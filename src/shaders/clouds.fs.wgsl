@group(0) @binding(0) var<uniform> cameraUniforms: CameraUniforms;

@group(1) @binding(0) var u_DitherTex: texture_3d<f32>;
@group(1) @binding(1) var u_DitherSampler: sampler;

struct FragmentInput {
    @builtin(position) position: vec4f,
    @location(0) ndc: vec2f
}

const NUM_STEPS: u32 = 100;
const DOT_SCALE: f32 = 10.0;
const EXTINCTION: f32 = 0.1;

const BB_MIN: vec3f = vec3f(-62.5, -3.75, -62.5);
const BB_MAX: vec3f = vec3f(12.5, 8.75, 12.5);

const CLOUD_CENTER: vec3f = vec3f(-25.0, 2.5, -25.0);
const CLOUD_SCALE: f32 = 0.5;

const LIGHT_DIR: vec3f = normalize(vec3f(-1.0, -1.0, -1.0));
const HIGHLIGHT_COLOR: vec3f = vec3f(1.0, 1.0, 1.0);
const SHADOW_COLOR: vec3f = vec3f(0.2, 0.2, 0.2);


// -----------------------------------
// CLOUD GENERATION FUNCTIONS
// -----------------------------------

fn random(p: vec3f) -> f32 {
    return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453123);
}

// based on https://www.shadertoy.com/view/4dS3Wd
fn noise(p: vec3f) -> f32 {
    let i = floor(p);
    let f = fract(p);

    let c000 = random(i + vec3(0.0, 0.0, 0.0));
    let c100 = random(i + vec3(1.0, 0.0, 0.0));
    let c010 = random(i + vec3(0.0, 1.0, 0.0));
    let c110 = random(i + vec3(1.0, 1.0, 0.0));
    let c001 = random(i + vec3(0.0, 0.0, 1.0));
    let c101 = random(i + vec3(1.0, 0.0, 1.0));
    let c011 = random(i + vec3(0.0, 1.0, 1.0));
    let c111 = random(i + vec3(1.0, 1.0, 1.0));

    let u = f * f * (3.0 - 2.0 * f);

    let x00 = mix(c000, c100, u.x);
    let x10 = mix(c010, c110, u.x);
    let x01 = mix(c001, c101, u.x);
    let x11 = mix(c011, c111, u.x);
    let y0 = mix(x00, x10, u.y);
    let y1 = mix(x01, x11, u.y);

    return mix(y0, y1, u.z);
}

fn fbm(p: vec3f) -> f32 {
    var pFbm = p;
    var value = 0.0;
    var amplitude = 0.5;

    for (var i = 0; i < 4; i++) {
        value += amplitude * noise(pFbm);
        pFbm *= 2.0;
        amplitude *= 0.4;
    }
    return value;
}

// -----------------------------------

// -----------------------------------
// CLOUD PARAMETER FUNCTIONS
// -----------------------------------

fn cloudDensityOG(p: vec3f) -> f32 {
    let shape = fbm(p * 0.015);
    let detail = fbm(p * 0.06);

    let density = shape - detail * 0.25;

    return smoothstep(0.3, 0.5, density);
}

fn cloudDensity(p: vec3f) -> f32 {
    // Compress the cloud formation around its center.
    let noiseP = CLOUD_CENTER + (p - CLOUD_CENTER) / CLOUD_SCALE;

    // Generate large-scale cloud shapes.
    let shape = fbm(noiseP * 0.035);

    // Add smaller-scale details.
    let detail = fbm(noiseP * 0.12);

    // Combine shape and detail.
    let density = shape - detail * 0.2;

    let cloudShape = smoothstep(0.42, 0.62, density);

    // Fade density near the top and bottom of the volume.
    let height = (p.y - BB_MIN.y) / (BB_MAX.y - BB_MIN.y);

    let heightShape =
        smoothstep(0.0, 0.15, height) *
        (1.0 - smoothstep(0.75, 1.0, height));

    return cloudShape * heightShape;
}

fn cloudNormal(p: vec3f) -> vec3f {
    // take 6 samples of density around point to estimate gradient and approximate normal
    let eps = 0.1;
    let dx = cloudDensity(p + vec3f(eps, 0.0, 0.0)) - cloudDensity(p - vec3f(eps, 0.0, 0.0));
    let dy = cloudDensity(p + vec3f(0.0, eps, 0.0)) - cloudDensity(p - vec3f(0.0, eps, 0.0));
    let dz = cloudDensity(p + vec3f(0.0, 0.0, eps)) - cloudDensity(p - vec3f(0.0, 0.0, eps));
    let gradient = vec3f(dx, dy, dz);

    return -normalize(gradient); // negative to point outward
}

fn cloudDither(p: vec3f, normal: vec3f, lightIntensity: f32) -> vec3f {
    // get uv
    let nor = abs(normalize(normal));
    var uv0: vec2f;
    if (nor.x > nor.y && nor.x > nor.z) {
        uv0 = p.yz;
    } else if (nor.y > nor.z) {
        uv0 = p.xz;
    } else {
        uv0 = p.xy;
    }
    let ditherUV = uv0 * DOT_SCALE;

    // get value from 3D Bayer matrix texture
    let threshold = textureSampleLevel(u_DitherTex, u_DitherSampler, vec3(ditherUV, 0.02), 0.0).r;
    let dither = select(0.0, 1.0, threshold > lightIntensity);
    let finalColor = mix(SHADOW_COLOR, HIGHLIGHT_COLOR, dither);
    return finalColor;
}
    
// -----------------------------------

// -----------------------------------
// CLOUD PARAMETER FUNCTIONS
// -----------------------------------

fn intersectBB(ro: vec3f, rd: vec3f) -> vec2f {
    let t0 = (BB_MIN - ro) / rd;
    let t1 = (BB_MAX - ro) / rd;

    let tMin = min(t0, t1);
    let tMax = max(t0, t1);

    let tStart = max(max(tMin.x, tMin.y), tMin.z);
    let tEnd = min(min(tMax.x, tMax.y), tMax.z);

    return vec2f(tStart, tEnd);
}

fn rayMarchClouds(ro: vec3f, rd: vec3f) -> vec4f {
    // get start and end based on bounding box
    let startEndBB = intersectBB(ro, rd);
    let tStart = max(0.0, startEndBB.x);
    let tEnd = startEndBB.y;
    if (tEnd <= tStart) {
        return vec4f(0.0);
    }

    // get step size
    let stepSize = (tEnd - tStart) / f32(NUM_STEPS);

    var finalColor = vec3(0.0, 0.0, 0.0);
    var finalTransmittance = 1.0;

    for (var i = 0u; i < NUM_STEPS; i++) {
        // get sample
        let t = tStart + (f32(i) + 0.5) * stepSize;
        let p = ro + rd * t;

        // sample cloud for parameters
        let density = cloudDensity(p);
        //let density = cloudDensityTest(p);
        if (density < 0.01) {
            // check if ray has exited the cloud volume
            continue;
        }
        let normal = cloudNormal(p);
        let diffuse = max(dot(normal, LIGHT_DIR), 0.0);
        let ambient = 0.1;
        let lightIntensity = mix(ambient, 1.0, max(diffuse, 0.0));
        let color = cloudDither(p, normal, lightIntensity);
        //let color = vec3(1.0, 1.0, 1.0);
        let alpha = 1.0 - exp(-density * stepSize * EXTINCTION);

        // accumulate color and opacity
        finalColor += color * alpha * finalTransmittance;
        finalTransmittance *= 1.0 - alpha;
        if (finalTransmittance < 0.01) {
            // cloud is too thick
            break;
        }
    }
    let finalAlpha = 1.0 - finalTransmittance;
    return vec4(finalColor, finalAlpha);
}

// -----------------------------------



@fragment
fn fs_main(in: FragmentInput) -> @location(0) vec4f
{
    let ndc = vec2f(in.ndc.x, -in.ndc.y);
    let farPoint = cameraUniforms.invViewProjMat * vec4f(ndc, 1.0, 1.0);
    let worldFar = farPoint.xyz / farPoint.w;
    let cameraPosition = (cameraUniforms.invViewMat * vec4f(0.0, 0.0, 0.0, 1.0)).xyz;
    let rd = normalize(worldFar - cameraPosition);

    return rayMarchClouds(cameraPosition, rd);
}