// Composes the cloud-top height field H(x, y) in km: the coarse simulated field, upsampled, plus
// fine detail that moves with the flow.
// Output texel: r = height (km), g = eyewall mask.

@group(0) @binding(0) var<uniform> U: Params;
@group(0) @binding(1) var simTex: texture_2d<f32>;
@group(0) @binding(2) var simSampler: sampler;
@group(0) @binding(3) var outTex: texture_storage_2d<rgba16float, write>;

// Longest flow-map reset period (storm s), used where the flow barely shears.
const FLOW_PERIOD_MAX: f32 = 10800.0;
const FLOW_LEVELS_MAX: f32 = 7.0;
// Most shear (tangential offset per unit radius) the motion may add to the detail before a reset.
const FLOW_SHEAR_MAX: f32 = 1.5;
// Inward spiral of the streaks: tangent of their crossing angle with circles around the eye.
const STREAK_PITCH: f32 = 0.3;

// Cloud texture streaked along the flow, roughly in [-1, 1].
//
// The noise lives in log-polar coordinates (angle, ln r), where a lattice cell is a patch that
// is `streak` times longer around the eye than across it. Such a cell grows with radius, so the
// lattice is refined by a factor of two every time the radius doubles and the two nearest
// refinements are blended; streaks therefore stay about `detailScaleKm` wide at every radius.
//
//   angleTurns: angle around the eye in turns, already shifted by the flow
//   rKm:        radius
//   offset:     decorrelates one flow-map layer from the next
fn streakPattern(angleTurns: f32, rKm: f32, offset: vec2f) -> f32 {
    let lod = log2(rKm / U.detailScaleKm);
    let lod0 = floor(lod);
    let lodMix = lod - lod0;
    let texelKm = U.domainKm / U.texSize;
    var acc = 0.0;
    var norm = 0.0;
    for (var i = 0; i < 2; i++) {
        let lv = lod0 + f32(i);
        let cells = exp2(lv);                                      // lattice cells per unit ln r
        let around = max(i32(round(2.0 * PI * cells / max(U.streak, 0.25))), 3);   // cells per turn
        let q = vec2f(angleTurns * f32(around), log(rKm) * cells) + offset + vec2f(0.0, 37.0 * lv);
        let warp = 0.6 * gnoiseWrapX(q * vec2f(1.0, 0.5) + vec2f(5.3, 2.9), around);
        // fBm whose octaves fade out before they get finer than the height texture can hold.
        let qw = q + vec2f(0.5 * warp, warp);
        var n = 0.0;
        var amp = 0.5;
        var freq = 1;
        for (var o = 0; o < 4; o++) {
            let cellKm = rKm / (cells * f32(freq));
            let keep = smoothstep(1.6, 3.2, cellKm / texelKm);
            if (keep > 0.0) {
                n += amp * keep * gnoiseWrapX(qw * f32(freq) + vec2f(0.0, 19.7 * f32(o)), around * freq);
            }
            amp *= 0.5;
            freq *= 2;
        }
        let w = select(1.0 - lodMix, lodMix, i == 1);
        acc += w * n;
        norm += w * w;
    }
    return 2.6 * acc / sqrt(max(norm, 1e-4));
}

// Detail that moves with the flow.
//  - Two-phase flow map along the analytic rotation (Vlachos 2010): each layer is rotated by the
//    local angular velocity times its time since reset, and the layers are cross-faded so a reset
//    is never visible. A noise phase offset hides the global pulse.
//  - The reset period halves wherever the shear doubles (Neyret 2003), so the motion never
//    smears the pattern, from the eyewall to the calm outer shield.
fn advectedDetail(p: vec2f, rKm: f32) -> f32 {
    let r = max(rKm, U.rmaxKm * U.eyeRatio);
    let om = omega(r);
    let shearRate = abs(r * (omega(r + 2.0) - omega(r - 2.0)) / 4.0);
    let period = min(FLOW_SHEAR_MAX / max(shearRate, 1e-9), FLOW_PERIOD_MAX);
    let level = clamp(log2(FLOW_PERIOD_MAX / period), 0.0, FLOW_LEVELS_MAX);
    let level0 = floor(level);
    let levelMix = level - level0;

    // Streaks trail the rotation on a log spiral, like the rainbands.
    let angle = atan2(p.y, p.x) + hemi() * STREAK_PITCH * log(r / U.rmaxKm);
    let phaseJitter = 0.35 * fbm(p / 350.0 + vec2f(U.seed), 2);
    var acc = 0.0;
    var norm = 0.0;
    for (var j = 0; j < 2; j++) {
        let lv = level0 + f32(j);
        let per = FLOW_PERIOD_MAX / exp2(lv);
        let wLevel = select(1.0 - levelMix, levelMix, j == 1);
        for (var k = 0; k < 2; k++) {
            let ph = U.time / per + 0.5 * f32(k) + phaseJitter;
            let cycle = floor(ph);
            let fr = ph - cycle;
            let a = angle - om * (fr - 0.5) * per;
            let offset = hash22(vec2i(i32(cycle), k + 2 * i32(lv) + 64 * i32(U.seed))) * 64.0;
            let w = wLevel * (1.0 - abs(2.0 * fr - 1.0));
            acc += w * streakPattern(a / (2.0 * PI), r, offset);
            norm += w * w;
        }
    }
    // Dividing by the root of the summed squared weights keeps the contrast steady through the
    // cross-fade (a plain weighted average of unrelated layers would pulse).
    return acc / sqrt(max(norm, 1e-4));
}

// Flattens x into steps of the given height with short ramps between them: flat plates of cloud
// separated by small scarps, like the layered cirrus deck in the reference.
fn terraced(x: f32, stepSize: f32) -> f32 {
    let t = x / stepSize;
    let i = floor(t);
    return (i + smoothstep(0.15, 0.85, t - i)) * stepSize;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
    let size = u32(U.texSize);
    if (gid.x >= size || gid.y >= size) {
        return;
    }

    let uv = (vec2f(gid.xy) + 0.5) / U.texSize;
    let p = (uv - 0.5) * U.domainKm;
    let r = length(p);
    let theta = atan2(p.y, p.x);
    let rmax = U.rmaxKm;

    let base = 0.45 * advectedDetail(p, r);

    // Eye and eyewall: the cloud top climbs from the eye floor to the tropopause at ~45 degrees
    // (the "stadium" in Houze 2010). A little angular noise keeps the eye from being a perfect circle.
    let wobble = 1.0 + 0.06 * gnoise(vec2f(cos(theta), sin(theta)) * 2.0 + vec2f(U.time * 2e-4, U.seed));
    let rEye = rmax * U.eyeRatio * wobble;
    let wall = smoothstep(rEye, rEye + 14.0, r);

    // Coarse simulated cloud field. The eye is re-cut here so its edge stays sharper than the
    // simulation grid.
    // Coarse simulated cloud field. Toward the outside the cloud gets thinner and is broken up
    // gradually by the streaked detail, so the shield feathers away with no outline.
    let hRaw = textureSampleLevel(simTex, simSampler, uv, 0.0).r;
    let hSim = hRaw * smoothstep(1.0, 9.0, hRaw + 5.0 * base);
    let hCore = mix(min(hSim, EYE_FLOOR_KM), hSim, wall);

    // Low cloud over the ocean, shaped by the storm: it uses the same wind-carried, streaked
    // pattern as the cloud deck, gathered into broad spiral lines that wind in toward the eye
    // and turn slowly with the circulation.
    let lowTan = tan(radians(U.bandPitchDeg + 8.0));
    let lowSpiral = theta + hemi() * (log(max(r, 1.0) / rmax) / lowTan - 2.0e-5 * U.time);
    let lowArms = cos(4.0 * lowSpiral + 3.0 * fbm(p / 300.0 + vec2f(U.seed * 5.1, 2.3), 2));
    let hLow = 3.2 * smoothstep(0.0, 0.5, 1.3 * base + 0.3 * lowArms - 0.05);
    var h = max(hCore, hLow);

    // Texture on the cloud deck, kept out of the eye.
    let highMask = smoothstep(2.5, 7.0, h) * smoothstep(rEye, rEye + 20.0, r);
    let bump = clamp(2.2 * base, -1.2, 1.2);
    h += U.detailStrength * highMask * mix(bump, terraced(bump, 0.45), U.terrace);
    h = max(h, 0.0);

    textureStore(outTex, gid.xy, vec4f(h, wall, 0.0, 1.0));
}
