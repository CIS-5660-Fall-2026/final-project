#version 300 es

//This is a vertex shader. While it is called a "shader" due to outdated conventions, this file
//is used to apply matrix transformations to the arrays of vertex data passed to it.
//Since this code is run on your GPU, each vertex is transformed simultaneously.
//If it were run on your CPU, each vertex would have to be processed in a FOR loop, one at a time.
//This simultaneous transformation allows your program to run much faster, especially when rendering
//geometry with millions of vertices.

uniform mat4 u_Model;       // The matrix that defines the transformation of the
                            // object we're rendering. In this assignment,
                            // this will be the result of traversing your scene graph.

uniform mat4 u_ModelInvTr;  // The inverse transpose of the model matrix.
                            // This allows us to transform the object's normals properly
                            // if the object has been non-uniformly scaled.

uniform mat4 u_ViewProj;    // The matrix that defines the camera's transformation.
                            // We've written a static matrix for you to use for HW2,
                            // but in HW3 you'll have to generate one yourself

uniform float u_Time;
uniform float u_Tail;
uniform float u_Speed;
uniform float u_Length;

in vec4 vs_Pos;             // The array of vertex positions passed to the shader

in vec4 vs_Nor;             // The array of vertex normals passed to the shader

in vec4 vs_Col;             // The array of vertex colors passed to the shader.

out vec4 fs_Nor;            // The array of normals that has been transformed by u_ModelInvTr. This is implicitly passed to the fragment shader.
out vec4 fs_LightVec;       // The direction in which our virtual light lies, relative to each vertex. This is implicitly passed to the fragment shader.
out vec4 fs_Col;            // The color of each vertex. This is implicitly passed to the fragment shader.
out float fs_Displacement;


const vec4 lightPos = vec4(5, 5, 3, 1); //The position of our virtual light, which is used to compute the shading of
                                        //the geometry in the fragment shader.

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

float impulse(float k, float x)
{
    float h = k * x;
    return h * exp(1.0 - h);
}

vec3 random3(vec3 p) {
    return fract(sin(vec3(
        dot(p, vec3(127.1, 311.7, 74.7)),
        dot(p, vec3(269.5, 183.3, 246.1)),
        dot(p, vec3(113.5, 271.9, 124.6))
    )) * 43758.5453123);
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

float fbmPerlin(vec3 p) {
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

float wavyFunc(vec3 v){
    vec3 rV = random3(v);
    float h = sin(rV.x * rV.y * rV.z + 2.75)*1.2;
    //float h = sawtooth_wave(rV.x + rV.y + rV.z + u_Time*0.01, 1., 1.);
    h = (h + 1.0)/2.0;

    return h;
}

vec3 rotateAxis(vec3 p, vec3 axis, float angle) {
    return mix(dot(axis, p) * axis, p, cos(angle)) + cross(axis, p) * sin(angle);
}

float threshold = 0.75;

void main()
{
    fs_Col = vs_Col;                         // Pass the vertex colors to the fragment shader for interpolation

    mat3 invTranspose = mat3(u_ModelInvTr);
    fs_Nor = vec4(invTranspose * vec3(vs_Nor), 0);          // Pass the vertex normals to the fragment shader for interpolation.
                                                            // Transform the geometry's normals by the inverse transpose of the
                                                            // model matrix. This is necessary to ensure the normals remain
                                                            // perpendicular to the surface after the surface is transformed by
                                                            // the model matrix.


    vec4 pos = vs_Pos;

    float randVal = wavyFunc(pos.xyz);
    float randVal3 = fbmPerlin(vec3(pos + u_Time*0.01*u_Speed)) * 1.2;
    randVal3 = (randVal3 + 1.0)*0.5;

    vec3 tailDir = normalize(vec3(-1.0));
    vec3 normalDir = normalize(vs_Nor.xyz);

    float tailMask = dot(normalDir, tailDir);
    float weight = (tailMask + 1.0)*0.5;

    pos.xyz += randVal;

    // everything except dot product 0.95 - 1.0 gets a tail
    tailMask = smoothstep(0.-u_Tail, 0.95, tailMask);

    float phase = fract(u_Time * 0.001*u_Speed);
    float pulse = impulse(25.0, phase);

    pulse = gain(0.75, pulse);

    float tri = triangle_wave(u_Time * 0.01, 1.0, 1.0);
    float extraNoise = fbmPerlin(vec3(pos + u_Time*0.01))*1.;
    extraNoise = (extraNoise + 1.0) * 0.5;

    pos.xyz += tailDir * extraNoise * tri * 0.01 * tailMask;
    pos.xyz += tailDir * randVal3*u_Length * tailMask * (1.0 + pulse);

    fs_Displacement = length(pos.xyz - vs_Pos.xyz);

    vec4 modelposition = u_Model * pos;   // Temporarily store the transformed vertex positions for use below

    fs_LightVec = lightPos - modelposition;  // Compute the direction in which the light source lies

    gl_Position = u_ViewProj * modelposition;// gl_Position is a built-in variable of OpenGL which is
                                             // used to render the final positions of the geometry's vertices
}
