import PrefixScan from "../gpu/PrefixScan";
import { compactScanWgsl, compactSerialWgsl } from "../shaders";
import type { SimulationAlgorithms, SimulationBuffers } from "./types";

type CompactionPass = {
  pipeline: GPUComputePipeline;
  bindGroup: GPUBindGroup;
};

export default class CompactionStage {
  private readonly oldToNew: GPUBuffer;
  private readonly pipeline: GPUComputePipeline;
  private readonly bindGroup: GPUBindGroup;
  private readonly params: GPUBuffer;
  private readonly dispatchArgs: GPUBuffer;
  private readonly scanCount: GPUBuffer;
  private readonly scan: PrefixScan;
  private readonly markPass: CompactionPass;
  private readonly scatterPass: CompactionPass;
  private readonly publishPass: CompactionPass;
  private readonly scratchBuffers: GPUBuffer[] = [];

  constructor(device: GPUDevice, buffers: SimulationBuffers) {
    this.params = buffers.params;
    this.dispatchArgs = buffers.dispatchArgs;
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
          code: compactSerialWgsl,
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

    const createScratch = (label: string): GPUBuffer => {
      const buffer = device.createBuffer({
        label,
        size: buffers.collisionCandidates.size,
        usage: GPUBufferUsage.STORAGE,
      });
      this.scratchBuffers.push(buffer);
      return buffer;
    };
    const alive = createScratch("compaction alive flags");
    const prefixes = createScratch("compaction exclusive prefixes");
    const candidateScratch = createScratch("compaction remapped candidates");
    this.scanCount = device.createBuffer({
      label: "compaction input count",
      size: Uint32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.scan = new PrefixScan(device, alive, prefixes, this.scanCount);

    const module = device.createShaderModule({
      label: "scan compaction shader",
      code: compactScanWgsl,
    });
    const resources = [
      buffers.bodiesB,
      buffers.bodiesA,
      buffers.collisionCandidates,
      buffers.params,
      this.scanCount,
      alive,
      prefixes,
      candidateScratch,
    ];
    const createPass = (entryPoint: string, bindings: number[]): CompactionPass => {
      const pipeline = device.createComputePipeline({
        label: `compaction/scan/${entryPoint} pass`,
        layout: "auto",
        compute: { module, entryPoint },
      });
      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: bindings.map((binding) => ({
          binding,
          resource: { buffer: resources[binding] },
        })),
      });
      return { pipeline, bindGroup };
    };
    this.markPass = createPass("markAlive", [0, 3, 5]);
    this.scatterPass = createPass("scatterBodies", [0, 1, 2, 3, 5, 6, 7]);
    this.publishPass = createPass("publishCandidates", [2, 3, 4, 5, 6, 7]);
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
      case "scan": {
        encoder.copyBufferToBuffer(this.params, 12, this.scanCount, 0, 4);
        this.encodeBodiesPass(encoder, this.markPass);
        this.scan.encode(encoder);
        this.encodeBodiesPass(encoder, this.scatterPass);
        this.encodeBodiesPass(encoder, this.publishPass);
        break;
      }
    }
  }

  private encodeBodiesPass(encoder: GPUCommandEncoder, step: CompactionPass): void {
    const pass = encoder.beginComputePass({ label: step.pipeline.label });
    pass.setPipeline(step.pipeline);
    pass.setBindGroup(0, step.bindGroup);
    pass.dispatchWorkgroupsIndirect(this.dispatchArgs, 0);
    pass.end();
  }

  public destroy(): void {
    this.oldToNew.destroy();
    this.scan.destroy();
    this.scanCount.destroy();
    for (const buffer of this.scratchBuffers) buffer.destroy();
  }
}