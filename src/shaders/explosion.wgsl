@group(0) @binding(0)
var<storage, read_write> bodies: array<Body>;

@group(0) @binding(1)
var<storage, read_write> collisionCandidates: array<u32>;

@group(0) @binding(2)
var<storage, read_write> params: SimulationUniforms;

@group(0) @binding(3)
var<storage, read_write> dispatchArgs: array<u32, 3>;

const EXPLOSION_RATE: f32 = 0.5;

const COLLAPSE_DURATION: f32 = 0.6; // Seconds
const COLLAPSE_RANGE: f32 = 6.0;
const COLLAPSE_SPEED: f32 = 14.0;
const COLLAPSE_STRENGTH: f32 = 8.0; // Velocity response per second
const SHOCK_RANGE: f32 = 9.0;
const SHOCK_STRENGTH: f32 = 28.0; // Peak outward speed added at the center

const MIN_FRAGMENTS: u32 = 128u;
const TARGET_FRAGMENT_MASS: f32 = 8.0;
const MIN_EJECTION_SPEED: f32 = 24.0;
const MAX_EJECTION_SPEED: f32 = 48.0;
const FRAGMENT_AXIAL_SPREAD: f32 = 0.65; // Axial offset relative to radial offset
const FRAGMENT_COOLDOWN: u32 = 120u;
const PI: f32 = 3.14159265359;

fn fragmentSeed(eventSeed: u32, index: u32) -> u32 {
    return hashU32(eventSeed + index + 1u);
}

fn fragmentWeight(seed: u32) -> f32 {
    return mix(0.55, 1.45, random01(seed));
}

fn pullNeighbors(parentIndex: u32, parent: Body, count: u32, dt: f32) {
    for (var j = 0u; j < count; j++) {
        if (j == parentIndex) {
            continue;
        }

        let offset = bodies[j].position - parent.position;
        let distance = length(offset);
        if (distance >= COLLAPSE_RANGE) {
            continue;
        }

        let falloff = 1.0 - smoothstep(0.0, COLLAPSE_RANGE, distance);
        let inwardSpeed = COLLAPSE_SPEED * smoothstep(0.0, parent.radius, distance);
        let direction = offset / max(distance, 0.0001);
        let targetVelocity = parent.velocity - inwardSpeed * direction;
        let response = massResponse(bodies[j].mass);
        let blend = 1.0 - exp(-COLLAPSE_STRENGTH * falloff * response * dt);
        bodies[j].velocity = mix(bodies[j].velocity, targetVelocity, blend);
    }
}

fn pushNeighbors(parentIndex: u32, parent: Body, count: u32) {
    for (var j = 0u; j < count; j++) {
        if (j == parentIndex) {
            continue;
        }

        let offset = bodies[j].position - parent.position;
        let distance = length(offset);
        if (distance >= SHOCK_RANGE) {
            continue;
        }

        var direction = vec3<f32>(0.0, 1.0, 0.0);
        if (distance > 0.0) {
            direction = offset / distance;
        }

        let falloff = 1.0 - smoothstep(0.0, SHOCK_RANGE, distance);
        let relativeSpeed = dot(bodies[j].velocity - parent.velocity, direction);
        let response = massResponse(bodies[j].mass);
        let speedChange = falloff * response * (SHOCK_STRENGTH - min(relativeSpeed, 0.0));
        bodies[j].velocity += speedChange * direction;
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
        if (parent.collapseProgress == 0.0 && parent.mass < EXPLOSION_MASS) {
            continue;
        }

        let desiredCount = max(MIN_FRAGMENTS, u32(ceil(parent.mass / TARGET_FRAGMENT_MASS)));
        let fragmentCount = min(desiredCount, capacity - nextSlot + 10u);
        if (fragmentCount < MIN_FRAGMENTS) {
            continue;
        }

        let eventSeed = hashU32(parent.seed ^ stepSeed);
        if (parent.collapseProgress == 0.0) {
            let rate = EXPLOSION_RATE * parent.mass / EXPLOSION_MASS;
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

        var axis = vec3<f32>(0.0, 1.0, 0.0);
        if (dot(parent.angularVelocity, parent.angularVelocity) > 0.0) {
            axis = normalize(parent.angularVelocity);
        }

        let reference = select(
            vec3<f32>(0.0, 1.0, 0.0),
            vec3<f32>(1.0, 0.0, 0.0),
            abs(axis.y) > 0.9
        );
        let u = normalize(cross(axis, reference));
        let v = cross(axis, u);
        let phase = 2.0 * PI * random01(eventSeed ^ 5u);
        var cumulativeWeight = 0.0;
        var assignedMass = 0.0;

        for (var j = 0u; j < fragmentCount; j++) {
            let seed = fragmentSeed(eventSeed, j);
            cumulativeWeight += fragmentWeight(seed);
            // Partition the parent mass between consecutive cumulative weights.
            let cumulativeMass = parent.mass * (cumulativeWeight / totalWeight);
            let mass = cumulativeMass - assignedMass;
            assignedMass = cumulativeMass;
            let fraction = mass / parent.mass;
            let radius = parent.radius * pow(fraction, 1.0 / 3.0);
            let jitter = random01(seed ^ 6u);
            let angle = phase + 2.0 * PI * (f32(j) + jitter) / f32(fragmentCount);
            let radial = cos(angle) * u + sin(angle) * v;
            let axialOffset = mix(-FRAGMENT_AXIAL_SPREAD, FRAGMENT_AXIAL_SPREAD, random01(seed ^ 7u));
            let direction = normalize(radial + axialOffset * axis);
            let speed = mix(MIN_EJECTION_SPEED, MAX_EJECTION_SPEED, random01(seed ^ 8u));

            var piece = Body();
            piece.mass = mass;
            piece.radius = radius;
            piece.orientation = vec4<f32>(0.0, 0.0, 0.0, 1.0);
            piece.angularVelocity = parent.angularVelocity;
            piece.absorptionCooldown = FRAGMENT_COOLDOWN;
            piece.position = parent.position + 0.85 * (parent.radius - radius) * direction;
            piece.velocity = parent.velocity + speed * direction;
            piece.seed = hashU32(seed ^ 9u);

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
    dispatchArgs[0] = (nextSlot + 63u) / 64u;
    params.simulationStep += 1u;
}