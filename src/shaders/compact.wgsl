@group(0) @binding(0)
var<storage, read> absorbedBodies: array<Body>;

@group(0) @binding(1)
var<storage, read_write> compactedBodies: array<Body>;

@group(0) @binding(2)
var<storage, read_write> collisionCandidates: array<u32>;

@group(0) @binding(3)
var<storage, read_write> params: SimulationUniforms;

@group(0) @binding(4)
var<storage, read_write> oldToNew: array<u32>;

@compute @workgroup_size(1)
fn compactBodies() {
    let oldCount = params.bodyCount;
    var newCount = 0u;

    for (var oldIndex = 0u; oldIndex < oldCount; oldIndex++) {
        var body = absorbedBodies[oldIndex];

        if (body.mass == 0.0) {
            oldToNew[oldIndex] = oldCount;
            continue;
        }

        if (body.absorptionCooldown > 0u) {
            body.absorptionCooldown -= 1u;
        }

        oldToNew[oldIndex] = newCount;
        compactedBodies[newCount] = body;
        collisionCandidates[newCount] = collisionCandidates[oldIndex];
        newCount++;
    }

    for (var i = 0u; i < newCount; i++) {
        let candidate = oldToNew[collisionCandidates[i]];
        collisionCandidates[i] = select(i, candidate, candidate != oldCount);
    }

    for (var i = newCount; i < oldCount; i++) {
        compactedBodies[i] = Body();
    }

    params.bodyCount = newCount;
}