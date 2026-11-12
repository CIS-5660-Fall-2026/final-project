
function seedHash(seed) {
  let h = 2166136261;
  for (const c of String(seed)) {
    h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  }
  return h | 0;
}
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const mix = (a, b, t) => a + (b - a) * t;
const gradients = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [Math.SQRT1_2, Math.SQRT1_2],
  [-Math.SQRT1_2, Math.SQRT1_2],
  [Math.SQRT1_2, -Math.SQRT1_2],
  [-Math.SQRT1_2, -Math.SQRT1_2],
];

export function createGradientNoise(seed) {
  const key = seedHash(seed);
  function gradient(x, y, dx, dy) {
    let h = key ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    const g = gradients[h & 7];
    return g[0] * dx + g[1] * dy;
  }
  return (x, y) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const u = fade(fx);
    const v = fade(fy);
    return Math.max(
      -1,
      Math.min(
        1,
        Math.SQRT2 *
          mix(
            mix(gradient(ix, iy, fx, fy), gradient(ix + 1, iy, fx - 1, fy), u),
            mix(gradient(ix, iy + 1, fx, fy - 1), gradient(ix + 1, iy + 1, fx - 1, fy - 1), u),
            v
          )
      )
    );
  };
}

export function createTerrainNoise(
  seed,
  { frequency = 0.004, octaves = 4, persistence = 0.5 } = {}
) {
  if (
    !Number.isFinite(frequency) ||
    frequency <= 0 ||
    !Number.isInteger(octaves) ||
    octaves < 1 ||
    octaves > 8 ||
    !Number.isFinite(persistence) ||
    persistence < 0 ||
    persistence > 1
  ) {
    throw Error('Invalid terrain noise parameters');
  }
  const layers = Array.from({ length: octaves }, (_, i) => ({
    sample: createGradientNoise(`${seed}:terrain:${i}`),
    c: Math.cos(i * 2.3999632297),
    s: Math.sin(i * 2.3999632297),
  }));
  return (x, z) => {
    let sum = 0;
    let weight = 0;
    let amplitude = 1;
    let f = frequency;
    for (let i = 0; i < layers.length; i++) {
      
      const { sample, c, s } = layers[i];
      sum += amplitude * sample((x * c - z * s) * f + 19.37, (x * s + z * c) * f - 8.19);
      weight += amplitude;
      amplitude *= persistence;
      f *= 2;
    }
    return sum / weight;
  };
}
