// Fullscreen pass: cloud-top height -> infrared brightness, lit as relief by a low sun.
// Also draws the wind-field debug view.

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

// Wind debug view: speed as color, direction as a grid of arrows, white ring at Rmax.
fn windDebug(pKm: vec2f) -> vec3f {
    let speed = length(windAt(pKm));
    let t = clamp(speed / 60.0, 0.0, 1.0);
    var col = mix(vec3f(0.02, 0.03, 0.12), vec3f(0.05, 0.35, 0.75), smoothstep(0.0, 0.3, t));
    col = mix(col, vec3f(0.95, 0.85, 0.25), smoothstep(0.3, 0.65, t));
    col = mix(col, vec3f(0.85, 0.12, 0.1), smoothstep(0.65, 1.0, t));

    let cell = U.viewHalfKm / 13.0;
    let c = (floor(pKm / cell) + 0.5) * cell;
    let wc = windAt(c);
    let sc = length(wc);
    let d = wc / max(sc, 1e-3);
    let rel = pKm - c;
    let along = dot(rel, d);
    let across = abs(dot(rel, vec2f(-d.y, d.x)));
    let len = cell * 0.44 * clamp(sc / 35.0, 0.12, 1.0);
    let headLen = 0.4 * len;
    let shaft = across < 0.025 * cell && along > -len && along < len - headLen;
    let head = along >= len - headLen && along < len && across < 0.55 * (len - along);
    if (sc > 0.3 && (shaft || head)) {
        col = vec3f(1.0);
    }

    let px = U.viewHalfKm * 2.0 / U.texSize;
    if (abs(length(pKm) - U.rmaxKm) < 0.8 * px) {
        col = vec3f(1.0);
    }
    return col;
}

const OCEAN_COLOR: vec3f = vec3f(0.02, 0.11, 0.26);

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
    // Screen -> km in the storm frame (+y is up on screen).
    let ndc = in.uv * 2.0 - 1.0;
    let pKm = vec2f(ndc.x * U.aspect, ndc.y) * U.viewHalfKm;
    let uv = pKm / U.domainKm + 0.5;

    if (U.viewMode > 0.5) {
        return vec4f(windDebug(pKm), 1.0);
    }

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
    let shade = 0.55 + 0.25 * clamp(lambert / max(sin(el), 0.05), 0.0, 1.8);

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
    // height_km = -0.1933 * BT + 57.405. Displayed like enhanced infrared imagery: cold (high) =
    // white, with a curve that keeps the whole high-cloud shield bright.
    let bt = (57.405 - h) / 0.1933;
    let cold = clamp((298.0 - bt) / 95.0, 0.0, 1.0);
    let ir = 1.0 - exp(-pow(2.6 * cold, 1.5));
    let shadow = mix(1.0, vis, 0.45);
    let light = mix(1.0, shade * shadow, U.reliefMix);

    // The infrared brightness doubles as cloud cover: white lit cloud over a blue ocean, which
    // shows through where the cloud is low and thin and is darkened by cloud shadows.
    let ocean = OCEAN_COLOR * mix(1.0, shadow, U.reliefMix);
    let c = mix(ocean, vec3f(light), ir);
    return vec4f(clamp(c, vec3f(0.0), vec3f(1.0)), 1.0);
}
