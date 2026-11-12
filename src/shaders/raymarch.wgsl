// Uniforms shared with main.ts (each vec3 is padded to 16 bytes)
// 和 main.ts 共享的 uniform（每个 vec3 补齐到 16 字节）
struct U {
  res: vec2f, time: f32, pad0: f32,
  camPos: vec3f, fovTan: f32,
  camFwd: vec3f, pad1: f32,
  camRight: vec3f, pad2: f32,
  camUp: vec3f, pad3: f32,
};
@group(0) @binding(0) var outTex: texture_storage_2d<rgba16float, write>;
@group(0) @binding(1) var<uniform> u: U;

// Hash: pseudo-random value in [0,1) from a 2D position
// 哈希：根据二维坐标生成 [0,1) 之间的伪随机数
fn hash2(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Value noise: smoothly interpolate hashes at the four grid corners
// 值噪声：对网格四个角的随机值做平滑插值
fn noise2(p: vec2f) -> f32 {
  let i = floor(p); let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2f(1, 0)), w.x),
             mix(hash2(i + vec2f(0, 1)), hash2(i + vec2f(1, 1)), w.x), w.y);
}

// FBM terrain height: sum of rotated noise octaves (higher freq, lower amp)
// FBM 地形高度：多层旋转噪声叠加，频率越高、振幅越小
fn terrainH(p: vec2f) -> f32 {
  let rot = mat2x2f(0.8, -0.6, 0.6, 0.8);
  var q = p * 0.02;
  var h = 0.0; var a = 1.0;
  for (var i = 0; i < 7; i++) {
    h += a * noise2(q);
    a *= 0.5;
    q = rot * q * 2.1 + 3.1;
  }
  return h * 18.0 - 12.0;
}

// Terrain normal from central differences of the height field
// 用高度场的中心差分计算地形法线
fn terrainNormal(p: vec2f) -> vec3f {
  let e = 0.05;
  return normalize(vec3f(terrainH(p - vec2f(e, 0)) - terrainH(p + vec2f(e, 0)), 2.0 * e,
                         terrainH(p - vec2f(0, e)) - terrainH(p + vec2f(0, e))));
}

// 3D hash: pseudo-random vec3 in [0,1) from a 3D position
// 三维哈希：根据三维坐标生成 [0,1) 之间的伪随机向量
fn hash33(p: vec3f) -> vec3f {
  var q = fract(p * vec3f(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yxz + 33.33);
  return fract((q.xxy + q.yxx) * q.zyx);
}

// 3D value noise (trilinear interpolation of corner hashes)
// 三维值噪声：对立方体 8 个角的随机值做三线性插值
fn noise3(p: vec3f) -> f32 {
  let i = floor(p); let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  let a = hash33(i).x;                      let b = hash33(i + vec3f(1, 0, 0)).x;
  let c = hash33(i + vec3f(0, 1, 0)).x;     let d = hash33(i + vec3f(1, 1, 0)).x;
  let e = hash33(i + vec3f(0, 0, 1)).x;     let f1 = hash33(i + vec3f(1, 0, 1)).x;
  let g = hash33(i + vec3f(0, 1, 1)).x;     let h = hash33(i + vec3f(1, 1, 1)).x;
  return mix(mix(mix(a, b, w.x), mix(c, d, w.x), w.y),
             mix(mix(e, f1, w.x), mix(g, h, w.x), w.y), w.z);
}

// 3D FBM: the expensive part that the neural SDF will later replace
// 三维 FBM：计算量最大的部分，之后要用神经 SDF 来替代
fn fbm3(p: vec3f) -> f32 {
  var q = p; var s = 0.0; var a = 0.5;
  for (var i = 0; i < 6; i++) {
    s += a * noise3(q);
    q = q * 2.03 + vec3f(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return s;
}

// Rock placement: one candidate rock per grid cell, decided by a hash
// 石头摆放：地面划成网格，每个格子用哈希决定有没有石头以及它的参数
const CELL: f32 = 14.0;

// Procedural rock SDF for the rock in one cell (huge value if the cell is empty)
// 某个格子里程序化石头的 SDF（格子里没有石头时返回很大的值）
fn rockInCell(p: vec3f, cell: vec2f) -> f32 {
  let r = hash33(vec3f(cell, 7.0));
  if (r.z > 0.45) { return 1e5; }
  let sz = 1.5 + 2.5 * r.x;
  let cxz = (cell + 0.5) * CELL + (r.xy - 0.5) * CELL * 0.4;
  let c = vec3f(cxz.x, terrainH(cxz) - 0.15 * sz, cxz.y);
  var q = p - c;
  q.y *= 1.2 - 0.3 * r.y;
  let base = length(q) - sz;
  // Bounding-sphere early out: skip the expensive noise when far away
  // 包围球提前退出：离石头较远时直接返回，不算昂贵的噪声
  if (base > 0.8 * sz) { return base - 0.5 * sz; }
  let disp = (fbm3(q * (1.6 / sz) + vec3f(cell * 7.0, 0.0)) - 0.5) * 1.1 * sz;
  // Scale down so the displaced field stays a safe (conservative) distance
  // 乘一个缩放系数，保证加了噪声之后仍然是安全的保守距离
  return (base + disp) * 0.6;
}

// Rock SDF: check this cell and its 8 neighbors
// 石头 SDF：检查当前格子和周围 8 个格子
fn rockSDF(p: vec3f) -> f32 {
  let cell = floor(p.xz / CELL);
  var d = 1e5;
  for (var j = -1; j <= 1; j++) {
    for (var i = -1; i <= 1; i++) {
      d = min(d, rockInCell(p, cell + vec2f(f32(i), f32(j))));
    }
  }
  return d;
}

// Scene SDF: returns (distance, material id); 1 = terrain, 2 = rock
// 场景 SDF：返回（距离，材质编号）；1 是地形，2 是石头
fn mapScene(p: vec3f) -> vec2f {
  let dt = (p.y - terrainH(p.xz)) * 0.5;
  let dr = rockSDF(p);
  if (dr < dt) { return vec2f(dr, 2.0); }
  return vec2f(dt, 1.0);
}

// Rock normal from central differences of the rock SDF
// 用石头 SDF 的中心差分计算石头法线
fn rockNormal(p: vec3f) -> vec3f {
  let e = vec2f(0.01, 0.0);
  return normalize(vec3f(rockSDF(p + e.xyy) - rockSDF(p - e.xyy),
                         rockSDF(p + e.yxy) - rockSDF(p - e.yxy),
                         rockSDF(p + e.yyx) - rockSDF(p - e.yyx)));
}

// Sphere tracing against the whole scene; returns (hit distance or -1, material id)
// 对整个场景做 sphere tracing，返回（命中距离，没命中为 -1；材质编号）
fn trace(ro: vec3f, rd: vec3f) -> vec2f {
  var t = 0.1;
  for (var i = 0; i < 400; i++) {
    let m = mapScene(ro + rd * t);
    if (m.x < 0.002 * t) { return vec2f(t, m.y); }
    t += m.x;
    if (t > 600.0) { break; }
  }
  return vec2f(-1.0, 0.0);
}

// Soft shadow: march toward the sun and track the closest miss (terrain + rocks)
// 软阴影：朝太阳方向步进，记录离地形和石头最近的程度
fn softShadow(ro: vec3f, rd: vec3f) -> f32 {
  var res = 1.0; var t = 0.3;
  for (var i = 0; i < 64; i++) {
    let h = mapScene(ro + rd * t).x;
    res = min(res, 8.0 * h / t);
    t += clamp(h, 0.2, 6.0);
    if (res < 0.01 || t > 150.0) { break; }
  }
  return clamp(res, 0.0, 1.0);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= u32(u.res.x) || id.y >= u32(u.res.y)) { return; }

  // Pixel -> camera ray (texture y points down, so flip it)
  // 像素 -> 相机光线（纹理坐标 y 朝下，需要翻转）
  var uv = (2.0 * vec2f(id.xy) - u.res) / u.res.y;
  uv.y = -uv.y;
  let ro = u.camPos;
  let rd = normalize(u.camFwd + (uv.x * u.camRight + uv.y * u.camUp) * u.fovTan);

  // Sky gradient plus a sun disc
  // 天空渐变，加上太阳光斑
  let sun = normalize(vec3f(-0.8, 0.45, -0.3));
  var sky = mix(vec3f(0.62, 0.72, 0.86), vec3f(0.16, 0.32, 0.62), pow(max(rd.y, 0.0), 0.6));
  sky += vec3f(1.0, 0.9, 0.7) * pow(max(dot(rd, sun), 0.0), 400.0) * 6.0;

  var col = sky;
  let hit = trace(ro, rd);
  let t = hit.x;
  if (t > 0.0) {
    let p = ro + rd * t;
    var n: vec3f;
    var alb: vec3f;
    if (hit.y > 1.5) {
      // Rock material: dark stone with noise variation, moss on upward faces
      // 石头材质：深色岩石加噪声变化，朝上的面长青苔
      n = rockNormal(p);
      let g = noise3(p * 2.5);
      alb = mix(vec3f(0.16, 0.14, 0.13), vec3f(0.34, 0.30, 0.26), g);
      alb = mix(alb, vec3f(0.10, 0.22, 0.06), smoothstep(0.55, 0.9, n.y) * 0.7);
    } else {
      // Terrain material by slope and height: grass, rock, snow
      // 地形材质：按坡度和高度决定草地、岩石、雪
      n = terrainNormal(p.xz);
      let rock = vec3f(0.28, 0.25, 0.21);
      let grass = vec3f(0.08, 0.17, 0.05);
      alb = mix(rock, grass, smoothstep(0.7, 0.88, n.y));
      alb = mix(alb, vec3f(0.85, 0.88, 0.92), smoothstep(10.0, 14.0, p.y) * smoothstep(0.6, 0.8, n.y));
    }

    // Lighting: sun diffuse with soft shadow, plus sky ambient
    // 光照：带软阴影的太阳漫反射，加上天空环境光
    let dif = max(dot(n, sun), 0.0) * softShadow(p + n * 0.1, sun);
    let amb = vec3f(0.35, 0.45, 0.6) * (0.5 + 0.5 * n.y);
    col = alb * (vec3f(1.0, 0.88, 0.7) * dif * 2.2 + amb * 0.5);

    // Distance fog blends toward the sky color
    // 距离雾：越远越接近天空颜色
    let fog = 1.0 - exp(-t * 0.006);
    col = mix(col, sky * 0.95, fog);
  }
  textureStore(outTex, id.xy, vec4f(col, 1.0));
}
