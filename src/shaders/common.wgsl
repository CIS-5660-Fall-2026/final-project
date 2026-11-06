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
    flowPeriod: f32,    // flow-map reset period (storm s)
    seed: f32,
    sunElevDeg: f32,
    sunAzimDeg: f32,
    exaggeration: f32,
    reliefMix: f32,
    shadows: f32,
    viewHalfKm: f32,
    aspect: f32,
    texSize: f32,
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

// Distance to the nearest cell feature point (Worley / cellular noise).
fn worley(p: vec2f) -> f32 {
    let i = vec2i(floor(p));
    let f = fract(p);
    var d = 8.0;
    for (var y = -1; y <= 1; y++) {
        for (var x = -1; x <= 1; x++) {
            let o = vec2i(x, y);
            let c = vec2f(o) + hash22(i + o) - f;
            d = min(d, dot(c, c));
        }
    }
    return sqrt(d);
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
