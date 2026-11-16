@group(${bindGroup_volumetric}) @binding(0) var<uniform> volume: VolumeUniforms;
@group(${bindGroup_volumetric}) @binding(1) var lightingBuffer: texture_3d<f32>;
@group(${bindGroup_volumetric}) @binding(2) var integrationBuffer: texture_storage_3d<rgba16float, write>;

const numFroxelZSlices: u32 = u32(${froxelGridDimZ});
const cameraNearZ: f32 = f32(${nearPlane});
const epsilon: f32 = 1e-6;

fn getFroxelStepSize(zSliceIdx: u32) -> f32
{
    var z0: f32 = getViewZFromFroxelZSlice(
        f32(zSliceIdx),
        f32(numFroxelZSlices),
        volume.volumeNearZ,
        volume.volumeFarZ,
        volume.distributionExponent);
    z0 = select(z0, cameraNearZ, zSliceIdx == 0u);

    let z1: f32 = getViewZFromFroxelZSlice(
        f32(zSliceIdx + 1u),
        f32(numFroxelZSlices),
        volume.volumeNearZ,
        volume.volumeFarZ,
        volume.distributionExponent);

    return z1 - z0;
}


@compute
@workgroup_size(${froxelWorkgroupSizeX}, ${froxelWorkgroupSizeY})
fn integrateVolume(@builtin(global_invocation_id) id: vec3u) {
    if (any(id.xy >= textureDimensions(integrationBuffer).xy)) {
        return;
    }

    // Step through all of the z-slices for this XY position, writing one texel per slice. 
    // Each texel stores the scattered light and transmittance accumulated from the camera 
    // up to the corresponding z-slice's far boundary
    var accumInScatter: vec3f = vec3f(0.0, 0.0, 0.0);
    var accumTransmittance: f32 = 1.0;
    for (var zSliceIdx = 0u; zSliceIdx < numFroxelZSlices; zSliceIdx++) {
        let uvw: vec3u = vec3u(id.xy, zSliceIdx);
        let sourceExtinction: vec4f = textureLoad(lightingBuffer, uvw, 0);
        let source: vec3f = sourceExtinction.rgb;
        let extinction: f32 = select(epsilon, sourceExtinction.a, sourceExtinction.a > epsilon);
        let stepSize: f32 = getFroxelStepSize(zSliceIdx);

        // Calculate the fraction of light that crosses this slice without being absorbed or scattered away
        let curSliceTransmittance: f32 = exp(-extinction * stepSize);

        // Calculate this slice's total light contribution as seen from its near boundary
        let integratedSource: vec3f = source * (1.0 - curSliceTransmittance) / extinction;

        // The accumulated in-scatter increases by this slice's light contribution after applying
        // the accumulated transmittance of all of the preceding slices (since the light must travel
        // through those slices on its way toward the camera).
        // 
        // Note that accumTransmittance must be updated AFTER accumInScatter to avoid double-applying
        // the current slice's transmittance.
        accumInScatter += (integratedSource * accumTransmittance);
        accumTransmittance *= curSliceTransmittance;

        textureStore(integrationBuffer, uvw, vec4f(accumInScatter, accumTransmittance));
    }
}