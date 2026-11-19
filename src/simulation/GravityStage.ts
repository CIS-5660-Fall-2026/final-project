import { gravityNaiveWgsl, gravityTiledWgsl } from "../shaders";
import type { SimulationAlgorithms, SimulationBuffers } from "./types";

export default class GravityStage {
  private readonly driftPipeline: GPUComputePipeline;
  private readonly naivePipeline: GPUComputePipeline;
  private readonly tiledPipeline: GPUComputePipeline;
  private readonly driftBindGroup: GPUBindGroup;
  private readonly naiveBindGroup: GPUBindGroup;
  private readonly tiledBindGroup: GPUBindGroup;
  private readonly dispatchArgs: GPUBuffer;

  constructor(device: GPUDevice, buffers: SimulationBuffers) {
    this.dispatchArgs = buffers.dispatchArgs;

    const module = device.createShaderModule({
      label: "naive gravity shader",
      code: gravityNaiveWgsl,
    });

    this.driftPipeline = device.createComputePipeline({
      label: "drift half pipeline",
      layout: "auto",
      compute: { module, entryPoint: "driftHalf" },
    });
    this.naivePipeline = device.createComputePipeline({
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
    this.naiveBindGroup = device.createBindGroup({
      label: "naive gravity bind group",
      layout: this.naivePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: buffers.bodiesB } },
        { binding: 1, resource: { buffer: buffers.bodiesA } },
        { binding: 2, resource: { buffer: buffers.params } },
      ],
    });
    this.tiledPipeline = device.createComputePipeline({
      label: "tiled gravity pipeline",
      layout: "auto",
      compute: {
        module: device.createShaderModule({
          label: "tiled gravity shader",
          code: gravityTiledWgsl,
        }),
        entryPoint: "gravityTiled",
      },
    });
    this.tiledBindGroup = device.createBindGroup({
      label: "tiled gravity bind group",
      layout: this.tiledPipeline.getBindGroupLayout(0),
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
        pass.setPipeline(this.naivePipeline);
        pass.setBindGroup(0, this.naiveBindGroup);
        pass.dispatchWorkgroupsIndirect(this.dispatchArgs, 0);
        pass.end();
        break;
      }
      case "tiled": {
        const pass = encoder.beginComputePass({ label: "tiled gravity pass" });
        pass.setPipeline(this.tiledPipeline);
        pass.setBindGroup(0, this.tiledBindGroup);
        pass.dispatchWorkgroupsIndirect(this.dispatchArgs, 0);
        pass.end();
        break;
      }
    }
  }
}