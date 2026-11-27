import { useEffect, useMemo } from 'react'
import { CuboidCollider, HeightfieldCollider, RigidBody } from '@react-three/rapier'
import { useControls } from 'leva'
import { useGameStore } from '../store/useGameStore'
import { MathUtils, PlaneGeometry } from 'three'
import {
  TERRAIN_SEGMENTS,
  TERRAIN_SIZE,
  buildHeights,
  makeHeightFn,
  type HeightFn,
} from '../utils/terrainMath'

interface RampProps {
  position: [number, number]
  angleDeg: number
  rotationY?: number
}

export const RAMP_HALF: [number, number, number] = [3, 0.2, 5]

export const RAMPS: ReadonlyArray<{ position: [number, number]; angleDeg: number; rotationY: number }> = [
  { position: [0, -14], angleDeg: 14, rotationY: 0 },
  { position: [14, -22], angleDeg: 20, rotationY: 0.3 },
  { position: [-14, -20], angleDeg: 26, rotationY: -0.25 },
]

/** Box ramp: low end toward +Z, high end toward -Z (before rotationY). */
function Ramp({ position, angleDeg, rotationY = 0 }: RampProps) {
  const angle = MathUtils.degToRad(angleDeg)
  const [hx, hy, hz] = RAMP_HALF
  // Place so the top surface of the low end touches y = 0.
  const y = hz * Math.sin(angle) - hy * Math.cos(angle)
  return (
    <RigidBody type="fixed" colliders={false} position={[position[0], y, position[1]]} rotation={[0, rotationY, 0]}>
      <group rotation={[angle, 0, 0]}>
        <CuboidCollider args={RAMP_HALF} friction={1} />
        <mesh castShadow receiveShadow>
          <boxGeometry args={[hx * 2, hy * 2, hz * 2]} />
          <meshStandardMaterial color="#e0a458" flatShading />
        </mesh>
      </group>
    </RigidBody>
  )
}

export interface TerrainShape {
  heightFn: HeightFn
  /** Changes whenever the terrain is regenerated (used as a React key). */
  signature: string
}

/** Leva-controlled terrain parameters. Call once (in Scene) and share the result. */
export function useTerrainShape(): TerrainShape {
  const { seed, amplitude, frequency } = useControls('Terrain', {
    seed: { value: 1337, step: 1 },
    amplitude: { value: 8, min: 0, max: 25, step: 0.5, label: 'hill height' },
    frequency: { value: 0.03, min: 0.01, max: 0.08, step: 0.005, label: 'hill frequency' },
  })
  return useMemo(
    () => ({
      heightFn: makeHeightFn(seed, amplitude, frequency),
      signature: `${seed}-${amplitude}-${frequency}`,
    }),
    [seed, amplitude, frequency],
  )
}

export function Terrain({ heightFn, signature }: TerrainShape) {
  const heights = useMemo(() => buildHeights(heightFn, TERRAIN_SIZE, TERRAIN_SEGMENTS), [heightFn])

  // Visual mesh samples the exact same function as the collider.
  const geometry = useMemo(() => {
    const geo = new PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS)
    geo.rotateX(-Math.PI / 2)
    const position = geo.attributes.position
    for (let i = 0; i < position.count; i++) {
      position.setY(i, heightFn(position.getX(i), position.getZ(i)))
    }
    geo.computeVertexNormals()
    return geo
  }, [heightFn])
  useEffect(() => () => geometry.dispose(), [geometry])

  const setMapTerrain = useGameStore((state) => state.setMapTerrain)
  useEffect(() => {
    setMapTerrain({ heightFn, signature })
  }, [heightFn, signature, setMapTerrain])

  return (
    <>
      <RigidBody type="fixed" colliders={false}>
        {/* key forces a fresh collider when the terrain is regenerated */}
        <HeightfieldCollider
          key={signature}
          args={[
            TERRAIN_SEGMENTS,
            TERRAIN_SEGMENTS,
            heights,
            { x: TERRAIN_SIZE, y: 1, z: TERRAIN_SIZE },
          ]}
          friction={1}
        />
        <mesh geometry={geometry} receiveShadow castShadow>
          <meshStandardMaterial color="#6fb35f" flatShading />
        </mesh>
      </RigidBody>

      {/* Ramps sit inside the flat spawn area. */}
      {RAMPS.map((ramp, i) => (
        <Ramp key={i} position={ramp.position} angleDeg={ramp.angleDeg} rotationY={ramp.rotationY} />
      ))}
    </>
  )
}
