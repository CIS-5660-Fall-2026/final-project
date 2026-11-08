#version 300 es

uniform mat4 u_Model;
uniform mat4 u_ModelInvTr;
uniform mat4 u_ViewProj;
uniform float u_Time;
uniform float u_Height;
uniform float u_Curl;

in vec4 vs_Pos;
in vec4 vs_Nor;
in vec4 vs_Col;

out vec4 fs_Nor;
out vec4 fs_LightVec;
out vec4 fs_Col;
out vec4 fs_Pos;
out float fs_SmallNoise;
out float fs_CurlNoise;

const vec4 lightPos = vec4(0, 5, 0, 1);
const float PI = 3.14159;


float random (vec3 st) {
    return fract(sin(dot(st, vec3(12.9898, 78.233, 37.719))) * 43758.5453123);
}

// based on https://www.shadertoy.com/view/4dS3Wd
float noise (vec3 st) {
    vec3 i = floor(st);
    vec3 f = fract(st);

    float c000 = random(i + vec3(0.0, 0.0, 0.0));
    float c100 = random(i + vec3(1.0, 0.0, 0.0));
    float c010 = random(i + vec3(0.0, 1.0, 0.0));
    float c110 = random(i + vec3(1.0, 1.0, 0.0));
    float c001 = random(i + vec3(0.0, 0.0, 1.0));
    float c101 = random(i + vec3(1.0, 0.0, 1.0));
    float c011 = random(i + vec3(0.0, 1.0, 1.0));
    float c111 = random(i + vec3(1.0, 1.0, 1.0));

    vec3 u = f * f * (3.0 - 2.0 * f);

    float x00 = mix(c000, c100, u.x);
    float x10 = mix(c010, c110, u.x);
    float x01 = mix(c001, c101, u.x);
    float x11 = mix(c011, c111, u.x);
    float y0 = mix(x00, x10, u.y);
    float y1 = mix(x01, x11, u.y);

    return mix(y0, y1, u.z);
}

#define OCTAVES 6
float fbm (vec3 st) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.5;

    for (int i = 0; i < OCTAVES; i++) {
        value += amplitude * noise(frequency * st);
        st = st * 2.0;
        amplitude *= 0.5;
    }
    return value;
}

float triangle_wave(float x, float freq, float amplitude) {
    return abs(mod(x * freq, amplitude) - (0.5 * amplitude));
}

float displacement(vec3 p) {
    float time = u_Time * 0.03;
    float freq = 5.5;
    float amp = u_Height;
    float base = sin(freq * p.x - time) * sin(freq * p.y - time) * sin(freq * p.z - time);
    float triangle = triangle_wave(p.y, 2.5, 2.0);
    return amp * base;
}


void main()
{
    fs_Col = vs_Col;
    mat3 invTranspose = mat3(u_ModelInvTr);
    fs_Nor = vec4(invTranspose * vec3(vs_Nor), 0);

    vec3 up = vec3(0.0, 1.0, 0.0);
    float nor_dir = dot(up, normalize(vs_Nor.xyz));
    
    float weight = 3.0 * smoothstep(-0.7, 1.0, nor_dir);
    float noise_weight = 0.1 + 0.8 * smoothstep(-0.7, 1.0, nor_dir);
 
    float topR = length(vs_Pos.xz);
    topR = 1.0 - smoothstep(0.0, 2.5, topR);

    float h = displacement(vs_Pos.xyz);
    float small_noise = fbm(vs_Pos.xyz * 8.0 - vec3(0.0, u_Time * 0.04, 0.0));
    vec3 curl_noise = vec3(
        fbm(vs_Pos.xyz * 2.0 - vec3(1.4, 0.0, 0.0) + u_Time * 0.0003) - 0.5,
        0.0,
        fbm(vs_Pos.xyz * 2.0 - vec3(0.0, 0.0, 8.9) + u_Time * 0.003) - 0.5);

    vec4 new_pos = vs_Pos;
    new_pos += vec4(up * h * weight * topR, 0.0);
    new_pos += vec4(curl_noise * weight * topR * u_Curl, 0.0);
    new_pos += vec4(up * small_noise * noise_weight, 0.0);

    float total_displacement = h * weight * topR + weight * topR * 1.8 + noise_weight;
    fs_SmallNoise = small_noise;
    fs_CurlNoise = curl_noise.x - curl_noise.z;

    fs_Pos = new_pos;
    vec4 modelposition = u_Model * new_pos;

    fs_LightVec = lightPos - modelposition;
    gl_Position = u_ViewProj * modelposition;
}
