#version 300 es
precision highp float;

in vec4 fs_Col;
out vec4 out_Col;

void main() {
    out_Col = vec4(fs_Col.rgb * fs_Col.a, fs_Col.a);
}
