const TERRAIN_OCTAVES: i32 = 7;
const TERRAIN_BASE_FREQUENCY: f32 = 0.02;
const TERRAIN_HEIGHT_SCALE: f32 = 18.0;
const TERRAIN_HEIGHT_OFFSET: f32 = -12.0;

fn terrainHeight(p: vec2f) -> f32 {
  // Rotating each octave hides the axis-aligned grid of value noise.
  // 每层旋转一次，避免值噪声的网格走向过于明显。
  let rotation = mat2x2f(0.8, -0.6, 0.6, 0.8);
  var q = p * TERRAIN_BASE_FREQUENCY;
  var height = 0.0;
  var amplitude = 1.0;
  for (var i = 0; i < TERRAIN_OCTAVES; i++) {
    height += amplitude * valueNoise2(q);
    amplitude *= 0.5;
    q = rotation * q * 2.1 + 3.1;
  }
  return height * TERRAIN_HEIGHT_SCALE + TERRAIN_HEIGHT_OFFSET;
}

fn terrainNormal(p: vec2f) -> vec3f {
  let e = 0.05;
  return normalize(vec3f(
      terrainHeight(p - vec2f(e, 0)) - terrainHeight(p + vec2f(e, 0)),
      2.0 * e,
      terrainHeight(p - vec2f(0, e)) - terrainHeight(p + vec2f(0, e))));
}
