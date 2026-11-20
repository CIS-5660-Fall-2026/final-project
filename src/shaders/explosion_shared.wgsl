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

fn pullVelocity(body: Body, parent: Body, offset: vec3<f32>, distance: f32, dt: f32) -> vec3<f32> {
    let falloff = 1.0 - smoothstep(0.0, COLLAPSE_RANGE, distance);
    let inwardSpeed = COLLAPSE_SPEED * smoothstep(0.0, parent.radius, distance);
    let direction = offset / max(distance, 0.0001);
    let targetVelocity = parent.velocity - inwardSpeed * direction;
    let response = massResponse(body.mass);
    let blend = 1.0 - exp(-COLLAPSE_STRENGTH * falloff * response * dt);
    return mix(body.velocity, targetVelocity, blend);
}

fn pushVelocity(body: Body, parent: Body, offset: vec3<f32>, distance: f32) -> vec3<f32> {
    var direction = vec3<f32>(0.0, 1.0, 0.0);
    if (distance > 0.0) {
        direction = offset / distance;
    }

    let falloff = 1.0 - smoothstep(0.0, SHOCK_RANGE, distance);
    let relativeSpeed = dot(body.velocity - parent.velocity, direction);
    let response = massResponse(body.mass);
    let speedChange = falloff * response * (SHOCK_STRENGTH - min(relativeSpeed, 0.0));
    return body.velocity + speedChange * direction;
}

fn fragmentBasis(parent: Body) -> mat3x3<f32> {
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
    return mat3x3<f32>(u, v, axis);
}

fn makeFragment(
    parent: Body,
    basis: mat3x3<f32>,
    phase: f32,
    fragmentIndex: u32,
    fragmentCount: u32,
    seed: u32,
    mass: f32,
) -> Body {
    let fraction = mass / parent.mass;
    let radius = parent.radius * pow(fraction, 1.0 / 3.0);
    let jitter = random01(seed ^ 6u);
    let angle = phase + 2.0 * PI * (f32(fragmentIndex) + jitter) / f32(fragmentCount);
    let radial = cos(angle) * basis[0] + sin(angle) * basis[1];
    let axialOffset = mix(-FRAGMENT_AXIAL_SPREAD, FRAGMENT_AXIAL_SPREAD, random01(seed ^ 7u));
    let direction = normalize(radial + axialOffset * basis[2]);
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

    return piece;
}