import { BODY_STRIDE, packBodies } from "./Body";
import type Scene from "./Scene";
import { SimulationUniforms } from "./Scene";
import { absorptionWgsl, collisionWgsl, gravityWgsl } from "./shaders";

export default class Simulation {
  private readonly device: GPUDevice;
  private workgroupCount = 0;
  private readonly uniforms = new SimulationUniforms();
  private bodyCount = 0;

  private readonly bodiesA: GPUBuffer;
  private readonly bodiesB: GPUBuffer;
  private readonly paramsBuffer: GPUBuffer;
  private readonly collisionCandidates: GPUBuffer;

  private readonly driftPipeline: GPUComputePipeline;
  private readonly gravityPipeline: GPUComputePipeline;
  private readonly collisionPipeline: GPUComputePipeline;
  private readonly absorptionPipeline: GPUComputePipeline;

  private readonly driftBindGroup: GPUBindGroup;
  private readonly gravityBindGroup: GPUBindGroup;
  private readonly collisionBindGroup: GPUBindGroup;
  private readonly absorptionBindGroup: GPUBindGroup;

  constructor(device: GPUDevice, scene: Scene) {
    this.device = device;

    const config = scene.simulationConfig;
    
    this.bodiesA = device.createBuffer({
      label: "simulation bodies A",
      size: config.capacity * BODY_STRIDE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.bodiesB = device.createBuffer({
      label: "simulation bodies B",
      size: config.capacity * BODY_STRIDE,
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_DST |
        GPUBufferUsage.COPY_SRC,
    });

    this.paramsBuffer = device.createBuffer({
      label: "simulation params",
      size: 48,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.collisionCandidates = device.createBuffer({
      label: "collision candidates",
      size: config.capacity * Uint32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.uniforms.fixedDt = config.fixedDt;
    this.uniforms.gravitationalConstant = config.gravitationalConstant;
    this.uniforms.softeningLength = config.softeningLength;

    if (scene.boundary) {
      this.uniforms.boundary = scene.boundary;
    }

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

    this.collisionPipeline = device.createComputePipeline({
      label: "collision detection pipeline",
      layout: "auto",
      compute: {
        module: device.createShaderModule({
          label: "collision detection shader",
          code: collisionWgsl,
        }),
        entryPoint: "detectCollisions",
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

    this.collisionBindGroup = device.createBindGroup({
      label: "collision detection bind group",
      layout: this.collisionPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.bodiesA } },
        { binding: 1, resource: { buffer: this.collisionCandidates } },
        { binding: 2, resource: { buffer: this.paramsBuffer } },
      ],
    });

    this.absorptionPipeline = device.createComputePipeline({
      label: "absorption pipeline",
      layout: "auto",
      compute: {
        module: device.createShaderModule({
          label: "absorption shader",
          code: absorptionWgsl,
        }),
        entryPoint: "applyAbsorption",
      },
    });

    this.absorptionBindGroup = device.createBindGroup({
      label: "absorption bind group",
      layout: this.absorptionPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.bodiesA } },
        { binding: 1, resource: { buffer: this.bodiesB } },
        { binding: 2, resource: { buffer: this.collisionCandidates } },
        { binding: 3, resource: { buffer: this.paramsBuffer } },
      ],
    });

    this.reset(scene);
  }

  public get bodiesBuffer(): GPUBuffer {
    return this.bodiesA;
  }
  
  public get collisionCandidatesBuffer(): GPUBuffer {
    return this.collisionCandidates;
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

    const collisionPass = encoder.beginComputePass({
      label: "collision detection pass",
    });

    collisionPass.setPipeline(this.collisionPipeline);
    collisionPass.setBindGroup(0, this.collisionBindGroup);
    collisionPass.dispatchWorkgroups(this.workgroupCount);
    collisionPass.end();

    const absorptionPass = encoder.beginComputePass({
      label: "absorption pass",
    });

    absorptionPass.setPipeline(this.absorptionPipeline);
    absorptionPass.setBindGroup(0, this.absorptionBindGroup);
    absorptionPass.dispatchWorkgroups(this.workgroupCount);
    absorptionPass.end();

    encoder.copyBufferToBuffer(
      this.bodiesB,
      0,
      this.bodiesA,
      0,
      this.bodyCount * BODY_STRIDE,
    );

    absorptionPass.end();
  }

  public reset(scene: Scene): void {
    const bodyCount = scene.initialBodies.length;
    this.bodyCount = bodyCount;
    
    const capacity = scene.simulationConfig.capacity;
    const workgroupSize = 64;
    this.workgroupCount = Math.ceil(bodyCount / workgroupSize);
    this.uniforms.bodyCount = bodyCount;

    const data = packBodies(scene.initialBodies, capacity);
    this.device.queue.writeBuffer(this.bodiesA, 0, data);
    this.device.queue.writeBuffer(this.bodiesB, 0, data);
    this.device.queue.writeBuffer(
      this.paramsBuffer, 0, this.uniforms.buffer,
    );

    const candidates = new Uint32Array(capacity);

    for (let i = 0; i < candidates.length; i++) {
      candidates[i] = i;
    }

    this.device.queue.writeBuffer(
      this.collisionCandidates, 0, candidates,
    );
  }

  public setPhysics(
    gravitationalConstant: number,
    softeningLength: number,
  ): void {
    this.uniforms.gravitationalConstant = gravitationalConstant;
    this.uniforms.softeningLength = softeningLength;

    this.device.queue.writeBuffer(
      this.paramsBuffer, 0, this.uniforms.buffer,
    );
  }

  public destroy(): void {
    this.bodiesA.destroy();
    this.bodiesB.destroy();
    this.paramsBuffer.destroy();
    this.collisionCandidates.destroy();
  }
}