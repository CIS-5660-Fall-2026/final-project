import Camera from "./Camera";
import { bodiesWgsl } from "./shaders";
import { createSphereMesh } from "./Sphere";
import type WebGpuContext from "./WebGpuContext";

export default class Renderer {
  private readonly gpuContext: WebGpuContext;

  public readonly camera: Camera = new Camera();
  private readonly cameraBuffer: GPUBuffer;

  private readonly renderPipeline: GPURenderPipeline;

  private readonly cameraBindGroup: GPUBindGroup;
  private readonly bodiesBindGroup: GPUBindGroup;

  private readonly sphereVertexBuffer: GPUBuffer;
  private readonly sphereIndexBuffer: GPUBuffer;

  private readonly indirectBuffer: GPUBuffer;

  private readonly depthTexture: GPUTexture;

  constructor(
    gpuContext: WebGpuContext, 
    bodiesBuffer: GPUBuffer, 
    bodyCount: number,
    collisionCandidatesBuffer: GPUBuffer
  ) {
    this.gpuContext = gpuContext;
    
    const device = this.gpuContext.device;
    const canvas = this.gpuContext.context.canvas;

    this.camera.aspect = canvas.width / canvas.height;
    this.camera.updateProjection();

    this.cameraBuffer = device.createBuffer({
      label: "camera buffer",
      size: this.camera.uniforms.buffer.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    const mesh = createSphereMesh();

    this.sphereVertexBuffer = device.createBuffer({
      size: mesh.positions.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });

    this.sphereIndexBuffer = device.createBuffer({
      size: mesh.indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
    });

    device.queue.writeBuffer(this.sphereVertexBuffer, 0, mesh.positions);
    device.queue.writeBuffer(this.sphereIndexBuffer, 0, mesh.indices);

    this.indirectBuffer = device.createBuffer({
      label: "draw indirect args",
      size: 20,
      usage: GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(this.indirectBuffer, 0,
      new Uint32Array([
        mesh.indices.length,
        bodyCount,
        0,
        0,
        0,
      ])
    );

    this.depthTexture = device.createTexture({
      size: [canvas.width, canvas.height],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT
    })

    const bodiesShaderModule = device.createShaderModule({
      label: "vertex shader",
      code: bodiesWgsl
    });

    this.renderPipeline = device.createRenderPipeline({
      label: "render pipeline",
      layout: "auto",
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: "less",
        format: "depth24plus"
      },
      vertex: {
        module: bodiesShaderModule,
        entryPoint: "vertMain",
        buffers: [{
          arrayStride: 12,
          attributes: [{
            shaderLocation: 0,
            offset: 0,
            format: "float32x3"
          }]
        }]
      },
      fragment: {
        module: bodiesShaderModule,
        entryPoint: "fragMain",
        targets: [{
          format: this.gpuContext.format
        }]
      }
    });

    this.cameraBindGroup = device.createBindGroup({
      label: "camera bind group",
      layout: this.renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.cameraBuffer } }
      ]
    });

    this.bodiesBindGroup = device.createBindGroup({
      label: "bodies bind group",
      layout: this.renderPipeline.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: { buffer: bodiesBuffer } },
        { binding: 1, resource: { buffer: collisionCandidatesBuffer } }
      ]
    });
  }

  public onFrame = (): void => {
    const device = this.gpuContext.device;

    this.camera.updateViewProjection();
    this.camera.onFrame();
    device.queue.writeBuffer(this.cameraBuffer, 0, this.camera.uniforms.buffer);
  }

  public encode(encoder: GPUCommandEncoder): void {
    const renderPass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.gpuContext.context.getCurrentTexture().createView(),
        loadOp: "clear",
        storeOp: "store"
      }],
      depthStencilAttachment: {
        view: this.depthTexture.createView(),
        depthClearValue: 1,
        depthLoadOp: "clear",
        depthStoreOp: "store"
      }
    });
    renderPass.setPipeline(this.renderPipeline);
    renderPass.setBindGroup(0, this.cameraBindGroup);
    renderPass.setBindGroup(1, this.bodiesBindGroup);
    renderPass.setVertexBuffer(0, this.sphereVertexBuffer);
    renderPass.setIndexBuffer(this.sphereIndexBuffer, "uint16");
    renderPass.drawIndexedIndirect(this.indirectBuffer, 0);
    renderPass.end();
  }
}