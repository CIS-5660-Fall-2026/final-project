struct WritableStarLights {
    count: atomic<u32>,
    lights: array<StarLight>,
}

@group(0) @binding(0)
var<storage, read> bodies: array<Body>;

@group(0) @binding(1)
var<uniform> params: SimulationUniforms;

@group(0) @binding(2)
var<storage, read_write> starLights: WritableStarLights;

@compute @workgroup_size(64)
fn collectStarLights(@builtin(global_invocation_id) id: vec3<u32>) {
    if (id.x >= params.bodyCount) {
        return;
    }

    let body = bodies[id.x];
    if (!isStar(body)) {
        return;
    }

    let index = atomicAdd(&starLights.count, 1u);
    let strength = 6.0 * body.radius * body.radius;
    let color = starColor(body.seed, starAverageHeat(body.mass));

    starLights.lights[index] = StarLight(
        body.position,
        body.radius,
        color,
        strength,
    );
}