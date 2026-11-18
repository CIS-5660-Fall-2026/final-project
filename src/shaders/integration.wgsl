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

fn integrateGravity(input: Body, forceSum: vec3<f32>) -> Body {
    var body = input;
    let acceleration = forceSum * params.gravitationalConstant;

    body.velocity += acceleration * params.fixedDt;
    let dragRate = params.linearDragRate * massResponse(body.mass);
    body.velocity *= exp(-dragRate * params.fixedDt);

    body = drift(body, params.fixedDt * 0.5);

    body.orientation = advanceOrientation(
        body.orientation,
        body.angularVelocity,
        params.fixedDt
    );

    return body;
}