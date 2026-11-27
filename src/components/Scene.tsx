import { Suspense, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { useControls } from 'leva'
import {
  AmbientLight,
  BackSide,
  Color,
  Fog,
  MathUtils,
  Vector3,
  type DirectionalLight,
  type Mesh,
  type MeshBasicMaterial,
  type Points,
  type PointsMaterial,
} from 'three'
import { atmosphere } from '../store/atmosphere'
import { useGameStore } from '../store/useGameStore'
import { createRng } from '../utils/terrainMath'
import { Car } from './Car'
import { CameraRig } from './CameraRig'
import { Letters } from './Letters'
import { Terrain, useTerrainShape } from './Terrain'
import { Trees } from './Trees'

/** Noon / night palettes. Everything blends between them with `atmosphere.night`. */
const DAY = {
  skyTop: new Color('#5aa9e6'),
  horizon: new Color('#d9eefc'),
  ambient: new Color('#ffffff'),
  ambientIntensity: 0.7,
  sun: new Color('#fff4e0'),
  sunIntensity: 2.2,
  fogNear: 70,
  fogFar: 240,
  bodyColor: new Color('#fff3b0'),
  bodyScale: 18,
}
const NIGHT = {
  skyTop: new Color('#03061a'),
  horizon: new Color('#101a3c'),
  ambient: new Color('#7f8fd0'),
  ambientIntensity: 0.28,
  sun: new Color('#9db3ff'),
  sunIntensity: 0.55,
  fogNear: 25,
  fogFar: 150,
  bodyColor: new Color('#e8edff'),
  bodyScale: 9,
}

const scratchColor = new Color()

/** Advances the blend toward the chosen time of day, then drives ambient light and fog. */
function Atmosphere() {
  const ambientRef = useRef<AmbientLight>(null)
  const scene = useThree((state) => state.scene)

  useFrame((_, delta) => {
    const target = useGameStore.getState().isNight ? 1 : 0
    atmosphere.night += (target - atmosphere.night) * (1 - Math.exp(-2.5 * Math.min(delta, 0.1)))
    if (Math.abs(target - atmosphere.night) < 0.001) atmosphere.night = target
    const n = atmosphere.night

    const ambient = ambientRef.current
    if (ambient) {
      ambient.color.copy(DAY.ambient).lerp(NIGHT.ambient, n)
      ambient.intensity = MathUtils.lerp(DAY.ambientIntensity, NIGHT.ambientIntensity, n)
    }
    if (scene.fog instanceof Fog) {
      scene.fog.color.copy(DAY.horizon).lerp(NIGHT.horizon, n)
      scene.fog.near = MathUtils.lerp(DAY.fogNear, NIGHT.fogNear, n)
      scene.fog.far = MathUtils.lerp(DAY.fogFar, NIGHT.fogFar, n)
    }
  }, -100)

  return (
    <>
      <fog attach="fog" args={[DAY.horizon, DAY.fogNear, DAY.fogFar]} />
      <ambientLight ref={ambientRef} intensity={DAY.ambientIntensity} />
    </>
  )
}

const LIGHT_OFFSET = new Vector3(18, 30, 12)
const BODY_DIRECTION = LIGHT_OFFSET.clone().normalize()

/** Gradient sky dome, plus a sun/moon disc and night stars, all following the camera. */
function Sky() {
  const domeRef = useRef<Mesh>(null)
  const bodyRef = useRef<Mesh>(null)
  const starsRef = useRef<Points>(null)

  const uniforms = useMemo(
    () => ({ top: { value: new Color(DAY.skyTop) }, horizon: { value: new Color(DAY.horizon) } }),
    [],
  )
  const starPositions = useMemo(() => {
    const rng = createRng(7)
    const positions = new Float32Array(600 * 3)
    for (let i = 0; i < 600; i++) {
      const theta = rng() * Math.PI * 2
      const y = 0.08 + rng() * 0.92 // upper hemisphere only
      const r = Math.sqrt(1 - y * y)
      positions[i * 3] = Math.cos(theta) * r * 420
      positions[i * 3 + 1] = y * 420
      positions[i * 3 + 2] = Math.sin(theta) * r * 420
    }
    return positions
  }, [])

  useFrame((state) => {
    const n = atmosphere.night
    const cam = state.camera.position
    domeRef.current?.position.copy(cam)

    uniforms.top.value.copy(DAY.skyTop).lerp(NIGHT.skyTop, n)
    uniforms.horizon.value.copy(DAY.horizon).lerp(NIGHT.horizon, n)

    const body = bodyRef.current
    if (body) {
      body.position.copy(cam).addScaledVector(BODY_DIRECTION, 380)
      body.scale.setScalar(MathUtils.lerp(DAY.bodyScale, NIGHT.bodyScale, n))
      ;(body.material as MeshBasicMaterial).color.copy(DAY.bodyColor).lerp(NIGHT.bodyColor, n)
    }

    const stars = starsRef.current
    if (stars) {
      stars.position.copy(cam)
      stars.visible = n > 0.02
      ;(stars.material as PointsMaterial).opacity = MathUtils.smoothstep(n, 0.3, 1)
    }
  })

  return (
    <>
      <mesh ref={domeRef} renderOrder={-3} frustumCulled={false}>
        <sphereGeometry args={[450, 24, 12]} />
        <shaderMaterial
          side={BackSide}
          depthWrite={false}
          fog={false}
          toneMapped={false}
          uniforms={uniforms}
          vertexShader={/* glsl */ `
            varying float vHeight;
            void main() {
              vHeight = normalize(position).y;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `}
          fragmentShader={/* glsl */ `
            uniform vec3 top;
            uniform vec3 horizon;
            varying float vHeight;
            void main() {
              float t = smoothstep(0.0, 0.55, vHeight);
              gl_FragColor = vec4(mix(horizon, top, t), 1.0);
              #include <colorspace_fragment>
            }
          `}
        />
      </mesh>

      <points ref={starsRef} renderOrder={-2} frustumCulled={false} visible={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[starPositions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color="#ffffff"
          size={1.8}
          sizeAttenuation={false}
          transparent
          opacity={0}
          depthWrite={false}
          fog={false}
          toneMapped={false}
        />
      </points>

      {/* Sun at noon, moon at night */}
      <mesh ref={bodyRef} renderOrder={-1} frustumCulled={false}>
        <sphereGeometry args={[1, 16, 12]} />
        <meshBasicMaterial fog={false} toneMapped={false} depthWrite={false} />
      </mesh>
    </>
  )
}

const SHADOW_EXTENT = 30
const SHADOW_MAP_SIZE = 1024
const TEXEL = (SHADOW_EXTENT * 2) / SHADOW_MAP_SIZE
const carPos = new Vector3()

/** Sun/moon light whose small shadow frustum follows the car (texel-snapped to avoid shimmer). */
function ShadowLight() {
  const lightRef = useRef<DirectionalLight>(null)
  const scene = useThree((state) => state.scene)

  useEffect(() => {
    const light = lightRef.current
    if (!light) return
    scene.add(light.target)
    return () => {
      scene.remove(light.target)
    }
  }, [scene])

  useFrame(() => {
    const light = lightRef.current
    const car = useGameStore.getState().chassis
    if (!light || !car) return
    car.getWorldPosition(carPos)
    const x = Math.round(carPos.x / TEXEL) * TEXEL
    const z = Math.round(carPos.z / TEXEL) * TEXEL
    light.target.position.set(x, 0, z)
    light.target.updateMatrixWorld()
    light.position.set(x + LIGHT_OFFSET.x, LIGHT_OFFSET.y, z + LIGHT_OFFSET.z)

    const n = atmosphere.night
    light.color.copy(scratchColor.copy(DAY.sun).lerp(NIGHT.sun, n))
    light.intensity = MathUtils.lerp(DAY.sunIntensity, NIGHT.sunIntensity, n)
  })

  return (
    <directionalLight
      ref={lightRef}
      intensity={DAY.sunIntensity}
      castShadow
      shadow-mapSize={[SHADOW_MAP_SIZE, SHADOW_MAP_SIZE]}
      shadow-camera-left={-SHADOW_EXTENT}
      shadow-camera-right={SHADOW_EXTENT}
      shadow-camera-top={SHADOW_EXTENT}
      shadow-camera-bottom={-SHADOW_EXTENT}
      shadow-camera-near={1}
      shadow-camera-far={90}
      shadow-bias={-0.0004}
      shadow-normalBias={0.04}
    />
  )
}

export function Scene() {
  const { debug } = useControls('Scene', { debug: { value: false, label: 'physics debug' } })
  const terrain = useTerrainShape()

  return (
    <>
      <Atmosphere />
      <Sky />
      <ShadowLight />

      <Suspense fallback={null}>
        {/* Fixed 60 Hz step: the same simulation on 60 Hz and 144 Hz screens. */}
        <Physics gravity={[0, -9.81, 0]} timeStep={1 / 60} debug={debug}>
          <Terrain {...terrain} />
          <Trees heightFn={terrain.heightFn} signature={terrain.signature} />
          <Letters />
          <Car />
        </Physics>
      </Suspense>

      <CameraRig />
    </>
  )
}
