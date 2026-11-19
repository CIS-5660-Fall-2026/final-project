// Per-frame uniforms. Layout must match FRAME_UNIFORM_LAYOUT in renderer.ts.
// 每帧 uniform。内存布局必须和 renderer.ts 中的 FRAME_UNIFORM_LAYOUT 一致。
struct FrameUniforms {
  resolution: vec2f,
  time: f32,
  tanHalfFovY: f32,
  cameraPosition: vec3f,
  _pad0: f32,
  cameraForward: vec3f,
  _pad1: f32,
  cameraRight: vec3f,
  _pad2: f32,
  cameraUp: vec3f,
  _pad3: f32,
};
