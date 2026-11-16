struct StarLight {
    position: vec3<f32>,
    radius: f32,
    color: vec3<f32>,
    strength: f32,
}

const STAR_COLORS = array<vec3<f32>, 6>(
    vec3<f32>(1.000, 0.250, 0.025), // orange
    vec3<f32>(1.000, 0.025, 0.012), // red
    vec3<f32>(1.000, 0.090, 0.015), // orange-red
    vec3<f32>(0.015, 0.360, 1.000), // ocean blue
    vec3<f32>(0.180, 0.520, 1.000), // sky blue
    vec3<f32>(0.025, 0.075, 1.000), // blue
);

fn isStar(body: Body) -> bool {
    return body.mass >= STAR_MASS || body.collapseProgress > 0.0;
}

fn starAverageHeat(mass: f32) -> f32 {
    let progress = clamp(
        (mass - STAR_MASS) / (EXPLOSION_MASS - STAR_MASS),
        0.0,
        1.0
    );

    return mix(0.20, 0.85, smoothstep(0.35, 1.0, progress));
}

fn starColor(seed: u32, heat: f32) -> vec3<f32> {
    let index = hashU32(seed ^ 11u) % 6u;
    let whiteMix = 0.85 * smoothstep(0.4, 0.9, heat);
    return mix(STAR_COLORS[index], vec3<f32>(1.0), whiteMix);
}