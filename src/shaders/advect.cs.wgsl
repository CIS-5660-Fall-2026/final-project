// One fixed tick of the coarse cloud simulation: semi-Lagrangian advection of the cloud-top
// height field (km) by the cloud-top wind (Harris 2004), then sources and sinks.
// Texel: r = cloud-top height (km).

@group(0) @binding(0) var<uniform> U: Params;
@group(0) @binding(1) var srcTex: texture_2d<f32>;
@group(0) @binding(2) var srcSampler: sampler;
@group(0) @binding(3) var dstTex: texture_storage_2d<rgba16float, write>;

const SIM_SIZE: f32 = 512.0;        // must match SIM_SIZE in main.ts
const WALL_TAU: f32 = 600.0;        // eyewall fill time (s)
const BAND_TAU: f32 = 1500.0;       // rainband fill time (s)
const EYE_TAU: f32 = 600.0;         // eye clearing time (s)

// Noise that changes over time: two layers sliding across each other. Roughly in [-1, 1].
fn evolving(q: vec2f, t: f32) -> f32 {
    return gnoise(q + vec2f(t, 0.37 * t)) + 0.6 * gnoise(q * 1.7 + vec2f(31.4 - 0.61 * t, t));
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
    let size = u32(SIM_SIZE);
    if (gid.x >= size || gid.y >= size) {
        return;
    }
    let dt = U.simDt;
    let uv = (vec2f(gid.xy) + 0.5) / SIM_SIZE;
    let p = (uv - 0.5) * U.domainKm;
    let r = length(p);
    let theta = atan2(p.y, p.x);
    let rmax = U.rmaxKm;
    let rEye = rmax * U.eyeRatio;
    let seedOff = vec2f(U.seed * 7.3, U.seed * -3.9);

    // Advection. Trace back along the flow: an exact rotation for the swirl (a straight-line
    // step would spiral outward near the eye), then a radial step for the outflow.
    let w = windPolar(p);
    let ang = w.x / (max(r, 0.05) * 1000.0) * dt;
    let r0 = max(r - w.y * dt / 1000.0, 0.0);
    let p0 = rot2(p, -ang) * (r0 / max(r, 1e-3));
    var h = textureSampleLevel(srcTex, srcSampler, p0 / U.domainKm + 0.5, 0.0).r;

    // Sink: gradual decay. Thin, low cloud evaporates somewhat faster, so it does not linger
    // as a haze far from the storm.
    let thin = 1.0 - smoothstep(0.5, 2.5, h);
    h *= exp(-dt / U.cloudLife * (1.0 + 3.0 * thin));

    // Source: eyewall. A ring at Rmax pushes cloud up to the tropopause; the top height varies
    // around the ring and in time, and the outflow winds those variations into spirals.
    let ring = exp(-pow((r - rmax) / (0.45 * rmax), 2.0));
    let qe = rot2(p, -0.5 * omega(rmax) * U.time) / (0.9 * rmax) + seedOff;
    let wallTop = min(TROPOPAUSE_KM - 1.5 + 3.0 * evolving(qe, U.time / 5400.0), TROPOPAUSE_KM + 1.0);
    h += (1.0 - exp(-dt / WALL_TAU * ring)) * max(wallTop - h, 0.0);

    // Source: rainbands on a logarithmic spiral with pitch angle alpha (Dvorak 1984). The spiral
    // stays roughly fixed relative to the storm (Houze's principal band) while convective cells
    // travel along it.
    let R = shieldRadius(p);
    let tanA = tan(radians(U.bandPitchDeg));
    let spiral = theta + hemi() * log(max(r, 1.0) / rmax) / tanA;
    let bandWarp = fbm(p / 220.0 + seedOff, 3);
    let wave = 0.5 + 0.5 * cos(round(U.bandCount) * spiral + 2.2 * bandWarp);
    let envelope = smoothstep(1.5 * rmax, 3.5 * rmax, r) * (1.0 - smoothstep(0.6 * R, 1.0 * R, r));
    let band = pow(wave, 3.0) * envelope;
    let qc = rot2(p, -omega(6.0 * rmax) * U.time) / 40.0 + seedOff;
    let cells = evolving(qc, U.time / 7200.0);
    let bandTop = 11.5 + 4.5 * cells;
    let bandSrc = U.bandStrength * band * smoothstep(-0.3, 0.4, cells);
    h += (1.0 - exp(-dt / BAND_TAU * bandSrc)) * max(bandTop - h, 0.0);

    // Sink: eye clearing. Sinking air inside the eyewall evaporates the cloud down to the eye floor.
    let eye = 1.0 - smoothstep(0.7 * rEye, 1.1 * rEye, r);
    h = mix(h, min(h, EYE_FLOOR_KM), (1.0 - exp(-dt / EYE_TAU)) * eye);

    textureStore(dstTex, gid.xy, vec4f(max(h, 0.0), 0.0, 0.0, 1.0));
}
