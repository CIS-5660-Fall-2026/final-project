@group(${bindGroup_volumetric}) @binding(0) var<uniform> volume: VolumeUniforms;
@group(${bindGroup_volumetric}) @binding(1) var scatteringExtinctionBuffer: texture_3d<f32>;
@group(${bindGroup_volumetric}) @binding(2) var lightingBuffer: texture_storage_3d<rgba16float, write>;
@group(${bindGroup_volumetric}) @binding(3) var<uniform> camera: CameraUniforms;
@group(${bindGroup_volumetric}) @binding(4) var<storage, read> lightSet: LightSet;
@group(${bindGroup_volumetric}) @binding(5) var<storage, read> clusterSet: ClusterSet;

// Henyey-Greenstein phase function -- calculates the proportion of light that
// a volume scatters towards the camera
fn phase(dirToLight: vec3f, dirToCamera: vec3f, g: f32) -> f32 {
    let cosTheta = dot(dirToLight, dirToCamera);
    var denom: f32 = 1.0 + (g * g) + (2.0 * g * cosTheta);
    denom = max(denom, 1e-6);
    let inv4pi: f32 = 1.0 / (4.0 * 3.1415926);
    return inv4pi * (1.0 - (g * g)) / (denom * sqrt(denom));
}

@compute
@workgroup_size(${froxelWorkgroupSizeX}, ${froxelWorkgroupSizeY}, ${froxelWorkgroupSizeZ})
fn computeScatteredLight(@builtin(global_invocation_id) id: vec3u) {
    if (any(id >= textureDimensions(lightingBuffer))) {
        return;
    }

    let participatingMediaProperties: vec4f = textureLoad(scatteringExtinctionBuffer, id, 0);

    // If the extinction coefficient is non-positive, then there is no volume in this froxel.
    // Negative values shouldn't happen, but we'll cover them just to be safe.
    if (participatingMediaProperties.a <= 0.0)
    {
        textureStore(lightingBuffer, id, vec4f(0.0));
        return;
    }

    let froxelGridDims: vec3f = vec3f(f32(${froxelGridDimX}), f32(${froxelGridDimY}), f32(${froxelGridDimZ}));

    // We add 0.5 to both our uv and froxel slice computations because we want
    // to obtain the world position of the center of the froxel
    let uv: vec2f = (vec2f(id.xy) + 0.5) / froxelGridDims.xy;
    let froxelZSlice: f32 = f32(id.z) + 0.5;
    let froxelWorldPos: vec3f = getFroxelWorldPosition(
        uv,
        froxelZSlice,
        froxelGridDims.z,
        volume.volumeNearZ,
        volume.volumeFarZ,
        volume.distributionExponent,
        camera.invProjMat,
        camera.invViewMat);

    let viewZ: f32 = getViewZFromFroxelZSlice(
        froxelZSlice,
        froxelGridDims.z,
        volume.volumeNearZ,
        volume.volumeFarZ,
        volume.distributionExponent);

    let flatClusterIdx: u32 = getClusterIndex(viewZ, uv);
    let cameraWorldPos: vec3f = camera.invViewMat[3].xyz;
    let vecToCamera = normalize(cameraWorldPos - froxelWorldPos);

    var totalLightContrib = vec3f(0.0);
    for (var lightIdx = 0u; lightIdx < clusterSet.clusters[flatClusterIdx].numLights; lightIdx++) {
        let light = lightSet.lights[clusterSet.clusters[flatClusterIdx].lightIndices[lightIdx]];

        // Calculate light contribution
        let vecToLight = light.pos - froxelWorldPos;
        let distToLight = length(vecToLight);
        let attenuation: f32 = rangeAttenuation(distToLight);
        totalLightContrib += (light.color * attenuation * phase(normalize(vecToLight), vecToCamera, volume.phaseG));
    }

    totalLightContrib += volume.ambientLightColor;

    // Write the radiance scattered toward the camera (plus the extinction coefficient) for this froxel
    textureStore(lightingBuffer,
        id,
        vec4f(totalLightContrib * participatingMediaProperties.rgb, participatingMediaProperties.a));
}