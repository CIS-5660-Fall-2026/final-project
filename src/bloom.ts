import { Vector3 } from 'three'

export type Bloom = { index: number[]; frames: Float32Array[] }

type Pattern = { flat: number[]; triangles: number[]; mountains: Set<string>; pinned: number }
type Edge = { a: number; b: number; rest: number }
type Crease = { wings: number[]; ends: number[]; rest: number; sign: number; angle: number }

const FRAMES = 24
const MAX_FOLD = 0.95
const STEPS = 500
const AXIAL = 60
const HINGE = 0.7
const DAMPING = 0.03

const baked = new Map<string, Bloom>()

export function bloom(petals: number, rings: number): Bloom {
  const key = `${petals} ${rings}`
  if (!baked.has(key)) baked.set(key, fold(pattern(petals, rings)))
  return baked.get(key)!
}

const edgeKey = (a: number, b: number) => `${Math.min(a, b)} ${Math.max(a, b)}`

// Yoshimura bloom pattern: a center polygon with one wedge of split rhombi per side
function pattern(petals: number, rings: number): Pattern {
  const radius = 0.5 / Math.sin(Math.PI / petals)
  const corner = (k: number) => {
    const angle = (2 * Math.PI * k) / petals
    return [radius * Math.cos(angle), radius * Math.sin(angle)]
  }
  const flat = [0, 0]
  for (let k = 0; k < petals; k++) flat.push(...corner(k))

  // Point (a, b) of wedge k: a steps along side k, b steps along the previous side continued
  const ids = new Map<string, number>()
  const id = (k: number, a: number, b: number): number => {
    k = (k + petals) % petals
    if (a === 0) return id(k - 1, b + 1, 0)
    if (a === 1 && b === 0) return 1 + ((k + 1) % petals)
    const key = `${k} ${a} ${b}`
    if (!ids.has(key)) {
      const [x, y] = corner(k)
      const [nextX, nextY] = corner(k + 1)
      const [lastX, lastY] = corner(k - 1)
      ids.set(key, flat.length / 2)
      flat.push(x + a * (nextX - x) + b * (x - lastX), y + a * (nextY - y) + b * (y - lastY))
    }
    return ids.get(key)!
  }

  const triangles: number[] = []
  const mountains = new Set<string>()
  for (let k = 0; k < petals; k++) {
    triangles.push(0, id(k, 0, 0), id(k, 1, 0))
    for (let j = 0; j < rings; j++) {
      for (let i = 0; i <= rings - j; i++) {
        const reach = i + j < rings ? 1 : 0.5
        const a = id(k, i, j)
        const b = id(k, i + 1, j)
        const c = id(k, i + reach, j + reach)
        const d = id(k, i, j + 1)
        triangles.push(a, c, b, a, d, c)
        mountains.add(edgeKey(a, c))
      }
    }
  }
  return { flat, triangles, mountains, pinned: petals + 1 }
}

// Bar and hinge model from Origami Simulator, stepped from flat to folded and saved as keyframes
function fold({ flat, triangles, mountains, pinned }: Pattern): Bloom {
  const points: Vector3[] = []
  for (let i = 0; i < flat.length; i += 2) points.push(new Vector3(flat[i], flat[i + 1], 0))
  const velocity = points.map(() => new Vector3())
  const force = points.map(() => new Vector3())
  const radius = Math.max(...points.map((p) => p.length()))

  const edges: Edge[] = []
  const creases: Crease[] = []
  const seen = new Map<string, number[]>()
  for (let t = 0; t < triangles.length; t += 3) {
    for (let s = 0; s < 3; s++) {
      const from = triangles[t + s]
      const to = triangles[t + ((s + 1) % 3)]
      const across = triangles[t + ((s + 2) % 3)]
      const key = edgeKey(from, to)
      const rest = points[from].distanceTo(points[to])
      const first = seen.get(key)
      if (!first) {
        seen.set(key, [from, to, across])
        edges.push({ a: from, b: to, rest })
      } else if (from > 0 && to > 0) {
        const sign = mountains.has(key) ? -1 : 1
        creases.push({ wings: [first[2], across], ends: [first[0], first[1]], rest, sign, angle: 0 })
      }
    }
  }

  const snapshot = () => {
    const ground = Math.min(...points.map((p) => p.z))
    return new Float32Array(points.flatMap((p) => [p.x / radius, (p.z - ground) / radius, -p.y / radius]))
  }

  const shortest = Math.min(...edges.map((e) => e.rest))
  const dt = 0.9 / (2 * Math.PI * Math.sqrt(AXIAL / shortest))
  const d = new Vector3()
  const crease = new Vector3()
  const wing1 = new Vector3()
  const wing2 = new Vector3()
  const normal1 = new Vector3()
  const normal2 = new Vector3()

  const frames = [snapshot()]
  for (let frame = 1; frame <= FRAMES; frame++) {
    const target = (MAX_FOLD * Math.PI * frame) / FRAMES
    for (let step = 0; step < STEPS; step++) {
      force.forEach((f) => f.set(0, 0, 0))

      for (const { a, b, rest } of edges) {
        d.subVectors(points[b], points[a])
        const length = d.length()
        d.multiplyScalar(((AXIAL / rest) * (length - rest)) / length)
        force[a].add(d)
        force[b].sub(d)
      }

      for (const c of creases) {
        const [w1, w2] = c.wings
        const [e1, e2] = c.ends
        crease.subVectors(points[e2], points[e1])
        wing1.subVectors(points[w1], points[e1])
        wing2.subVectors(points[w2], points[e1])
        const length = crease.length()
        const along1 = wing1.dot(crease) / (length * length)
        const along2 = wing2.dot(crease) / (length * length)
        normal1.crossVectors(crease, wing1)
        normal2.crossVectors(wing2, crease)
        const height1 = normal1.length() / length
        const height2 = normal2.length() / length
        normal1.normalize()
        normal2.normalize()

        let angle = -Math.atan2(d.crossVectors(normal1, normal2).dot(crease) / length, normal1.dot(normal2))
        angle += 2 * Math.PI * Math.round((c.angle - angle) / (2 * Math.PI))
        c.angle = angle

        const pull = HINGE * c.rest * (c.sign * target - angle)
        normal1.multiplyScalar(pull / height1)
        normal2.multiplyScalar(pull / height2)
        force[w1].add(normal1)
        force[w2].add(normal2)
        force[e1].addScaledVector(normal1, along1 - 1).addScaledVector(normal2, along2 - 1)
        force[e2].addScaledVector(normal1, -along1).addScaledVector(normal2, -along2)
      }

      for (let i = pinned; i < points.length; i++) {
        velocity[i].addScaledVector(force[i], dt).multiplyScalar(1 - DAMPING)
        points[i].addScaledVector(velocity[i], dt)
      }
    }
    frames.push(snapshot())
  }
  return { index: triangles, frames }
}
