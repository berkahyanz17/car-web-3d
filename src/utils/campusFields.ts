import {
  COURT,
  GARDEN,
  BUILDINGS,
  MAP_H,
  MAP_W,
  OVAL,
  PARKING,
  ROADS,
  SOIL,
  WATER,
} from '../data/jatinangor'
import { CELL, GROUND_D, GROUND_W, NX, NZ, smooth, type TerrainFields } from './terrainMath'

const OFFSET_X = (GROUND_W - MAP_W) / 2 // map px -> canvas px (1 px = 1 m)
const OFFSET_Z = (GROUND_D - MAP_H) / 2

const FLAT_MARGIN_ROAD = 5 // m kept flat on each side of a road
const FLAT_MARGIN_BUILDING = 8
const HILL_RAMP = 38 // m over which the hills fade in beyond the flat features

function context(width: number, height: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2D canvas is not available')
  return ctx
}

function tracePolygon(ctx: CanvasRenderingContext2D, flat: ReadonlyArray<number>) {
  ctx.beginPath()
  for (let i = 0; i < flat.length; i += 2) {
    const x = (flat[i] ?? 0) + OFFSET_X
    const y = (flat[i + 1] ?? 0) + OFFSET_Z
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

/** Chamfer distance (metres) from every pixel to the nearest set pixel. */
function distanceTransform(mask: Uint8Array, width: number, height: number): Float32Array {
  const INF = 1e6
  const dist = new Float32Array(width * height)
  for (let i = 0; i < dist.length; i++) dist[i] = mask[i] ? 0 : INF
  const D2 = Math.SQRT2
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      let d = dist[i] ?? INF
      if (x > 0) d = Math.min(d, (dist[i - 1] ?? INF) + 1)
      if (y > 0) {
        d = Math.min(d, (dist[i - width] ?? INF) + 1)
        if (x > 0) d = Math.min(d, (dist[i - width - 1] ?? INF) + D2)
        if (x < width - 1) d = Math.min(d, (dist[i - width + 1] ?? INF) + D2)
      }
      dist[i] = d
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x
      let d = dist[i] ?? INF
      if (x < width - 1) d = Math.min(d, (dist[i + 1] ?? INF) + 1)
      if (y < height - 1) {
        d = Math.min(d, (dist[i + width] ?? INF) + 1)
        if (x < width - 1) d = Math.min(d, (dist[i + width + 1] ?? INF) + D2)
        if (x > 0) d = Math.min(d, (dist[i + width - 1] ?? INF) + D2)
      }
      dist[i] = d
    }
  }
  return dist
}

/** Rasterises roads, buildings, plazas and ponds into the per-vertex terrain fields (browser only). */
export function buildTerrainFields(): TerrainFields {
  const width = GROUND_W
  const height = GROUND_D

  // ---- features that must stay flat
  const flat = context(width, height)
  flat.fillStyle = '#000'
  flat.strokeStyle = '#000'
  flat.lineCap = 'round'
  flat.lineJoin = 'round'

  for (const road of ROADS) {
    flat.lineWidth = road.width + FLAT_MARGIN_ROAD * 2
    flat.beginPath()
    for (let i = 0; i < road.pts.length; i += 2) {
      const x = (road.pts[i] ?? 0) + OFFSET_X
      const y = (road.pts[i + 1] ?? 0) + OFFSET_Z
      if (i === 0) flat.moveTo(x, y)
      else flat.lineTo(x, y)
    }
    flat.stroke()
  }

  for (const b of BUILDINGS) {
    const theta = (b.theta * Math.PI) / 180
    flat.save()
    flat.translate(b.x + OFFSET_X, b.y + OFFSET_Z)
    flat.rotate(theta)
    if (b.kind === 'round') {
      flat.beginPath()
      flat.arc(0, 0, b.w / 2 + FLAT_MARGIN_BUILDING, 0, Math.PI * 2)
      flat.fill()
    } else {
      for (const [lx, lz, w, d] of b.parts ?? [[0, 0, b.w, b.d] as const]) {
        const m = FLAT_MARGIN_BUILDING
        flat.fillRect(lx - w / 2 - m, lz - d / 2 - m, w + m * 2, d + m * 2)
      }
    }
    flat.restore()
  }

  tracePolygon(flat, PARKING)
  flat.fill()
  flat.lineWidth = 12
  for (const polygon of SOIL) {
    tracePolygon(flat, polygon)
    flat.fill()
  }
  for (const polygon of WATER) {
    tracePolygon(flat, polygon)
    flat.fill()
    flat.stroke() // widen the flat bank around ponds
  }
  flat.beginPath()
  flat.arc(GARDEN.cx + OFFSET_X, GARDEN.cy + OFFSET_Z, GARDEN.r_plaza + 6, 0, Math.PI * 2)
  flat.fill()
  flat.beginPath()
  flat.ellipse(OVAL.cx + OFFSET_X, OVAL.cy + OFFSET_Z, OVAL.rx + 8, OVAL.ry + 8, 0, 0, Math.PI * 2)
  flat.fill()
  flat.fillRect(COURT.cx + OFFSET_X - 24, COURT.cy + OFFSET_Z - 20, 48, 40)

  const alpha = flat.getImageData(0, 0, width, height).data
  const mask = new Uint8Array(width * height)
  for (let i = 0; i < mask.length; i++) mask[i] = (alpha[i * 4 + 3] ?? 0) > 40 ? 1 : 0
  const dist = distanceTransform(mask, width, height)

  // ---- pond basins (blurred so the banks slope)
  const pondRaw = context(width, height)
  pondRaw.fillStyle = '#000'
  for (const polygon of WATER) {
    tracePolygon(pondRaw, polygon)
    pondRaw.fill()
  }
  const pondBlur = context(width, height)
  pondBlur.filter = 'blur(6px)'
  pondBlur.drawImage(pondRaw.canvas, 0, 0)
  const pond = pondBlur.getImageData(0, 0, width, height).data

  const stride = NZ + 1
  const hillWeight = new Float32Array((NX + 1) * stride)
  const carve = new Float32Array((NX + 1) * stride)
  for (let xi = 0; xi <= NX; xi++) {
    for (let zi = 0; zi <= NZ; zi++) {
      const px = Math.min(xi * CELL, width - 1)
      const py = Math.min(zi * CELL, height - 1)
      const i = py * width + px
      const d = dist[i] ?? 0
      hillWeight[xi * stride + zi] = smooth(Math.min(Math.max(d / HILL_RAMP, 0), 1))
      const a = (pond[i * 4 + 3] ?? 0) / 255
      carve[xi * stride + zi] = Math.min(Math.max((a - 0.25) / 0.5, 0), 1)
    }
  }
  return { hillWeight, carve }
}
