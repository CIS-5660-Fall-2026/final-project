// Shared by every shader module (prepended in shaders.ts).
// Each module declares its own `U` binding; WGSL module-scope declarations are order-independent.

// Must match the packing order in params.ts (packUniforms).
struct Params {
    time: f32,          // storm time (s)
    domainKm: f32,      // side length of the simulated square (km)
    rmaxKm: f32,        // radius of maximum wind (km)
    hollandB: f32,      // Holland profile shape parameter
    deltaPPa: f32,      // central pressure deficit (Pa)
    coriolis: f32,      // Coriolis parameter f (1/s), negative in the southern hemisphere
    outflowTurn: f32,   // 0..1 blend toward angular-momentum-conserving outflow
    eyeRatio: f32,      // eye radius / Rmax
    bandCount: f32,
    bandPitchDeg: f32,
    bandStrength: f32,
    cdoRadiusKm: f32,   // radius of the central dense overcast
    detailScaleKm: f32,
    detailStrength: f32,
    streak: f32,        // length / width of the detail streaks along the flow
    seed: f32,
    sunElevDeg: f32,
    sunAzimDeg: f32,
    exaggeration: f32,
    reliefMix: f32,
    shadows: f32,
    viewHalfKm: f32,
    aspect: f32,
    texSize: f32,
    outflowSpeed: f32,  // peak radial outflow at cloud-top level (m/s)
    cloudLife: f32,     // e-folding decay time of cloud-top height (s)
    simDt: f32,         // fixed simulation tick (storm s)
    viewMode: f32,      // 0 = clouds, 1 = wind debug
    terrace: f32,       // 0..1 blend from smooth detail to flat stepped plates
};

const PI: f32 = 3.14159265;
const RHO_AIR: f32 = 1.15;          // kg/m^3
const TROPOPAUSE_KM: f32 = 16.0;
const EYE_FLOOR_KM: f32 = 1.5;

// ---------------------------------------------------------------- hashing & noise

fn pcg2d(vin: vec2u) -> vec2u {
    var v = vin * 1664525u + 1013904223u;
    v.x += v.y * 1664525u;
    v.y += v.x * 1664525u;
    v = v ^ (v >> vec2u(16u));
    v.x += v.y * 1664525u;
    v.y += v.x * 1664525u;
    v = v ^ (v >> vec2u(16u));
    return v;
}

fn hash22(p: vec2i) -> vec2f {
    return vec2f(pcg2d(bitcast<vec2u>(p))) * (1.0 / 4294967295.0);
}

// Quintic gradient noise, roughly in [-0.7, 0.7].
fn gnoise(p: vec2f) -> f32 {
    let i = vec2i(floor(p));
    let f = fract(p);
    let u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    let ga = hash22(i) * 2.0 - 1.0;
    let gb = hash22(i + vec2i(1, 0)) * 2.0 - 1.0;
    let gc = hash22(i + vec2i(0, 1)) * 2.0 - 1.0;
    let gd = hash22(i + vec2i(1, 1)) * 2.0 - 1.0;
    let va = dot(ga, f);
    let vb = dot(gb, f - vec2f(1.0, 0.0));
    let vc = dot(gc, f - vec2f(0.0, 1.0));
    let vd = dot(gd, f - vec2f(1.0, 1.0));
    return mix(mix(va, vb, u.x), mix(vc, vd, u.x), u.y);
}

fn fbm(pin: vec2f, octaves: i32) -> f32 {
    var p = pin;
    var a = 0.5;
    var s = 0.0;
    let rot = mat2x2f(0.8, 0.6, -0.6, 0.8);
    for (var i = 0; i < octaves; i++) {
        s += a * gnoise(p);
        p = rot * p * 2.03 + vec2f(17.1, -9.3);
        a *= 0.5;
    }
    return s;
}

// Gradient noise that repeats every `period` cells along x, for coordinates that wrap around
// (an angle, for example).
fn gnoiseWrapX(p: vec2f, period: i32) -> f32 {
    let i = vec2i(floor(p));
    let f = fract(p);
    let u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    let x0 = ((i.x % period) + period) % period;
    let x1 = (x0 + 1) % period;
    let ga = hash22(vec2i(x0, i.y)) * 2.0 - 1.0;
    let gb = hash22(vec2i(x1, i.y)) * 2.0 - 1.0;
    let gc = hash22(vec2i(x0, i.y + 1)) * 2.0 - 1.0;
    let gd = hash22(vec2i(x1, i.y + 1)) * 2.0 - 1.0;
    let va = dot(ga, f);
    let vb = dot(gb, f - vec2f(1.0, 0.0));
    let vc = dot(gc, f - vec2f(0.0, 1.0));
    let vd = dot(gd, f - vec2f(1.0, 1.0));
    return mix(mix(va, vb, u.x), mix(vc, vd, u.x), u.y);
}

fn rot2(p: vec2f, a: f32) -> vec2f {
    let c = cos(a);
    let s = sin(a);
    return vec2f(c * p.x - s * p.y, s * p.x + c * p.y);
}

// ---------------------------------------------------------------- vortex

fn hemi() -> f32 {
    return select(-1.0, 1.0, U.coriolis >= 0.0);
}

// Holland (1980) gradient wind speed (m/s) at radius rKm.
fn hollandV(rKm: f32) -> f32 {
    let r = max(rKm, 0.05) * 1000.0;
    let rm = U.rmaxKm * 1000.0;
    let x = min(pow(rm / r, U.hollandB), 80.0);
    let fh = 0.5 * abs(U.coriolis) * r;
    return sqrt(U.hollandB * U.deltaPPa / RHO_AIR * x * exp(-x) + fh * fh) - fh;
}

// Tangential wind at cloud-top level: the Holland core blends outward into air that conserves
// absolute angular momentum M = r v + f r^2 / 2, which turns anticyclonic at large radius (Houze 2010).
fn cloudTopV(rKm: f32) -> f32 {
    let v = hollandV(rKm);
    let r = max(rKm, 0.05) * 1000.0;
    let rm = U.rmaxKm * 1000.0;
    let f = abs(U.coriolis);
    let m0 = 0.5 * (rm * hollandV(U.rmaxKm) + 0.5 * f * rm * rm);
    let vOut = (m0 - 0.5 * f * r * r) / r;
    let w = U.outflowTurn * smoothstep(2.0 * U.rmaxKm, 8.0 * U.rmaxKm, rKm);
    return mix(v, vOut, w);
}

// Angular velocity (rad/s). Positive = counter-clockwise on screen (northern hemisphere cyclonic).
fn omega(rKm: f32) -> f32 {
    return hemi() * cloudTopV(rKm) / (max(rKm, 0.05) * 1000.0);
}

// ---------------------------------------------------------------- wind field

// Edge of the outflow cloud shield (km). Low-frequency noise keeps it from being a perfect circle.
fn shieldRadius(p: vec2f) -> f32 {
    return U.cdoRadiusKm * (1.0 + 0.8 * fbm(p / 380.0 + vec2f(U.seed * 1.3, 5.0), 3));
}

// Radial outflow at cloud-top level (m/s): zero in the eye, full strength from the eyewall out,
// then a smooth taper to zero at the shield radius, so the cloud slows down and thins out
// gradually instead of piling up at a front.
fn radialV(p: vec2f, rKm: f32) -> f32 {
    let rEye = U.rmaxKm * U.eyeRatio;
    let R = shieldRadius(p);
    let up = smoothstep(rEye, 1.5 * U.rmaxKm, rKm);
    let down = pow(clamp((R - rKm) / (0.75 * R), 0.0, 1.0), 1.5);
    return U.outflowSpeed * up * down;
}

// Cloud-top wind in polar form (m/s): x = tangential (positive = counter-clockwise), y = radial.
fn windPolar(p: vec2f) -> vec2f {
    let r = length(p);
    return vec2f(hemi() * cloudTopV(r), radialV(p, r));
}

// Cloud-top wind as a vector in the storm frame (m/s, +y up on screen).
fn windAt(p: vec2f) -> vec2f {
    let r = max(length(p), 1e-3);
    let er = p / r;
    let w = windPolar(p);
    return w.x * vec2f(-er.y, er.x) + w.y * er;
}
