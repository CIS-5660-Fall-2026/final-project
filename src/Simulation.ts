import { BODY_STRIDE, packBodies } from "./Body";
import type Scene from "./Scene";
import { SimulationUniforms } from "./Scene";
import { gravityWgsl } from "./shaders";

export default class Simulation {
  private readonly device: GPUDevice;
  private readonly scene: Scene;
  private readonly workgroupCount: number;

  private readonly bodiesA: GPUBuffer;
  private readonly bodiesB: GPUBuffer;
  private readonly paramsBuffer: GPUBuffer;

  private readonly driftPipeline: GPUComputePipeline;
  private readonly gravityPipeline: GPUComputePipeline;

  private readonly driftBindGroup: GPUBindGroup;
  private readonly gravityBindGroup: GPUBindGroup;

  constructor(device: GPUDevice, scene: Scene) {
    this.device = device;
    this.scene = scene;

    const bodyCount = this.scene.initialBodies.length;
    const config = this.scene.simulationConfig;
    
    const workgroupSize = 64;
    this.workgroupCount = Math.ceil(bodyCount / workgroupSize);
    
    this.bodiesA = device.createBuffer({
      label: "simulation bodies A",
      size: config.capacity * BODY_STRIDE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.bodiesB = device.createBuffer({
      label: "simulation bodies B",
      size: config.capacity * BODY_STRIDE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.paramsBuffer = device.createBuffer({
      label: "simulation params",
      size: 48,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const uniforms = new SimulationUniforms();
    uniforms.fixedDt = config.fixedDt;
    uniforms.gravitationalConstant = config.gravitationalConstant;
    uniforms.softeningLength = config.softeningLength;
    uniforms.bodyCount = bodyCount;
    
    if (scene.boundary) {
      uniforms.boundary = scene.boundary;
    }

    device.queue.writeBuffer(this.paramsBuffer, 0, uniforms.buffer);

    const module = device.createShaderModule({
      label: "simulation shader",
      code: gravityWgsl
    });

    this.driftPipeline = device.createComputePipeline({
      label: "drift half pipeline",
      layout: "auto",
      compute: {
        module,
        entryPoint: "driftHalf",
      },
    });

    this.gravityPipeline = device.createComputePipeline({
      label: "naive gravity pipeline",
      layout: "auto",
      compute: {
        module,
        entryPoint: "gravityNaive",
      },
    });

    this.driftBindGroup = device.createBindGroup({
      label: "drift half bind group",
      layout: this.driftPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.bodiesA } },
        { binding: 1, resource: { buffer: this.bodiesB } },
        { binding: 2, resource: { buffer: this.paramsBuffer } },
      ],
    });

    this.gravityBindGroup = device.createBindGroup({
      label: "naive gravity bind group",
      layout: this.gravityPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.bodiesB } },
        { binding: 1, resource: { buffer: this.bodiesA } },
        { binding: 2, resource: { buffer: this.paramsBuffer } },
      ],
    });

    this.reset();
  }

  public get bodiesBuffer(): GPUBuffer {
    return this.bodiesA;
  }

  public encodeStep(encoder: GPUCommandEncoder): void {
    if (this.workgroupCount === 0) {
      return;
    }

    const driftPass = encoder.beginComputePass({
      label: "drift half pass",
    });

    driftPass.setPipeline(this.driftPipeline);
    driftPass.setBindGroup(0, this.driftBindGroup);
    driftPass.dispatchWorkgroups(this.workgroupCount);
    driftPass.end();

    const gravityPass = encoder.beginComputePass({
      label: "naive gravity pass",
    });

    gravityPass.setPipeline(this.gravityPipeline);
    gravityPass.setBindGroup(0, this.gravityBindGroup);
    gravityPass.dispatchWorkgroups(this.workgroupCount);
    gravityPass.end();
  }

  public reset(): void {
    const data = packBodies(
      this.scene.initialBodies,
      this.scene.simulationConfig.capacity,
    );

    this.device.queue.writeBuffer(this.bodiesA, 0, data);
    this.device.queue.writeBuffer(this.bodiesB, 0, data);
  }

  public destroy(): void {
    this.bodiesA.destroy();
    this.bodiesB.destroy();
    this.paramsBuffer.destroy();
  }
}