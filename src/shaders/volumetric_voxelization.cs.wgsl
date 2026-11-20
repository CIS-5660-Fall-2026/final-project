@group(${bindGroup_volumetric}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_volumetric}) @binding(1) var<uniform> volume: VolumeUniforms;
@group(${bindGroup_volumetric}) @binding(2) var scatteringExtinctionBuffer: texture_storage_3d<rgba16float, write>;

fn random3(p: vec3f) -> vec3f {
    return fract(
        sin(vec3f(
            dot(p, vec3f(127.1, 311.7, 233.9)),
            dot(p, vec3f(269.5, 183.3, 379.7)),
            dot(p, vec3f(519.7, 47.1, 173.5))))
        * 43758.5453);
}

fn quinticPoly1(t: f32) -> f32 {
    let t3 = t * t * t;
    let t4 = t3 * t;
    let t5 = t4 * t;

    return 1.0 - 6.0 * t5 + 15.0 * t4 - 10.0 * t3;
}

fn quinticPoly3(t: vec3f) -> vec3f {
    return vec3f(quinticPoly1(t.x), quinticPoly1(t.y), quinticPoly1(t.z));
}

fn computeSurflet(P: vec3f, gridPoint: vec3f) -> f32 {
    // Compute falloff function by converting linear distance to a polynomial
    let dist = abs(P - gridPoint);
    let t = quinticPoly3(dist);

    // Get the random vector for the grid point
    let gradient = 2.0 * random3(gridPoint) - vec3f(1.0);

    // Get the vector from the grid point to P
    let diff = P - gridPoint;

    // Get the value of our height field by dotting grid->P with our gradient
    let height = dot(diff, gradient);

    // Scale our height field (i.e. reduce it) by our polynomial falloff function
    return height * t.x * t.y * t.z;
}

fn perlinNoise(pos: vec3f) -> f32 {
    var surfletSum = 0.0;

    // Iterate over the eight integer corners surrounding pos
    for (var dx = 0; dx <= 1; dx++) {
        for (var dy = 0; dy <= 1; dy++) {
            for (var dz = 0; dz <= 1; dz++) {
                surfletSum += computeSurflet(pos, floor(pos) + vec3f(f32(dx), f32(dy), f32(dz)));
            }
        }
    }

    return surfletSum;
}

fn fractalPerlinNoise(p: vec3f, octaves: u32, time: f32) -> f32 {
    var total = 0.0;
    let persistence = 0.5;
    var freq = 10.0;
    var amp = 1.0;

    let scaledTime = time * 0.25;
    let offset = vec3f(-scaledTime, scaledTime, -scaledTime);

    for (var i = 1u; i <= octaves; i++) {
        let noiseStep = perlinNoise(p * freq + offset);
        total += noiseStep * amp;
        freq *= 2.0;
        amp *= persistence;
    }

    return total;
}

@compute
@workgroup_size(${froxelWorkgroupSizeX}, ${froxelWorkgroupSizeY}, ${froxelWorkgroupSizeZ})
fn populateParticipatingMediaProperties(@builtin(global_invocation_id) id: vec3u) {
    if (any(id >= textureDimensions(scatteringExtinctionBuffer))) {
        return;
    }

    let froxelGridDims: vec2f = vec2f(f32(${froxelGridDimX}), f32(${froxelGridDimY}));
    // We add 0.5 to both our uv and froxel slice computations because we want
    // to obtain the world position of the center of the froxel
    let froxelWorldPos: vec3f = getFroxelWorldPosition(
        (vec2f(id.xy) + 0.5) / froxelGridDims,
        f32(id.z) + 0.5,
        f32(${froxelGridDimZ}),
        volume.volumeNearZ,
        volume.volumeFarZ,
        volume.distributionExponent,
        camera.invProjMat,
        camera.invViewMat);

    // NCHORTEK TODO: Use noise to generate participating media properties for this froxel
    let scatteringExtinction: vec4f = select(
        10.0 * vec4f(vec3f(volume.scattering), volume.scattering + volume.absorption),
        vec4f(0.0),
        froxelWorldPos.y > 1.0);

    textureStore(scatteringExtinctionBuffer,
        id,
        scatteringExtinction);
}