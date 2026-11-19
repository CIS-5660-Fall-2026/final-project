@group(0) @binding(0) var sceneTexture: texture_2d<f32>;
@group(0) @binding(1) var sceneSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

// Single full-screen triangle; uv has y pointing down to match texture rows.
// 一个覆盖全屏的三角形；uv 的 y 朝下，和纹理行方向一致。
@vertex
fn fullscreenVertex(@builtin(vertex_index) index: u32) -> VertexOutput {
  let corners = array(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  let corner = corners[index];
  var out: VertexOutput;
  out.position = vec4f(corner, 0.0, 1.0);
  out.uv = vec2f(corner.x * 0.5 + 0.5, 0.5 - corner.y * 0.5);
  return out;
}

fn acesFilm(x: vec3f) -> vec3f {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), vec3f(0.0), vec3f(1.0));
}

// The swap chain format is not sRGB, so gamma is applied here.
// 交换链格式不是 sRGB，所以在这里做 gamma 编码。
@fragment
fn tonemapFragment(in: VertexOutput) -> @location(0) vec4f {
  let hdr = textureSample(sceneTexture, sceneSampler, in.uv).rgb;
  return vec4f(pow(acesFilm(hdr), vec3f(1.0 / 2.2)), 1.0);
}
