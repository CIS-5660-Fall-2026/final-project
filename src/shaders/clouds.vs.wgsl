struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) ndc: vec2f
}

@vertex
fn vs_main(@builtin(vertex_index) index: u32) -> VertexOutput {
    var positions = array<vec2f, 3>(
        vec2f(-1.0, -1.0),
        vec2f( 3.0, -1.0),
        vec2f(-1.0,  3.0)
    );

    var output: VertexOutput;
    output.position = vec4f(positions[index], 0.0, 1.0);
    output.ndc = positions[index];

    return output;
}