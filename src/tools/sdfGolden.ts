/**
 * Dev tool: evaluates the WGSL `rockLocalSdf` on the GPU at deterministic sample
 * points and exports the results. Python tests use this file to verify that the
 * PyTorch teacher matches the shader exactly.
 *
 * Usage: `npm run dev`, open /tools/sdf-golden.html, click "Download".
 */
import noiseSource from '../shaders/noise.wgsl?raw';
import rocksSource from '../shaders/rocks.wgsl?raw';
import terrainSource from '../shaders/terrain.wgsl?raw';

const SPECIES_COUNT = 4;
const POINTS_PER_SPECIES = 1024;
// Must match TRAINING_BOX_HALF_EXTENT in training/neural_sdf/procedural.py.
// 必须和 training/neural_sdf/procedural.py 中的 TRAINING_BOX_HALF_EXTENT 一致。
const BOX_HALF_EXTENT = 1.8;
const SEED = 20261118;
const WORKGROUP_SIZE = 64;

const EVAL_KERNEL = /* wgsl */ `
@group(0) @binding(0) var<storage, read> samples: array<vec4f>;
@group(0) @binding(1) var<storage, read_write> distances: array<f32>;

@compute @workgroup_size(${WORKGROUP_SIZE})
fn evaluate(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= arrayLength(&distances)) {
    return;
  }
  let s = samples[id.x];
  distances[id.x] = rockLocalSdf(s.xyz, u32(s.w));
}
`;

export interface GoldenData {
  readonly formatVersion: 1;
  readonly description: string;
  /** Rows of [x, y, z, species, wgslDistance]. */
  readonly samples: number[][];
}

/** Small deterministic PRNG (mulberry32) so the sample set is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSamples(): Float32Array {
  const random = mulberry32(SEED);
  const data = new Float32Array(SPECIES_COUNT * POINTS_PER_SPECIES * 4);
  let offset = 0;
  for (let species = 0; species < SPECIES_COUNT; species++) {
    for (let i = 0; i < POINTS_PER_SPECIES; i++) {
      // Half uniform in the box, half on shells around the rock surface.
      // 一半在包围盒内均匀分布，一半分布在石头表面附近的球壳上。
      let point: [number, number, number];
      if (i % 2 === 0) {
        point = [0, 0, 0].map(() => (random() * 2 - 1) * BOX_HALF_EXTENT) as [
          number,
          number,
          number,
        ];
      } else {
        const z = random() * 2 - 1;
        const phi = random() * 2 * Math.PI;
        const r = 0.5 + random();
        const s = Math.sqrt(1 - z * z);
        point = [r * s * Math.cos(phi), r * z, r * s * Math.sin(phi)];
      }
      data.set([...point, species], offset);
      offset += 4;
    }
  }
  return data;
}

export async function generateGolden(): Promise<GoldenData> {
  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) throw new Error('WebGPU is not available.');
  const device = await adapter.requestDevice();

  const samples = makeSamples();
  const count = samples.length / 4;
  const sampleBuffer = device.createBuffer({
    size: samples.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(sampleBuffer, 0, samples);
  const resultBuffer = device.createBuffer({
    size: count * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const readBuffer = device.createBuffer({
    size: count * 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  const module = device.createShaderModule({
    label: 'sdf golden',
    code: [noiseSource, terrainSource, rocksSource, EVAL_KERNEL].join('\n'),
  });
  const pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: {module, entryPoint: 'evaluate'},
  });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      {binding: 0, resource: {buffer: sampleBuffer}},
      {binding: 1, resource: {buffer: resultBuffer}},
    ],
  });

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(Math.ceil(count / WORKGROUP_SIZE));
  pass.end();
  encoder.copyBufferToBuffer(resultBuffer, 0, readBuffer, 0, count * 4);
  device.queue.submit([encoder.finish()]);

  await readBuffer.mapAsync(GPUMapMode.READ);
  const distances = new Float32Array(readBuffer.getMappedRange().slice(0));
  readBuffer.unmap();
  device.destroy();

  const rows: number[][] = [];
  for (let i = 0; i < count; i++) {
    rows.push([...samples.subarray(i * 4, i * 4 + 4), distances[i]]);
  }
  return {
    formatVersion: 1,
    description:
      'WGSL rockLocalSdf reference values: [x, y, z, species, distance]',
    samples: rows,
  };
}

function download(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], {type: 'application/json'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

declare global {
  interface Window {
    generateGolden?: () => Promise<GoldenData>;
  }
}
window.generateGolden = generateGolden;

const button = document.querySelector('button');
button?.addEventListener('click', async () => {
  const golden = await generateGolden();
  download('rock_local_sdf.json', JSON.stringify(golden));
});
