@group(0) @binding(0)
var<storage, read_write> bodies: array<Body>;

@group(0) @binding(1)
var<storage, read_write> collisionCandidates: array<u32>;

@group(0) @binding(2)
var<storage, read_write> params: SimulationUniforms;

fn pullNeighbors(parentIndex: u32, parent: Body, count: u32, dt: f32) {
    for (var j = 0u; j < count; j++) {
        if (j == parentIndex) {
            continue;
        }

        let offset = bodies[j].position - parent.position;
        let distance = length(offset);
        if (distance < COLLAPSE_RANGE) {
            bodies[j].velocity = pullVelocity(bodies[j], parent, offset, distance, dt);
        }
    }
}

fn pushNeighbors(parentIndex: u32, parent: Body, count: u32) {
    for (var j = 0u; j < count; j++) {
        if (j == parentIndex) {
            continue;
        }

        let offset = bodies[j].position - parent.position;
        let distance = length(offset);
        if (distance < SHOCK_RANGE) {
            bodies[j].velocity = pushVelocity(bodies[j], parent, offset, distance);
        }
    }
}

@compute @workgroup_size(1)
fn explodeBodies() {
    let originalCount = params.bodyCount;
    let capacity = arrayLength(&bodies);
    let stepSeed = hashU32(params.simulationStep);
    var nextSlot = originalCount;

    for (var i = 0u; i < originalCount; i++) {
        let parent = bodies[i];
        if (parent.collapseProgress == 0.0 && parent.mass < params.explosionMass) {
            continue;
        }

        let desiredCount = max(MIN_FRAGMENTS, u32(ceil(parent.mass / TARGET_FRAGMENT_MASS)));
        let fragmentCount = min(desiredCount, capacity - nextSlot + 1u);
        if (fragmentCount < MIN_FRAGMENTS) {
            continue;
        }

        let eventSeed = hashU32(parent.seed ^ stepSeed);
        if (parent.collapseProgress == 0.0) {
            let rate = EXPLOSION_RATE * parent.mass / params.explosionMass;
            let probability = 1.0 - exp(-rate * params.fixedDt);
            if (random01(eventSeed) >= probability) {
                continue;
            }
        }

        let progress = parent.collapseProgress + params.fixedDt / COLLAPSE_DURATION;
        if (progress < 1.0) {
            pullNeighbors(i, parent, nextSlot, params.fixedDt);
            bodies[i].collapseProgress = progress;
            continue;
        }

        pushNeighbors(i, parent, nextSlot);

        var totalWeight = 0.0;
        for (var j = 0u; j < fragmentCount; j++) {
            totalWeight += fragmentWeight(fragmentSeed(eventSeed, j));
        }

        let basis = fragmentBasis(parent);
        let phase = 2.0 * PI * random01(eventSeed ^ 5u);
        var cumulativeWeight = 0.0;
        var assignedMass = 0.0;

        for (var j = 0u; j < fragmentCount; j++) {
            let seed = fragmentSeed(eventSeed, j);
            cumulativeWeight += fragmentWeight(seed);
            let cumulativeMass = parent.mass * (cumulativeWeight / totalWeight);
            let mass = cumulativeMass - assignedMass;
            assignedMass = cumulativeMass;
            let piece = makeFragment(parent, basis, phase, j, fragmentCount, seed, mass);

            var slot = i;
            if (j > 0u) {
                slot = nextSlot;
                nextSlot++;
            }
            bodies[slot] = piece;
            collisionCandidates[slot] = slot;
        }
    }

    if (nextSlot != originalCount) {
        for (var i = 0u; i < originalCount; i++) {
            if (bodies[collisionCandidates[i]].absorptionCooldown
                == FRAGMENT_COOLDOWN) {
                collisionCandidates[i] = i;
            }
        }
    }

    params.bodyCount = nextSlot;
}