import { BODY_STRIDE } from "./Body";
import Camera from "./Camera";
import { bodiesDebugWgsl, bodiesWgsl, collectStarLightsWgsl, postProcessWgsl } from "./shaders";
import { createSphereMesh } from "./Sphere";
import type WebGpuContext from "./WebGpuContext";

const HDR_FORMAT: GPUTextureFormat = "rgba16float";

type BloomTarget = {
  texture: GPUTexture;
  view: GPUTextureView;
  bindGroup: GPUBindGroup;
};

type RenderTargets = {
  depthTexture: GPUTexture;
  depthView: GPUTextureView;
  hdrTexture: GPUTexture;
  hdrView: GPUTextureView;
  bloomHorizontal: BloomTarget;
  bloomVertical: BloomTarget;
  compositeBindGroup: GPUBindGroup;
};

export default class Renderer {
  private readonly gpuContext: WebGpuContext;
  
  public readonly camera: Camera = new Camera();
  private readonly cameraBuffer: GPUBuffer;

  public mode: "surface" | "debug" = "surface";
  public bloomStrength = 0.30;
  public exposure = 1.0;
  public bloomThreshold = 0.25;
  public starLightStrength = 6.0;

  private readonly surfacePipeline: GPURenderPipeline;
  private readonly debugPipeline: GPURenderPipeline;  
  private readonly compositePipeline: GPURenderPipeline;
  private readonly bloomHorizontalPipeline: GPURenderPipeline;
  private readonly bloomVerticalPipeline: GPURenderPipeline;
  private readonly sampler: GPUSampler;

  private readonly collectStarLightsPipeline: GPUComputePipeline;

  private readonly cameraBindGroup: GPUBindGroup;
  private readonly bodiesBindGroup: GPUBindGroup;
  private readonly collectStarLightsBindGroup: GPUBindGroup;

  private readonly sphereVertexBuffer: GPUBuffer;
  private readonly sphereIndexBuffer: GPUBuffer;
  private readonly indirectBuffer: GPUBuffer;
  private readonly simulationParamsBuffer: GPUBuffer;
  private readonly simulationDispatchArgsBuffer: GPUBuffer;
  private readonly starLightsBuffer: GPUBuffer;
  private readonly renderParamsBuffer: GPUBuffer;

  private renderTargets: RenderTargets;

  constructor(
    gpuContext: WebGpuContext, 
    bodiesBuffer: GPUBuffer, 
    collisionCandidatesBuffer: GPUBuffer,
    simulationParamsBuffer: GPUBuffer,
    simulationDispatchArgsBuffer: GPUBuffer
  ) {
    this.gpuContext = gpuContext;
    
    const device = this.gpuContext.device;

    this.cameraBuffer = device.createBuffer({
      label: "camera buffer",
      size: this.camera.uniforms.buffer.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.renderParamsBuffer = device.createBuffer({
      label: "render params",
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this.updateRenderParams();

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
        { binding: 2, resource: { buffer: this.starLightsBuffer } },
        { binding: 3, resource: { buffer: this.renderParamsBuffer } }
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
        },
        {
          binding: 3,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" }
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
      "surface pipeline", bodiesWgsl, HDR_FORMAT
    );
    this.debugPipeline = createPipeline(
      "debug pipeline", bodiesDebugWgsl, this.gpuContext.format
    ); 

    this.sampler = device.createSampler({
      minFilter: "linear",
      magFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge"
    });

    const postProcessModule = device.createShaderModule({
      label: "post process shader",
      code: postProcessWgsl
    });

    const createBloomPipeline = (entryPoint: string): GPURenderPipeline => {
      return device.createRenderPipeline({
        label: entryPoint,
        layout: "auto",
        vertex: { module: postProcessModule, entryPoint: "vertMain" },
        fragment: {
          module: postProcessModule,
          entryPoint,
          targets: [{ format: HDR_FORMAT }]
        }
      });
    };

    this.bloomHorizontalPipeline = createBloomPipeline("bloomHorizontal");
    this.bloomVerticalPipeline = createBloomPipeline("bloomVertical");

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
        { binding: 2, resource: { buffer: this.starLightsBuffer } },
        { binding: 3, resource: { buffer: simulationParamsBuffer } }
      ]
    });

    this.renderTargets = this.resize();
    this.camera.updateProjection();
  }

  private resize(targets?: RenderTargets): RenderTargets {
    const device = this.gpuContext.device;
    const canvas = this.gpuContext.context.canvas as HTMLCanvasElement;
    const pixelRatio = window.devicePixelRatio;
    const maxSize = device.limits.maxTextureDimension2D;
    const width = Math.max(1, Math.min(maxSize, Math.round(canvas.clientWidth * pixelRatio)));
    const height = Math.max(1, Math.min(maxSize, Math.round(canvas.clientHeight * pixelRatio)));

    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    if (targets?.depthTexture.width === width && targets.depthTexture.height === height) return targets;

    if (targets) {
      targets.depthTexture.destroy();
      targets.hdrTexture.destroy();
      targets.bloomHorizontal.texture.destroy();
      targets.bloomVertical.texture.destroy();
    }

    this.camera.aspect = width / height;

    const depthTexture = device.createTexture({
      size: [width, height],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT
    });
    const depthView = depthTexture.createView();

    const hdrTexture = device.createTexture({
      label: "HDR scene",
      size: [width, height],
      format: HDR_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    });
    const hdrView = hdrTexture.createView();

    const bloomTextureDescriptor: GPUTextureDescriptor = {
      size: [Math.ceil(width / 2), Math.ceil(height / 2)],
      format: HDR_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    };
    const createBloomTarget = (
      pipeline: GPURenderPipeline,
      source: GPUTextureView
    ): BloomTarget => {
      const texture = device.createTexture(bloomTextureDescriptor);
      const view = texture.createView();
      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: source },
          { binding: 1, resource: this.sampler },
          { binding: 3, resource: { buffer: this.renderParamsBuffer } }
        ]
      });
      return { texture, view, bindGroup };
    };

    const bloomHorizontal = createBloomTarget(this.bloomHorizontalPipeline, hdrView);
    const bloomVertical = createBloomTarget(this.bloomVerticalPipeline, bloomHorizontal.view);

    const compositeBindGroup = device.createBindGroup({
      layout: this.compositePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: hdrView },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: bloomVertical.view },
        { binding: 3, resource: { buffer: this.renderParamsBuffer } }
      ]
    });

    return {
      depthTexture,
      depthView,
      hdrTexture,
      hdrView,
      bloomHorizontal,
      bloomVertical,
      compositeBindGroup
    };
  }

  public updateRenderParams(): void {
    this.gpuContext.device.queue.writeBuffer(
      this.renderParamsBuffer,
      0,
      new Float32Array([
        this.bloomStrength,
        this.exposure,
        this.bloomThreshold,
        this.starLightStrength
      ])
    );
  }

  public onFrame = (): void => {
    const device = this.gpuContext.device;

    this.renderTargets = this.resize(this.renderTargets);
    this.camera.updateViewProjection();
    this.camera.onFrame();
    device.queue.writeBuffer(this.cameraBuffer, 0, this.camera.uniforms.buffer);
  }

  private encodeBloomPass(
    encoder: GPUCommandEncoder,
    pipeline: GPURenderPipeline,
    { view, bindGroup }: BloomTarget
  ): void {
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
    const { depthView, hdrView, bloomHorizontal, bloomVertical, compositeBindGroup } = this.renderTargets;

    const scenePass = encoder.beginRenderPass({
      colorAttachments: [{
        view: debug ? canvasView : hdrView,
        loadOp: "clear",
        storeOp: "store"
      }],
      depthStencilAttachment: {
        view: depthView,
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

    this.encodeBloomPass(encoder, this.bloomHorizontalPipeline, bloomHorizontal);
    this.encodeBloomPass(encoder, this.bloomVerticalPipeline, bloomVertical);

    const compositePass = encoder.beginRenderPass({
      colorAttachments: [{
        view: canvasView,
        loadOp: "clear",
        storeOp: "store"
      }]
    });
    compositePass.setPipeline(this.compositePipeline);
    compositePass.setBindGroup(0, compositeBindGroup);
    compositePass.draw(3);
    compositePass.end();
  }
}