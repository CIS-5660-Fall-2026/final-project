import Camera from "./Camera";
import type WebGpuContext from "./WebGpuContext";

export default class Renderer {
  private readonly gpuContext: WebGpuContext;

  private frameId: number | null = null;

  private camera: Camera = new Camera();
  private cameraBuffer: GPUBuffer;

  constructor(gpuContext: WebGpuContext, aspect?: number) {
    this.gpuContext = gpuContext;
    
    this.camera.aspect = aspect ?? this.camera.aspect;

    this.cameraBuffer = this.gpuContext.device.createBuffer({
      size: this.camera.uniforms.buffer.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
  }

  public start(): void {
    this.frameId = requestAnimationFrame(this.onFrame);
  }

  public stop(): void {
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }

  private onFrame = (): void => {
    this.render();
    this.frameId = requestAnimationFrame(this.onFrame);
  }

  public render(): void {   
    const device = this.gpuContext.device;
    
    const canvasTextureView = this.gpuContext.context.getCurrentTexture().createView();
   
    const encoder = device.createCommandEncoder();
    
    const renderPass = encoder.beginRenderPass({
      colorAttachments: [{
        view: canvasTextureView,
        loadOp: "clear",
        clearValue: { r: 0, g: 0, b: 0.4, a: 1 },
        storeOp: "store"
      }]
    });

    renderPass.end();

    device.queue.submit([encoder.finish()]);
  }
}