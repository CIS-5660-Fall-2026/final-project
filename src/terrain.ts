import { BufferGeometry, Float32BufferAttribute } from 'three'
import { mulberry32 } from './random'

export const SIZE = 16
const RIDGES = 5
const HEADINGS = [[1, 0], [1, 1], [0, 1], [-1, 0], [-1, -1], [0, -1]]

type Peak = { q: number; r: number; height: number }

// Ridges are seeded walks along the lattice lines, and the ground drops one step per lattice step away from them
export function terrain(seed: number, ridgeHeight: number, facets: number) {
  const cell = SIZE / facets
  const rows = Math.round((facets * 2) / Math.sqrt(3))
  const row = SIZE / rows

  const peaks: Peak[] = []
  const random = mulberry32(seed)
  for (let n = 0; n < RIDGES; n++) {
    let r = Math.round((0.2 + 0.6 * random()) * rows)
    let q = Math.round((0.2 + 0.6 * random()) * facets + r / 2)
    let heading = Math.floor(random() * 6)
    const length = Math.round((0.15 + 0.3 * random()) * facets)
    const top = (0.05 + 0.09 * random()) * facets
    const bend = Math.round(random() * length)
    const turn = random() < 0.5 ? 1 : 5
    for (let step = 0; step <= length; step++) {
      if (step === bend) heading = (heading + turn) % 6
      peaks.push({ q, r, height: Math.round(top * Math.sin((Math.PI * step) / length)) })
      q += HEADINGS[heading][0]
      r += HEADINGS[heading][1]
    }
  }

  const height = (x: number, z: number) => {
    const r = (z + SIZE / 2) / row
    const q = (x + SIZE / 2) / cell + r / 2
    let steps = 0
    for (const peak of peaks) {
      const dq = q - peak.q
      const dr = r - peak.r
      steps = Math.max(steps, peak.height - Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq - dr)))
    }
    const edge = (SIZE / 2 - Math.max(Math.abs(x), Math.abs(z))) / cell
    return Math.min(steps, edge) * cell * ridgeHeight
  }

  const positions: number[] = []
  const indices: number[] = []
  const n = facets + 2
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i < n; i++) {
      const x = Math.min(Math.max((i - 0.5 * (j % 2)) * cell, 0), SIZE) - SIZE / 2
      const z = j * row - SIZE / 2
      positions.push(x, height(x, z), z)
    }
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i
      const b = a + 1
      const c = a + n
      const d = c + 1
      if (j % 2 === 0) indices.push(a, c, d, a, d, b)
      else indices.push(a, c, b, b, c, d)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  return { geometry, height }
}
