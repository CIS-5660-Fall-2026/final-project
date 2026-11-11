@group(3) @binding(0) var u_DitherTex: texture_3d<f32>;
@group(3) @binding(1) var u_DitherSampler: sampler;

struct FragmentInput {
    @location(0) fs_Nor: vec3f,
    @location(1) fs_LightVec: vec3f,
    @location(2) fs_Pos: vec3f
}

@fragment
fn main(input: FragmentInput) -> @location(0) vec4f
{
    // tunable parameters
    let u_DotScale = 10.0;
    let u_ColorHighlight = vec3f(0.9020, 0.9961, 0.9961);
    let u_ColorShadow = vec3f(0.204, 0.196, 0.106);

    // lighting
    let diffuseTerm = dot(normalize(input.fs_Nor), normalize(input.fs_LightVec));
    let ambientTerm = 0.1;
    let lightIntensity = mix(ambientTerm, 1.0, max(diffuseTerm, 0.0));
    // lightIntensity = 0.5;

    // get uv
    let pos = input.fs_Pos;
    let nor = abs(normalize(input.fs_Nor));
    var uv0: vec2f;
    if (nor.x > nor.y && nor.x > nor.z) {
        uv0 = pos.yz;
    } else if (nor.y > nor.z) {
        uv0 = pos.xz;
    } else {
        uv0 = pos.xy;
    }

    // screen space uv derivatives
    let dx = dpdx(uv0);
    let dy = dpdy(uv0);

    // SVD uv freq - from Rune's implementation
    let Q = dot(dx, dx) + dot(dy, dy);
    let R = dx.x * dy.y - dx.y * dy.x;
    let discriminant = sqrt(max(0.0, Q * Q - 4.0 * R * R));
    let freq = sqrt(max(vec2f(Q + discriminant, Q - discriminant) * 0.5, vec2f(0.0)));
    var spacing = freq.y; // dot spacing
    spacing *= u_DotScale;
    spacing /= max(sqrt(lightIntensity), 0.001);

    // get fractal level
    let spacingLog = log2(max(spacing, 1e-5));
    let level = floor(spacingLog);
    let frac = fract(spacingLog); // percent to next level

    // get sub-layer
    let subLayer = mix(1.0, 4.0, 1.0 - frac); // blend between 1 and 4 dots
    let layer = (subLayer - 1.0) * 8.0;
    let w = (layer + 0.5) / 25.0;

    // scale uv for current fractal level
    let uv = uv0 / exp2(level);

    // get threshold from 3D Bayer matrix texture
    let threshold = textureSample(u_DitherTex, u_DitherSampler, vec3f(uv, w)).r;
    let dither = select(0.0, 1.0, lightIntensity > threshold);
    let finalColor = mix(u_ColorShadow, u_ColorHighlight, dither);

    return vec4f(finalColor, 1.0);
}