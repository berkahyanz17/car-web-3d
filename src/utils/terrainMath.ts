/**
 * Terrain grid, seeded noise, the height function and the Rapier heightfield layout.
 *
 * RECONSTRUCTED: the original file was overwritten by mistake. This version was rebuilt from what the
 * surviving files import (campusFields, groundPaint, Terrain, Trees, Minimap, Scene). The exports and
 * data layout match; the margin size, pond depth and noise mix are my best guesses.
 */
import { MAP_H, MAP_W } from '../data/jatinangor'

export { createRng } from './random'

/** Metres per terrain cell. The mesh and the collider share this grid. */
export const CELL = 4
/** Extra ground (metres, each side) around the mapped campus, covered by hills. */
const MARGIN = 100

export const NX = Math.ceil((MAP_W + MARGIN * 2) / CELL)
export const NZ = Math.ceil((MAP_H + MARGIN * 2) / CELL)
export const GROUND_W = NX * CELL
export const GROUND_D = NZ * CELL

/** How deep the pond basins are carved (metres). */
const POND_DEPTH = 2.5

export function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

/** Per-vertex fields rasterised from the map; index = xi * (NZ + 1) + zi. */
export interface TerrainFields {
  /** 0 on flat campus features (roads, buildings, plazas), rising to 1 on open ground. */
  hillWeight: Float32Array
  /** 0..1 pond mask (1 = pond bed). */
  carve: Float32Array
}

function hash2(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 1442695041)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967295 // [0, 1]
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

/** Bilinear sample of a per-vertex field at world (x, z). */
function sampleField(field: Float32Array, x: number, z: number): number {
  const fx = Math.min(Math.max((x / GROUND_W + 0.5) * NX, 0), NX)
  const fz = Math.min(Math.max((z / GROUND_D + 0.5) * NZ, 0), NZ)
  const x0 = Math.min(Math.floor(fx), NX - 1)
  const z0 = Math.min(Math.floor(fz), NZ - 1)
  const tx = fx - x0
  const tz = fz - z0
  const stride = NZ + 1
  const a = field[x0 * stride + z0] ?? 0
  const b = field[(x0 + 1) * stride + z0] ?? 0
  const c = field[x0 * stride + z0 + 1] ?? 0
  const d = field[(x0 + 1) * stride + z0 + 1] ?? 0
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz
}

export type HeightFn = (x: number, z: number) => number

export function makeHeightFn(
  seed: number,
  amplitude: number,
  frequency: number,
  fields: TerrainFields,
): HeightFn {
  return (x, z) => {
    const weight = sampleField(fields.hillWeight, x, z)
    const hills = weight === 0 ? 0 : fbm(x * frequency, z * frequency, seed) * amplitude * weight
    return hills - sampleField(fields.carve, x, z) * POND_DEPTH
  }
}

/**
 * Heights for the Rapier heightfield: nrows = NZ, ncols = NX,
 * index = xi * (NZ + 1) + zi, where x runs with xi and z with zi.
 */
export function buildHeights(fn: HeightFn): number[] {
  const stride = NZ + 1
  const heights = new Array<number>((NX + 1) * stride)
  for (let xi = 0; xi <= NX; xi++) {
    for (let zi = 0; zi <= NZ; zi++) {
      heights[xi * stride + zi] = fn(xi * CELL - GROUND_W / 2, zi * CELL - GROUND_D / 2)
    }
  }
  return heights
}
