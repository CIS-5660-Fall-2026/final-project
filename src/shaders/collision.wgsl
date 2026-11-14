@group(0) @binding(0)
var<storage, read> bodies: array<Body>;

@group(0) @binding(1)
var<storage, read_write> collisionCandidates: array<u32>;

@group(0) @binding(2)
var<uniform> params: SimulationUniforms;

@compute @workgroup_size(64)
fn detectCollisions(
    @builtin(global_invocation_id) invocationId: vec3<u32>,
) {
    let i = invocationId.x;

    if (i >= params.bodyCount) {
        return;
    }

    let body = bodies[i];

    var candidate = i;
    var candidateMass = body.mass;

    for (var j = 0u; j < params.bodyCount; j++) {
        if (j == i) {
            continue;
        }

        let other = bodies[j];

        let higherPriority =
            other.mass > candidateMass ||
            (other.mass == candidateMass && j < candidate);

        if (!higherPriority) {
            continue;
        }

        let distance = other.position - body.position;
        let radiusSum = body.radius + other.radius;

        if (dot(distance, distance) <= radiusSum * radiusSum) {
            candidate = j;
            candidateMass = other.mass;
        }
    }

    collisionCandidates[i] = candidate;
}