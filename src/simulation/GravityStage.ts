import { gravityWgsl } from "../shaders";
import type { SimulationAlgorithms, SimulationBuffers } from "./types";

export default class GravityStage {
  private readonly driftPipeline: GPUComputePipeline;
  private readonly gravityPipeline: GPUComputePipeline;
  private readonly driftBindGroup: GPUBindGroup;
  private readonly gravityBindGroup: GPUBindGroup;
  private readonly dispatchArgs: GPUBuffer;

  constructor(device: GPUDevice, buffers: SimulationBuffers) {
    this.dispatchArgs = buffers.dispatchArgs;

    const module = device.createShaderModule({
      label: "simulation shader",
      code: gravityWgsl,
    });

    this.driftPipeline = device.createComputePipeline({
      label: "drift half pipeline",
      layout: "auto",
      compute: { module, entryPoint: "driftHalf" },
    });
    this.gravityPipeline = device.createComputePipeline({
      label: "naive gravity pipeline",
      layout: "auto",
      compute: { module, entryPoint: "gravityNaive" },
    });

    this.driftBindGroup = device.createBindGroup({
      label: "drift half bind group",
      layout: this.driftPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: buffers.bodiesA } },
        { binding: 1, resource: { buffer: buffers.bodiesB } },
        { binding: 2, resource: { buffer: buffers.params } },
      ],
    });
    this.gravityBindGroup = device.createBindGroup({
      label: "naive gravity bind group",
      layout: this.gravityPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: buffers.bodiesB } },
        { binding: 1, resource: { buffer: buffers.bodiesA } },
        { binding: 2, resource: { buffer: buffers.params } },
      ],
    });
  }

  public encodeDrift(encoder: GPUCommandEncoder): void {
    const pass = encoder.beginComputePass({ label: "drift half pass" });
    pass.setPipeline(this.driftPipeline);
    pass.setBindGroup(0, this.driftBindGroup);
    pass.dispatchWorkgroupsIndirect(this.dispatchArgs, 0);
    pass.end();
  }

  public encode(
    encoder: GPUCommandEncoder,
    algorithm: SimulationAlgorithms["gravity"],
  ): void {
    switch (algorithm) {
      case "naive": {
        const pass = encoder.beginComputePass({ label: "naive gravity pass" });
        pass.setPipeline(this.gravityPipeline);
        pass.setBindGroup(0, this.gravityBindGroup);
        pass.dispatchWorkgroupsIndirect(this.dispatchArgs, 0);
        pass.end();
        break;
      }
    }
  }
}