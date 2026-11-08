#version 300 es

precision highp float;

uniform float u_Time;

in vec2 fs_UV;

out vec4 out_Col;


float random (vec2 st) {
    return fract(sin(dot(st, vec2(12.9898, 78.233))) * 43758.5453123);
}

float noise (vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);

    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));

    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

#define OCTAVES 6
float fbm (vec2 st) {
    float value = 0.0;
    float amplitude = 0.5;

    for (int i = 0; i < OCTAVES; i++) {
        value += amplitude * noise(st);
        st *= 2.0;
        amplitude *= 0.4;
    }
    return value;
}

void main()
{
    vec3 color = vec3(0.05, 0.05, 0.05);
    vec2 uv = fs_UV;

    float time = u_Time * 0.05;
    uv -= vec2(time * 0.003, time * 0.01);

    float smoke = fbm(uv * 9.0);

    vec3 smokeColor = vec3(0.2, 0.2, 0.2);
    vec3 bgColor = color;

    vec3 finalColor = mix(bgColor, smokeColor, smoke);

    out_Col = vec4(finalColor, 1.0);
}