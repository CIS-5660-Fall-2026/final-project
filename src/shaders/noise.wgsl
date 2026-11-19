const FBM3_OCTAVES: i32 = 6;

fn hash12(p: vec2f) -> f32 {
  var q = fract(vec3f(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

fn hash33(p: vec3f) -> vec3f {
  var q = fract(p * vec3f(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yxz + 33.33);
  return fract((q.xxy + q.yxx) * q.zyx);
}

// Same value as hash33(p).x, without computing the unused components.
// 与 hash33(p).x 结果完全相同，但不计算用不到的分量。
fn hash31(p: vec3f) -> f32 {
  var q = fract(p * vec3f(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yxz + 33.33);
  return fract((q.x + q.y) * q.z);
}

fn valueNoise2(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2f(1, 0)), w.x),
             mix(hash12(i + vec2f(0, 1)), hash12(i + vec2f(1, 1)), w.x), w.y);
}

fn valueNoise3(p: vec3f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  let x00 = mix(hash31(i), hash31(i + vec3f(1, 0, 0)), w.x);
  let x10 = mix(hash31(i + vec3f(0, 1, 0)), hash31(i + vec3f(1, 1, 0)), w.x);
  let x01 = mix(hash31(i + vec3f(0, 0, 1)), hash31(i + vec3f(1, 0, 1)), w.x);
  let x11 = mix(hash31(i + vec3f(0, 1, 1)), hash31(i + vec3f(1, 1, 1)), w.x);
  return mix(mix(x00, x10, w.y), mix(x01, x11, w.y), w.z);
}

// Range is [0, 1 - 2^-FBM3_OCTAVES]; rocks.wgsl relies on this bound.
// 取值范围是 [0, 1 - 2^-FBM3_OCTAVES]；rocks.wgsl 依赖这个上下界。
fn fbm3(p: vec3f) -> f32 {
  var q = p;
  var sum = 0.0;
  var amplitude = 0.5;
  for (var i = 0; i < FBM3_OCTAVES; i++) {
    sum += amplitude * valueNoise3(q);
    q = q * 2.03 + vec3f(1.7, 9.2, 3.1);
    amplitude *= 0.5;
  }
  return sum;
}
