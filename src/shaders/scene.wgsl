override WORKGROUP_SIZE: u32 = 8u;

const MATERIAL_NONE: u32 = 0u;
const MATERIAL_TERRAIN: u32 = 1u;
const MATERIAL_ROCK: u32 = 2u;

const MAX_TRACE_STEPS: i32 = 400;
const MAX_TRACE_DISTANCE: f32 = 600.0;
const HIT_EPSILON_PER_UNIT: f32 = 0.002;
// The height field is not a true SDF; scaling it keeps sphere tracing from overshooting.
// 高度场不是真正的 SDF，乘这个系数防止 sphere tracing 穿过地形。
const TERRAIN_STEP_SCALE: f32 = 0.5;

const SUN_DIRECTION: vec3f = vec3f(-0.8, 0.45, -0.3);
const FOG_DENSITY: f32 = 0.006;

@group(0) @binding(0) var outputTexture: texture_storage_2d<rgba16float, write>;
@group(0) @binding(1) var<uniform> frame: FrameUniforms;

struct SceneSample {
  distance: f32,
  material: u32,
};

fn sampleScene(p: vec3f) -> SceneSample {
  let terrain = (p.y - terrainHeight(p.xz)) * TERRAIN_STEP_SCALE;
  let rock = rockSdf(p);
  if (rock < terrain) {
    return SceneSample(rock, MATERIAL_ROCK);
  }
  return SceneSample(terrain, MATERIAL_TERRAIN);
}

struct Hit {
  distance: f32,
  material: u32,
};

fn trace(origin: vec3f, direction: vec3f) -> Hit {
  var t = 0.1;
  for (var i = 0; i < MAX_TRACE_STEPS; i++) {
    let s = sampleScene(origin + direction * t);
    if (s.distance < HIT_EPSILON_PER_UNIT * t) {
      return Hit(t, s.material);
    }
    t += s.distance;
    if (t > MAX_TRACE_DISTANCE) {
      break;
    }
  }
  return Hit(-1.0, MATERIAL_NONE);
}

fn softShadow(origin: vec3f, direction: vec3f) -> f32 {
  var result = 1.0;
  var t = 0.3;
  for (var i = 0; i < 64; i++) {
    let h = sampleScene(origin + direction * t).distance;
    result = min(result, 8.0 * h / t);
    t += clamp(h, 0.2, 6.0);
    if (result < 0.01 || t > 150.0) {
      break;
    }
  }
  return clamp(result, 0.0, 1.0);
}

fn rockNormal(p: vec3f) -> vec3f {
  let e = vec2f(0.01, 0.0);
  return normalize(vec3f(
      rockSdf(p + e.xyy) - rockSdf(p - e.xyy),
      rockSdf(p + e.yxy) - rockSdf(p - e.yxy),
      rockSdf(p + e.yyx) - rockSdf(p - e.yyx)));
}

fn skyColor(direction: vec3f, sun: vec3f) -> vec3f {
  let gradient = mix(vec3f(0.62, 0.72, 0.86), vec3f(0.16, 0.32, 0.62),
                     pow(max(direction.y, 0.0), 0.6));
  let sunDisc = vec3f(1.0, 0.9, 0.7) * pow(max(dot(direction, sun), 0.0), 400.0) * 6.0;
  return gradient + sunDisc;
}

fn terrainAlbedo(p: vec3f, n: vec3f) -> vec3f {
  let rock = vec3f(0.28, 0.25, 0.21);
  let grass = vec3f(0.08, 0.17, 0.05);
  let snow = vec3f(0.85, 0.88, 0.92);
  let ground = mix(rock, grass, smoothstep(0.7, 0.88, n.y));
  return mix(ground, snow, smoothstep(10.0, 14.0, p.y) * smoothstep(0.6, 0.8, n.y));
}

fn rockAlbedo(p: vec3f, n: vec3f) -> vec3f {
  let stone = mix(vec3f(0.16, 0.14, 0.13), vec3f(0.34, 0.30, 0.26), valueNoise3(p * 2.5));
  let moss = vec3f(0.10, 0.22, 0.06);
  return mix(stone, moss, smoothstep(0.55, 0.9, n.y) * 0.7);
}

@compute @workgroup_size(WORKGROUP_SIZE, WORKGROUP_SIZE)
fn renderScene(@builtin(global_invocation_id) id: vec3u) {
  let size = vec2u(frame.resolution);
  if (id.x >= size.x || id.y >= size.y) {
    return;
  }

  // Texture rows go top-down while camera "up" is +y, hence the flip.
  // 纹理的行是从上往下的，而相机的 up 是 +y，所以要翻转。
  var uv = (2.0 * (vec2f(id.xy) + 0.5) - frame.resolution) / frame.resolution.y;
  uv.y = -uv.y;
  let origin = frame.cameraPosition;
  let direction = normalize(frame.cameraForward +
      (uv.x * frame.cameraRight + uv.y * frame.cameraUp) * frame.tanHalfFovY);

  let sun = normalize(SUN_DIRECTION);
  let sky = skyColor(direction, sun);
  var color = sky;

  let hit = trace(origin, direction);
  if (hit.material != MATERIAL_NONE) {
    let p = origin + direction * hit.distance;
    var n: vec3f;
    var albedo: vec3f;
    if (hit.material == MATERIAL_ROCK) {
      n = rockNormal(p);
      albedo = rockAlbedo(p, n);
    } else {
      n = terrainNormal(p.xz);
      albedo = terrainAlbedo(p, n);
    }
    let diffuse = max(dot(n, sun), 0.0) * softShadow(p + n * 0.1, sun);
    let ambient = vec3f(0.35, 0.45, 0.6) * (0.5 + 0.5 * n.y);
    color = albedo * (vec3f(1.0, 0.88, 0.7) * diffuse * 2.2 + ambient * 0.5);
    let fog = 1.0 - exp(-hit.distance * FOG_DENSITY);
    color = mix(color, sky * 0.95, fog);
  }
  textureStore(outputTexture, id.xy, vec4f(color, 1.0));
}
