#version 300 es

// This is a fragment shader. If you've opened this file first, please
// open and read lambert.vert.glsl before reading on.
// Unlike the vertex shader, the fragment shader actually does compute
// the shading of geometry. For every pixel in your program's output
// screen, the fragment shader is run for every bit of geometry that
// particular pixel overlaps. By implicitly interpolating the position
// data passed into the fragment shader by the vertex shader, the fragment shader
// can compute what color to apply to its pixel based on things like vertex
// position, light position, and vertex color.
precision highp float;

uniform vec4 u_Color; // The color with which to render this instance of geometry.
uniform vec4 u_Color2;
uniform vec4 u_Color3;
uniform vec4 u_Color4;

uniform float u_Time;
uniform float u_Speed;
uniform float u_Length;
uniform float u_ColorTransition;

// These are the interpolated values out of the rasterizer, so you can't know
// their specific values without knowing the vertices that contributed to them
in vec4 fs_Nor;
in vec4 fs_LightVec;
in vec4 fs_Col;
in vec4 fs_Pos;

in float fs_Displacement;

out vec4 out_Col; // This is the final output color that you will see on your
                  // screen for the pixel that is currently being processed.

vec3 random3(vec3 p) {
    return fract(sin(vec3(
        dot(p, vec3(127.1, 311.7, 74.7)),
        dot(p, vec3(269.5, 183.3, 246.1)),
        dot(p, vec3(113.5, 271.9, 124.6))
    )) * 43758.5453123);
}

float hash1(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

vec3 starColorFromRandom(float r) {
    if (r < 0.20) return vec3(1.0, 1.0, 1.0);
    if (r < 0.40) return vec3(0.7, 0.8, 1.0);
    if (r < 0.60) return vec3(1.0, 0.9, 0.7);
    if (r < 0.80) return vec3(1.0, 0.7, 0.5);
    return vec3(1.0, 0.5, 0.5);
}

float WorleyNoise3D(vec3 p, out vec3 color) {
    vec3 pInt = floor(p);
    vec3 pFract = fract(p);

    float minDist = 1.0;
    vec3 cell = vec3(0.);

    // Search the 3��3��3 neighborhood
    for (int z = -1; z <= 1; z++) {
        for (int y = -1; y <= 1; y++) {
            for (int x = -1; x <= 1; x++) {

                vec3 neighbor = vec3(float(x), float(y), float(z));

                // Random feature point inside the cell
                vec3 point = random3(pInt + neighbor);

                // Animate point positions
                //point = 0.5 + 0.5 * sin(u_Time * 0.01 + 6.283185 * point);

                // Vector from cell point to fragment
                vec3 diff = neighbor + point - pFract;

                // Euclidean distance
                float dist = length(diff);

                //minDist = min(minDist, dist);
                if (dist < minDist) {
                    minDist = dist;
                    cell = pInt + neighbor;
                }
            }
        }
    }

    // Smooth shaping
    float t = minDist;
    color = starColorFromRandom(hash1(cell));
    return t;
}

float surflet(vec3 P, vec3 gridPoint) {
    float distX = abs(P.x - gridPoint.x);
    float distY = abs(P.y - gridPoint.y);
    float distZ = abs(P.z - gridPoint.z);

    float tX = 1.0 - 6.0 * pow(distX, 5.0) + 15.0 * pow(distX, 4.0) - 10.0 * pow(distX, 3.0);
    float tY = 1.0 - 6.0 * pow(distY, 5.0) + 15.0 * pow(distY, 4.0) - 10.0 * pow(distY, 3.0);
    float tZ = 1.0 - 6.0 * pow(distZ, 5.0) + 15.0 * pow(distZ, 4.0) - 10.0 * pow(distZ, 3.0);

    vec3 gradient = 2.0 * random3(gridPoint) - vec3(1.0);

    vec3 diff = P - gridPoint;

    float height = dot(diff, gradient);

    return height * tX * tY * tZ;
}

float perlinNoise3D(vec3 uv) {
    float surfletSum = 0.0;

    // Iterate over the 8 corners of the cube (dx, dy, dz)
    for (int dx = 0; dx <= 1; ++dx) {
        for (int dy = 0; dy <= 1; ++dy) {
            for (int dz = 0; dz <= 1; ++dz) {
                surfletSum += surflet(uv, floor(uv) + vec3(float(dx), float(dy), float(dz)));
            }
        }
    }
    return surfletSum;
}

float fPerlin(vec3 p) {
    float total = 0.0;
    int octaves = 8;
    float amp = 0.5;
    float freq = 2.0;
    float persistence = 0.5;

    for (int i = 0; i < octaves; i++) {
        total += perlinNoise3D(p * freq) * amp;
        freq *= 2.0;
        amp *= persistence;  // decreases amplitude �� smoother composite
    }

    return total;
}

// https://dev.thi.ng/gradients/
vec3 palette(in float t, in vec3 a, in vec3 b, in vec3 c, in vec3 d)
{
    return a + b * cos(6.283185 * (c * t + d)*0.52);
}

vec3 palette2(in float t, in vec3 a, in vec3 b, in vec3 c, in vec3 d)
{
    return a + b * sin(6.283185 * (c * t + d)*0.42);
}

vec3 BWRPalette(float t) {
    vec3 v1 = vec3(0.250, 0.000, 0.250);
    vec3 v2 = vec3(0.228, 0.038, 0.500);
    vec3 v3 = vec3(0.700, 1.000, 1.000);
    vec3 v4 = vec3(0.0667, 0.333, 0.000);

    return palette(t, v1, v2, v3, v4);
}

void main()
{
    //Background
    vec4 FragColor;
    vec3 starColor;
    vec3 dummy;

    vec3 dir = normalize(fs_Pos.xyz);
    vec3 moveDir = normalize(vec3(1.0, 1.0, 1.0));

    float noise2 = fPerlin(dir);
    float mask = perlinNoise3D(dir + vec3(0.0, u_Time*0.00125, 0.0));
    float noise2_clamped = noise2 * 0.5 + 0.5;
    mask = mask * 0.5 + 0.5;
    mask = smoothstep(0.4, 0.8, mask);

    vec4 nebulaCol = mix(vec4(0.5, 0.0, 0.5, 1.0), vec4(0.0, 0.0, 0.0, 1.0), noise2 * 2.0);
    nebulaCol = vec4(BWRPalette(noise2 * 2.0), 1.0);
    FragColor = mix(vec4(0.0, 0.0, 0.0, 1.0), nebulaCol, mask);

    float noise = WorleyNoise3D(u_Time * 0.0003 + dir * 50.0, starColor);
    float intensity = WorleyNoise3D(dir * 75.0, dummy);
    if (noise < 0.1) {
        float pow_intensity = pow(intensity, 5.0);
        float starBrightness;
        if (pow_intensity > 0.85) {
            starBrightness = 25.0 * intensity;
        }
        else {
            starBrightness = intensity;
        }
        FragColor = vec4(starColor * starBrightness, 1.0);
    }

    out_Col = FragColor;
}
