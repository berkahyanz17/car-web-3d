import { useEffect, useRef } from 'react'
import { Quaternion, Vector3 } from 'three'
import { atmosphere } from '../store/atmosphere'
import { useGameStore } from '../store/useGameStore'
import { PX_PER_M, getGroundCanvas } from '../utils/groundPaint'
import { GROUND_D, GROUND_W } from '../utils/terrainMath'

const SIZE = 168 // css px
const VIEW_PX_PER_M = 1.1 // zoom: the 168 px circle shows ~150 m

const pos = new Vector3()
const quat = new Quaternion()
const forward = new Vector3()

/** Heading-up circular minimap drawn on a 2D canvas (outside the R3F canvas). */
export function Minimap() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
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
      if (!car) return
      const map = getGroundCanvas() // painted once, shared with the ground texture

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
      const k = VIEW_PX_PER_M / PX_PER_M
      ctx.scale(k, k)
      ctx.drawImage(map, -(pos.x + GROUND_W / 2) * PX_PER_M, -(pos.z + GROUND_D / 2) * PX_PER_M)
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
