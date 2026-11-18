#version 300 es
precision highp float;

uniform sampler2D u_Accum;
uniform vec3 u_Paper;
uniform float u_InkStrength;
uniform int u_Mode;

out vec4 out_Col;

void main() {
    vec4 acc = texelFetch(u_Accum, ivec2(gl_FragCoord.xy), 0);
    vec3 col;
    if (u_Mode == 0) {
        vec3 inkColor = acc.rgb / max(acc.a, 1e-4);
        float coverage = 1.0 - exp(-u_InkStrength * acc.a);
        col = mix(u_Paper, inkColor, coverage);
    } else {
        col = 1.0 - exp(-u_InkStrength * (acc.a - acc.rgb));
    }
    out_Col = vec4(col, 1.0);
}
