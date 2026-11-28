import { useEffect, useMemo } from 'react'
import { CuboidCollider, HeightfieldCollider, RigidBody } from '@react-three/rapier'
import { useControls } from 'leva'
import { CanvasTexture, MathUtils, PlaneGeometry, Shape, ShapeGeometry, SRGBColorSpace } from 'three'
import { RAMPS, WATER } from '../data/jatinangor'
import { buildTerrainFields } from '../utils/campusFields'
import { mapToWorld } from '../utils/campusCoords'
import { getGroundCanvas } from '../utils/groundPaint'
import {
  GROUND_D,
  GROUND_W,
  NX,
  NZ,
  buildHeights,
  makeHeightFn,
  type HeightFn,
} from '../utils/terrainMath'

const RAMP_HALF: [number, number, number] = [3, 0.2, 5]
const WATER_LEVEL = -0.35

interface RampProps {
  position: [number, number]
  angleDeg: number
  rotationY?: number
}

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
    amplitude: { value: 5, min: 0, max: 20, step: 0.5, label: 'hill height' },
    frequency: { value: 0.02, min: 0.005, max: 0.06, step: 0.005, label: 'hill frequency' },
  })
  const fields = useMemo(() => buildTerrainFields(), [])
  return useMemo(
    () => ({
      heightFn: makeHeightFn(seed, amplitude, frequency, fields),
      signature: `${seed}-${amplitude}-${frequency}`,
    }),
    [seed, amplitude, frequency, fields],
  )
}

export function Terrain({ heightFn, signature }: TerrainShape) {
  const heights = useMemo(() => buildHeights(heightFn), [heightFn])

  // Visual mesh samples the exact same function (on the same 4 m grid) as the collider.
  const geometry = useMemo(() => {
    const geo = new PlaneGeometry(GROUND_W, GROUND_D, NX, NZ)
    geo.rotateX(-Math.PI / 2)
    const position = geo.attributes.position
    for (let i = 0; i < position.count; i++) {
      position.setY(i, heightFn(position.getX(i), position.getZ(i)))
    }
    geo.computeVertexNormals()
    return geo
  }, [heightFn])
  useEffect(() => () => geometry.dispose(), [geometry])

  const texture = useMemo(() => {
    const map = new CanvasTexture(getGroundCanvas())
    map.colorSpace = SRGBColorSpace
    map.anisotropy = 8
    return map
  }, [])
  useEffect(() => () => texture.dispose(), [texture])

  const waterGeometries = useMemo(
    () =>
      WATER.map((polygon) => {
        const shape = new Shape()
        for (let i = 0; i < polygon.length; i += 2) {
          const [wx, wz] = mapToWorld(polygon[i] ?? 0, polygon[i + 1] ?? 0)
          if (i === 0) shape.moveTo(wx, -wz)
          else shape.lineTo(wx, -wz)
        }
        shape.closePath()
        const geo = new ShapeGeometry(shape)
        geo.rotateX(-Math.PI / 2) // (x, -z) in the shape plane -> (x, z) on the ground
        // Grow the sheet a little; the basin carve hides whatever pokes out.
        geo.scale(1.12, 1, 1.12)
        return geo
      }),
    [],
  )
  useEffect(() => () => waterGeometries.forEach((geo) => geo.dispose()), [waterGeometries])

  const halfW = GROUND_W / 2
  const halfD = GROUND_D / 2

  return (
    <>
      <RigidBody type="fixed" colliders={false}>
        {/* key forces a fresh collider when the terrain is regenerated.
            Rapier rows run along Z: nrows = NZ, ncols = NX, index = xi * (NZ + 1) + zi. */}
        <HeightfieldCollider
          key={signature}
          args={[NZ, NX, heights, { x: GROUND_W, y: 1, z: GROUND_D }]}
          friction={1}
        />
        <mesh geometry={geometry} receiveShadow>
          <meshStandardMaterial map={texture} flatShading />
        </mesh>

        {/* Invisible walls so nothing leaves the map */}
        <CuboidCollider args={[halfW + 2, 25, 1]} position={[0, 10, -halfD - 1]} />
        <CuboidCollider args={[halfW + 2, 25, 1]} position={[0, 10, halfD + 1]} />
        <CuboidCollider args={[1, 25, halfD + 2]} position={[-halfW - 1, 10, 0]} />
        <CuboidCollider args={[1, 25, halfD + 2]} position={[halfW + 1, 10, 0]} />
      </RigidBody>

      {waterGeometries.map((geo, i) => (
        <mesh key={i} geometry={geo} position={[0, WATER_LEVEL, 0]}>
          <meshStandardMaterial color="#3f88c5" transparent opacity={0.8} roughness={0.25} />
        </mesh>
      ))}

      {RAMPS.map((ramp, i) => {
        const [wx, wz] = mapToWorld(ramp.x, ramp.y)
        return (
          <Ramp
            key={i}
            position={[wx, wz]}
            angleDeg={Math.abs(ramp.tilt)}
            rotationY={ramp.tilt < 0 ? Math.PI : 0}
          />
        )
      })}
    </>
  )
}
