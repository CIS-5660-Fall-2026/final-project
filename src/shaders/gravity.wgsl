@group(0) @binding(0) 
var<storage, read> inputBodies: array<Body>;

@group(0) @binding(1)
var<storage, read_write> outputBodies: array<Body>;

@group(0) @binding(2)
var<uniform> params: SimulationUniforms;

fn advanceOrientation(
    orientation: vec4<f32>,
    angularVelocity: vec3<f32>,
    dt: f32
) -> vec4<f32> {
    let speed = length(angularVelocity);

    if (speed == 0.0) {
        return orientation;
    }

    let halfAngle = speed * dt * 0.5;

    let delta = vec4<f32>(
        angularVelocity * (sin(halfAngle) / speed),
        cos(halfAngle)
    );

    return normalize(multiplyQuaternion(delta, orientation));
}

fn drift(body: Body, dt: f32) -> Body {
    var result = body;
    result.position += result.velocity * dt;

    if (params.boundaryEnabled == 0u) {
        return result;
    }

    for (var axis = 0u; axis < 3u; axis++) {
        let lo = params.boundaryMin[axis] + result.radius;
        let hi = params.boundaryMax[axis] - result.radius;
        let width = hi - lo;
        let period = 2.0 * width;

        let offset = result.position[axis] - lo;
        let folded = offset - period * floor(offset / period);

        if (folded <= width) {
            result.position[axis] = lo + folded;
        } else {
            result.position[axis] = lo + period - folded;
            result.velocity[axis] = -result.velocity[axis];
        }
    }

    return result;
}


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

    var body = inputBodies[i];
    var acceleration = vec3<f32>(0.0);

    let softeningSquared = params.softeningLength * params.softeningLength;

    for (var j = 0u; j < params.bodyCount; j++) {
        if (j == i) {
            continue;
        }

        let other = inputBodies[j];
        let r = other.position - body.position;
        let distanceSquared = dot(r, r);
        let radiusSum = body.radius + other.radius;

        if (distanceSquared <= radiusSum * radiusSum) {
            continue;
        }

        let inverseDistance = inverseSqrt(distanceSquared + softeningSquared);

        acceleration += other.mass
            * r
            * inverseDistance
            * inverseDistance
            * inverseDistance;
    }

    acceleration *= params.gravitationalConstant;

    body.velocity += acceleration * params.fixedDt;

    body = drift(body, params.fixedDt * 0.5);

    body.orientation = advanceOrientation(
        body.orientation,
        body.angularVelocity,
        params.fixedDt
    );

    outputBodies[i] = body;
}