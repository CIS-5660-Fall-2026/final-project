import GUI from 'lil-gui';

import {FlyCamera, type CameraPose} from './camera';
import {observeCanvasSize} from './gpu/canvasSize';
import {initGpu} from './gpu/context';
import {Renderer} from './renderer';
import {FrameStats} from './stats';

const VERTICAL_FOV_RADIANS = (50 * Math.PI) / 180;
const MAX_CAMERA_STEP_SECONDS = 0.1;
const INITIAL_POSE: CameraPose = {position: [0, 8, 0], yaw: 0, pitch: -0.15};
// All performance numbers are measured from this view so they stay comparable.
// 所有性能数据都在这个固定视角下测量，保证可以互相比较。
const BENCHMARK_POSE: CameraPose = {
  position: [10, 9, -30],
  yaw: 0.15,
  pitch: -0.2,
};

async function main(): Promise<void> {
  const canvas = document.querySelector('canvas');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('Missing <canvas> element.');
  }

  const gpu = await initGpu(canvas);
  void gpu.device.lost.then(info => {
    if (info.reason !== 'destroyed')
      showFatalError(`WebGPU device lost: ${info.message}`);
  });

  const renderer = new Renderer(gpu);
  const camera = new FlyCamera(canvas, INITIAL_POSE);
  const stats = new FrameStats(document.body);
  const settings = {renderScale: 0.5};

  const applySize = () =>
    renderer.resize(canvas.width, canvas.height, settings.renderScale);
  observeCanvasSize(
    canvas,
    gpu.device.limits.maxTextureDimension2D,
    (width, height) => {
      canvas.width = width;
      canvas.height = height;
      applySize();
    },
  );

  const gui = new GUI({title: 'Neural-Procedural Terrain'});
  gui
    .add(settings, 'renderScale', 0.25, 1, 0.05)
    .name('render scale')
    .onFinishChange(applySize);
  gui
    .add({benchmarkView: () => camera.setPose(BENCHMARK_POSE)}, 'benchmarkView')
    .name('benchmark view');

  const tanHalfFovY = Math.tan(VERTICAL_FOV_RADIANS / 2);
  let previousMs: number | null = null;
  const frame = (nowMs: number) => {
    const deltaMs = previousMs === null ? 0 : nowMs - previousMs;
    previousMs = nowMs;
    stats.record(deltaMs, renderer.renderSize);
    // Clamped so a long pause (e.g. a hidden tab) does not teleport the camera.
    // 限制步长，避免切回标签页时相机一下子飞出去很远。
    const cameraState = camera.update(
      Math.min(deltaMs / 1000, MAX_CAMERA_STEP_SECONDS),
    );
    renderer.render({
      timeSeconds: nowMs / 1000,
      tanHalfFovY,
      camera: cameraState,
    });
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function showFatalError(message: string): void {
  console.error(message);
  const element = document.createElement('div');
  element.className = 'fatal-error';
  element.textContent = message;
  document.body.appendChild(element);
}

main().catch((error: unknown) => {
  showFatalError(error instanceof Error ? error.message : String(error));
});
