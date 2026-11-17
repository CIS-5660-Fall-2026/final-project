struct CameraUniforms {
    viewProjection: mat4x4<f32>,
}

struct ReadableStarLights {
    count: u32,
    lights: array<StarLight>,
}

@group(0) @binding(0)
var<uniform> camera: CameraUniforms;

@group(1) @binding(0)
var<storage, read> bodies: array<Body>;

@group(1) @binding(2)
var<storage, read> starLights: ReadableStarLights;

@group(1) @binding(3)
var<uniform> params: SimulationUniforms;

const COLLAPSE_MIN_RADIUS_SCALE: f32 = 0.6;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) normal: vec3<f32>,
    @location(1) localPosition: vec3<f32>,
    @location(2) @interpolate(flat) bodyIndex: u32,
    @location(3) @interpolate(flat) surfaceOffset: vec3<f32>,
    @location(4) @interpolate(flat) paletteMix: f32,
    @location(5) worldPosition: vec3<f32>,
}

fn evaluateStarLights(position: vec3<f32>, normal: vec3<f32>) -> vec3<f32> {
    var lighting = vec3<f32>(0.0);
    let lightCount = starLights.count;

    for (var i = 0u; i < lightCount; i++) {
        let light = starLights.lights[i];
        let offset = light.position - position;
        let distanceSquared = dot(offset, offset);
        let radiusSquared = light.radius * light.radius;
        let softenedDistanceSquared = max(distanceSquared, radiusSquared);

        let diffuse = max(
            dot(normal, offset) * inverseSqrt(softenedDistanceSquared),
            0.0
        );
        lighting += light.color * (
            light.strength * diffuse / softenedDistanceSquared
        );
    }

    return lighting;
}

@vertex
fn vertMain(
    @location(0) localPosition: vec3<f32>,
    @builtin(instance_index) instanceIndex: u32
) -> VertexOutput {
    let body = bodies[instanceIndex];
    var output: VertexOutput;

    let rotatedPosition = rotateVector(body.orientation, localPosition);
    let radiusScale = mix(1.0, COLLAPSE_MIN_RADIUS_SCALE, body.collapseProgress);
    let worldPosition = body.position + rotatedPosition * body.radius * radiusScale;

    let surfaceOffset = 64.0 * vec3<f32>(
        random01(body.seed ^ 1u),
        random01(body.seed ^ 2u),
        random01(body.seed ^ 3u)
    );

    output.position = camera.viewProjection * vec4<f32>(worldPosition, 1.0);
    output.normal = rotatedPosition;
    output.localPosition = localPosition;
    output.bodyIndex = instanceIndex;
    output.surfaceOffset = surfaceOffset;
    output.paletteMix = random01(body.seed ^ 4u);
    output.worldPosition = worldPosition;
    return output;
}

@fragment
fn fragMain(input: VertexOutput) -> @location(0) vec4<f32> {
    let body = bodies[input.bodyIndex];
    let p = normalize(input.localPosition);

    if (isStar(body, params.starMass)) {
        let broad = noise3D(4.0 * p + input.surfaceOffset);
        let detail = noise3D(13.0 * p + input.surfaceOffset);
        let field = 0.75 * broad + 0.25 * detail;

        let averageHeat = starAverageHeat(body.mass, params.starMass, params.explosionMass);
        let localHeat = clamp(averageHeat + 0.65 * field, 0.0, 1.0);

        let color = starColor(body.seed, localHeat);
        let emission = mix(0.5, 1.5, localHeat);
        return vec4<f32>(color * emission, 1.0);
    }

    let detail = fbm(6.0 * p + input.surfaceOffset) / 1.875;
    let rockColor = mix(
        vec3<f32>(0.30, 0.32, 0.34),
        vec3<f32>(0.34, 0.32, 0.29),
        input.paletteMix
    );
    let baseColor = rockColor
        * (0.95 + 0.10 * smoothstep(-0.25, 0.25, detail));

    let normal = normalize(input.normal);
    let skyWeight = normal.y * 0.5 + 0.5;
    let ambient = 0.2 * mix(
        vec3<f32>(0.020, 0.020, 0.030),
        vec3<f32>(0.060, 0.075, 0.095),
        skyWeight
    );
    let starLighting = evaluateStarLights(input.worldPosition, normal);
    let litRock = baseColor * (ambient + starLighting);

    let crackStartMass = 0.025 * params.starMass;
    let heat = clamp(
        (body.mass - crackStartMass) / (params.starMass - crackStartMass),
        0.0,
        1.0
    );
    if (heat == 0.0) {
        return vec4<f32>(litRock, 1.0);
    }

    let crackField = noise3D(2.5 * p + input.surfaceOffset);
    let bandDistance = abs(crackField);
    let crackBand = 1.0 - smoothstep(0.02, 0.06, bandDistance);

    let patchNoise = noise3D(
        2.0 * p + input.surfaceOffset + vec3<f32>(17.0, 31.0, 11.0)
    );
    let crackMask = crackBand * smoothstep(-0.1, 0.1, patchNoise);

    let crackColor = mix(
        vec3<f32>(1.0, 0.025, 0.005),
        vec3<f32>(1.0, 0.380, 0.045),
        heat
    );
    let crackEmission = crackColor * (2.0 * heat * crackMask);

    return vec4<f32>(litRock + crackEmission, 1.0);
}