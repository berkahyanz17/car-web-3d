import { Canvas } from '@react-three/fiber'
import { Leva } from 'leva'
import { Minimap } from './components/Minimap'
import { Scene } from './components/Scene'
import { useGameStore } from './store/useGameStore'

export function App() {
  const isNight = useGameStore((state) => state.isNight)
  const toggleNight = useGameStore((state) => state.toggleNight)

  return (
    <>
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ fov: 55, near: 0.1, far: 600, position: [0, 6, 12] }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <Scene />
      </Canvas>
      <Leva collapsed />
      <Minimap />
      <button
        type="button"
        onClick={(event) => {
          toggleNight()
          event.currentTarget.blur() // keep Space for braking
        }}
        style={{
          position: 'fixed',
          left: 12,
          top: 190,
          padding: '6px 10px',
          border: 'none',
          borderRadius: 6,
          background: 'rgba(0,0,0,0.45)',
          color: '#fff',
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        {isNight ? '🌙 Night' : '☀️ Noon'} (N)
      </button>
      <div
        style={{
          position: 'fixed',
          left: 12,
          bottom: 12,
          padding: '6px 10px',
          borderRadius: 6,
          background: 'rgba(0,0,0,0.45)',
          color: '#fff',
          fontSize: 13,
          pointerEvents: 'none',
        }}
      >
        WASD / arrows: drive · Space: brake · R: reset · N: noon/night
      </div>
    </>
  )
}
