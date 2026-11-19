const BLUR_RADIUS: i32 = 48;
const BLUR_SIGMA: f32 = 15.0;

fn brightPart(color: vec3<f32>) -> vec3<f32> {
    let peak = max(color.r, max(color.g, color.b));
    let threshold = renderParams.bloomThreshold;
    if (peak <= threshold) {
        return vec3<f32>(0.0);
    }

    return color * ((peak - threshold) / peak);
}

fn gaussianBlur(
    uv: vec2<f32>,
    stepUv: vec2<f32>,
    extract: bool,
) -> vec3<f32> {
    var result = vec3<f32>(0.0);
    var weightSum = 0.0;

    for (var i = -BLUR_RADIUS; i <= BLUR_RADIUS; i++) {
        let tap = f32(i);
        let distance = tap / BLUR_SIGMA;
        let weight = exp(-0.5 * distance * distance);

        var color = textureSampleLevel(
            sourceImage, postSampler, uv + tap * stepUv, 0.0
        ).rgb;

        if (extract) {
            color = brightPart(color);
        }

        result += weight * color;
        weightSum += weight;
    }

    return result / weightSum;
}

@fragment
fn bloomHorizontal(
    @builtin(position) position: vec4<f32>
) -> @location(0) vec4<f32> {
    let halfSize = (textureDimensions(sourceImage) + vec2<u32>(1u))
        / vec2<u32>(2u);
    let size = vec2<f32>(halfSize);
    let uv = position.xy / size;
    let color = gaussianBlur(uv, vec2<f32>(1.0 / size.x, 0.0), true);
    return vec4<f32>(color, 1.0);
}

@fragment
fn bloomVertical(
    @builtin(position) position: vec4<f32>
) -> @location(0) vec4<f32> {
    let size = vec2<f32>(textureDimensions(sourceImage));
    let uv = position.xy / size;
    let color = gaussianBlur(uv, vec2<f32>(0.0, 1.0 / size.y), false);
    return vec4<f32>(color, 1.0);
}