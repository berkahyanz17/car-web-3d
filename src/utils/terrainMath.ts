/** Seeded, dependency-free terrain height function shared by the mesh and the collider. */

export const TERRAIN_SIZE = 300
export const TERRAIN_SEGMENTS = 150 // 2 m per cell
export const FLAT_RADIUS = 32 // perfectly flat around the spawn
export const BLEND_DISTANCE = 45 // smooth ramp-up of the hills beyond it

function hash2(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 1442695041)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967295 // [0, 1]
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

/** 2D value noise in [-1, 1]. */
function valueNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x)
  const iz = Math.floor(z)
  const fx = smooth(x - ix)
  const fz = smooth(z - iz)
  const a = hash2(ix, iz, seed)
  const b = hash2(ix + 1, iz, seed)
  const c = hash2(ix, iz + 1, seed)
  const d = hash2(ix + 1, iz + 1, seed)
  const top = a + (b - a) * fx
  const bottom = c + (d - c) * fx
  return (top + (bottom - top) * fz) * 2 - 1
}

function fbm(x: number, z: number, seed: number): number {
  let amplitude = 1
  let frequency = 1
  let sum = 0
  let norm = 0
  for (let octave = 0; octave < 4; octave++) {
    sum += valueNoise(x * frequency, z * frequency, seed + octave * 101) * amplitude
    norm += amplitude
    amplitude *= 0.5
    frequency *= 2
  }
  return sum / norm
}

export type HeightFn = (x: number, z: number) => number

export function makeHeightFn(seed: number, amplitude: number, frequency: number): HeightFn {
  return (x, z) => {
    const dist = Math.hypot(x, z)
    const t = Math.min(Math.max((dist - FLAT_RADIUS) / BLEND_DISTANCE, 0), 1)
    const mask = smooth(t)
    if (mask === 0) return 0
    return fbm(x * frequency, z * frequency, seed) * amplitude * mask
  }
}

/**
 * Heights for a Rapier heightfield with `segments` cells per side
 * ((segments + 1)^2 samples), in the layout Rapier expects.
 */
export function buildHeights(fn: HeightFn, size: number, segments: number): number[] {
  const n = segments + 1
  const heights = new Array<number>(n * n)
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const x = (row / segments - 0.5) * size
      const z = (col / segments - 0.5) * size
      heights[row * n + col] = fn(x, z)
    }
  }
  return heights
}

/** Small seeded PRNG (mulberry32) returning floats in [0, 1). */
export function createRng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
