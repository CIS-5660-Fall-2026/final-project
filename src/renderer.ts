import type {CameraState} from './camera';
import type {GpuContext} from './gpu/context';
import {createShaderModule} from './gpu/shader';
import blitSource from './shaders/blit.wgsl?raw';
import commonSource from './shaders/common.wgsl?raw';
import noiseSource from './shaders/noise.wgsl?raw';
import rocksSource from './shaders/rocks.wgsl?raw';
import sceneSource from './shaders/scene.wgsl?raw';
import terrainSource from './shaders/terrain.wgsl?raw';

const WORKGROUP_SIZE = 8;
const HDR_FORMAT: GPUTextureFormat = 'rgba16float';

/** Float offsets into FrameUniforms (common.wgsl); each vec3 is padded to 16 bytes. */
const FRAME_UNIFORM_LAYOUT = {
  resolution: 0,
  time: 2,
  tanHalfFovY: 3,
  cameraPosition: 4,
  cameraForward: 8,
  cameraRight: 12,
  cameraUp: 16,
  floatCount: 20,
} as const;

export interface FrameInput {
  readonly timeSeconds: number;
  readonly tanHalfFovY: number;
  readonly camera: CameraState;
}

interface RenderTarget {
  readonly texture: GPUTexture;
  readonly width: number;
  readonly height: number;
  readonly sceneBindGroup: GPUBindGroup;
  readonly blitBindGroup: GPUBindGroup;
}

/**
 * Ray-marches the scene into an HDR texture at a reduced resolution, then
 * upscales and tone-maps it to the canvas.
 */
export class Renderer {
  private readonly device: GPUDevice;
  private readonly context: GPUCanvasContext;
  private readonly uniformBuffer: GPUBuffer;
  private readonly uniformData = new Float32Array(
    FRAME_UNIFORM_LAYOUT.floatCount,
  );
  private readonly sceneLayout: GPUBindGroupLayout;
  private readonly blitLayout: GPUBindGroupLayout;
  private readonly scenePipeline: GPUComputePipeline;
  private readonly blitPipeline: GPURenderPipeline;
  private readonly sampler: GPUSampler;
  private target: RenderTarget | null = null;

  constructor(gpu: GpuContext) {
    this.device = gpu.device;
    this.context = gpu.context;

    this.uniformBuffer = this.device.createBuffer({
      label: 'frame uniforms',
      size: this.uniformData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.sceneLayout = this.device.createBindGroupLayout({
      label: 'scene',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: {access: 'write-only', format: HDR_FORMAT},
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: {type: 'uniform'},
        },
      ],
    });
    this.blitLayout = this.device.createBindGroupLayout({
      label: 'blit',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {sampleType: 'float'},
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: {type: 'filtering'},
        },
      ],
    });

    this.scenePipeline = this.device.createComputePipeline({
      label: 'scene',
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [this.sceneLayout],
      }),
      compute: {
        module: createShaderModule(this.device, 'scene', [
          commonSource,
          noiseSource,
          terrainSource,
          rocksSource,
          sceneSource,
        ]),
        entryPoint: 'renderScene',
        constants: {WORKGROUP_SIZE},
      },
    });

    const blitModule = createShaderModule(this.device, 'blit', [blitSource]);
    this.blitPipeline = this.device.createRenderPipeline({
      label: 'blit',
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [this.blitLayout],
      }),
      vertex: {module: blitModule, entryPoint: 'fullscreenVertex'},
      fragment: {
        module: blitModule,
        entryPoint: 'tonemapFragment',
        targets: [{format: gpu.format}],
      },
    });

    this.sampler = this.device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
    });
  }

  /** Render resolution in pixels, or [0, 0] before the first resize. */
  get renderSize(): readonly [number, number] {
    return this.target ? [this.target.width, this.target.height] : [0, 0];
  }

  /** Recreates the HDR target for a new output size or render scale. */
  resize(outputWidth: number, outputHeight: number, renderScale: number): void {
    const width = Math.max(1, Math.floor(outputWidth * renderScale));
    const height = Math.max(1, Math.floor(outputHeight * renderScale));
    if (this.target?.width === width && this.target.height === height) return;

    this.target?.texture.destroy();
    const texture = this.device.createTexture({
      label: 'scene HDR',
      size: [width, height],
      format: HDR_FORMAT,
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });
    const view = texture.createView();
    this.target = {
      texture,
      width,
      height,
      sceneBindGroup: this.device.createBindGroup({
        layout: this.sceneLayout,
        entries: [
          {binding: 0, resource: view},
          {binding: 1, resource: {buffer: this.uniformBuffer}},
        ],
      }),
      blitBindGroup: this.device.createBindGroup({
        layout: this.blitLayout,
        entries: [
          {binding: 0, resource: view},
          {binding: 1, resource: this.sampler},
        ],
      }),
    };
  }

  render(frame: FrameInput): void {
    const target = this.target;
    if (!target) return;

    this.writeUniforms(frame, target);
    const encoder = this.device.createCommandEncoder({label: 'frame'});

    const scenePass = encoder.beginComputePass({label: 'scene'});
    scenePass.setPipeline(this.scenePipeline);
    scenePass.setBindGroup(0, target.sceneBindGroup);
    scenePass.dispatchWorkgroups(
      Math.ceil(target.width / WORKGROUP_SIZE),
      Math.ceil(target.height / WORKGROUP_SIZE),
    );
    scenePass.end();

    const blitPass = encoder.beginRenderPass({
      label: 'blit',
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: [0, 0, 0, 1],
        },
      ],
    });
    blitPass.setPipeline(this.blitPipeline);
    blitPass.setBindGroup(0, target.blitBindGroup);
    blitPass.draw(3);
    blitPass.end();

    this.device.queue.submit([encoder.finish()]);
  }

  private writeUniforms(frame: FrameInput, target: RenderTarget): void {
    const data = this.uniformData;
    const layout = FRAME_UNIFORM_LAYOUT;
    data.set([target.width, target.height], layout.resolution);
    data[layout.time] = frame.timeSeconds;
    data[layout.tanHalfFovY] = frame.tanHalfFovY;
    data.set(frame.camera.position, layout.cameraPosition);
    data.set(frame.camera.forward, layout.cameraForward);
    data.set(frame.camera.right, layout.cameraRight);
    data.set(frame.camera.up, layout.cameraUp);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, data);
  }
}
