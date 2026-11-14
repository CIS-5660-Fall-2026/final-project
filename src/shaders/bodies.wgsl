struct CameraUniforms {
    viewProjection: mat4x4<f32>,
}

@group(0) @binding(0)
var<uniform> camera: CameraUniforms;

@group(1) @binding(0)
var<storage, read> bodies: array<Body>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) normal: vec3<f32>,
    @location(1) localPosition: vec3<f32>,
    @location(2) @interpolate(flat) bodyIndex: u32,
    @location(3) @interpolate(flat) surfaceOffset: vec3<f32>,
    @location(4) @interpolate(flat) paletteMix: f32,
}

@vertex
fn vertMain(
    @location(0) localPosition: vec3<f32>,
    @builtin(instance_index) instanceIndex: u32
) -> VertexOutput {
    let body = bodies[instanceIndex];
    var output: VertexOutput;

    if (body.mass == 0.0) {
        output.position = vec4<f32>(2.0, 0.0, 0.0, 1.0);
        return output;
    }

    let rotatedPosition = rotateVector(body.orientation, localPosition);
    let worldPosition = body.position + rotatedPosition * body.radius;

    let surfaceOffset = 64.0 * vec3<f32>(
        random01(body.seed ^ 1u),
        random01(body.seed ^ 2u),
        random01(body.seed ^ 3u)
    );

    output.position = camera.viewProjection * vec4<f32>(worldPosition, 1.0);
    output.normal = rotatedPosition;
    output.localPosition = localPosition;
    output.bodyIndex = instanceIndex;
    output.surfaceOffset = surfaceOffset;
    output.paletteMix = random01(body.seed ^ 4u);
    return output;
}

@fragment
fn fragMain(input: VertexOutput) -> @location(0) vec4<f32> {
    let p = normalize(input.localPosition);
    let detail = fbm(6.0 * p + input.surfaceOffset) / 1.875;

    let rockColor = mix(
        vec3<f32>(0.30, 0.32, 0.34),
        vec3<f32>(0.34, 0.32, 0.29),
        input.paletteMix
    );
    let baseColor = rockColor
        * (0.95 + 0.10 * smoothstep(-0.25, 0.25, detail));

    let normal = normalize(input.normal);

    let lightDirection = normalize(vec3<f32>(1.0, 1.0, 1.0));
    let lightColor = vec3<f32>(1.0, 0.95, 0.90);
    let lightIntensity = 1.0;

    let diffuse = max(dot(normal, lightDirection), 0.0);
    let lighting = lightColor * lightIntensity * diffuse;

    return vec4<f32>(baseColor * lighting, 1.0);
}