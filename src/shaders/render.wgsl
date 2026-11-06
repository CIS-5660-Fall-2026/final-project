// Fullscreen pass: cloud-top height -> infrared brightness, lit as relief by a low sun.

@group(0) @binding(0) var<uniform> U: Params;
@group(0) @binding(1) var heightTex: texture_2d<f32>;
@group(0) @binding(2) var heightSampler: sampler;

struct VSOut {
    @builtin(position) pos: vec4f,
    @location(0) uv: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) i: u32) -> VSOut {
    var corners = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
    var o: VSOut;
    o.pos = vec4f(corners[i], 0.0, 1.0);
    o.uv = corners[i] * 0.5 + 0.5;
    return o;
}

fn heightAt(uv: vec2f) -> f32 {
    if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) {
        return 0.0;
    }
    return textureSampleLevel(heightTex, heightSampler, uv, 0.0).r;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
    // Screen -> km in the storm frame (+y is up on screen).
    let ndc = in.uv * 2.0 - 1.0;
    let pKm = vec2f(ndc.x * U.aspect, ndc.y) * U.viewHalfKm;
    let uv = pKm / U.domainKm + 0.5;

    let texelUV = 1.0 / U.texSize;
    let texelKm = U.domainKm / U.texSize;
    let h = heightAt(uv);
    let hx = (heightAt(uv + vec2f(texelUV, 0.0)) - heightAt(uv - vec2f(texelUV, 0.0))) / (2.0 * texelKm);
    let hy = (heightAt(uv + vec2f(0.0, texelUV)) - heightAt(uv - vec2f(0.0, texelUV))) / (2.0 * texelKm);
    let n = normalize(vec3f(-U.exaggeration * hx, -U.exaggeration * hy, 1.0));

    // Sun direction: azimuth measured clockwise from screen-up.
    let el = radians(clamp(U.sunElevDeg, 1.0, 89.0));
    let az = radians(U.sunAzimDeg);
    let L = vec3f(sin(az) * cos(el), cos(az) * cos(el), sin(el));
    let lambert = max(dot(n, L), 0.0);
    let shade = 0.25 + 0.75 * clamp(lambert / max(sin(el), 0.05), 0.0, 1.8);

    // Height-field shadows: march toward the sun with growing steps.
    var vis = 1.0;
    if (U.shadows > 0.5) {
        let dir = normalize(L.xy);
        let rise = tan(el) / U.exaggeration;
        var dist = 1.5 * texelKm;
        for (var i = 0; i < 24; i++) {
            let hq = heightAt((pKm + dir * dist) / U.domainKm + 0.5);
            vis = min(vis, clamp(1.0 - (hq - (h + dist * rise)) * 1.5, 0.0, 1.0));
            dist *= 1.3;
        }
    }

    // Brightness temperature from height, inverting Algodon et al. (2025) eq. 1:
    // height_km = -0.1933 * BT + 57.405. Displayed like infrared imagery: cold (high) = white.
    let bt = (57.405 - h) / 0.1933;
    let ir = clamp((300.0 - bt) / 110.0, 0.0, 1.0);
    let lit = ir * shade * mix(1.0, vis, 0.85);
    let c = clamp(mix(ir, lit, U.reliefMix), 0.0, 1.0);
    return vec4f(vec3f(c), 1.0);
}
