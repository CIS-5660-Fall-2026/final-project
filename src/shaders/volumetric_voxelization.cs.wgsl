@group(${bindGroup_volumetric}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_volumetric}) @binding(1) var<uniform> volume: VolumeUniforms;
@group(${bindGroup_volumetric}) @binding(2) var scatteringExtinctionBuffer: texture_storage_3d<rgba16float, write>;

@compute
@workgroup_size(${froxelWorkgroupSizeX}, ${froxelWorkgroupSizeY}, ${froxelWorkgroupSizeZ})
fn populateParticipatingMediaProperties(@builtin(global_invocation_id) id: vec3u) {
    if (any(id >= textureDimensions(scatteringExtinctionBuffer))) {
        return;
    }

    // NCHORTEK TODO: Use noise to generate participating media properties for this froxel
    textureStore(scatteringExtinctionBuffer,
        id,
        vec4f(vec3f(volume.scattering), volume.scattering + volume.absorption));
}