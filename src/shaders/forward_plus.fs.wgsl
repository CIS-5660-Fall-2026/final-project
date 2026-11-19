// TODO-2: implement the Forward+ fragment shader
// See naive.fs.wgsl for basic fragment shader setup; this shader should use light clusters instead of looping over all lights
@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;
@group(${bindGroup_scene}) @binding(3) var integrationBuffer: texture_3d<f32>;
@group(${bindGroup_scene}) @binding(4) var volumeSampler: sampler;
@group(${bindGroup_scene}) @binding(5) var<uniform> volume: VolumeUniforms;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput
{
    @builtin(position) screenPos: vec4f,
    @location(0) worldPos: vec3f,
    @location(1) modelNor: vec3f,
    @location(2) uv: vec2f
}

const clusterZScale: f32 = f32(${gridDimZ}) / log2(f32(${farPlane}) / f32(${nearPlane}));
const clusterZBias: f32 = -f32(${gridDimZ}) * log2(f32(${nearPlane})) / log2(f32(${farPlane}) / f32(${nearPlane}));

const numFroxelZSlices: f32 = f32(${froxelGridDimZ});
const invFroxelZSlices: f32 = 1.0 / numFroxelZSlices;

// ------------------------------------
// Shading process:
// ------------------------------------
// Determine which cluster contains the current fragment.
// Retrieve the number of lights that affect the current fragment from the cluster’s data.
// Initialize a variable to accumulate the total light contribution for the fragment.
// For each light in the cluster:
//     Access the light's properties using its index.
//     Calculate the contribution of the light based on its position, the fragment’s position, and the surface normal.
//     Add the calculated contribution to the total light accumulation.
// Multiply the fragment’s diffuse color by the accumulated light contribution.
// Return the final color, ensuring that the alpha component is set appropriately (typically to 1).
@fragment
fn main(in: FragmentInput) -> @location(0) vec4f
{
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    // Calculate the light cluster index
    let zViewDistance: f32 = -vec4f(camera.viewMat * vec4f(in.worldPos, 1.0)).z;
    let zSliceIdx: u32 = min(u32(max(log2(zViewDistance) * clusterZScale + clusterZBias, 0.0)), u32(${gridDimZ}) - 1u);
    let tilePixelDims: vec2f = camera.screenResolution / vec2f(clusterSet.gridDims.xy);
    let tileIdx: vec2u = vec2u(in.screenPos.xy / tilePixelDims);
    let flatClusterIdx = tileIdx.x
        + tileIdx.y * clusterSet.gridDims.x
        + zSliceIdx * clusterSet.gridDims.x * clusterSet.gridDims.y;

    var totalLightContrib = vec3f(0, 0, 0);
    for (var lightIdx = 0u; lightIdx < clusterSet.clusters[flatClusterIdx].numLights; lightIdx++) {
        let light = lightSet.lights[clusterSet.clusters[flatClusterIdx].lightIndices[lightIdx]];
        totalLightContrib += calculateLightContrib(light, in.worldPos, normalize(in.modelNor));
    }

    let litSurfaceColor: vec3f = diffuseColor.rgb * totalLightContrib;

    // Calculate the UVW coordinates for our froxel grid
    let froxelUV: vec2f = in.screenPos.xy / camera.screenResolution;
    let froxelZSlice: f32 = getContinuousFroxelZSlice(
        numFroxelZSlices,
        zViewDistance,
        volume.volumeNearZ,
        volume.volumeFarZ,
        volume.distributionExponent);
    let froxelW: f32 = (froxelZSlice - 0.5) * invFroxelZSlices;

    // .rgb holds the total in-scattered light that the volume sends toward the camera,
    // .a holds transmittance (the fraction of light that reaches the camera after traversing the volume)
    let scatteringTransmittance: vec4f = textureSampleLevel(integrationBuffer, volumeSampler, vec3f(froxelUV, froxelW), 0.0);
    let finalColor = (litSurfaceColor * scatteringTransmittance.a) + scatteringTransmittance.rgb;
    return vec4f(finalColor, 1.0);
}