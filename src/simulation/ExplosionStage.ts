import PrefixScan from "../gpu/PrefixScan";
import { explosionParallelWgsl, explosionSerialWgsl } from "../shaders";
import type { SimulationAlgorithms, SimulationBuffers } from "./types";

type ExplosionPass = { pipeline: GPUComputePipeline; bindGroup: GPUBindGroup };

export default class ExplosionStage {
  private readonly buffers: SimulationBuffers;
  private readonly pipeline: GPUComputePipeline;
  private readonly bindGroup: GPUBindGroup;
  private readonly scratch: GPUBuffer[] = [];
  private readonly bodyCount: GPUBuffer;
  private readonly state: GPUBuffer;
  private readonly dispatches: GPUBuffer;
  private readonly eventScan: PrefixScan;
  private readonly budgetScan: PrefixScan;
  private readonly classify: ExplosionPass;
  private readonly pack: ExplosionPass;
  private readonly allocate: ExplosionPass;
  private readonly respond: ExplosionPass;
  private readonly emit: ExplosionPass;
  private readonly publish: ExplosionPass;

  constructor(device: GPUDevice, buffers: SimulationBuffers) {
    this.buffers = buffers;
    this.pipeline = device.createComputePipeline({
      label: "explosion pipeline",
      layout: "auto",
      compute: {
        module: device.createShaderModule({
          label: "explosion shader",
          code: explosionSerialWgsl,
        }),
        entryPoint: "explodeBodies",
      },
    });
    this.bindGroup = device.createBindGroup({
      label: "explosion bind group",
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: buffers.bodiesA } },
        { binding: 1, resource: { buffer: buffers.collisionCandidates } },
        { binding: 2, resource: { buffer: buffers.params } },
      ],
    });
    const scratch = (label: string, size = buffers.collisionCandidates.size, extraUsage = 0) => {
      const buffer = device.createBuffer({
        label: `explosion ${label}`, size, usage: GPUBufferUsage.STORAGE | extraUsage,
      });
      this.scratch.push(buffer);
      return buffer;
    };
    this.bodyCount = scratch("input count", 4, GPUBufferUsage.COPY_DST);
    const flags = scratch("event flags");
    const ranks = scratch("event ranks");
    const parents = scratch("event parents");
    const requests = scratch("append requests");
    const offsets = scratch("append offsets");
    this.state = scratch("event count, approved end, final count", 12, GPUBufferUsage.COPY_DST);
    this.dispatches = scratch("response, emission, publish args", 36, GPUBufferUsage.INDIRECT);
    this.eventScan = new PrefixScan(device, flags, ranks, this.bodyCount);
    this.budgetScan = new PrefixScan(device, requests, offsets, this.state);

    const module = device.createShaderModule({ label: "parallel explosion shader", code: explosionParallelWgsl });
    const resources = [buffers.bodiesA, buffers.bodiesB, buffers.params, buffers.collisionCandidates,
      flags, ranks, parents, requests, offsets, this.state, this.dispatches, this.bodyCount];
    const makePass = (entryPoint: string, bindings: number[]): ExplosionPass => {
      const pipeline = device.createComputePipeline({
        label: `explosion/parallel/${entryPoint}`, layout: "auto", compute: { module, entryPoint },
      });
      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: bindings.map(binding => ({ binding, resource: { buffer: resources[binding] } })),
      });
      return { pipeline, bindGroup };
    };
    this.classify = makePass("classify", [0, 2, 4]);
    this.pack = makePass("packEvents", [0, 2, 4, 5, 6, 7, 9]);
    this.allocate = makePass("allocateEvents", [0, 2, 7, 8, 9, 10]);
    this.respond = makePass("applyResponses", [0, 1, 2, 6, 7, 9]);
    this.emit = makePass("emitFragments", [0, 1, 2, 6, 7, 8, 9]);
    this.publish = makePass("publishBodies", [0, 1, 2, 3, 9, 11]);
  }

  public encode(
    encoder: GPUCommandEncoder,
    algorithm: SimulationAlgorithms["explosion"],
  ): void {
    switch (algorithm) {
      case "serial": {
        const pass = encoder.beginComputePass({ label: "explosion pass" });
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.bindGroup);
        pass.dispatchWorkgroups(1);
        pass.end();
        break;
      }
      case "parallel": {
        encoder.copyBufferToBuffer(this.buffers.params, 12, this.bodyCount, 0, 4);
        this.encodePass(encoder, this.classify, this.buffers.dispatchArgs);
        this.eventScan.encode(encoder);
        encoder.clearBuffer(this.state, 0, 4);
        this.encodePass(encoder, this.pack, this.buffers.dispatchArgs);
        this.budgetScan.encode(encoder);
        this.encodePass(encoder, this.allocate);
        this.encodePass(encoder, this.respond, this.dispatches, 0);
        this.encodePass(encoder, this.emit, this.dispatches, 12);
        this.encodePass(encoder, this.publish, this.dispatches, 24);
        break;
      }
    }
  }

  private encodePass(encoder: GPUCommandEncoder, step: ExplosionPass, args?: GPUBuffer, offset = 0): void {
    const pass = encoder.beginComputePass({ label: step.pipeline.label });
    pass.setPipeline(step.pipeline);
    pass.setBindGroup(0, step.bindGroup);
    if (args) pass.dispatchWorkgroupsIndirect(args, offset);
    else pass.dispatchWorkgroups(1);
    pass.end();
  }

  public destroy(): void {
    this.eventScan.destroy();
    this.budgetScan.destroy();
    for (const buffer of this.scratch) buffer.destroy();
  }
}