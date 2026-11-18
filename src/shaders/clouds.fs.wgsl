@group(0) @binding(0) var<uniform> cameraUniforms: CameraUniforms;

@group(1) @binding(0) var u_DitherTex: texture_3d<f32>;
@group(1) @binding(1) var u_DitherSampler: sampler;

struct FragmentInput {
    @builtin(position) position: vec4f,
    @location(0) ndc: vec2f
}

const NUM_STEPS: u32 = 64;
const DOT_SCALE: f32 = 10.0;
const ABSORPTION: f32 = 0.2;
const SCATTERING: f32 = 0.1;
const EXTINCTION: f32 = ABSORPTION + SCATTERING;

const BB_MIN: vec3f = vec3f(-62.5, -50.75, -62.5);
const BB_MAX: vec3f = vec3f(12.5, 8.75, 12.5);
const CLOUD_CENTER: vec3f = vec3f(-25.0, 2.5, -25.0);
const CLOUD_SCALE: f32 = 0.5;

const SURFACE_THRESHOLD = 0.02;
const NUM_BISECT_STEPS = 6;

const LIGHT_VEC: vec3f = normalize(vec3f(1.0, 1.0, 1.0));
const HIGHLIGHT_COLOR: vec3f = vec3f(0.9020, 0.9961, 0.9961);
const SHADOW_COLOR: vec3f = vec3f(0.204, 0.196, 0.106);

struct March {
    opacity: f32,
    tSurface: f32,
}

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

fn cloudDensity(p: vec3f) -> f32 {
    let noiseP = CLOUD_CENTER + (p - CLOUD_CENTER) / CLOUD_SCALE;
    let shape = fbm(noiseP * 0.035);
    let detail = fbm(noiseP * 0.12);

    let density = shape - detail * 0.2;
    let cloudShape = smoothstep(0.42, 0.62, density);

    let height = (p.y - BB_MIN.y) / (BB_MAX.y - BB_MIN.y);
    let heightShape = smoothstep(0.0, 0.15, height) *(1.0 - smoothstep(0.75, 1.0, height));

    return cloudShape * heightShape;
}

fn cloudNormal(p: vec3f, rd: vec3f) -> vec3f {
    // take 6 samples of density around point to estimate gradient and approximate normal
    let eps = 0.5;
    let dx = cloudDensity(p + vec3f(eps, 0.0, 0.0)) - cloudDensity(p - vec3f(eps, 0.0, 0.0));
    let dy = cloudDensity(p + vec3f(0.0, eps, 0.0)) - cloudDensity(p - vec3f(0.0, eps, 0.0));
    let dz = cloudDensity(p + vec3f(0.0, 0.0, eps)) - cloudDensity(p - vec3f(0.0, 0.0, eps));
    let gradient = vec3f(dx, dy, dz);

    let len_grad = length(gradient);
    if (len_grad < 1e-6) {
        // region is too flat - nan values
        return -rd;
    }
    return -gradient / len_grad; // negative to point outward
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

fn rayMarchClouds(ro: vec3f, rd: vec3f) -> March {
    var finalMarch = March(0.0, 0.0);

    // get start and end based on bounding box
    let startEndBB = intersectBB(ro, rd);
    let tStart = max(0.0, startEndBB.x);
    let tEnd = startEndBB.y;
    if (tEnd <= tStart) {
        return finalMarch;
    }

    // get step size
    let stepSize = (tEnd - tStart) / f32(NUM_STEPS);

    // set initial values
    var weightSum = 0.0;
    var tWeighted = 0.0;
    var tHit = 0.0;
    var tPrev = 0.0;
    var hit = false;

    var finalColor = vec3(0.0, 0.0, 0.0);
    var finalT = 1.0;

    for (var i = 0u; i < NUM_STEPS; i++) {
        // get sample
        let t = tStart + (f32(i) + 0.5) * stepSize;
        let p = ro + rd * t;

        // sample cloud for parameters
        let density = cloudDensity(p);

        if (!hit && density > SURFACE_THRESHOLD) {
            // get inside isosurface -> bisect to find exact point
            var first = tPrev;
            var second = t;
            for (var j = 0; j < NUM_BISECT_STEPS; j++) {
                let middle = 0.5 * (first + second);
                let newDensity = cloudDensity(ro + rd * middle);
                if (newDensity > SURFACE_THRESHOLD) {
                    // still in isosurface so go back
                    second = middle;
                }
                else {
                    first = middle;
                }
            }
            tHit = second;
            hit = true;
        }
        tPrev = t;

        if (density < 0.01) {
            // check if ray has exited the cloud volume
            continue;
        }

        // accumulate final values
        let deltaT = exp(-density * stepSize * EXTINCTION);   // beer-lambert transmission
        let alpha = 1.0 - deltaT;   // light that doesn't survive
        let weight = alpha * finalT;
        tWeighted += weight * t;    // running sum of depth and weight at that depth
        weightSum += weight;
        finalT *= deltaT;
        if (finalT < 0.01) {
            // cloud is too thick
            break;
        }
    }

    finalMarch.opacity = 1.0 - finalT;
    let tMean = select(tStart, tWeighted / weightSum, weightSum > 1e-6);     // to get estimate of cloud surface point
    finalMarch.tSurface = select(tMean, tHit, hit);     // only use mean if we never reach the isosurface (aka no hit)
    return finalMarch;
}

fn projectUV(p: vec3f, nor: vec3f) -> vec2f {
    if (nor.x > nor.y && nor.x > nor.z) { return p.yz; }
    else if (nor.y > nor.z)             { return p.xz; }
    return p.xy;
}

// -----------------------------------


@fragment
fn fs_main(in: FragmentInput) -> @location(0) vec4f
{
    // get ray origin and direction
    let ndc = vec2f(in.ndc.x, -in.ndc.y);
    let farPoint = cameraUniforms.invViewProjMat * vec4f(ndc, 1.0, 1.0);
    let worldFar = farPoint.xyz / farPoint.w;
    let ro = (cameraUniforms.invViewMat * vec4f(0.0, 0.0, 0.0, 1.0)).xyz;
    let rd = normalize(worldFar - ro);

    // ray march
    let march = rayMarchClouds(ro, rd);

    // get uv
    let pos = ro + rd * march.tSurface;  // approx position on cloud based on ray marcher
    let normal = cloudNormal(pos, rd);
    let nor = abs(normal);
    let uv0 = projectUV(pos, nor);

    // lighting and radiance
    let diffuseTerm =  dot(normal, LIGHT_VEC);
    let ambientTerm = 0.1;
    let lightIntensity = mix(ambientTerm, 1.0, max(diffuseTerm, 0.0));
    let cloudOpacity = smoothstep(0.05, 0.95, march.opacity);
    let brightness = lightIntensity * cloudOpacity;

    // (new) estimate derivatives of cloud uv -> assume a flat plane around point
    let rdx = rd + dpdx(rd);
    let rdy = rd + dpdy(rd);
    let dnx = dot(rdx, normal);
    let dny = dot(rdy, normal);
    let tx = dot(pos - ro, normal) / select(dnx, 1e-4, abs(dnx) < 1e-4);
    let ty = dot(pos - ro, normal) / select(dny, 1e-4, abs(dny) < 1e-4);
    let dx = projectUV(ro + rdx * tx, nor) - uv0;
    let dy = projectUV(ro + rdy * ty, nor) - uv0;

    // SVD uv freq - from Rune's implementation
    let Q = dot(dx, dx) + dot(dy, dy);
    let R = dx.x * dy.y - dx.y * dy.x;
    let discriminant = sqrt(max(0.0, Q * Q - 4.0 * R * R));
    let freq = sqrt(max(vec2f(Q + discriminant, Q - discriminant) * 0.5, vec2f(0.0)));
    var spacing = freq.y; // dot spacing
    spacing *= DOT_SCALE;
    spacing /= max(sqrt(lightIntensity), 0.001);

    // get fractal level
    let spacingLog = log2(max(spacing, 1e-5));
    let level = floor(spacingLog);
    let frac = fract(spacingLog); // percent to next level

    // get sub-layer
    let subLayer = mix(1.0, 4.0, 1.0 - frac); // blend between 1 and 4 dots
    let layer = (subLayer - 1.0) * 8.0;
    let w = (layer + 0.5) / 25.0;

    // scale uv for current fractal level
    let uv = uv0 / exp2(level);

    // get threshold from 3D Bayer matrix texture
    let threshold = textureSample(u_DitherTex, u_DitherSampler, vec3f(uv, w)).r;
    let dither = select(0.0, 1.0, brightness > threshold);
    let color = mix(SHADOW_COLOR, HIGHLIGHT_COLOR, dither);

    var alpha = select(0.0, 1.0, march.opacity > 0.02);
    return vec4f(color, alpha);
    //return vec4f(vec3f((level + 6.0) / 12.0), 1.0);
}