@group(0) @binding(0)
var<storage, read> absorbedBodies: array<Body>;

@group(0) @binding(1)
var<storage, read_write> compactedBodies: array<Body>;

@group(0) @binding(2)
var<storage, read_write> collisionCandidates: array<u32>;

@group(0) @binding(3)
var<storage, read_write> params: SimulationUniforms;

@group(0) @binding(4)
var<storage, read> scanCount: u32;

@group(0) @binding(5)
var<storage, read_write> alive: array<u32>;

@group(0) @binding(6)
var<storage, read> prefixes: array<u32>;

@group(0) @binding(7)
var<storage, read_write> candidateScratch: array<u32>;

@compute @workgroup_size(64)
fn markAlive(@builtin(global_invocation_id) id: vec3<u32>) {
    let i = id.x;
    if (i >= params.bodyCount) {
        return;
    }
    alive[i] = select(0u, 1u, absorbedBodies[i].mass != 0.0);
}

@compute @workgroup_size(64)
fn scatterBodies(@builtin(global_invocation_id) id: vec3<u32>) {
    let i = id.x;
    if (i >= params.bodyCount) {
        return;
    }

    var body = absorbedBodies[i];
    if (body.mass == 0.0) {
        return;
    }

    if (body.absorptionCooldown > 0u) {
        body.absorptionCooldown -= 1u;
    }
    let destination = prefixes[i];
    compactedBodies[destination] = body;

    let candidate = collisionCandidates[i];
    candidateScratch[destination] = select(destination, prefixes[candidate], alive[candidate] != 0u);
}

fn compactedCount() -> u32 {
    let oldCount = scanCount;
    if (oldCount == 0u) {
        return 0u;
    }
    return prefixes[oldCount - 1u] + alive[oldCount - 1u];
}

@compute @workgroup_size(64)
fn publishCandidates(@builtin(global_invocation_id) id: vec3<u32>) {
    let i = id.x;
    let newCount = compactedCount();
    if (i == 0u) {
        params.bodyCount = newCount;
    }
    if (i < newCount) {
        collisionCandidates[i] = candidateScratch[i];
    }
}