@group(${bindGroup_volumetric}) @binding(0) var<uniform> volume: VolumeUniforms;
@group(${bindGroup_volumetric}) @binding(1) var scatteringExtinctionBuffer: texture_3d<f32>;
@group(${bindGroup_volumetric}) @binding(2) var lightingBuffer: texture_storage_3d<rgba16float, write>;

@compute
@workgroup_size(${froxelWorkgroupSizeX}, ${froxelWorkgroupSizeY}, ${froxelWorkgroupSizeZ})
fn computeScatteredLight(@builtin(global_invocation_id) id: vec3u) {
    if (any(id >= textureDimensions(lightingBuffer))) {
        return;
    }

    // NCHORTEK TODO: Write the radiance scattered toward the camera (plus the extinction coefficient)
    // for this froxel
    textureStore(lightingBuffer, id, vec4f(0.0));
}