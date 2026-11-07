import Camera from "./Camera";
import { bodiesWgsl, gravityWgsl } from "./shaders";
import type WebGpuContext from "./WebGpuContext";

export default class Renderer {
  private readonly gpuContext: WebGpuContext;

  private frameId: number | null = null;

  private camera: Camera = new Camera();
  private cameraBuffer: GPUBuffer;

  private computePipeline: GPUComputePipeline;
  private renderPipeline: GPURenderPipeline;

  private computeBindGroup: GPUBindGroup;
  private renderBindGroup: GPUBindGroup;

  private indirectBuffer: GPUBuffer;

  constructor(gpuContext: WebGpuContext, aspect?: number) {
    this.gpuContext = gpuContext;
    
    const device = this.gpuContext.device;

    this.camera.aspect = aspect ?? this.camera.aspect;

    this.cameraBuffer = device.createBuffer({
      label: "camera buffer",
      size: this.camera.uniforms.buffer.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    const positionsBuffer = device.createBuffer({
      label: "positions buffer",
      size: 3 * 4 * 4,
      usage: GPUBufferUsage.STORAGE
    });

    this.indirectBuffer = device.createBuffer({
      label: "draw indirect args",
      size: 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT,
    })

    this.computePipeline = device.createComputePipeline({
      label: "compute pipeline",
      layout: "auto",
      compute: {
        module: device.createShaderModule({
          label: "compute shader",
          code: gravityWgsl
        }),
        entryPoint: "gravityNaive"
      }
    });

    this.computeBindGroup = device.createBindGroup({
      label: "compute bind group",
      layout: this.computePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: positionsBuffer } },
        { binding: 1, resource: { buffer: this.indirectBuffer } }
      ]
    });

    const bodiesShaderModule = device.createShaderModule({
      label: "vertex shader",
      code: bodiesWgsl
    });

    this.renderPipeline = device.createRenderPipeline({
      label: "render pipeline",
      layout: "auto",
      // depthStencil: {
      //   depthWriteEnabled: true,
      //   depthCompare: "less",
      //   format: "depth24plus"
      // },
      vertex: {
        module: bodiesShaderModule,
        entryPoint: "vertMain"
      },
      fragment: {
        module: bodiesShaderModule,
        entryPoint: "fragMain",
        targets: [{
          format: this.gpuContext.format
        }]
      }
    });

    this.renderBindGroup = device.createBindGroup({
      label: "render bind group",
      layout: this.renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.cameraBuffer } },
        { binding: 1, resource: { buffer: positionsBuffer } }
      ]
    })
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
    const device = this.gpuContext.device;

    this.camera.onFrame();

    // device.queue.writeBuffer(this.cameraBuffer, 0, this.camera.uniforms.buffer);

    device.queue.writeBuffer(
      this.cameraBuffer,
      0,
      new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
      ]),
    );

    this.render();
    this.frameId = requestAnimationFrame(this.onFrame);
  }

  public render(): void {   
    const device = this.gpuContext.device;
    
    const canvasTextureView = this.gpuContext.context.getCurrentTexture().createView();
   
    const encoder = device.createCommandEncoder();

    const computePass = encoder.beginComputePass({
      label: "compute pass"
    });
    computePass.setPipeline(this.computePipeline);
    computePass.setBindGroup(0, this.computeBindGroup);
    computePass.dispatchWorkgroups(1);
    computePass.end();
    
    const renderPass = encoder.beginRenderPass({
      colorAttachments: [{
        view: canvasTextureView,
        loadOp: "clear",
        storeOp: "store"
      }]
    });
    renderPass.setPipeline(this.renderPipeline);
    renderPass.setBindGroup(0, this.renderBindGroup);
    renderPass.drawIndirect(this.indirectBuffer, 0);
    renderPass.end();

    device.queue.submit([encoder.finish()]);
  }
}