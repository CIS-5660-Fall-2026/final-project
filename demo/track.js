import * as T from './vendor/three.module.js';
import { createTerrainNoise } from './noise.js';

export function random(seed) {
  let a = 2166136261;
  for (const c of String(seed)) {
    a = Math.imul(a ^ c.charCodeAt(0), 16777619);
  }
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pointDistance(p, a, b) {
  const x = b.x - a.x;
  const z = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * x + (p.z - a.z) * z) / (x * x + z * z || 1)));
  return Math.hypot(p.x - a.x - t * x, p.z - a.z - t * z);
}

function cross(a, b, c) {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

function segmentDistance(a, b, c, d) {
  if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) {
    return 0;
  }
  return Math.min(
    pointDistance(a, c, d),
    pointDistance(b, c, d),
    pointDistance(c, a, b),
    pointDistance(d, a, b)
  );
}

export function validate(points, width) {
  const N = points.length;
  const lengths = [0];
  let minRadius = Infinity;
  for (let i = 0; i < N; i++) {
    lengths.push(lengths[i] + points[i].distanceTo(points[(i + 1) % N]));
  }
  const length = lengths[N];
  const corridor = width + 2.8;
  for (let i = 0; i < N; i++) {
    const a = points[(i + N - 1) % N];
    const b = points[i];
    const c = points[(i + 1) % N];
    const area = Math.abs(cross(a, b, c));
    const r =
      area < 1e-7 ? Infinity : (a.distanceTo(b) * b.distanceTo(c) * c.distanceTo(a)) / (2 * area);
    minRadius = Math.min(minRadius, r);
    if (r < (width / 2 + 1.1) * 1.6) {
      return { valid: false, reason: 'tight turn' };
    }
    for (let j = i + 2; j < N; j++) {
      if (i === 0 && j === N - 1) {
        continue;
      }
      const sep = lengths[j] - lengths[i];
      if (segmentDistance(b, c, points[j], points[(j + 1) % N]) < 1e-6) {
        return { valid: false, reason: 'intersection' };
      }
      if (Math.min(sep, length - sep) < corridor * 2.2) {
        continue;
      }
      if (segmentDistance(b, c, points[j], points[(j + 1) % N]) < corridor) {
        return { valid: false, reason: 'clearance' };
      }
    }
  }
  return { valid: true, length, minRadius };
}
// Macro layouts encode corner sequences, not traced real-circuit coordinates.
// Each is deformed by seed, infield depth, straight stretch, and technical esses.
export const PRESETS = {
  shanghai: {
    label: 'Shanghai-inspired',
    complexity: 8,
    infield: 85,
    straight: 85,
    elevation: 3,
    terrain: 12,
  },
  spa: {
    label: 'Spa-inspired',
    complexity: 7,
    infield: 65,
    straight: 80,
    elevation: 24,
    terrain: 32,
  },
  silverstone: {
    label: 'Silverstone-inspired',
    complexity: 9,
    infield: 75,
    straight: 60,
    elevation: 6,
    terrain: 14,
  },
};
const layouts = {
  shanghai: [
    [-140, -100],
    [-40, -100],
    [60, -100],
    [125, -80],
    [130, -40],
    [110, -15],
    [80, -25],
    [75, -55],
    [45, -65],
    [15, -55],
    [5, -20],
    [30, 0],
    [75, 5],
    [100, 35],
    [85, 60],
    [45, 55],
    [15, 35],
    [-15, 50],
    [-10, 85],
    [45, 110],
    [120, 110],
    [140, 140],
    [-110, 140],
    [-150, 110],
    [-145, 40],
    [-110, 15],
    [-90, -15],
    [-110, -45],
    [-145, -40],
  ],
  spa: [
    [-108, -90],
    [-52, -120],
    [8, -124],
    [70, -105],
    [117, -52],
    [134, 8],
    [111, 38],
    [81, 28],
    [68, 1],
    [44, 9],
    [36, 48],
    [64, 73],
    [53, 108],
    [15, 119],
    [-18, 96],
    [-34, 61],
    [-67, 48],
    [-106, 73],
    [-130, 58],
    [-121, 28],
    [-88, 9],
    [-90, -16],
    [-125, -38],
  ],
  silverstone: [
    [-126, -92],
    [-53, -109],
    [23, -110],
    [98, -86],
    [126, -48],
    [108, -14],
    [74, -20],
    [51, -51],
    [17, -47],
    [5, -18],
    [30, 3],
    [70, 5],
    [105, 32],
    [95, 60],
    [63, 72],
    [35, 50],
    [9, 65],
    [-4, 94],
    [-43, 116],
    [-86, 102],
    [-94, 73],
    [-64, 52],
    [-70, 24],
    [-113, 18],
    [-135, -16],
  ],
};

export function terrainField(x, z, seed = '2401', settings = {}) {
  return createTerrainNoise(seed, settings)(x, z);
}

export function generate({
  seed = '2401',
  complexity = 8,
  scale = 1,
  width = 7,
  style = 'shanghai',
  infield = 80,
  straight = 75,
  elevation = 12,
  terrain = 20,
  frequency = 0.004,
  octaves = 4,
  persistence = 0.5,
} = {}) {
  const noise = createTerrainNoise(seed, { frequency, octaves, persistence });
  const rng = random(seed);
  const N = 640;
  let track;
  for (let attempt = 0; attempt <= 35; attempt++) {
    const fallback = attempt === 35;
    const base = layouts[style] || layouts.shanghai;
    const controls = base.map(([x, z], i) => {
      const angle = (i / base.length) * Math.PI * 2 - Math.PI;
      const mix = Math.max(0.15, infield / 100);
      const ox = Math.cos(angle) * 125;
      const oz = Math.sin(angle) * 110;
      // Preserve macro ordering; blend towards the macro layout to open infield folds.
      // Oval fallback is explicit and is never silently substituted as an accepted layout.
      if (fallback) {
        return new T.Vector3(ox * scale * 1.8, 0, oz * scale * 1.8);
      }
      const radial = Math.hypot(x, z);
      const push = (1 - mix) * Math.max(0, 110 - radial);
      const k = 1 + push / Math.max(radial, 25);
      const jitter = (rng() - 0.5) * 4 * Math.max(0.1, 1 - attempt * 0.05);
      const wave = (i % 2 ? 1 : -1) * (complexity - 5) * 1.2;
      return new T.Vector3(
        (x * k + jitter + wave) *
          (1 + straight / 160) *
          scale *
          2.3 *
          (1 + Math.floor(attempt / 7) * 0.12),
        0,
        (z * k + jitter) * scale * 2.3 * (1 + Math.floor(attempt / 7) * 0.12)
      );
    });
    const curve = new T.CatmullRomCurve3(controls, true, 'centripetal');
    curve.arcLengthDivisions = 4000;
    curve.updateArcLengths();
    const flat = curve.getSpacedPoints(N).slice(0, N);
    const report = validate(flat, width);
    if (!report.valid) {
      continue;
    }
    let heights = controls.map((p) => noise(p.x, p.z) * elevation * 2);
    // Rebuild the spline in 3D, then measure its dense-sampled grades.
    controls.forEach((p, i) => (p.y = heights[i]));
    curve.updateArcLengths();
    let points = curve.getSpacedPoints(N).slice(0, N);
    let maxGrade = 0;
    let heightScale = 1;
    for (let pass = 0; pass < 8; pass++) {
      maxGrade = 0;
      points.forEach((p, i) => {
        const q = points[(i + 1) % N];
        maxGrade = Math.max(maxGrade, Math.abs(q.y - p.y) / Math.hypot(q.x - p.x, q.z - p.z));
      });
      if (maxGrade <= 0.14) {
        break;
      }
      const factor = 0.138 / maxGrade;
      heightScale *= factor;
      controls.forEach((p) => (p.y *= factor));
      curve.updateArcLengths();
      points = curve.getSpacedPoints(N).slice(0, N);
    }
    const floor = 8 - Math.min(...points.map((p) => p.y));
    controls.forEach((p) => (p.y += floor));
    curve.updateArcLengths();
    points = curve.getSpacedPoints(N).slice(0, N);
    // Arc-length sampling changes with elevation: recheck the actual horizontal projection.
    const projected = points.map((p) => new T.Vector3(p.x, 0, p.z));
    const check = validate(projected, width);
    if (!check.valid) {
      continue;
    }
    const frames = points.map((p, i) => {
      const tangent = points[(i + 1) % N]
        .clone()
        .sub(points[(i + N - 1) % N])
        .normalize();
      return { p, t: tangent, n: new T.Vector3(tangent.z, 0, -tangent.x).normalize() };
    });
    let start = 0;
    let best = -Infinity;
    frames.forEach((f, i) => {
      const score = f.t.dot(frames[(i + 8) % N].t) - Math.abs(f.t.y) * 0.5;
      if (score > best) {
        best = score;
        start = i;
      }
    });
    const actualGrade = Math.max(
      ...points.map((p, i) => {
        const q = points[(i + 1) % N];
        return Math.abs(q.y - p.y) / Math.hypot(q.x - p.x, q.z - p.z);
      })
    );
    track = {
      curve,
      points,
      frames,
      controls,
      start,
      length: curve.getLength(),
      minRadius: check.minRadius,
      attempts: attempt + 1,
      fallback,
      width,
      seed,
      scale,
      style,
      terrain,
      elevation,
      noise,
      frequency,
      octaves,
      persistence,
      heightScale,
      maxGrade: actualGrade,
      relief: Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y)),
    };
    break;
  }
  if (!track) {
    throw Error('Unable to generate a valid fallback for these settings.');
  }
  return track;
}

export function nearestTrack(p, track) {
  let best = Infinity;
  let height = 0;
  for (let i = 0; i < track.points.length; i++) {
    const a = track.points[i];
    const b = track.points[(i + 1) % track.points.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const t = Math.max(
      0,
      Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1))
    );
    const d = (p.x - a.x - dx * t) ** 2 + (p.z - a.z - dz * t) ** 2;
    if (d < best) {
      best = d;
      height = a.y + (b.y - a.y) * t;
    }
  }
  return { distance: Math.sqrt(best), height };
}

export function distanceToTrack(p, track) {
  return nearestTrack(p, track).distance;
}

export function groundHeight(x, z, track) {
  const near = nearestTrack({ x, z }, track);
  const blend = T.MathUtils.smoothstep(near.distance, track.width / 2 + 7, track.width / 2 + 28);
  return (
    T.MathUtils.lerp(
      near.height - 1.2,
      5 + (0.5 + 0.5 * track.noise(x, z)) * track.terrain * 2.5,
      blend
    ) - 0.18
  );
}
