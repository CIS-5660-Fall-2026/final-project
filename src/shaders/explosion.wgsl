@group(0) @binding(0)
var<storage, read_write> bodies: array<Body>;

@group(0) @binding(1)
var<storage, read_write> collisionCandidates: array<u32>;

@group(0) @binding(2)
var<storage, read_write> params: SimulationUniforms;

@group(0) @binding(3)
var<storage, read_write> dispatchArgs: array<u32, 3>;

const EXPLOSION_MASS: f32 = 160.0;
const MIN_FRAGMENT_PAIRS: u32 = 64u;
const TARGET_FRAGMENT_MASS: f32 = 8.0;
const MIN_EJECTION_SPEED: f32 = 6.0;
const FRAGMENT_COOLDOWN: u32 = 120u;
const PI: f32 = 3.14159265359;

fn pairWeight(seed: u32) -> f32 {
    return mix(0.8, 1.2, random01(seed));
}

@compute @workgroup_size(1)
fn explodeBodies() {
    let originalCount = params.bodyCount;
    let capacity = arrayLength(&bodies);
    let stepSeed = hashU32(params.simulationStep);
    var nextSlot = originalCount;

    for (var i = 0u; i < originalCount; i++) {
        let parent = bodies[i];
        if (parent.mass < EXPLOSION_MASS) {
            continue;
        }

        let eventSeed = hashU32(parent.seed ^ stepSeed);
        let rate = 0.5 * parent.mass / EXPLOSION_MASS;
        let probability = 1.0 - exp(-rate * params.fixedDt);
        if (random01(eventSeed) >= probability) {
            continue;
        }

        let pairCount = max(
            MIN_FRAGMENT_PAIRS,
            u32(ceil(parent.mass / (2.0 * TARGET_FRAGMENT_MASS)))
        );
        let fragmentCount = 2u * pairCount;
        let extraSlots = fragmentCount - 1u;
        let minimumEnergy = 0.5 * parent.mass
            * MIN_EJECTION_SPEED * MIN_EJECTION_SPEED;

        if (extraSlots > capacity - nextSlot ||
            parent.storedEnergy < minimumEnergy) {
            continue;
        }

        var totalWeight = 0.0;
        for (var pair = 0u; pair < pairCount; pair++) {
            totalWeight += pairWeight(hashU32(eventSeed + pair + 1u));
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
        let phase = 2.0 * PI * random01(eventSeed ^ 0x1u);
        let extraEnergyPerFragment =
            (parent.storedEnergy - minimumEnergy) / f32(fragmentCount);

        for (var pair = 0u; pair < pairCount; pair++) {
            let seed = hashU32(eventSeed + pair + 1u);
            let fraction = pairWeight(seed) / (2.0 * totalWeight);
            let mass = parent.mass * fraction;
            let radius = parent.radius * pow(fraction, 1.0 / 3.0);
            let speed = sqrt(
                MIN_EJECTION_SPEED * MIN_EJECTION_SPEED
                + 2.0 * extraEnergyPerFragment / mass
            );

            let jitter = random01(seed ^ 0x2u);
            let angle = phase + PI * (f32(pair) + jitter) / f32(pairCount);
            let direction = cos(angle) * u + sin(angle) * v;
            let offset = 0.85 * (parent.radius - radius) * direction;
            let velocityOffset = speed * direction;

            let secondIndex = nextSlot + 2u * pair;
            let firstIndex = select(secondIndex - 1u, i, pair == 0u);

            var piece = Body();
            piece.mass = mass;
            piece.radius = radius;
            piece.orientation = vec4<f32>(0.0, 0.0, 0.0, 1.0);
            piece.angularVelocity = parent.angularVelocity;
            piece.absorptionCooldown = FRAGMENT_COOLDOWN;

            piece.position = parent.position + offset;
            piece.velocity = parent.velocity + velocityOffset;
            piece.seed = hashU32(seed ^ 0x3u);
            bodies[firstIndex] = piece;
            collisionCandidates[firstIndex] = firstIndex;

            piece.position = parent.position - offset;
            piece.velocity = parent.velocity - velocityOffset;
            piece.seed = hashU32(seed ^ 0x4u);
            bodies[secondIndex] = piece;
            collisionCandidates[secondIndex] = secondIndex;
        }

        nextSlot += extraSlots;
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