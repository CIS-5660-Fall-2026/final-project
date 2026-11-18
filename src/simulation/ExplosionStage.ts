import { explosionWgsl } from "../shaders";
import type { SimulationAlgorithms, SimulationBuffers } from "./types";

export default class ExplosionStage {
  private readonly pipeline: GPUComputePipeline;
  private readonly bindGroup: GPUBindGroup;

  constructor(device: GPUDevice, buffers: SimulationBuffers) {
    this.pipeline = device.createComputePipeline({
      label: "explosion pipeline",
      layout: "auto",
      compute: {
        module: device.createShaderModule({
          label: "explosion shader",
          code: explosionWgsl,
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
    }
  }
}