import { collisionWgsl } from "../shaders";
import type { SimulationAlgorithms, SimulationBuffers } from "./types";

export default class CollisionStage {
  private readonly pipeline: GPUComputePipeline;
  private readonly bindGroup: GPUBindGroup;
  private readonly dispatchArgs: GPUBuffer;

  constructor(device: GPUDevice, buffers: SimulationBuffers) {
    this.dispatchArgs = buffers.dispatchArgs;
    this.pipeline = device.createComputePipeline({
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
    this.bindGroup = device.createBindGroup({
      label: "collision detection bind group",
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
    algorithm: SimulationAlgorithms["collision"],
  ): void {
    switch (algorithm) {
      case "all-pairs": {
        const pass = encoder.beginComputePass({ label: "collision detection pass" });
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.bindGroup);
        pass.dispatchWorkgroupsIndirect(this.dispatchArgs, 0);
        pass.end();
        break;
      }
    }
  }
}