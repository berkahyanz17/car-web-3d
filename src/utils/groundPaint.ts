import {
  BUILDINGS,
  COURT,
  FOREST,
  GARDEN,
  MAP_H,
  MAP_W,
  OVAL,
  PARKING,
  ROADS,
  SOIL,
  WATER,
} from '../data/jatinangor'
import { GROUND_D, GROUND_W, createRng } from './terrainMath'

/** Texture resolution of the painted ground (also used by the minimap). */
export const PX_PER_M = 2

const GRASS = '#93c97a'
const GRASS_ALT = '#82bb6b'
const FOREST_GREEN = '#4c9b57'
const SOIL_BROWN = '#c8a771'
const ASPHALT = '#8d9298'
const ASPHALT_EDGE = '#6c7176'
const WATER_BED = '#2d6a99'
const SHORE = '#d7c79a'
const PLAZA = '#d8d1be'
const COURT_RED = '#c2563a'

let cached: HTMLCanvasElement | null = null

function pathFlat(ctx: CanvasRenderingContext2D, flat: ReadonlyArray<number>, close: boolean) {
  for (let i = 0; i < flat.length; i += 2) {
    const x = flat[i] ?? 0
    const y = flat[i + 1] ?? 0
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  if (close) ctx.closePath()
}

function smoothRoad(ctx: CanvasRenderingContext2D, pts: ReadonlyArray<number>) {
  ctx.beginPath()
  ctx.moveTo(pts[0] ?? 0, pts[1] ?? 0)
  const n = pts.length / 2
  for (let i = 1; i < n - 1; i++) {
    const x = pts[i * 2] ?? 0
    const y = pts[i * 2 + 1] ?? 0
    const nx = pts[i * 2 + 2] ?? x
    const ny = pts[i * 2 + 3] ?? y
    ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2)
  }
  ctx.lineTo(pts[(n - 1) * 2] ?? 0, pts[(n - 1) * 2 + 1] ?? 0)
}

function roofColor(kind: string, explicit: string | undefined, facade: string | undefined): string {
  if (explicit) return explicit
  if (kind === 'shed') return '#b5472f'
  if (kind === 'round') return '#d9d4c7'
  return facade === 'navy' ? '#c9b998' : '#cdbfa5'
}

/** Paints the whole campus top-down: grass, forest, soil, ponds, roads, plazas and building roofs. */
export function getGroundCanvas(): HTMLCanvasElement {
  if (cached) return cached
  const S = PX_PER_M
  const canvas = document.createElement('canvas')
  canvas.width = GROUND_W * S
  canvas.height = GROUND_D * S
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas is not available')

  // Everything below is drawn in map pixels (= metres), origin at the photo's top-left.
  const toMap = () => ctx.setTransform(S, 0, 0, S, S * (GROUND_W - MAP_W) / 2, S * (GROUND_D - MAP_H) / 2)
  ctx.fillStyle = GRASS
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Forest frame around the playable area (soft edge).
  ctx.save()
  ctx.filter = 'blur(26px)'
  ctx.strokeStyle = FOREST_GREEN
  ctx.lineWidth = 2 * S * 95
  ctx.strokeRect(0, 0, canvas.width, canvas.height)
  ctx.restore()

  toMap()
  // Soft lawn mottling
  const rng = createRng(5)
  ctx.fillStyle = GRASS_ALT
  ctx.globalAlpha = 0.5
  for (let i = 0; i < 260; i++) {
    ctx.beginPath()
    ctx.arc(rng() * MAP_W, rng() * MAP_H, 5 + rng() * 14, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  // Forest patches traced from the drone photo (even-odd so holes stay open)
  ctx.fillStyle = FOREST_GREEN
  ctx.beginPath()
  for (const polygon of FOREST) pathFlat(ctx, polygon, true)
  ctx.fill('evenodd')

  ctx.fillStyle = SOIL_BROWN
  ctx.beginPath()
  for (const polygon of SOIL) pathFlat(ctx, polygon, true)
  ctx.fill('evenodd')

  // Ponds
  for (const polygon of WATER) {
    ctx.beginPath()
    pathFlat(ctx, polygon, true)
    ctx.fillStyle = WATER_BED
    ctx.fill()
    ctx.lineWidth = 3
    ctx.strokeStyle = SHORE
    ctx.lineJoin = 'round'
    ctx.stroke()
  }

  // Roads
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const road of ROADS) {
    smoothRoad(ctx, road.pts)
    ctx.lineWidth = road.width + 1.8
    ctx.strokeStyle = ASPHALT_EDGE
    ctx.stroke()
  }
  for (const road of ROADS) {
    smoothRoad(ctx, road.pts)
    ctx.lineWidth = road.width
    ctx.strokeStyle = ASPHALT
    ctx.stroke()
  }
  ctx.lineCap = 'butt'
  ctx.setLineDash([4, 6])
  ctx.lineWidth = 0.5
  ctx.strokeStyle = 'rgba(240,240,240,0.8)'
  for (const road of ROADS) {
    if (road.width < 7) continue
    smoothRoad(ctx, road.pts)
    ctx.stroke()
  }
  ctx.setLineDash([])

  // Parking lot beside the Rektorat (spawn)
  ctx.beginPath()
  pathFlat(ctx, PARKING, true)
  ctx.fillStyle = '#a2a8ae'
  ctx.fill()
  ctx.strokeStyle = ASPHALT_EDGE
  ctx.lineWidth = 1
  ctx.stroke()

  // Herbal garden with plaza
  ctx.fillStyle = PLAZA
  ctx.beginPath()
  ctx.arc(GARDEN.cx, GARDEN.cy, GARDEN.r_plaza, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#78b865'
  ctx.beginPath()
  ctx.arc(GARDEN.cx, GARDEN.cy, GARDEN.r_garden, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = PLAZA
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.arc(GARDEN.cx, GARDEN.cy, GARDEN.r_garden * 0.5, 0, Math.PI * 2)
  ctx.stroke()

  // Sports court
  ctx.save()
  ctx.translate(COURT.cx, COURT.cy)
  ctx.rotate((COURT.theta * Math.PI) / 180)
  ctx.fillStyle = COURT_RED
  ctx.fillRect(-COURT.w / 2, -COURT.d / 2, COURT.w, COURT.d)
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  ctx.lineWidth = 0.5
  ctx.strokeRect(-COURT.w / 2 + 2, -COURT.d / 2 + 2, COURT.w - 4, COURT.d - 4)
  ctx.beginPath()
  ctx.moveTo(0, -COURT.d / 2 + 2)
  ctx.lineTo(0, COURT.d / 2 - 2)
  ctx.stroke()
  ctx.restore()

  // Oval arena
  ctx.fillStyle = '#6fae5c'
  ctx.beginPath()
  ctx.ellipse(OVAL.cx, OVAL.cy, OVAL.rx, OVAL.ry, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#8a8a7e'
  ctx.lineWidth = 2.4
  ctx.stroke()

  // Building roofs (3D buildings cover these in the world; they make the minimap readable)
  for (const b of BUILDINGS) {
    ctx.save()
    ctx.translate(b.x, b.y)
    ctx.rotate((b.theta * Math.PI) / 180)
    ctx.fillStyle = 'rgba(0,0,0,0.18)'
    if (b.kind === 'round') {
      ctx.beginPath()
      ctx.arc(1.5, 1.5, b.w / 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = roofColor(b.kind, b.roofColor, b.facade)
      ctx.beginPath()
      ctx.arc(0, 0, b.w / 2, 0, Math.PI * 2)
      ctx.fill()
    } else {
      const parts = b.parts ?? [[0, 0, b.w, b.d] as const]
      for (const [lx, lz, w, d] of parts) ctx.fillRect(lx - w / 2 + 1.5, lz - d / 2 + 1.5, w, d)
      ctx.fillStyle = roofColor(b.kind, b.roofColor, b.facade)
      for (const [lx, lz, w, d] of parts) ctx.fillRect(lx - w / 2, lz - d / 2, w, d)
    }
    ctx.restore()
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  cached = canvas
  return canvas
}
