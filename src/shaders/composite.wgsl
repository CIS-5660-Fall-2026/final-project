@group(0) @binding(0)
var sourceImage: texture_2d<f32>;

@group(0) @binding(1)
var postSampler: sampler;

@group(0) @binding(2)
var bloomImage: texture_2d<f32>;

@group(0) @binding(3)
var<uniform> renderParams: RenderParams;

@vertex
fn vertMain(@builtin(vertex_index) index: u32) -> @builtin(position) vec4<f32> {
    let positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>( 3.0, -1.0),
        vec2<f32>(-1.0,  3.0)
    );
    return vec4<f32>(positions[index], 0.0, 1.0);
}

fn toneMap(color: vec3<f32>) -> vec3<f32> {
    let numerator = color * (2.51 * color + vec3<f32>(0.03));
    let denominator = color * (2.43 * color + vec3<f32>(0.59))
        + vec3<f32>(0.14);
    return clamp(numerator / denominator, vec3<f32>(0.0), vec3<f32>(1.0));
}

fn linearToSrgb(color: vec3<f32>) -> vec3<f32> {
    let low = 12.92 * color;
    let high = 1.055 * pow(color, vec3<f32>(1.0 / 2.4)) - vec3<f32>(0.055);
    return select(low, high, color > vec3<f32>(0.0031308));
}

@fragment
fn fragMain(
    @builtin(position) position: vec4<f32>
) -> @location(0) vec4<f32> {
    let hdrColor = textureLoad(sourceImage, vec2<i32>(position.xy), 0).rgb;
    let uv = position.xy / vec2<f32>(textureDimensions(sourceImage));
    let glow = textureSampleLevel(bloomImage, postSampler, uv, 0.0).rgb;

    let combined = hdrColor + renderParams.bloomStrength * glow;
    let displayColor = linearToSrgb(toneMap(combined * renderParams.exposure));
    return vec4<f32>(displayColor, 1.0);
}