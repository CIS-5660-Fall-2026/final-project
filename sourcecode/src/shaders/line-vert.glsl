#version 300 es

layout(location = 0) in vec2 vs_Pos;
layout(location = 1) in vec4 vs_Col;

uniform vec2 u_Resolution;

out vec4 fs_Col;

void main() {
    vec2 clip = vs_Pos / u_Resolution * 2.0 - 1.0;
    clip.y = -clip.y;
    gl_Position = vec4(clip, 0.0, 1.0);
    fs_Col = vs_Col;
}
