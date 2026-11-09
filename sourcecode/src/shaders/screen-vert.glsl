#version 300 es

in vec4 vs_Pos;

void main() {
    gl_Position = vec4(vs_Pos.xyz, 1.0);
}