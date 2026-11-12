// Full-screen triangle; uv covers [0,1] with y pointing down like the texture
// 全屏三角形；uv 覆盖 [0,1]，y 朝下，和纹理坐标一致
@group(0) @binding(0) var hdr: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;

struct VOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };

@vertex fn vs(@builtin(vertex_index) i: u32) -> VOut {
  let p = array(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  var o: VOut;
  o.pos = vec4f(p[i], 0, 1);
  o.uv = vec2f(p[i].x * 0.5 + 0.5, 0.5 - p[i].y * 0.5);
  return o;
}

// ACES filmic tone mapping (HDR -> [0,1])
// ACES 电影感色调映射（把 HDR 压到 [0,1]）
fn aces(x: vec3f) -> vec3f {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), vec3f(0), vec3f(1));
}

// Upscale with bilinear filtering, tone map, then gamma-encode
// 用双线性过滤放大，做色调映射，再做 gamma 校正
@fragment fn fs(in: VOut) -> @location(0) vec4f {
  let c = textureSample(hdr, samp, in.uv).rgb;
  return vec4f(pow(aces(c), vec3f(1.0 / 2.2)), 1);
}
