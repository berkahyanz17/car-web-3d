import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { Vector3 } from 'three'
import { BUILDINGS } from '../data/jatinangor'
import type { BuildingSpec, LabelCategory } from '../data/campusTypes'
import { useGameStore } from '../store/useGameStore'
import { mapToWorld } from '../utils/campusCoords'

/** Chip colours follow the legend of the ITB Jatinangor master plan. */
const CHIP: Record<LabelCategory, { bg: string; fg: string }> = {
  support: { bg: '#5ec4c2', fg: '#06302f' },
  prodi: { bg: '#b0705a', fg: '#ffffff' },
  eng: { bg: '#f0a868', fg: '#3a2209' },
  agri: { bg: '#7fd39c', fg: '#0b3319' },
  sport: { bg: '#e07a5f', fg: '#ffffff' },
}

const SHOW_DISTANCE = 80
const FADE_DISTANCE = 130
const carPos = new Vector3()

interface ChipProps {
  spec: BuildingSpec & { label: NonNullable<BuildingSpec['label']> }
}

function Chip({ spec }: ChipProps) {
  const ref = useRef<HTMLDivElement>(null)
  const last = useRef(-1)
  const [wx, wz] = mapToWorld(spec.x, spec.y)
  const top = spec.h + (spec.kind === 'shed' || spec.kind === 'hip' ? 6 : spec.kind === 'round' ? 6 : 3)

  useFrame(() => {
    const el = ref.current
    const car = useGameStore.getState().chassis
    if (!el || !car) return
    car.getWorldPosition(carPos)
    const d = Math.hypot(carPos.x - wx, carPos.z - wz)
    const opacity = d < SHOW_DISTANCE ? 1 : d > FADE_DISTANCE ? 0 : 1 - (d - SHOW_DISTANCE) / (FADE_DISTANCE - SHOW_DISTANCE)
    const bucket = Math.round(opacity * 20)
    if (bucket === last.current) return
    last.current = bucket
    el.style.opacity = String(bucket / 20)
    el.style.visibility = bucket === 0 ? 'hidden' : 'visible'
  })

  const colors = CHIP[spec.label.cat]
  return (
    <Html position={[wx, top, wz]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
      <div
        ref={ref}
        style={{
          background: colors.bg,
          color: colors.fg,
          padding: '3px 8px',
          borderRadius: 4,
          fontFamily: 'system-ui, sans-serif',
          fontSize: 12,
          fontWeight: 600,
          lineHeight: 1.25,
          textAlign: 'center',
          width: 'max-content',
          maxWidth: 150,
          boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
          opacity: 0,
          visibility: 'hidden',
          userSelect: 'none',
        }}
      >
        {spec.label.text}
      </div>
    </Html>
  )
}

/** Floating name chips (from the master plan) that appear as you drive near each building. */
export function Labels() {
  return (
    <>
      {BUILDINGS.filter((b): b is ChipProps['spec'] => b.label !== undefined).map((b) => (
        <Chip key={b.id} spec={b} />
      ))}
    </>
  )
}
