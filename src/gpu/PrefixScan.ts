import { prefixScanPrepareWgsl, prefixScanWgsl } from "../shaders";

type ScanPass = {
  pipeline: GPUComputePipeline;
  bindGroup: GPUBindGroup;
};

export default class PrefixScan {
  private readonly levelInfo: GPUBuffer;
  private readonly preparePipeline: GPUComputePipeline;
  private readonly prepareBindGroup: GPUBindGroup;
  private readonly scanPasses: ScanPass[] = [];
  private readonly offsetPasses: ScanPass[] = [];
  private readonly scratchBuffers: GPUBuffer[] = [];

  constructor(device: GPUDevice, input: GPUBuffer, output: GPUBuffer, count: GPUBuffer) {
    const createScratch = (label: string, elements: number): GPUBuffer => {
      const buffer = device.createBuffer({
        label,
        size: elements * Uint32Array.BYTES_PER_ELEMENT,
        usage: GPUBufferUsage.STORAGE,
      });
      this.scratchBuffers.push(buffer);
      return buffer;
    };

    const levels: { input: GPUBuffer; output: GPUBuffer; sums: GPUBuffer }[] = [];
    let capacity = input.size / Uint32Array.BYTES_PER_ELEMENT;
    let levelInput = input;
    let levelOutput = output;
    while (true) {
      const blockCount = Math.ceil(capacity / 256);
      const sums = createScratch(`scan block sums ${levels.length}`, blockCount);
      levels.push({ input: levelInput, output: levelOutput, sums });
      if (blockCount === 1) break;
      capacity = blockCount;
      levelInput = sums;
      levelOutput = createScratch(`scan prefixes ${levels.length}`, capacity);
    }

    this.levelInfo = device.createBuffer({
      label: "scan level counts and dispatch args",
      size: levels.length * 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT,
    });
    this.preparePipeline = device.createComputePipeline({
      label: "scan prepare pipeline",
      layout: "auto",
      compute: {
        module: device.createShaderModule({ code: prefixScanPrepareWgsl }),
        entryPoint: "prepareScan",
      },
    });
    this.prepareBindGroup = device.createBindGroup({
      layout: this.preparePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: count } },
        { binding: 1, resource: { buffer: this.levelInfo } },
      ],
    });

    const module = device.createShaderModule({ label: "exclusive scan shader", code: prefixScanWgsl });
    for (let i = 0; i < levels.length; i++) {
      const level = levels[i];
      const pipeline = device.createComputePipeline({
        label: `scan blocks pipeline ${i}`,
        layout: "auto",
        compute: { module, entryPoint: "scanBlocks", constants: { SCAN_LEVEL: i } },
      });
      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: level.input } },
          { binding: 1, resource: { buffer: level.output } },
          { binding: 2, resource: { buffer: level.sums } },
          { binding: 4, resource: { buffer: this.levelInfo } },
        ],
      });
      this.scanPasses.push({ pipeline, bindGroup });

      if (i + 1 < levels.length) {
        const offsetPipeline = device.createComputePipeline({
          label: `scan offsets pipeline ${i}`,
          layout: "auto",
          compute: { module, entryPoint: "addBlockOffsets", constants: { SCAN_LEVEL: i } },
        });
        const offsetBindGroup = device.createBindGroup({
          layout: offsetPipeline.getBindGroupLayout(0),
          entries: [
            { binding: 1, resource: { buffer: level.output } },
            { binding: 3, resource: { buffer: levels[i + 1].output } },
            { binding: 4, resource: { buffer: this.levelInfo } },
          ],
        });
        this.offsetPasses.push({ pipeline: offsetPipeline, bindGroup: offsetBindGroup });
      }
    }
  }

  public encode(encoder: GPUCommandEncoder): void {
    const prepare = encoder.beginComputePass({ label: "scan prepare pass" });
    prepare.setPipeline(this.preparePipeline);
    prepare.setBindGroup(0, this.prepareBindGroup);
    prepare.dispatchWorkgroups(1);
    prepare.end();

    for (let i = 0; i < this.scanPasses.length; i++) {
      const step = this.scanPasses[i];
      const pass = encoder.beginComputePass({ label: `scan/blocks/${i} pass` });
      pass.setPipeline(step.pipeline);
      pass.setBindGroup(0, step.bindGroup);
      pass.dispatchWorkgroupsIndirect(this.levelInfo, i * 16 + 4);
      pass.end();
    }

    for (let i = this.offsetPasses.length - 1; i >= 0; i--) {
      const step = this.offsetPasses[i];
      const pass = encoder.beginComputePass({ label: `scan/offsets/${i} pass` });
      pass.setPipeline(step.pipeline);
      pass.setBindGroup(0, step.bindGroup);
      pass.dispatchWorkgroupsIndirect(this.levelInfo, i * 16 + 4);
      pass.end();
    }
  }

  public destroy(): void {
    this.levelInfo.destroy();
    for (const buffer of this.scratchBuffers) buffer.destroy();
  }
}