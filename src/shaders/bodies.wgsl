struct CameraUniforms {
    viewProjection: mat4x4<f32>
}

@group(0) @binding(0)
var<uniform> camera: CameraUniforms;

@group(1) @binding(0)
var<storage, read> bodies: array<Body>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) normal: vec3<f32>,
    @location(1) localPosition: vec3<f32>,
    @location(2) @interpolate(flat) bodyIndex: u32
}

@vertex
fn vertMain(
    @location(0) localPosition: vec3<f32>,
    @builtin(instance_index) instanceIndex: u32
) -> VertexOutput {
    let body = bodies[instanceIndex];
    let rotatedPosition = rotateVector(body.orientation, localPosition);
    let worldPosition = body.position + rotatedPosition * body.radius;

    var output: VertexOutput;
    output.position = camera.viewProjection * vec4<f32>(worldPosition, 1.0);
    output.normal = localPosition;
    output.localPosition = localPosition;
    output.bodyIndex = instanceIndex;
    return output;
}

@fragment
fn fragMain(input: VertexOutput) -> @location(0) vec4<f32> {
    let normal = normalize(input.normal);
    let lightDirection = normalize(vec3<f32>(1.0, 1.0, 1.0));
    let brightness = 0.2 + 0.8 * max(dot(normal, lightDirection), 0.0);

    let baseColor = vec3<f32>(
        1.0,
        smoothstep(1.0, 8.0, bodies[input.bodyIndex].mass),
        input.localPosition.x * 0.5 + 0.5
    );

    return vec4<f32>(baseColor * brightness, 1.0);
}