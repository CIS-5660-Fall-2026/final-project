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
        let body = absorbedBodies[oldIndex];

        oldToNew[oldIndex] = newCount;
        compactedBodies[newCount] = body;
        collisionCandidates[newCount] = collisionCandidates[oldIndex];
        newCount++;
    }

    for (var i = 0u; i < newCount; i++) {
        let oldCandidate = collisionCandidates[i];
        let newCandidate = oldToNew[oldCandidate];
        collisionCandidates[i] = select(i, newCandidate, newCandidate != oldCount);
    }

    params.bodyCount = newCount;
}