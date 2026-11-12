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

in float fs_Displacement;

out vec4 out_Col; // This is the final output color that you will see on your
                  // screen for the pixel that is currently being processed.

float bias(float b, float t)
{
    return pow(t, log(b) / log(0.5));
}

float gain(float g, float t)
{
    if (t < 0.5)
        return bias(1.0 - g, 2.0 * t) / 2.0;
    else
        return 1.0 - bias(1.0 - g, 2.0 - 2.0 * t) / 2.0;
}

float impulse(float k, float x)
{
    float h = k * x;
    return h * exp(1.0 - h);
}

float square_wave(float x, float freq, float amplitude)
{
    return abs(mod(floor(x * freq), 2.0) * amplitude);
}

float sawtooth_wave(float x, float freq, float amplitude)
{
    return (x * freq - floor(x * freq)) * amplitude;
}

float triangle_wave(float x, float freq, float amplitude)
{
    return abs(mod(x * freq, amplitude) - (0.5 * amplitude));
}

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
    vec3 cell = vec3(0);

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
    vec3 v1 = u_Color.xyz;
    vec3 v2 = u_Color2.xyz;
    vec3 v3 = u_Color3.xyz;
    vec3 v4 = u_Color4.xyz;
    //vec3 v1 = vec3(0.55, 0.60, 0.85); 
    // vec3 v2 = vec3(0.30, 0.25, 0.10);
    // vec3 v3 = vec3(0.80, 0.90, 1.00); 
    // vec3 v4 = vec3(0.85, 0.90, 0.95); 

    return palette(t, v1, v2, v3, v4);
}

vec3 BWRPalette2(float t) {
    vec3 v1 = vec3(0.88, 0.78, 0.95);  
    vec3 v2 = vec3(0.18, 0.10, 0.22);  
    vec3 v3 = vec3(1.0, 1.0, 1.0);
    vec3 v4 = vec3(0.00, 0.16, 0.08);  

    return palette2(t, v1, v2, v3, v4);
}

void main()
{
    vec3 resultColor = BWRPalette(fs_Displacement + u_Time*u_ColorTransition);

    float phase = fract(u_Time * 0.001*u_Speed);
    float pulse = impulse(25.0, phase);

    pulse = gain(0.75, pulse);

    vec3 impulseColor = BWRPalette2(fs_Displacement);

    resultColor = mix(resultColor, impulseColor, pulse);

    vec4 diffuseColor = vec4(resultColor,1.0);

    // Calculate the diffuse term for Lambert shading
    float diffuseTerm = dot(normalize(fs_Nor), normalize(fs_LightVec));
    // Avoid negative lighting values
    diffuseTerm = clamp(diffuseTerm, 0., 1.);

    float ambientTerm = 0.5;

    float lightIntensity = diffuseTerm + ambientTerm;   //Add a small float value to the color multiplier
                                                        //to simulate ambient lighting. This ensures that faces that are not
                                                        //lit by our point light are not completely black.
    
    // Compute final shaded color
    //out_Col = vec4(diffuseColor.rgb * lightIntensity, diffuseColor.a);
    out_Col = vec4(resultColor, 1.0);
}
