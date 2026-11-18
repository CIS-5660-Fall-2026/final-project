@group(0) @binding(0)
var<storage, read> inputBodies: array<Body>;

@group(0) @binding(1)
var<storage, read_write> outputBodies: array<Body>;

@group(0) @binding(2)
var<uniform> params: SimulationUniforms;

@compute @workgroup_size(64)
fn driftHalf(
    @builtin(global_invocation_id) invocationId: vec3<u32>
) {
    let i = invocationId.x;

    if (i >= params.bodyCount) {
        return;
    }

    outputBodies[i] = drift(
        inputBodies[i],
        params.fixedDt * 0.5
    );
}


@compute @workgroup_size(64)
fn gravityNaive(
    @builtin(global_invocation_id) invocationId: vec3<u32>
) {
    let i = invocationId.x;

    if (i >= params.bodyCount) {
        return;
    }

    let body = inputBodies[i];

    var acceleration = vec3<f32>(0.0);

    for (var j = 0u; j < params.bodyCount; j++) {
        if (j == i) {
            continue;
        }

        let other = inputBodies[j];

        let r = other.position - body.position;
        let radiusSum = body.radius + other.radius;
        let softening = max(params.softeningLength, 0.5 * radiusSum);
        let inverseDistance = inverseSqrt(dot(r, r) + softening * softening);

        acceleration += other.mass
            * r
            * inverseDistance
            * inverseDistance
            * inverseDistance;
    }

    outputBodies[i] = integrateGravity(body, acceleration);
}