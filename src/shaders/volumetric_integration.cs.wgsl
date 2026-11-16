@group(${bindGroup_volumetric}) @binding(0) var<uniform> volume: VolumeUniforms;
@group(${bindGroup_volumetric}) @binding(1) var lightingBuffer: texture_3d<f32>;
@group(${bindGroup_volumetric}) @binding(2) var integrationBuffer: texture_storage_3d<rgba16float, write>;

@compute
@workgroup_size(${froxelWorkgroupSizeX}, ${froxelWorkgroupSizeY})
fn main(@builtin(global_invocation_id) id: vec3u) {
    if (any(id.xy >= textureDimensions(integrationBuffer).xy)) {
        return;
    }

    // NCHORTEK TODO: Step through all of the z-slices for this XY position,
    // writing one texel per slice. Each texel stores the scattered light
    // and transmittance accumulated from the camera up to the corresponding
    // z-slice
}