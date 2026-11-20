struct ExplosionState {
    eventCount: u32,
    approvedEnd: u32,
    finalCount: u32,
}

struct DispatchSize {
    x: u32,
    y: u32,
    z: u32,
}

struct ExplosionDispatches {
    response: DispatchSize,
    emission: DispatchSize,
    publish: DispatchSize,
}

@group(0) @binding(0)
var<storage, read_write> bodiesA: array<Body>;

@group(0) @binding(1)
var<storage, read_write> bodiesB: array<Body>;

@group(0) @binding(2)
var<storage, read_write> params: SimulationUniforms;

@group(0) @binding(3)
var<storage, read_write> candidates: array<u32>;

@group(0) @binding(4)
var<storage, read_write> flags: array<u32>;

@group(0) @binding(5)
var<storage, read> ranks: array<u32>;

@group(0) @binding(6)
var<storage, read_write> parentIndices: array<u32>;

@group(0) @binding(7)
var<storage, read_write> appendRequests: array<u32>;

@group(0) @binding(8)
var<storage, read> appendOffsets: array<u32>;

@group(0) @binding(9)
var<storage, read_write> state: ExplosionState;

@group(0) @binding(10)
var<storage, read_write> dispatches: ExplosionDispatches;

@group(0) @binding(11)
var<storage, read> inputBodyCount: u32;

fn seedForParent(parent: Body) -> u32 {
    return hashU32(parent.seed ^ hashU32(params.simulationStep));
}

fn nextProgress(parent: Body) -> f32 {
    return min(1.0, parent.collapseProgress + params.fixedDt / COLLAPSE_DURATION);
}

@compute @workgroup_size(64)
fn classify(@builtin(global_invocation_id) id: vec3<u32>) {
    let i = id.x;
    if (i >= params.bodyCount) {
        return;
    }

    let parent = bodiesA[i];
    var collapsing = parent.collapseProgress > 0.0;
    if (!collapsing && parent.mass >= params.explosionMass) {
        let rate = EXPLOSION_RATE * parent.mass / params.explosionMass;
        collapsing = random01(seedForParent(parent)) < 1.0 - exp(-rate * params.fixedDt);
    }
    flags[i] = select(0u, 1u, collapsing);
}

@compute @workgroup_size(64)
fn packEvents(@builtin(global_invocation_id) id: vec3<u32>) {
    let i = id.x;
    let bodyCount = params.bodyCount;
    if (i >= bodyCount) {
        return;
    }

    if (i + 1u == bodyCount) {
        state.eventCount = ranks[i] + flags[i];
    }
    if (flags[i] == 0u) {
        return;
    }

    let eventIndex = ranks[i];
    let parent = bodiesA[i];
    parentIndices[eventIndex] = i;

    let fragmentCount = max(MIN_FRAGMENTS, u32(ceil(parent.mass / TARGET_FRAGMENT_MASS)));
    appendRequests[eventIndex] = select(0u, fragmentCount - 1u, nextProgress(parent) == 1.0);
}

@compute @workgroup_size(1)
fn allocateEvents() {
    let bodyCount = params.bodyCount;
    let availableSlots = arrayLength(&bodiesA) - bodyCount;

    var lo = 0u;
    var hi = state.eventCount;
    while (lo < hi) {
        let mid = (lo + hi) / 2u;
        if (appendOffsets[mid] + appendRequests[mid] <= availableSlots) {
            lo = mid + 1u;
        } else {
            hi = mid;
        }
    }

    state.approvedEnd = lo;
    var appendedCount = 0u;
    if (lo > 0u) {
        appendedCount = appendOffsets[lo - 1u] + appendRequests[lo - 1u];
    }
    state.finalCount = bodyCount + appendedCount;

    let hasEvents = state.eventCount != 0u;
    dispatches.response = DispatchSize(select(0u, (bodyCount + 63u) / 64u, hasEvents), 1u, 1u);
    dispatches.publish = DispatchSize(select(0u, (state.finalCount + 63u) / 64u, hasEvents), 1u, 1u);

    let emissionGroups = select(0u, lo, appendedCount > 0u);
    dispatches.emission = DispatchSize(min(emissionGroups, 65535u), (emissionGroups + 65534u) / 65535u, 1u);
}

@compute @workgroup_size(64)
fn applyResponses(@builtin(global_invocation_id) id: vec3<u32>) {
    let i = id.x;
    if (i >= params.bodyCount) {
        return;
    }

    var body = bodiesA[i];
    for (var eventIndex = 0u; eventIndex < state.eventCount; eventIndex++) {
        let parentIndex = parentIndices[eventIndex];
        let parent = bodiesA[parentIndex];
        if (parentIndex == i) {
            body.collapseProgress = nextProgress(parent);
            continue;
        }

        let offset = body.position - parent.position;
        let distance = length(offset);
        if (appendRequests[eventIndex] == 0u && distance < COLLAPSE_RANGE) {
            body.velocity = pullVelocity(body, parent, offset, distance, params.fixedDt);
        } else if (appendRequests[eventIndex] > 0u && eventIndex < state.approvedEnd && distance < SHOCK_RANGE) {
            body.velocity = pushVelocity(body, parent, offset, distance);
        }
    }
    bodiesB[i] = body;
}

var<workgroup> groupFragmentCount: u32;
var<workgroup> weightSums: array<f32, 64>;

@compute @workgroup_size(64)
fn emitFragments(
    @builtin(workgroup_id) group: vec3<u32>,
    @builtin(local_invocation_index) lane: u32,
) {
    let eventIndex = group.x + group.y * 65535u;
    if (lane == 0u) {
        groupFragmentCount = 0u;
        if (eventIndex < state.approvedEnd && appendRequests[eventIndex] > 0u) {
            groupFragmentCount = appendRequests[eventIndex] + 1u;
        }
    }

    let fragmentCount = workgroupUniformLoad(&groupFragmentCount);
    if (fragmentCount == 0u) {
        return;
    }

    let parentIndex = parentIndices[eventIndex];
    let parent = bodiesA[parentIndex];
    let eventSeed = seedForParent(parent);

    var localWeightSum = 0.0;
    for (var fragmentIndex = lane; fragmentIndex < fragmentCount; fragmentIndex += 64u) {
        localWeightSum += fragmentWeight(fragmentSeed(eventSeed, fragmentIndex));
    }
    weightSums[lane] = localWeightSum;
    for (var stride = 32u; stride > 0u; stride /= 2u) {
        workgroupBarrier();
        if (lane < stride) {
            weightSums[lane] += weightSums[lane + stride];
        }
    }
    let totalWeight = workgroupUniformLoad(&weightSums[0]);

    let basis = fragmentBasis(parent);
    let phase = 2.0 * PI * random01(eventSeed ^ 5u);
    let firstAppendSlot = params.bodyCount + appendOffsets[eventIndex];
    for (var fragmentIndex = lane; fragmentIndex < fragmentCount; fragmentIndex += 64u) {
        let seed = fragmentSeed(eventSeed, fragmentIndex);
        let mass = parent.mass * (fragmentWeight(seed) / totalWeight);
        let slot = select(firstAppendSlot + fragmentIndex - 1u, parentIndex, fragmentIndex == 0u);
        bodiesB[slot] = makeFragment(parent, basis, phase, fragmentIndex, fragmentCount, seed, mass);
    }
}

@compute @workgroup_size(64)
fn publishBodies(@builtin(global_invocation_id) id: vec3<u32>) {
    let i = id.x;
    if (i >= state.finalCount) {
        return;
    }

    let body = bodiesB[i];
    bodiesA[i] = body;

    if (state.finalCount == inputBodyCount) {
        return;
    }
    if (i == 0u) {
        params.bodyCount = state.finalCount;
    }

    if (i >= inputBodyCount || body.absorptionCooldown == FRAGMENT_COOLDOWN) {
        candidates[i] = i;
    } else if (bodiesB[candidates[i]].absorptionCooldown == FRAGMENT_COOLDOWN) {
        candidates[i] = i;
    }
}