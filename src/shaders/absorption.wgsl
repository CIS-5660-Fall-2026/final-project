@group(0) @binding(0)
var<storage, read> inputBodies: array<Body>;

@group(0) @binding(1)
var<storage, read_write> outputBodies: array<Body>;

@group(0) @binding(2)
var<storage, read> collisionCandidates: array<u32>;

@group(0) @binding(3)
var<uniform> params: SimulationUniforms;

const MASS_PER_DISTANCE: f32 = 0.5;
const MIN_ABSORPTION_RATE: f32 = 0.5;
const MAX_ABSORPTION_RATE: f32 = 4.0;

fn transferredMass(donor: Body, receiver: Body) -> f32 {
    let relativeSpeed = length(donor.velocity - receiver.velocity);
    let rate = clamp(
        MASS_PER_DISTANCE * relativeSpeed,
        MIN_ABSORPTION_RATE,
        MAX_ABSORPTION_RATE
    );

    return min(donor.mass, rate * params.fixedDt);
}

@compute @workgroup_size(64)
fn applyAbsorption(@builtin(global_invocation_id) id: vec3<u32>) {
    let i = id.x;
    if (i >= params.bodyCount) {
        return;
    }

    let body = inputBodies[i];

    let candidate = collisionCandidates[i];

    if (candidate != i) {
        if (collisionCandidates[candidate] != candidate) {
            outputBodies[i] = body;
        }

        return;
    }

    var gainedMass = 0.0;
    var radiusCubed = body.radius * body.radius * body.radius;
    var positionMoment = vec3<f32>(0.0);
    var momentumOffset = vec3<f32>(0.0);

    for (var j = 0u; j < params.bodyCount; j++) {
        if (j == i || collisionCandidates[j] != i) {
            continue;
        }

        let donor = inputBodies[j];
        let amount = transferredMass(donor, body);
        let donorRadiusCubed = donor.radius * donor.radius * donor.radius;

        gainedMass += amount;
        radiusCubed += donorRadiusCubed * (amount / donor.mass);
        positionMoment += amount * (donor.position - body.position);
        momentumOffset += amount * (donor.velocity - body.velocity);
    }

    var receiver = body;
    var acceptsTransfer = gainedMass > 0.0;

    if (acceptsTransfer) {
        receiver.mass = body.mass + gainedMass;
        receiver.radius = pow(radiusCubed, 1.0 / 3.0);
        receiver.position = body.position + positionMoment / receiver.mass;
        receiver.velocity = body.velocity + momentumOffset / receiver.mass;

        if (params.boundaryEnabled != 0u) {
            let radius = vec3<f32>(receiver.radius);
            let lo = params.boundaryMin + radius;
            let hi = params.boundaryMax - radius;

            if (any(lo >= hi)) {
                acceptsTransfer = false;
                receiver = body;
            } else {
                receiver.position = clamp(receiver.position, lo, hi);

                for (var axis = 0u; axis < 3u; axis++) {
                    if (receiver.position[axis] == lo[axis]) {
                        receiver.velocity[axis] = abs(receiver.velocity[axis]);
                    } else if (receiver.position[axis] == hi[axis]) {
                        receiver.velocity[axis] = -abs(receiver.velocity[axis]);
                    }
                }
            }
        }
    }

    outputBodies[i] = receiver;

    for (var j = 0u; j < params.bodyCount; j++) {
        if (j == i || collisionCandidates[j] != i) {
            continue;
        }

        let donor = inputBodies[j];
        var result = donor;

        if (acceptsTransfer) {
            let amount = transferredMass(donor, body);

            if (amount == donor.mass) {
                result = Body();
            } else if (amount > 0.0) {
                result.mass = donor.mass - amount;
                result.radius = donor.radius
                    * pow(result.mass / donor.mass, 1.0 / 3.0);
            }
        }

        outputBodies[j] = result;
    }
}