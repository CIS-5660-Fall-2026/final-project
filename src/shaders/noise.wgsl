// Adapted from Chris Wellons' lowbias32 hash (2018).
// https://nullprogram.com/blog/2018/07/31/
fn hashU32(value: u32) -> u32 {
    var h = value;
    h ^= h >> 16u;
    h *= 0x7feb352du;
    h ^= h >> 15u;
    h *= 0x846ca68bu;
    h ^= h >> 16u;
    return h;
}

fn random01(seed: u32) -> f32 {
    return f32(hashU32(seed) >> 8u) / 16777216.0;
}

fn hash3D(p: vec3<f32>) -> vec3<f32> {
    var q = fract(p * vec3<f32>(0.1031, 0.1030, 0.0973));
    q += vec3<f32>(dot(q, q.yxz + vec3<f32>(33.33)));
    return fract((q.xxy + q.yxx) * q.zyx);
}

fn gradient(p: vec3<f32>) -> vec3<f32> {
    let result = hash3D(p) * 2.0 - vec3<f32>(1.0);
    return result / max(length(result), 0.00001);
}

fn noise3D(p: vec3<f32>) -> f32 {
    let grid = floor(p);
    let pos = fract(p);

    let fade = pos * pos * pos
        * (pos * (pos * 6.0 - vec3<f32>(15.0)) + vec3<f32>(10.0));

    let p000 = vec3<f32>(0.0, 0.0, 0.0);
    let p100 = vec3<f32>(1.0, 0.0, 0.0);
    let p010 = vec3<f32>(0.0, 1.0, 0.0);
    let p110 = vec3<f32>(1.0, 1.0, 0.0);
    let p001 = vec3<f32>(0.0, 0.0, 1.0);
    let p101 = vec3<f32>(1.0, 0.0, 1.0);
    let p011 = vec3<f32>(0.0, 1.0, 1.0);
    let p111 = vec3<f32>(1.0, 1.0, 1.0);

    let v000 = dot(gradient(grid + p000), pos - p000);
    let v100 = dot(gradient(grid + p100), pos - p100);
    let v010 = dot(gradient(grid + p010), pos - p010);
    let v110 = dot(gradient(grid + p110), pos - p110);
    let v001 = dot(gradient(grid + p001), pos - p001);
    let v101 = dot(gradient(grid + p101), pos - p101);
    let v011 = dot(gradient(grid + p011), pos - p011);
    let v111 = dot(gradient(grid + p111), pos - p111);

    let x00 = mix(v000, v100, fade.x);
    let x10 = mix(v010, v110, fade.x);
    let x01 = mix(v001, v101, fade.x);
    let x11 = mix(v011, v111, fade.x);

    let y0 = mix(x00, x10, fade.y);
    let y1 = mix(x01, x11, fade.y);

    return mix(y0, y1, fade.z);
}

fn fbm(p: vec3<f32>) -> f32 {
    var result = 0.0;
    var amplitude = 1.0;
    var frequency = 1.0;

    for (var i = 0u; i < 4u; i++) {
        result += amplitude * noise3D(p * frequency);
        amplitude *= 0.5;
        frequency *= 2.0;
    }

    return result;
}