struct DrawIndirectArgs {
    vertexCount: u32,
    instanceCount: u32,
    firstVertex: u32,
    firstInstance: u32,
}

@group(0) @binding(0)
var<storage, read_write> positions: array<vec4<f32>, 3>;

@group(0) @binding(1)
var<storage, read_write> drawArgs: DrawIndirectArgs;

@compute @workgroup_size(1)
fn gravityNaive() {
    positions[0] = vec4<f32>(-0.6, -0.5, 0.5, 1.0);
    positions[1] = vec4<f32>( 0.6, -0.5, 0.5, 1.0);
    positions[2] = vec4<f32>( 0.0,  0.5, 0.5, 1.0);

    drawArgs.vertexCount = 3u;
    drawArgs.instanceCount = 1u;
    drawArgs.firstVertex = 0u;
    drawArgs.firstInstance = 0u;
}