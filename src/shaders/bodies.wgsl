struct CameraUniforms {
    viewProjection: mat4x4<f32>
}

@group(0) @binding(0)
var<uniform> camera: CameraUniforms;

@group(0) @binding(1)
var<storage, read> positions: array<vec4<f32>, 3>;

@vertex
fn vertMain(
    @builtin(vertex_index) vertexIndex: u32
) -> @builtin(position) vec4<f32> {
    return camera.viewProjection * positions[vertexIndex];
}

@fragment
fn fragMain() -> @location(0) vec4<f32> {
    return vec4<f32>(1.0, 0.5, 0.1, 1.0);
}