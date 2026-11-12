import raymarchWGSL from './shaders/raymarch.wgsl?raw';
import blitWGSL from './shaders/blit.wgsl?raw';
import GUI from 'lil-gui';

const canvas = document.querySelector('canvas')!;
const adapter = await navigator.gpu?.requestAdapter();
if (!adapter) throw new Error('WebGPU not supported');
const device = await adapter.requestDevice();
const ctx = canvas.getContext('webgpu')!;
const format = navigator.gpu.getPreferredCanvasFormat();
ctx.configure({ device, format });

const W = (canvas.width = Math.floor(canvas.clientWidth * devicePixelRatio));
const H = (canvas.height = Math.floor(canvas.clientHeight * devicePixelRatio));

// Render-resolution scale: ray march at lower res, then upscale in the blit pass
// 渲染分辨率缩放：raymarching 用较低分辨率计算，再在 blit pass 里放大显示
const params = { renderScale: 0.5 };
let RW = 1, RH = 1;
let hdr: GPUTexture;
const ubo = device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

// Camera: WASD move, Q/E down/up, mouse drag to look, Shift to speed up
// 相机：WASD 移动，Q/E 下降/上升，鼠标拖动转向，Shift 加速
const cam = { pos: [0, 8, 0], yaw: 0, pitch: -0.15 };
const keys = new Set<string>();
addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
let dragging = false;
canvas.addEventListener('mousedown', () => (dragging = true));
addEventListener('mouseup', () => (dragging = false));
addEventListener('mousemove', (e) => {
  if (!dragging) return;
  cam.yaw += e.movementX * 0.003;
  cam.pitch = Math.max(-1.5, Math.min(1.5, cam.pitch - e.movementY * 0.003));
});

// Build the camera basis (forward/right/up) and apply keyboard movement
// 计算相机的前、右、上三个方向，并根据按键移动相机
function updateCamera(dt: number) {
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const fwd = [cp * Math.sin(cam.yaw), sp, cp * Math.cos(cam.yaw)];
  const right = [Math.cos(cam.yaw), 0, -Math.sin(cam.yaw)];
  const up = [
    fwd[1] * right[2] - fwd[2] * right[1],
    fwd[2] * right[0] - fwd[0] * right[2],
    fwd[0] * right[1] - fwd[1] * right[0],
  ];
  const speed = (keys.has('shift') ? 60 : 12) * dt;
  const move = (v: number[], s: number) => { for (let i = 0; i < 3; i++) cam.pos[i] += v[i] * s; };
  if (keys.has('w')) move(fwd, speed);
  if (keys.has('s')) move(fwd, -speed);
  if (keys.has('d')) move(right, speed);
  if (keys.has('a')) move(right, -speed);
  if (keys.has('e')) cam.pos[1] += speed;
  if (keys.has('q')) cam.pos[1] -= speed;
  return { fwd, right, up };
}
let lastT = 0;

const computePipe = device.createComputePipeline({
  layout: 'auto',
  compute: { module: device.createShaderModule({ code: raymarchWGSL }), entryPoint: 'main' },
});
const blitModule = device.createShaderModule({ code: blitWGSL });
const blitPipe = device.createRenderPipeline({
  layout: 'auto',
  vertex: { module: blitModule, entryPoint: 'vs' },
  fragment: { module: blitModule, entryPoint: 'fs', targets: [{ format }] },
});
const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
let computeBG: GPUBindGroup, blitBG: GPUBindGroup;

// (Re)create the HDR texture and bind groups when the render scale changes
// 渲染缩放改变时，重新创建 HDR 纹理和 bind group
function resize() {
  RW = Math.max(1, Math.floor(W * params.renderScale));
  RH = Math.max(1, Math.floor(H * params.renderScale));
  hdr?.destroy();
  hdr = device.createTexture({
    size: [RW, RH],
    format: 'rgba16float',
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
  });
  computeBG = device.createBindGroup({
    layout: computePipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: hdr.createView() },
      { binding: 1, resource: { buffer: ubo } },
    ],
  });
  blitBG = device.createBindGroup({
    layout: blitPipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: hdr.createView() },
      { binding: 1, resource: sampler },
    ],
  });
}
resize();

// GUI panel (lil-gui)
// 参数面板（lil-gui）
const gui = new GUI();
gui.add(params, 'renderScale', 0.25, 1.0, 0.05).name('render scale').onFinishChange(resize);

// Fixed benchmark view so timings are comparable between versions
// 固定的基准视角，保证不同版本之间的性能数据可以直接比较
const bench = {
  'benchmark view': () => { cam.pos = [10, 9, -30]; cam.yaw = 0.15; cam.pitch = -0.2; },
};
gui.add(bench, 'benchmark view');

// FPS / frame-time overlay (averaged over 30 frames)
// 左上角显示 FPS 和每帧耗时（30 帧平均）
const stats = document.createElement('div');
stats.style.cssText = 'position:fixed;left:8px;top:8px;color:#fff;font:13px monospace;background:#0008;padding:4px 8px;border-radius:4px';
document.body.appendChild(stats);
let accum = 0, frames = 0;

function frame(t: number) {
  // Frame time in seconds (clamped to avoid jumps after tab switches)
  // 帧间隔（秒），加上上限，避免切换标签页回来时相机跳太远
  // Real frame time for stats; clamped copy for camera movement
  // 统计用真实帧时间；相机移动用加了上限的帧时间
  const rawDt = (t - lastT) / 1000;
  const dt = Math.min(rawDt, 0.1); lastT = t;
  accum += rawDt; frames++;
  if (frames === 30) {
    stats.textContent = `${(frames / accum).toFixed(1)} FPS | ${(1000 * accum / frames).toFixed(1)} ms | ${RW}x${RH}`;
    accum = 0; frames = 0;
  }
  const { fwd, right, up } = updateCamera(dt);
  // Upload uniforms; layout must match struct U in raymarch.wgsl
  // 上传 uniform，排布必须和 raymarch.wgsl 里的 struct U 一致
  device.queue.writeBuffer(ubo, 0, new Float32Array([
    RW, RH, t / 1000, 0,
    ...cam.pos, Math.tan((50 * Math.PI / 180) / 2),
    ...fwd, 0,
    ...right, 0,
    ...up, 0,
  ]));
  const enc = device.createCommandEncoder();

  const cp = enc.beginComputePass();
  cp.setPipeline(computePipe);
  cp.setBindGroup(0, computeBG);
  cp.dispatchWorkgroups(Math.ceil(RW / 8), Math.ceil(RH / 8));
  cp.end();

  const rp = enc.beginRenderPass({
    colorAttachments: [{
      view: ctx.getCurrentTexture().createView(),
      loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1],
    }],
  });
  rp.setPipeline(blitPipe);
  rp.setBindGroup(0, blitBG);
  rp.draw(3);
  rp.end();

  device.queue.submit([enc.finish()]);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);