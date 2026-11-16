import Camera from "./Camera";
import { bodiesDebugWgsl, bodiesWgsl, compositeWgsl } from "./shaders";
import { createSphereMesh } from "./Sphere";
import type WebGpuContext from "./WebGpuContext";

export default class Renderer {
  private readonly gpuContext: WebGpuContext;
  
  public readonly camera: Camera = new Camera();
  private readonly cameraBuffer: GPUBuffer;

  public mode: "surface" | "debug" = "surface";

  private readonly surfacePipeline: GPURenderPipeline;
  private readonly debugPipeline: GPURenderPipeline;  
  private readonly compositePipeline: GPURenderPipeline;

  private readonly cameraBindGroup: GPUBindGroup;
  private readonly bodiesBindGroup: GPUBindGroup;
  private readonly compositeBindGroup: GPUBindGroup;

  private readonly sphereVertexBuffer: GPUBuffer;
  private readonly sphereIndexBuffer: GPUBuffer;
  private readonly indirectBuffer: GPUBuffer;

  private readonly depthTexture: GPUTexture;

  private readonly hdrView: GPUTextureView;

  constructor(
    gpuContext: WebGpuContext, 
    bodiesBuffer: GPUBuffer, 
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
        0,
        0,
        0,
      ])
    );

    this.depthTexture = device.createTexture({
      size: [canvas.width, canvas.height],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT
    });

    const hdrFormat: GPUTextureFormat = "rgba16float";
    this.hdrView = device.createTexture({
      label: "HDR scene",
      size: [canvas.width, canvas.height],
      format: hdrFormat,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    }).createView();

    const cameraLayout = device.createBindGroupLayout({
      label: "camera bind group layout",
      entries: [{
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: "uniform" }
      }]
    });

    const bodiesLayout = device.createBindGroupLayout({
      label: "bodies bind group layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "read-only-storage" }
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "read-only-storage" }
        }
      ]
    });

    const pipelineLayout = device.createPipelineLayout({
      label: "render pipeline layout",
      bindGroupLayouts: [
        cameraLayout, 
        bodiesLayout
      ]
    });

    const createPipeline = (
      label: string,
      code: string,
      colorFormat: GPUTextureFormat
    ): GPURenderPipeline => {
      const module = device.createShaderModule({ 
        label: `${label} module`, 
        code 
      });

      return device.createRenderPipeline({
        label: `${label} pipeline`,
        layout: pipelineLayout,
        depthStencil: {
          depthWriteEnabled: true,
          depthCompare: "less",
          format: "depth24plus"
        },
        vertex: {
          module,
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
          module,
          entryPoint: "fragMain",
          targets: [{
            format: colorFormat
          }]
        }
      });
    };

    this.surfacePipeline = createPipeline(
      "surface pipeline", bodiesWgsl, hdrFormat
    );
    this.debugPipeline = createPipeline(
      "debug pipeline", bodiesDebugWgsl, this.gpuContext.format
    ); 

    const compositeModule = device.createShaderModule({
      label: "HDR composite shader",
      code: compositeWgsl
    });
    this.compositePipeline = device.createRenderPipeline({
      label: "HDR composite pipeline",
      layout: "auto",
      vertex: { module: compositeModule, entryPoint: "vertMain" },
      fragment: {
        module: compositeModule,
        entryPoint: "fragMain",
        targets: [{ format: this.gpuContext.format }]
      }
    });
    
    this.compositeBindGroup = device.createBindGroup({
      layout: this.compositePipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: this.hdrView }]
    });

    this.cameraBindGroup = device.createBindGroup({
      label: "camera bind group",
      layout: cameraLayout,
      entries: [
        { binding: 0, resource: { buffer: this.cameraBuffer } }
      ]
    });

    this.bodiesBindGroup = device.createBindGroup({
      label: "bodies bind group",
      layout: bodiesLayout,
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

  public encode(
    encoder: GPUCommandEncoder,
    simulationParamsBuffer: GPUBuffer,
  ): void {
    encoder.copyBufferToBuffer(
      simulationParamsBuffer,
      12, // bodyCount
      this.indirectBuffer,
      4,
      4,
    );

    const debug = this.mode === "debug";
    const canvasView = this.gpuContext.context.getCurrentTexture().createView();

    const scenePass = encoder.beginRenderPass({
      colorAttachments: [{
        view: debug ? canvasView : this.hdrView,
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

    scenePass.setPipeline(debug ? this.debugPipeline : this.surfacePipeline);
    scenePass.setBindGroup(0, this.cameraBindGroup);
    scenePass.setBindGroup(1, this.bodiesBindGroup);
    scenePass.setVertexBuffer(0, this.sphereVertexBuffer);
    scenePass.setIndexBuffer(this.sphereIndexBuffer, "uint16");
    scenePass.drawIndexedIndirect(this.indirectBuffer, 0);
    scenePass.end();

    if (debug) return;

    const compositePass = encoder.beginRenderPass({
      colorAttachments: [{
        view: canvasView,
        loadOp: "clear",
        storeOp: "store"
      }]
    });
    compositePass.setPipeline(this.compositePipeline);
    compositePass.setBindGroup(0, this.compositeBindGroup);
    compositePass.draw(3);
    compositePass.end();
  }
}