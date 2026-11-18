let seedX = 0.0;
let seedY = 0.0;
let seedZ = 0.0;

export function setNoiseSeed(seed: number) {
  seedX = seed * 67.23;
  seedY = seed * 97.71;
  seedZ = seed * 13.77;
}

function fract(x: number): number {
  return x - Math.floor(x);
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function gradientDot(ix: number, iy: number, iz: number, fx: number, fy: number, fz: number): number {
  const r1 = fract(Math.sin(ix * 127.1 + iy * 311.7 + iz * 74.7) * 43758.5453);
  const r2 = fract(Math.sin(ix * 269.5 + iy * 183.3 + iz * 246.1) * 43758.5453);

  const z = r1 * 2.0 - 1.0;
  const phi = r2 * 6.28318530718;
  const radius = Math.sqrt(Math.max(0.0, 1.0 - z * z));

  return radius * Math.cos(phi) * fx + radius * Math.sin(phi) * fy + z * fz;
}

export function perlin3D(x: number, y: number, z: number): number {
  x += seedX;
  y += seedY;
  z += seedZ;

  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;

  const v000 = gradientDot(ix,     iy,     iz,     fx,       fy,       fz);
  const v100 = gradientDot(ix + 1, iy,     iz,     fx - 1.0, fy,       fz);
  const v010 = gradientDot(ix,     iy + 1, iz,     fx,       fy - 1.0, fz);
  const v110 = gradientDot(ix + 1, iy + 1, iz,     fx - 1.0, fy - 1.0, fz);
  const v001 = gradientDot(ix,     iy,     iz + 1, fx,       fy,       fz - 1.0);
  const v101 = gradientDot(ix + 1, iy,     iz + 1, fx - 1.0, fy,       fz - 1.0);
  const v011 = gradientDot(ix,     iy + 1, iz + 1, fx,       fy - 1.0, fz - 1.0);
  const v111 = gradientDot(ix + 1, iy + 1, iz + 1, fx - 1.0, fy - 1.0, fz - 1.0);

  const ux = fx * fx * fx * (fx * (fx * 6.0 - 15.0) + 10.0);
  const uy = fy * fy * fy * (fy * (fy * 6.0 - 15.0) + 10.0);
  const uz = fz * fz * fz * (fz * (fz * 6.0 - 15.0) + 10.0);

  const mix00 = mix(v000, v100, ux);
  const mix10 = mix(v010, v110, ux);
  const mix01 = mix(v001, v101, ux);
  const mix11 = mix(v011, v111, ux);

  const mix0 = mix(mix00, mix10, uy);
  const mix1 = mix(mix01, mix11, uy);

  return mix(mix0, mix1, uz);
}

export function fbmPerlin3D(x: number, y: number, z: number, octaves: number, lacunarity: number, gain: number): number {
  let sum = 0.0;
  let amp = 1.0;
  let norm = 0.0;

  for (let i = 0; i < octaves; i++) {
    sum += amp * perlin3D(x, y, z);
    norm += amp;
    x *= lacunarity;
    y *= lacunarity;
    z *= lacunarity;
    amp *= gain;
  }
  return sum / Math.max(norm, 1e-6);
}

