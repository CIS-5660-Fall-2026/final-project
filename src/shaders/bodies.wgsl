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
    let rotatedPosition = rotateVector(body.orientation, localPosition);
    let worldPosition = body.position + rotatedPosition * body.radius;

    let surfaceOffset = 64.0 * vec3<f32>(
        random01(body.seed ^ 1u),
        random01(body.seed ^ 2u),
        random01(body.seed ^ 3u)
    );

    var output: VertexOutput;
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
    let spherePosition = normalize(input.localPosition);
    let p = 4.0 * spherePosition + input.surfaceOffset;

    let h = fbm(p);
    let tone = smoothstep(-0.2, 0.2, h);

    let darkColor = mix(
        vec3<f32>(0.07, 0.08, 0.09),
        vec3<f32>(0.09, 0.08, 0.07),
        input.paletteMix
    );
    let lightColor = mix(
        vec3<f32>(0.40, 0.43, 0.46),
        vec3<f32>(0.46, 0.43, 0.39),
        input.paletteMix
    );
    let baseColor = mix(darkColor, lightColor, tone);

    let normal = normalize(input.normal);
    let lightDirection = normalize(vec3<f32>(1.0, 1.0, 1.0));
    let brightness = 0.2 + 0.8 * max(dot(normal, lightDirection), 0.0);

    return vec4<f32>(baseColor * brightness, 1.0);
}