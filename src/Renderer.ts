import { BODY_STRIDE } from "./Body";
import Camera from "./Camera";
import { bodiesDebugWgsl, bodiesWgsl, collectStarLightsWgsl, postProcessWgsl } from "./shaders";
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

  private readonly bloomPasses: readonly {
    view: GPUTextureView;
    pipeline: GPURenderPipeline;
    bindGroup: GPUBindGroup;
  }[];

  private readonly collectStarLightsPipeline: GPUComputePipeline;

  private readonly cameraBindGroup: GPUBindGroup;
  private readonly bodiesBindGroup: GPUBindGroup;
  private readonly compositeBindGroup: GPUBindGroup;
  private readonly collectStarLightsBindGroup: GPUBindGroup;

  private readonly sphereVertexBuffer: GPUBuffer;
  private readonly sphereIndexBuffer: GPUBuffer;
  private readonly indirectBuffer: GPUBuffer;
  private readonly simulationParamsBuffer: GPUBuffer;
  private readonly simulationDispatchArgsBuffer: GPUBuffer;
  private readonly starLightsBuffer: GPUBuffer;

  private readonly depthTexture: GPUTexture;

  private readonly hdrView: GPUTextureView;

  constructor(
    gpuContext: WebGpuContext, 
    bodiesBuffer: GPUBuffer, 
    collisionCandidatesBuffer: GPUBuffer,
    simulationParamsBuffer: GPUBuffer,
    simulationDispatchArgsBuffer: GPUBuffer
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

    this.simulationParamsBuffer = simulationParamsBuffer;
    this.simulationDispatchArgsBuffer = simulationDispatchArgsBuffer;

    const bodyCapacity = bodiesBuffer.size / BODY_STRIDE;
    this.starLightsBuffer = device.createBuffer({
      label: "star lights",
      size: 16 + 32 * bodyCapacity,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    this.collectStarLightsPipeline = device.createComputePipeline({
      label: "collect star lights pipeline",
      layout: "auto",
      compute: {
        module: device.createShaderModule({ code: collectStarLightsWgsl }),
        entryPoint: "collectStarLights"
      }
    });

    this.collectStarLightsBindGroup = device.createBindGroup({
      layout: this.collectStarLightsPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: bodiesBuffer } },
        { binding: 1, resource: { buffer: simulationParamsBuffer } },
        { binding: 2, resource: { buffer: this.starLightsBuffer } }
      ]
    });

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
        },
        {
          binding: 2,
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

    const bloomSize = [Math.ceil(canvas.width / 2), Math.ceil(canvas.height / 2)];
    const bloomTextureDescriptor: GPUTextureDescriptor = {
      size: bloomSize,
      format: hdrFormat,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    };
    const horizontalView = device.createTexture(bloomTextureDescriptor).createView();
    const bloomView = device.createTexture(bloomTextureDescriptor).createView();

    const sampler = device.createSampler({
      minFilter: "linear",
      magFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge"
    });

    const postProcessModule = device.createShaderModule({
      label: "post process shader",
      code: postProcessWgsl
    });

    const createBloomPass = (
      entryPoint: string,
      source: GPUTextureView,
      view: GPUTextureView
    ) => {
      const pipeline = device.createRenderPipeline({
        label: entryPoint,
        layout: "auto",
        vertex: { module: postProcessModule, entryPoint: "vertMain" },
        fragment: {
          module: postProcessModule,
          entryPoint,
          targets: [{ format: hdrFormat }]
        }
      });
      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: source },
          { binding: 1, resource: sampler }
        ]
      });
      return { view, pipeline, bindGroup };
    };

    this.bloomPasses = [
      createBloomPass("bloomHorizontal", this.hdrView, horizontalView),
      createBloomPass("bloomVertical", horizontalView, bloomView)
    ];

    this.compositePipeline = device.createRenderPipeline({
      label: "HDR composite pipeline",
      layout: "auto",
      vertex: { module: postProcessModule, entryPoint: "vertMain" },
      fragment: {
        module: postProcessModule,
        entryPoint: "fragMain",
        targets: [{ format: this.gpuContext.format }]
      }
    });
    this.compositeBindGroup = device.createBindGroup({
      layout: this.compositePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.hdrView },
        { binding: 1, resource: sampler },
        { binding: 2, resource: bloomView }
      ]
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
        { binding: 1, resource: { buffer: collisionCandidatesBuffer } },
        { binding: 2, resource: { buffer: this.starLightsBuffer } }
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
    encoder.copyBufferToBuffer(
      this.simulationParamsBuffer,
      12, // bodyCount
      this.indirectBuffer,
      4,
      4,
    );

    const debug = this.mode === "debug";

    if (!debug) {
      encoder.clearBuffer(this.starLightsBuffer, 0, Uint32Array.BYTES_PER_ELEMENT);

      const collectPass = encoder.beginComputePass({ label: "collect star lights" });
      collectPass.setPipeline(this.collectStarLightsPipeline);
      collectPass.setBindGroup(0, this.collectStarLightsBindGroup);
      collectPass.dispatchWorkgroupsIndirect(this.simulationDispatchArgsBuffer, 0);
      collectPass.end();
    }

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

    for (const { view, pipeline, bindGroup } of this.bloomPasses) {
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view,
          loadOp: "clear",
          storeOp: "store"
        }]
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3);
      pass.end();
    }

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