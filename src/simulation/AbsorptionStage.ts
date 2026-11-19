import { absorptionWgsl } from "../shaders";
import type { SimulationAlgorithms, SimulationBuffers } from "./types";

export default class AbsorptionStage {
  private readonly pipeline: GPUComputePipeline;
  private readonly bindGroup: GPUBindGroup;
  private readonly dispatchArgs: GPUBuffer;

  constructor(device: GPUDevice, buffers: SimulationBuffers) {
    this.dispatchArgs = buffers.dispatchArgs;
    this.pipeline = device.createComputePipeline({
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
    this.bindGroup = device.createBindGroup({
      label: "absorption bind group",
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: buffers.bodiesA } },
        { binding: 1, resource: { buffer: buffers.bodiesB } },
        { binding: 2, resource: { buffer: buffers.collisionCandidates } },
        { binding: 3, resource: { buffer: buffers.params } },
      ],
    });
  }

  public encode(
    encoder: GPUCommandEncoder,
    algorithm: SimulationAlgorithms["absorption"],
  ): void {
    switch (algorithm) {
      case "full-scan": {
        const pass = encoder.beginComputePass({ label: "absorption pass" });
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.bindGroup);
        pass.dispatchWorkgroupsIndirect(this.dispatchArgs, 0);
        pass.end();
        break;
      }
    }
  }
}