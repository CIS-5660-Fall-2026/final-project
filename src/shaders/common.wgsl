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
