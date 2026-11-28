import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  ExtrudeGeometry,
  MeshStandardMaterial,
  RepeatWrapping,
  Shape,
  SRGBColorSpace,
} from 'three'
import { BUILDINGS } from '../data/jatinangor'
import type { BuildingSpec } from '../data/campusTypes'
import { atmosphere } from '../store/atmosphere'
import { mapToWorld } from '../utils/campusCoords'

type FacadeKind = 'navy' | 'light' | 'dorm'

const TILE_W = 4 // metres of facade per texture tile
const TILE_H = 3.6
const WALL_CREAM = '#ebe2cd'
const SHED_ROOF = '#b8503a'
const BLOCK_ROOF = '#c9b998'

const FACADE_STYLE: Record<FacadeKind, { wall: string; glass: string; frame: string }> = {
  navy: { wall: '#2c3555', glass: '#f0d98a', frame: '#1c2238' }, // render: dark facade, yellow window bands
  light: { wall: '#e8e2d2', glass: '#6d8fb0', frame: '#c9c0aa' },
  dorm: { wall: '#cbb9a2', glass: '#56657a', frame: '#a99880' },
}

interface Facade {
  material: MeshStandardMaterial
  /** Texture tiles so windows are not cut in half. */
  textures: CanvasTexture[]
}

function makeFacadeTextures(kind: FacadeKind): { map: CanvasTexture; glow: CanvasTexture } {
  const style = FACADE_STYLE[kind]
  const size = 128
  const draw = (wall: string, glass: string, frame: string) => {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas is not available')
    ctx.fillStyle = wall
    ctx.fillRect(0, 0, size, size)
    // one floor: a band of two windows
    ctx.fillStyle = frame
    ctx.fillRect(6, 30, size - 12, 66)
    ctx.fillStyle = glass
    ctx.fillRect(10, 34, 50, 58)
    ctx.fillRect(68, 34, 50, 58)
    const texture = new CanvasTexture(canvas)
    texture.wrapS = RepeatWrapping
    texture.wrapT = RepeatWrapping
    texture.colorSpace = SRGBColorSpace
    texture.anisotropy = 4
    return texture
  }
  return { map: draw(style.wall, style.glass, style.frame), glow: draw('#000000', '#ffe2a0', '#000000') }
}

function makeFacade(kind: FacadeKind): Facade {
  const { map, glow } = makeFacadeTextures(kind)
  const material = new MeshStandardMaterial({
    map,
    emissive: new Color('#ffffff'),
    emissiveMap: glow,
    emissiveIntensity: 0,
    flatShading: true,
  })
  return { material, textures: [map, glow] }
}

/** Box whose side faces repeat the facade texture once per floor / bay. */
function facadeBox(w: number, h: number, d: number): BoxGeometry {
  const geometry = new BoxGeometry(w, h, d)
  const uv = geometry.attributes.uv
  const rows = Math.max(1, Math.round(h / TILE_H))
  const scaleFace = (face: number, across: number) => {
    const cols = Math.max(1, Math.round(across / TILE_W))
    for (let i = face * 4; i < face * 4 + 4; i++) {
      uv.setXY(i, uv.getX(i) * cols, uv.getY(i) * rows)
    }
  }
  scaleFace(0, d) // +x
  scaleFace(1, d) // -x
  scaleFace(4, w) // +z
  scaleFace(5, w) // -z
  return geometry
}

function gableRoofGeometry(length: number, span: number, rise: number): BufferGeometry {
  const profile = new Shape()
  profile.moveTo(-span / 2, 0)
  profile.lineTo(span / 2, 0)
  profile.lineTo(0, rise)
  profile.closePath()
  const geometry = new ExtrudeGeometry(profile, { depth: length, bevelEnabled: false })
  geometry.translate(0, 0, -length / 2) // ridge runs along local Z, centred
  return geometry
}

interface BuildingProps {
  spec: BuildingSpec
  facades: Record<FacadeKind, Facade>
}

function Building({ spec, facades }: BuildingProps) {
  const [wx, wz] = mapToWorld(spec.x, spec.y)
  const rotationY = (-spec.theta * Math.PI) / 180
  const parts = spec.parts ?? [[0, 0, spec.w, spec.d] as const]
  const facade = facades[spec.facade ?? (spec.kind === 'hip' || spec.kind === 'round' ? 'light' : 'navy')]

  const geometries = useMemo(() => {
    if (spec.kind === 'block') {
      return parts.map(([, , w, d]) => facadeBox(w, spec.h, d))
    }
    return []
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec])
  useEffect(() => () => geometries.forEach((geometry) => geometry.dispose()), [geometries])

  const roofGeometry = useMemo(() => {
    if (spec.kind !== 'shed') return null
    const alongX = spec.w >= spec.d
    const length = (alongX ? spec.w : spec.d) + 1.2
    const span = (alongX ? spec.d : spec.w) + 1.4
    return { geometry: gableRoofGeometry(length, span, 2.3), alongX }
  }, [spec])
  useEffect(() => () => roofGeometry?.geometry.dispose(), [roofGeometry])

  const roofMaterials = useMemo(() => {
    const top = new MeshStandardMaterial({ color: BLOCK_ROOF, flatShading: true })
    const plain = new MeshStandardMaterial({ color: '#777', flatShading: true })
    return { top, plain }
  }, [])
  useEffect(
    () => () => {
      roofMaterials.top.dispose()
      roofMaterials.plain.dispose()
    },
    [roofMaterials],
  )

  return (
    <RigidBody type="fixed" colliders={false} position={[wx, 0, wz]} rotation={[0, rotationY, 0]}>
      {spec.kind === 'round' ? (
        <>
          <CylinderCollider args={[spec.h / 2, spec.w / 2]} position={[0, spec.h / 2, 0]} />
          <mesh castShadow receiveShadow position={[0, spec.h / 2, 0]}>
            <cylinderGeometry args={[spec.w / 2, spec.w / 2, spec.h, 28]} />
            <meshStandardMaterial color={WALL_CREAM} flatShading />
          </mesh>
          {/* window band */}
          <mesh position={[0, spec.h * 0.55, 0]}>
            <cylinderGeometry args={[spec.w / 2 + 0.05, spec.w / 2 + 0.05, spec.h * 0.3, 28, 1, true]} />
            <meshStandardMaterial color="#5f7f9c" flatShading side={2} />
          </mesh>
          {spec.roof === 'cone' ? (
            <mesh castShadow position={[0, spec.h + 2, 0]}>
              <coneGeometry args={[spec.w / 2 + 0.9, 4, 16]} />
              <meshStandardMaterial color={spec.roofColor ?? SHED_ROOF} flatShading />
            </mesh>
          ) : (
            <>
              <mesh castShadow position={[0, spec.h + 0.3, 0]}>
                <cylinderGeometry args={[spec.w / 2 + 0.4, spec.w / 2 + 0.4, 0.6, 28]} />
                <meshStandardMaterial color="#d9d4c7" flatShading />
              </mesh>
              <mesh castShadow position={[0, spec.h + 1.2, 0]}>
                <cylinderGeometry args={[spec.w / 2 - 4, spec.w / 2 - 4, 1.2, 28]} />
                <meshStandardMaterial color="#b9b3a4" flatShading />
              </mesh>
            </>
          )}
        </>
      ) : (
        parts.map(([lx, lz, w, d], i) => (
          <group key={i} position={[lx, 0, lz]}>
            <CuboidCollider args={[w / 2, spec.h / 2, d / 2]} position={[0, spec.h / 2, 0]} />
            {spec.kind === 'block' ? (
              <>
                <mesh
                  castShadow
                  receiveShadow
                  geometry={geometries[i]}
                  material={[
                    facade.material,
                    facade.material,
                    roofMaterials.top,
                    roofMaterials.plain,
                    facade.material,
                    facade.material,
                  ]}
                  position={[0, spec.h / 2, 0]}
                />
                {/* parapet cap, as in the render */}
                <mesh castShadow position={[0, spec.h + 0.25, 0]}>
                  <boxGeometry args={[w + 0.8, 0.5, d + 0.8]} />
                  <meshStandardMaterial color="#d6c7a8" flatShading />
                </mesh>
              </>
            ) : (
              <>
                <mesh castShadow receiveShadow position={[0, spec.h / 2, 0]}>
                  <boxGeometry args={[w, spec.h, d]} />
                  <meshStandardMaterial color={WALL_CREAM} flatShading />
                </mesh>
                {spec.kind === 'shed' && roofGeometry ? (
                  <mesh
                    castShadow
                    geometry={roofGeometry.geometry}
                    position={[0, spec.h, 0]}
                    rotation={[0, roofGeometry.alongX ? Math.PI / 2 : 0, 0]}
                  >
                    <meshStandardMaterial color={spec.roofColor ?? SHED_ROOF} flatShading />
                  </mesh>
                ) : null}
                {spec.kind === 'hip' ? (
                  // Square pyramid roof: 4-sided cone turned 45 degrees so its base is axis-aligned.
                  <mesh castShadow position={[0, spec.h + spec.h * 0.35, 0]} rotation={[0, Math.PI / 4, 0]} scale={[w + 1.4, spec.h * 0.7, d + 1.4]}>
                    <coneGeometry args={[Math.SQRT1_2, 1, 4]} />
                    <meshStandardMaterial color={spec.roofColor ?? '#a98660'} flatShading />
                  </mesh>
                ) : null}
              </>
            )}
          </group>
        ))
      )}
    </RigidBody>
  )
}

/** All campus buildings (visual primitives + simple box/cylinder colliders). */
export function Buildings() {
  const facades = useMemo<Record<FacadeKind, Facade>>(
    () => ({ navy: makeFacade('navy'), light: makeFacade('light'), dorm: makeFacade('dorm') }),
    [],
  )
  useEffect(
    () => () => {
      for (const facade of Object.values(facades)) {
        facade.material.dispose()
        facade.textures.forEach((texture) => texture.dispose())
      }
    },
    [facades],
  )

  // Windows glow at night.
  useFrame(() => {
    const glow = atmosphere.night * 1.1
    for (const facade of Object.values(facades)) facade.material.emissiveIntensity = glow
  })

  return (
    <>
      {BUILDINGS.map((spec) => (
        <Building key={spec.id} spec={spec} facades={facades} />
      ))}
    </>
  )
}
