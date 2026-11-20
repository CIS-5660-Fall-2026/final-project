// CHECKITOUT: code that you add here will be prepended to all shaders

struct Light {
    pos: vec3f,
    color: vec3f
}

struct LightSet {
    numLights: u32,
    lights: array<Light>
}

// TODO-2: you may want to create a ClusterSet struct similar to LightSet
struct ClusterBounds {
    minValues: vec3f,
    maxValues: vec3f
}

struct Cluster {
    numLights: u32,
    lightIndices: array<u32, ${maxLightsPerCluster}>
}

struct ClusterSet {
    gridDims: vec3u,
    clusters: array<Cluster>
}

struct CameraUniforms {
    // TODO-1.3: add an entry for the view proj mat (of type mat4x4f)
    viewProjMat: mat4x4f,
    viewMat: mat4x4f,
    invViewMat: mat4x4f,
    invProjMat: mat4x4f,
    screenResolution: vec2f,
    zNear: f32,
    zFar: f32
    // NCHORTEK TODO: Add additional uniforms needed for Forward+
}

struct VolumeUniforms {
    volumeNearZ: f32,
    volumeFarZ: f32,
    distributionExponent: f32,
    scattering: f32,
    ambientLightColor: vec3f,
    absorption: f32,
    noiseFreq: f32,
    octaveCount: u32,
    densityScale: f32,
    phaseG: f32
}

const clusterZScale: f32 = f32(${gridDimZ}) / log2(f32(${farPlane}) / f32(${nearPlane}));
const clusterZBias: f32 = -f32(${gridDimZ}) * log2(f32(${nearPlane})) / log2(f32(${farPlane}) / f32(${nearPlane}));

// CHECKITOUT: this special attenuation function ensures lights don't affect geometry outside the maximum light radius
fn rangeAttenuation(distance: f32) -> f32 {
    return clamp(1.f - pow(distance / ${lightRadius}, 4.f), 0.f, 1.f) / (distance * distance);
}

fn calculateLightContrib(light: Light, posWorld: vec3f, nor: vec3f) -> vec3f {
    let vecToLight = light.pos - posWorld;
    let distToLight = length(vecToLight);

    let lambert = max(dot(nor, normalize(vecToLight)), 0.f);
    return light.color * lambert * rangeAttenuation(distToLight);
}

// Find the view-space point along the given vector that intersects
// a Z-aligned plane at a given input z coordinate
fn intersectZPlane(v: vec3f, z: f32) -> vec3f {
    return v * (z / v.z);
}

fn convertClipToView(pClip: vec4f, invProjMat: mat4x4f) -> vec4f {
    let pView: vec4f = invProjMat * pClip;
    return (pView / pView.w);
}

fn convertScreenToView(pScreen: vec4f, screenResolution: vec2f, invProjMat: mat4x4f) -> vec4f {
    let pUV: vec2f = pScreen.xy / screenResolution;
    return convertClipToView(
        vec4f((vec2f(pUV.x, 1.0 - pUV.y) * 2.0) - 1.0,
            pScreen.z,
            pScreen.w),
        invProjMat);
}

// Compute a view-space depth value from a given froxel z-slice (a continuous slice value, not an index)
fn getViewZFromFroxelZSlice(froxelZSlice: f32, numSlices: f32, volumeNearZ: f32, volumeFarZ: f32, distributionExponent: f32) -> f32 {
    let t = froxelZSlice / numSlices;

    let warpedT = pow(t, distributionExponent);

    return volumeNearZ * pow(volumeFarZ / volumeNearZ, warpedT);
}

// Compute a froxel z-slice value that corresponds to a given view-space depth.
// This is just the inversion of the froxelSlice -> viewZ mapping 
fn getContinuousFroxelZSlice(numSlices: f32, viewZ: f32, volumeNearZ: f32, volumeFarZ: f32, distributionExponent: f32) -> f32 {
    let clampedViewZ = max(viewZ, volumeNearZ);

    let logFarNear = log(volumeFarZ / volumeNearZ);
    let t = log(clampedViewZ / volumeNearZ) / logFarNear;

    let unwarpedT = pow(t, 1.0 / distributionExponent);

    return unwarpedT * numSlices;
}

// Compute a world space position from a given froxel z-slice (a continuous slice value where integers 
// correspond to froxel boundaries) and a uv value. This is effectively answering: "If I shot a ray 
// from the camera through a given UV position and then travelled along the froxel z-column to the 
// provided slice, what world position would I land at?"
fn getFroxelWorldPosition(
    uv: vec2f,
    slice: f32,
    numSlices: f32,
    volumeNearZ: f32,
    volumeFarZ: f32,
    distributionExponent: f32,
    invProjMat: mat4x4f,
    invViewMat: mat4x4f) -> vec3f {

    let ndc: vec2f = vec2f(
        (uv.x * 2.0) - 1.0,
        1.0 - (uv.y * 2.0));

    // By setting z = 1 we are placing this clip-space position
    // at the far plane. Note that z could be any valid clip-space
    // coordinate (anything in [0, 1])--we just care about obtaining
    // a view-space ray direction that points straight through the 
    // screen at the provided uv
    let clipFarPos: vec4f = vec4f(ndc, 1.0, 1.0);
    let viewFarPos: vec4f = invProjMat * clipFarPos;
    let viewDir: vec3f = normalize(viewFarPos.xyz / viewFarPos.w);

    let viewZ: f32 = getViewZFromFroxelZSlice(
        slice,
        numSlices,
        volumeNearZ,
        volumeFarZ,
        distributionExponent);

    // Find the view-space intersection point between the ray with
    // viewDir and the XY plane at -viewZ
    let viewPos: vec3f = viewDir * (-viewZ / viewDir.z);

    let worldPos: vec4f = invViewMat * vec4f(viewPos, 1.0);
    return worldPos.xyz;
}

fn getClusterIndex(zViewDistance: f32, uv: vec2f) -> u32 {
    let screenGridDims: vec3u = vec3u(u32(${gridDimX}), u32(${gridDimY}), u32(${gridDimZ}));

    let tileIdx: vec2u = vec2u(uv * vec2f(screenGridDims.xy));
    let zSliceIdx: u32 = u32(max(log2(zViewDistance) * clusterZScale + clusterZBias, 0.0));

    let clusterIdx: vec3u = min(vec3u(tileIdx, zSliceIdx), screenGridDims - vec3u(1u));

    return clusterIdx.x
        + clusterIdx.y * screenGridDims.x
        + clusterIdx.z * screenGridDims.x * screenGridDims.y;
}