// FNV-1a string hashing and Mulberry32. All procedural decisions use explicit streams.
export function random(seed: string): () => number {
  let state = 2166136261;
  for (const c of seed) { state ^= c.codePointAt(0)!; state = Math.imul(state, 16777619); }
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const integer = (rng: () => number, min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
export function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) { const j = integer(rng, 0, i); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
