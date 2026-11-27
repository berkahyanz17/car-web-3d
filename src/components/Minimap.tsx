import { useEffect, useRef } from 'react'
import { Quaternion, Vector3 } from 'three'
import { atmosphere } from '../store/atmosphere'
import { useGameStore } from '../store/useGameStore'
import { TERRAIN_SIZE, type HeightFn } from '../utils/terrainMath'
import { RAMPS, RAMP_HALF } from './Terrain'

const SIZE = 168 // css px
const VIEW_PX_PER_M = 1.3 // zoom: radius 84 px ~ 65 m
const BAKE_PX_PER_M = 1.5 // resolution of the baked terrain image

const LOW = [58, 120, 66] as const
const HIGH = [186, 214, 140] as const

/** Bakes terrain shading, trees and ramps into one static image (re-run only when they change). */
function bakeMap(heightFn: HeightFn, trees: ReadonlyArray<{ x: number; z: number }>): HTMLCanvasElement {
  const px = Math.round(TERRAIN_SIZE * BAKE_PX_PER_M)
  const canvas = document.createElement('canvas')
  canvas.width = px
  canvas.height = px
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  const toWorld = (i: number) => i / BAKE_PX_PER_M - TERRAIN_SIZE / 2
  const heights = new Float32Array(px * px)
  let min = Infinity
  let max = -Infinity
  for (let j = 0; j < px; j++) {
    for (let i = 0; i < px; i++) {
      const h = heightFn(toWorld(i), toWorld(j))
      heights[j * px + i] = h
      if (h < min) min = h
      if (h > max) max = h
    }
  }
  const range = Math.max(max - min, 1e-3)

  const image = ctx.createImageData(px, px)
  for (let j = 0; j < px; j++) {
    for (let i = 0; i < px; i++) {
      const h = heights[j * px + i] ?? 0
      const t = (h - min) / range
      // Cheap hillshade: slope toward the light (up-left) brightens.
      const left = heights[j * px + Math.max(i - 1, 0)] ?? h
      const up = heights[Math.max(j - 1, 0) * px + i] ?? h
      const shade = 1 + Math.max(Math.min(((left - h) + (up - h)) * 0.35, 0.35), -0.35)
      const o = (j * px + i) * 4
      for (let c = 0; c < 3; c++) {
        const value = (LOW[c] ?? 0) + ((HIGH[c] ?? 0) - (LOW[c] ?? 0)) * t
        image.data[o + c] = Math.max(0, Math.min(255, value * shade))
      }
      image.data[o + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)

  const toPx = (v: number) => (v + TERRAIN_SIZE / 2) * BAKE_PX_PER_M

  // Ramps (plan view)
  ctx.fillStyle = '#e0a458'
  for (const ramp of RAMPS) {
    ctx.save()
    ctx.translate(toPx(ramp.position[0]), toPx(ramp.position[1]))
    ctx.rotate(-ramp.rotationY)
    const length = RAMP_HALF[2] * 2 * Math.cos((ramp.angleDeg * Math.PI) / 180)
    ctx.fillRect(
      -RAMP_HALF[0] * BAKE_PX_PER_M,
      (-length / 2) * BAKE_PX_PER_M,
      RAMP_HALF[0] * 2 * BAKE_PX_PER_M,
      length * BAKE_PX_PER_M,
    )
    ctx.restore()
  }

  // Trees
  ctx.fillStyle = '#1f5a36'
  for (const tree of trees) {
    ctx.beginPath()
    ctx.arc(toPx(tree.x), toPx(tree.z), 1.6, 0, Math.PI * 2)
    ctx.fill()
  }
  return canvas
}

const pos = new Vector3()
const quat = new Quaternion()
const forward = new Vector3()

/** Heading-up circular minimap drawn on a 2D canvas (outside the R3F canvas). */
export function Minimap() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const baked = useRef<HTMLCanvasElement | null>(null)

  // Re-bake whenever terrain or trees change.
  useEffect(() => {
    const rebuild = () => {
      const { mapTerrain, mapTrees } = useGameStore.getState()
      baked.current = mapTerrain ? bakeMap(mapTerrain.heightFn, mapTrees) : null
    }
    rebuild()
    return useGameStore.subscribe((state, previous) => {
      if (state.mapTerrain !== previous.mapTerrain || state.mapTrees !== previous.mapTrees) rebuild()
    })
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = SIZE * dpr
    canvas.height = SIZE * dpr
    const c = SIZE / 2
    let raf = 0

    const draw = () => {
      raf = requestAnimationFrame(draw)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, SIZE, SIZE)

      const car = useGameStore.getState().chassis
      const map = baked.current
      if (!car || !map) return

      car.getWorldPosition(pos)
      car.getWorldQuaternion(quat)
      forward.set(0, 0, -1).applyQuaternion(quat)
      const theta = -Math.PI / 2 - Math.atan2(forward.z, forward.x) // rotate so forward points up

      ctx.save()
      ctx.beginPath()
      ctx.arc(c, c, c - 2, 0, Math.PI * 2)
      ctx.clip()
      ctx.fillStyle = '#2f5d39'
      ctx.fillRect(0, 0, SIZE, SIZE)

      ctx.translate(c, c)
      ctx.rotate(theta)
      const k = VIEW_PX_PER_M / BAKE_PX_PER_M
      ctx.scale(k, k)
      ctx.drawImage(
        map,
        -(pos.x + TERRAIN_SIZE / 2) * BAKE_PX_PER_M,
        -(pos.z + TERRAIN_SIZE / 2) * BAKE_PX_PER_M,
      )
      ctx.restore()

      // Night tint
      if (atmosphere.night > 0.01) {
        ctx.save()
        ctx.beginPath()
        ctx.arc(c, c, c - 2, 0, Math.PI * 2)
        ctx.clip()
        ctx.fillStyle = `rgba(6, 12, 40, ${0.5 * atmosphere.night})`
        ctx.fillRect(0, 0, SIZE, SIZE)
        ctx.restore()
      }

      // Car marker (always pointing up)
      ctx.save()
      ctx.translate(c, c)
      ctx.fillStyle = '#e63946'
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(0, -8)
      ctx.lineTo(5.5, 7)
      ctx.lineTo(0, 4)
      ctx.lineTo(-5.5, 7)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.restore()

      // Ring + north marker
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.beginPath()
      ctx.arc(c, c, c - 2, 0, Math.PI * 2)
      ctx.stroke()
      const nx = c + Math.sin(theta) * (c - 14)
      const ny = c - Math.cos(theta) * (c - 14)
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 12px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('N', nx, ny)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        left: 12,
        top: 12,
        width: SIZE,
        height: SIZE,
        borderRadius: '50%',
        boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
        pointerEvents: 'none',
      }}
    />
  )
}
