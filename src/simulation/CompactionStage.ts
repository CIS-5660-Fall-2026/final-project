import { compactWgsl } from "../shaders";
import type { SimulationAlgorithms, SimulationBuffers } from "./types";

export default class CompactionStage {
  private readonly oldToNew: GPUBuffer;
  private readonly pipeline: GPUComputePipeline;
  private readonly bindGroup: GPUBindGroup;

  constructor(device: GPUDevice, buffers: SimulationBuffers) {
    this.oldToNew = device.createBuffer({
      label: "compaction slot mapping",
      size: buffers.collisionCandidates.size,
      usage: GPUBufferUsage.STORAGE,
    });
    this.pipeline = device.createComputePipeline({
      label: "compaction pipeline",
      layout: "auto",
      compute: {
        module: device.createShaderModule({
          label: "compaction shader",
          code: compactWgsl,
        }),
        entryPoint: "compactBodies",
      },
    });
    this.bindGroup = device.createBindGroup({
      label: "compaction bind group",
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: buffers.bodiesB } },
        { binding: 1, resource: { buffer: buffers.bodiesA } },
        { binding: 2, resource: { buffer: buffers.collisionCandidates } },
        { binding: 3, resource: { buffer: buffers.params } },
        { binding: 4, resource: { buffer: this.oldToNew } },
      ],
    });
  }

  public encode(
    encoder: GPUCommandEncoder,
    algorithm: SimulationAlgorithms["compaction"],
  ): void {
    switch (algorithm) {
      case "serial": {
        const pass = encoder.beginComputePass({ label: "compaction pass" });
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.bindGroup);
        pass.dispatchWorkgroups(1);
        pass.end();
        break;
      }
    }
  }

  public destroy(): void {
    this.oldToNew.destroy();
  }
}