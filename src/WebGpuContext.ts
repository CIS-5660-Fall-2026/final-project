export default class WebGpuContext {
  public readonly adapter: GPUAdapter;
  public readonly device: GPUDevice;
  public readonly context: GPUCanvasContext;
  public readonly format: GPUTextureFormat;

  private constructor(
    adapter: GPUAdapter,
    device: GPUDevice,
    context: GPUCanvasContext,
    format: GPUTextureFormat
  ) {
    this.adapter = adapter;
    this.device = device;
    this.context = context;
    this.format = format;
  }

  public static async create(canvas: HTMLCanvasElement): Promise<WebGpuContext> {
    if (!navigator.gpu) {
      throw new Error("WebGPU not supported on this browser");
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("No appropriate GPUAdapter found");
    }

    const device = await adapter.requestDevice();

    const context = canvas.getContext("webgpu") as GPUCanvasContext;
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
      device: device,
      format: format,
    });

    return new WebGpuContext(
      adapter,
      device,
      context,
      format
    );
  }
}