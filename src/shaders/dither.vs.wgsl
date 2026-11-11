struct ModelUniforms {
    modelMat: mat4x4f
}

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(1) @binding(0) var<uniform> model: ModelUniforms;

struct VertexInput {
    @location(0) vs_Pos: vec3f,
    @location(1) vs_Nor: vec3f,
    @location(2) vs_UV: vec2f
}

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) fs_Nor: vec3f,
    @location(1) fs_LightVec: vec3f,
    @location(2) fs_Pos: vec3f
}

const lightPos = vec3f(10.0, 10.0, 10.0);

@vertex
fn main(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;

    let modelposition = model.modelMat * vec4f(input.vs_Pos, 1.0);

    output.fs_Pos = input.vs_Pos;
    output.fs_Nor = normalize((model.modelMat * vec4f(input.vs_Nor, 0.0)).xyz);
    output.fs_LightVec = lightPos - modelposition.xyz;

    output.position = camera.viewProjMat * modelposition;

    return output;
}