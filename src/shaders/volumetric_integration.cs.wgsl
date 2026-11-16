@group(${bindGroup_volumetric}) @binding(0) var<uniform> volume: VolumeUniforms;
@group(${bindGroup_volumetric}) @binding(1) var lightingBuffer: texture_3d<f32>;
@group(${bindGroup_volumetric}) @binding(2) var integrationBuffer: texture_storage_3d<rgba16float, write>;

const numFroxelZSlices: u32 = u32(${froxelGridDimZ});

@compute
@workgroup_size(${froxelWorkgroupSizeX}, ${froxelWorkgroupSizeY})
fn integrateVolume(@builtin(global_invocation_id) id: vec3u) {
    if (any(id.xy >= textureDimensions(integrationBuffer).xy)) {
        return;
    }

    // NCHORTEK TODO: Step through all of the z-slices for this XY position,
    // writing one texel per slice. Each texel stores the scattered light
    // and transmittance accumulated from the camera up to the corresponding
    // z-slice's far boundary
    var inScatter: vec3f = vec3f(0.0, 0.0, 0.0);
    var transmittance: f32 = 1.0;
    for (var zSliceIdx = 0u; zSliceIdx < numFroxelZSlices; zSliceIdx++) {
        textureStore(integrationBuffer, vec3u(id.xy, zSliceIdx), vec4f(inScatter, transmittance));
    }
}