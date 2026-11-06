// Builds the cloud-top height field H(x, y) in km.
// Output texel: r = height (km), g = eyewall mask, b = rainband mask.

@group(0) @binding(0) var<uniform> U: Params;
@group(0) @binding(1) var outTex: texture_storage_2d<rgba16float, write>;

// Small-scale cloud texture at position q (km): x = domain-warped fBm, y = convective "cells".
fn detailPattern(q: vec2f) -> vec2f {
    let s = q / U.detailScaleKm + vec2f(U.seed * 13.7, U.seed * -7.1);
    let warp = vec2f(fbm(s * 0.35 + vec2f(3.1, 1.7), 3), fbm(s * 0.35 + vec2f(-5.2, 7.7), 3));
    let base = fbm(s + 2.0 * warp, 5);
    let cells = clamp(1.0 - worley(s * 1.7 + 1.5 * warp), 0.0, 1.0);
    return vec2f(base, cells);
}

// Two-phase flow map along the analytic rotation (Vlachos 2010): each layer is rotated back by
// the local angular velocity times its time since reset, and the layers are cross-faded so a
// reset is never visible. A noise phase offset hides the global pulse.
fn advectedDetail(p: vec2f, rKm: f32) -> vec2f {
    let om = omega(rKm);
    let phaseJitter = 0.35 * fbm(p / 350.0 + vec2f(U.seed), 2);
    var acc = vec2f(0.0);
    for (var k = 0; k < 2; k++) {
        let ph = U.time / U.flowPeriod + 0.5 * f32(k) + phaseJitter;
        let cycle = floor(ph);
        let fr = ph - cycle;
        let p0 = rot2(p, -om * fr * U.flowPeriod);
        let jump = (hash22(vec2i(i32(cycle), k)) - 0.5) * 400.0;
        let w = 1.0 - abs(2.0 * fr - 1.0);
        acc += w * detailPattern(p0 + jump);
    }
    return acc;
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

    let d = advectedDetail(p, r);
    let base = d.x;
    let cells = d.y;

    // Eye and eyewall: the cloud top climbs from the eye floor to the tropopause at ~45 degrees
    // (the "stadium" in Houze 2010). A little angular noise keeps the eye from being a perfect circle.
    let wobble = 1.0 + 0.06 * gnoise(vec2f(cos(theta), sin(theta)) * 2.0 + vec2f(U.time * 2e-4, U.seed));
    let rEye = rmax * U.eyeRatio * wobble;
    let wall = smoothstep(rEye, rEye + 14.0, r);

    // Central dense overcast with a ragged outer edge.
    let cdo = 1.0 - smoothstep(0.55 * U.cdoRadiusKm, 1.25 * U.cdoRadiusKm, r + 60.0 * base);
    let hCore = mix(EYE_FLOOR_KM, (TROPOPAUSE_KM - 0.5) * cdo, wall);

    // Spiral rainbands on a logarithmic spiral with pitch angle alpha. They stay roughly fixed
    // relative to the storm (Houze's principal band) while the advected detail streams along them.
    let tanA = tan(radians(U.bandPitchDeg));
    let spiral = theta + hemi() * log(max(r, 1.0) / rmax) / tanA;
    let bandWarp = fbm(p / 220.0 + vec2f(U.seed * 3.0), 3);
    let wave = 0.5 + 0.5 * cos(round(U.bandCount) * spiral + 2.2 * bandWarp);
    let band = pow(wave, 2.5) * smoothstep(1.2 * rmax, 3.5 * rmax, r) * (1.0 - smoothstep(380.0, 620.0, r));
    let hBand = U.bandStrength * band * mix(7.0, 14.0, cells);

    // Patchy low clouds over the ocean.
    let hLow = 2.5 * smoothstep(0.1, 0.5, 1.2 * base + 0.1 * cells);

    var h = max(max(hCore, hBand), hLow);

    // Convective texture on the high cloud, kept out of the eye.
    let highMask = smoothstep(4.0, 10.0, h) * smoothstep(rEye, rEye + 20.0, r);
    h += U.detailStrength * highMask * (1.2 * base + (cells - 0.5));
    h = max(h, 0.0);

    textureStore(outTex, gid.xy, vec4f(h, wall, band, 1.0));
}
