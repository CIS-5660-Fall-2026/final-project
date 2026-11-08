struct Body {
    position: vec3<f32>,
    mass: f32,
    velocity: vec3<f32>,
    radius: f32,
    orientation: vec4<f32>,
    angularVelocity: vec3<f32>
}

struct SimulationUniforms {
    fixedDt: f32,
    gravitationalConstant: f32,
    softeningLength: f32,
    bodyCount: u32,

    boundaryMin: vec3<f32>,
    boundaryEnabled: u32,

    boundaryMax: vec3<f32>
}

fn multiplyQuaternion(
    a: vec4<f32>,
    b: vec4<f32>,
) -> vec4<f32> {
    return vec4<f32>(
        a.w * b.xyz + b.w * a.xyz + cross(a.xyz, b.xyz),
        a.w * b.w - dot(a.xyz, b.xyz)
    );
}

fn rotateVector(q: vec4<f32>, v: vec3<f32>) -> vec3<f32> {
    return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
}