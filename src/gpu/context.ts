/**
 * Optional features enabled when the adapter supports them. Code must check
 * `GpuContext.features` before relying on any of them.
 */
const OPTIONAL_FEATURES: readonly GPUFeatureName[] = [
  'timestamp-query',
  'shader-f16',
];

export interface GpuContext {
  readonly device: GPUDevice;
  readonly context: GPUCanvasContext;
  readonly format: GPUTextureFormat;
  readonly features: ReadonlySet<GPUFeatureName>;
}

export async function initGpu(canvas: HTMLCanvasElement): Promise<GpuContext> {
  if (!navigator.gpu) {
    throw new Error('WebGPU is not supported in this browser.');
  }
  // Prefer the discrete GPU on laptops with hybrid graphics.
  // 双显卡笔记本上优先使用独立显卡。
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: 'high-performance',
  });
  if (!adapter) {
    throw new Error('No suitable GPU adapter was found.');
  }
  const requiredFeatures = OPTIONAL_FEATURES.filter(feature =>
    adapter.features.has(feature),
  );
  const device = await adapter.requestDevice({requiredFeatures});

  const context = canvas.getContext('webgpu');
  if (!context) {
    throw new Error('Failed to create a WebGPU canvas context.');
  }
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({device, format, alphaMode: 'opaque'});

  return {device, context, format, features: new Set(requiredFeatures)};
}
