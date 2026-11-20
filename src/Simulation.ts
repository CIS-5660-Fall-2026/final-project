import { BODY_STRIDE, packBodies } from "./Body";
import type Scene from "./Scene";
import { SimulationUniforms } from "./Scene";
import { finishStepWgsl } from "./shaders";
import AbsorptionStage from "./simulation/AbsorptionStage";
import CollisionStage from "./simulation/CollisionStage";
import CompactionStage from "./simulation/CompactionStage";
import ExplosionStage from "./simulation/ExplosionStage";
import GravityStage from "./simulation/GravityStage";
import { BASELINE_ALGORITHMS } from "./simulation/types";
import type { SimulationAlgorithms, SimulationBuffers } from "./simulation/types";

export default class Simulation {
  private readonly device: GPUDevice;
  private readonly uniforms = new SimulationUniforms();
  private readonly buffers: SimulationBuffers;
  private readonly algorithms: SimulationAlgorithms = { ...BASELINE_ALGORITHMS };

  private readonly gravity: GravityStage;
  private readonly collision: CollisionStage;
  private readonly absorption: AbsorptionStage;
  private readonly compaction: CompactionStage;
  private readonly explosion: ExplosionStage;
  private readonly finishStepPipeline: GPUComputePipeline;
  private readonly finishStepBindGroup: GPUBindGroup;

  constructor(device: GPUDevice, scene: Scene) {
    this.device = device;
    const capacity = scene.simulationConfig.capacity;

    this.buffers = {
      bodiesA: device.createBuffer({
        label: "simulation bodies A",
        size: capacity * BODY_STRIDE,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      }),
      bodiesB: device.createBuffer({
        label: "simulation bodies B",
        size: capacity * BODY_STRIDE,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      }),
      params: device.createBuffer({
        label: "simulation params",
        size: this.uniforms.buffer.byteLength,
        usage:
          GPUBufferUsage.UNIFORM |
          GPUBufferUsage.STORAGE |
          GPUBufferUsage.COPY_DST |
          GPUBufferUsage.COPY_SRC,
      }),
      dispatchArgs: device.createBuffer({
        label: "simulation dispatch args",
        size: 12,
        usage:
          GPUBufferUsage.STORAGE |
          GPUBufferUsage.INDIRECT |
          GPUBufferUsage.COPY_DST,
      }),
      collisionCandidates: device.createBuffer({
        label: "collision candidates",
        size: capacity * Uint32Array.BYTES_PER_ELEMENT,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      }),
    };

    this.gravity = new GravityStage(device, this.buffers);
    this.collision = new CollisionStage(device, this.buffers);
    this.absorption = new AbsorptionStage(device, this.buffers);
    this.compaction = new CompactionStage(device, this.buffers);
    this.explosion = new ExplosionStage(device, this.buffers);

    this.finishStepPipeline = device.createComputePipeline({
      label: "finish step pipeline",
      layout: "auto",
      compute: {
        module: device.createShaderModule({
          label: "finish step shader",
          code: finishStepWgsl,
        }),
        entryPoint: "finishStep",
      },
    });
    this.finishStepBindGroup = device.createBindGroup({
      label: "finish step bind group",
      layout: this.finishStepPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.buffers.params } },
        { binding: 1, resource: { buffer: this.buffers.dispatchArgs } },
      ],
    });

    this.reset(scene);
  }

  public get bodiesBuffer(): GPUBuffer {
    return this.buffers.bodiesA;
  }

  public get collisionCandidatesBuffer(): GPUBuffer {
    return this.buffers.collisionCandidates;
  }

  public get simulationParamsBuffer(): GPUBuffer {
    return this.buffers.params;
  }

  public get simulationDispatchArgsBuffer(): GPUBuffer {
    return this.buffers.dispatchArgs;
  }

  public setAlgorithms(algorithms: Readonly<SimulationAlgorithms>): void {
    Object.assign(this.algorithms, algorithms);
  }

  public encodeStep(encoder: GPUCommandEncoder): void {
    this.gravity.encodeDrift(encoder);
    this.gravity.encode(encoder, this.algorithms.gravity);
    this.collision.encode(encoder, this.algorithms.collision);
    this.absorption.encode(encoder, this.algorithms.absorption);
    this.compaction.encode(encoder, this.algorithms.compaction);
    this.explosion.encode(encoder, this.algorithms.explosion);
    this.encodeFinishStep(encoder);
  }

  private encodeFinishStep(encoder: GPUCommandEncoder): void {
    const pass = encoder.beginComputePass({ label: "finish step pass" });
    pass.setPipeline(this.finishStepPipeline);
    pass.setBindGroup(0, this.finishStepBindGroup);
    pass.dispatchWorkgroups(1);
    pass.end();
  }

  public reset(scene: Scene): void {
    const bodyCount = scene.initialBodies.length;
    
    const config = scene.simulationConfig;
    const capacity = config.capacity;
    this.uniforms.fixedDt = config.fixedDt;
    this.uniforms.bodyCount = bodyCount;
    this.uniforms.boundary = scene.boundary;
    this.uniforms.gravitationalConstant = config.gravitationalConstant;
    this.uniforms.softeningLength = config.softeningLength;
    this.uniforms.linearDragRate = config.linearDragRate;
    this.uniforms.starMass = config.starMass;
    this.uniforms.explosionMass = config.explosionMass;

    const data = packBodies(scene.initialBodies, capacity);
    this.device.queue.writeBuffer(this.buffers.bodiesA, 0, data);
    this.device.queue.writeBuffer(this.buffers.bodiesB, 0, data);
    this.device.queue.writeBuffer(
      this.buffers.params, 0, this.uniforms.buffer,
    );

    this.device.queue.writeBuffer(
      this.buffers.dispatchArgs,
      0,
      new Uint32Array([Math.ceil(bodyCount / 64), 1, 1]),
    );

    const candidates = new Uint32Array(capacity);

    for (let i = 0; i < candidates.length; i++) {
      candidates[i] = i;
    }

    this.device.queue.writeBuffer(
      this.buffers.collisionCandidates, 0, candidates,
    );
  }

  public setPhysics(
    gravitationalConstant: number,
    softeningLength: number,
    linearDragRate: number,
  ): void {
    this.uniforms.gravitationalConstant = gravitationalConstant;
    this.uniforms.softeningLength = softeningLength;
    this.uniforms.linearDragRate = linearDragRate;

    this.device.queue.writeBuffer(
      this.buffers.params,
      4,
      this.uniforms.buffer,
      4,
      8,
    );
    this.device.queue.writeBuffer(
      this.buffers.params,
      48,
      this.uniforms.buffer,
      48,
      4,
    );
  }

  public destroy(): void {
    this.buffers.bodiesA.destroy();
    this.buffers.bodiesB.destroy();
    this.buffers.params.destroy();
    this.buffers.collisionCandidates.destroy();
    this.buffers.dispatchArgs.destroy();
    this.compaction.destroy();
    this.explosion.destroy();
  }
}