import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  CuboidCollider,
  RigidBody,
  useBeforePhysicsStep,
  useRapier,
  type RapierRigidBody,
} from '@react-three/rapier'
import { useControls } from 'leva'
import { MathUtils, Quaternion, Vector3, type Group, type SpotLight } from 'three'
import { SPAWN_PX } from '../data/jatinangor'
import { atmosphere } from '../store/atmosphere'
import { mapToWorld } from '../utils/campusCoords'
import { useKeyboard } from '../hooks/useKeyboard'
import { useGameStore } from '../store/useGameStore'

const [SPAWN_X, SPAWN_Z] = mapToWorld(...SPAWN_PX)
/** Parking lot beside the Rektorat; the car faces -Z (north, up the main road). */
export const SPAWN_POSITION: [number, number, number] = [SPAWN_X, 1.5, SPAWN_Z]

const CHASSIS_HALF: [number, number, number] = [0.8, 0.25, 1.6]
const WHEEL_RADIUS = 0.35
const WHEEL_WIDTH = 0.3
const SUSPENSION_REST = 0.35
const FALL_LIMIT_Y = -30
const HEADLIGHT_INTENSITY = 600

/** Car faces -Z. Wheel order: front-left, front-right, rear-left, rear-right. */
const WHEELS: ReadonlyArray<{ x: number; z: number; front: boolean }> = [
  { x: -0.95, z: -1.1, front: true },
  { x: 0.95, z: -1.1, front: true },
  { x: -0.95, z: 1.1, front: false },
  { x: 0.95, z: 1.1, front: false },
]

type RapierContext = ReturnType<typeof useRapier>
type Vehicle = ReturnType<RapierContext['world']['createVehicleController']>

const tmpQuat = new Quaternion()
const tmpVec = new Vector3()
const FORWARD = new Vector3(0, 0, -1)

export function Car() {
  const bodyRef = useRef<RapierRigidBody>(null)
  const visualRef = useRef<Group>(null)
  const wheelRefs = useRef<Array<Group | null>>([null, null, null, null])
  const vehicleRef = useRef<Vehicle | null>(null)
  const steerRef = useRef(0)
  const headlightRefs = useRef<Array<SpotLight | null>>([null, null])
  const forwardSpeedRef = useRef(0)
  const spinRef = useRef(0)
  const lastResetNonce = useRef(0)

  const keys = useKeyboard()
  const { world } = useRapier()
  const setChassis = useGameStore((state) => state.setChassis)

  const params = useControls('Car', {
    mass: { value: 200, min: 50, max: 1000, step: 10 },
    engineForce: { value: 260, min: 0, max: 1200, step: 10, label: 'engine force' },
    maxSpeed: { value: 28, min: 5, max: 80, step: 1, label: 'max speed (m/s)' },
    maxSteer: { value: 0.5, min: 0.1, max: 1, step: 0.01, label: 'max steer (rad)' },
    brakeForce: { value: 120, min: 0, max: 600, step: 5, label: 'brake force' },
    suspensionStiffness: { value: 30, min: 5, max: 120, step: 1, label: 'susp. stiffness' },
    suspensionTravel: { value: 0.3, min: 0.05, max: 1, step: 0.01, label: 'susp. travel' },
    suspensionCompression: { value: 2.4, min: 0.1, max: 10, step: 0.1, label: 'susp. compression' },
    suspensionRelaxation: { value: 2.8, min: 0.1, max: 10, step: 0.1, label: 'susp. relaxation' },
    grip: { value: 2.5, min: 0.5, max: 10, step: 0.1, label: 'tire grip' },
    angularDamping: { value: 0.6, min: 0, max: 5, step: 0.05, label: 'angular damping' },
  })
  // Physics callback runs outside React's render, so read tunables from a ref.
  const paramsRef = useRef(params)
  paramsRef.current = params

  // Expose the interpolated visual root to the camera rig and shadow light.
  useEffect(() => {
    setChassis(visualRef.current)
    return () => setChassis(null)
  }, [setChassis])

  // Create the raycast vehicle controller once the chassis body exists.
  useEffect(() => {
    const body = bodyRef.current
    if (!body) return

    const vehicle = world.createVehicleController(body)
    for (const wheel of WHEELS) {
      vehicle.addWheel(
        { x: wheel.x, y: 0, z: wheel.z },
        { x: 0, y: -1, z: 0 }, // suspension direction
        { x: -1, y: 0, z: 0 }, // axle
        SUSPENSION_REST,
        WHEEL_RADIUS,
      )
    }
    vehicleRef.current = vehicle

    return () => {
      vehicleRef.current = null
      world.removeVehicleController(vehicle)
    }
  }, [world])

  // Runs once per FIXED physics step (identical on 60 Hz and 144 Hz displays).
  useBeforePhysicsStep((physicsWorld) => {
    const body = bodyRef.current
    const vehicle = vehicleRef.current
    if (!body || !vehicle) return

    const p = paramsRef.current
    const dt = physicsWorld.timestep

    // Reset (R key) or fell off the map.
    const nonce = useGameStore.getState().resetNonce
    if (nonce !== lastResetNonce.current || body.translation().y < FALL_LIMIT_Y) {
      lastResetNonce.current = nonce
      body.setTranslation({ x: SPAWN_POSITION[0], y: SPAWN_POSITION[1], z: SPAWN_POSITION[2] }, true)
      body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
      body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      body.setAngvel({ x: 0, y: 0, z: 0 }, true)
      steerRef.current = 0
    }

    body.setAngularDamping(p.angularDamping)

    // Signed speed along the car's forward (-Z) axis.
    const q = body.rotation()
    tmpQuat.set(q.x, q.y, q.z, q.w)
    tmpVec.copy(FORWARD).applyQuaternion(tmpQuat)
    const lv = body.linvel()
    const forwardSpeed = tmpVec.x * lv.x + tmpVec.y * lv.y + tmpVec.z * lv.z

    forwardSpeedRef.current = forwardSpeed

    const input = keys.current
    const throttle = (input.forward ? 1 : 0) - (input.backward ? 1 : 0)
    const steerInput = (input.left ? 1 : 0) - (input.right ? 1 : 0)

    // Rapier: positive engine force pushes toward +Z, so forward (-Z) is negative.
    let engine = -throttle * p.engineForce
    if (throttle > 0 && forwardSpeed > p.maxSpeed) engine = 0
    if (throttle < 0 && -forwardSpeed > p.maxSpeed * 0.4) engine = 0
    if (input.brake) engine = 0

    // Less steering lock at speed, smoothed toward the target.
    const speedFactor = 1 - 0.6 * Math.min(Math.abs(forwardSpeed) / p.maxSpeed, 1)
    const targetSteer = steerInput * p.maxSteer * speedFactor
    steerRef.current = MathUtils.lerp(steerRef.current, targetSteer, Math.min(1, dt * 10))

    for (let i = 0; i < WHEELS.length; i++) {
      vehicle.setWheelEngineForce(i, engine)
      vehicle.setWheelBrake(i, input.brake ? p.brakeForce : 0)
      if (WHEELS[i]?.front) vehicle.setWheelSteering(i, steerRef.current)
      vehicle.setWheelSuspensionStiffness(i, p.suspensionStiffness)
      vehicle.setWheelMaxSuspensionTravel(i, p.suspensionTravel)
      vehicle.setWheelSuspensionCompression(i, p.suspensionCompression)
      vehicle.setWheelSuspensionRelaxation(i, p.suspensionRelaxation)
      vehicle.setWheelFrictionSlip(i, p.grip)
    }

    vehicle.updateVehicle(dt)
  })

  // Visual wheel pose (suspension travel, steering, spin).
  // Headlight spot targets live in the chassis group so they swing with the car.
  useEffect(() => {
    const group = visualRef.current
    if (!group) return
    const lights = headlightRefs.current
    lights.forEach((light, i) => {
      if (!light) return
      light.target.position.set(i === 0 ? -0.5 : 0.5, -1.2, -16)
      group.add(light.target)
    })
    return () => {
      lights.forEach((light) => {
        if (light) group.remove(light.target)
      })
    }
  }, [])

  useFrame((_, delta) => {
    for (const light of headlightRefs.current) {
      if (light) light.intensity = atmosphere.night * HEADLIGHT_INTENSITY
    }
    const vehicle = vehicleRef.current
    if (!vehicle) return
    // Rapier's wheelRotation() stays 0 here, so integrate spin from forward speed.
    // Rolling toward -Z means the wheel top moves toward -Z: negative rotation about X.
    spinRef.current -= (forwardSpeedRef.current / WHEEL_RADIUS) * Math.min(delta, 0.05)
    for (let i = 0; i < WHEELS.length; i++) {
      const group = wheelRefs.current[i]
      if (!group) continue
      group.position.y = -(vehicle.wheelSuspensionLength(i) ?? SUSPENSION_REST)
      group.rotation.y = WHEELS[i]?.front ? steerRef.current : 0
      group.rotation.x = spinRef.current
    }
  })

  return (
    <RigidBody
      ref={bodyRef}
      position={SPAWN_POSITION}
      colliders={false}
      canSleep={false}
      linearDamping={0.05}
    >
      <CuboidCollider args={CHASSIS_HALF} mass={params.mass} />

      <group ref={visualRef}>
        {/* Chassis */}
        <mesh castShadow>
          <boxGeometry args={[CHASSIS_HALF[0] * 2, CHASSIS_HALF[1] * 2, CHASSIS_HALF[2] * 2]} />
          <meshStandardMaterial color="#e63946" flatShading />
        </mesh>
        {/* Cabin */}
        <mesh castShadow position={[0, 0.5, 0.3]}>
          <boxGeometry args={[1.3, 0.5, 1.4]} />
          <meshStandardMaterial color="#f1faee" flatShading />
        </mesh>
        {/* Headlights mark the front (-Z) */}
        {[-0.5, 0.5].map((x) => (
          <mesh key={x} position={[x, 0.05, -1.62]}>
            <boxGeometry args={[0.3, 0.15, 0.05]} />
            <meshStandardMaterial color="#ffe66d" emissive="#ffe66d" emissiveIntensity={1.5} />
          </mesh>
        ))}
        {[-0.5, 0.5].map((x, i) => (
          <spotLight
            key={x}
            ref={(light) => {
              headlightRefs.current[i] = light
            }}
            position={[x, 0.05, -1.7]}
            intensity={0}
            angle={0.55}
            penumbra={0.6}
            distance={55}
            decay={2}
            color="#fff1c2"
          />
        ))}

        {/* Wheels */}
        {WHEELS.map((wheel, i) => (
          <group
            key={i}
            position={[wheel.x, -SUSPENSION_REST, wheel.z]}
            ref={(group) => {
              if (group) group.rotation.order = 'YXZ' // steer (Y) then spin (X)
              wheelRefs.current[i] = group
            }}
          >
            <mesh castShadow rotation-z={Math.PI / 2}>
              <cylinderGeometry args={[WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_WIDTH, 16]} />
              <meshStandardMaterial color="#222831" flatShading />
            </mesh>
            {/* Hub marker so rotation is visible */}
            <mesh rotation-z={Math.PI / 2}>
              <cylinderGeometry args={[WHEEL_RADIUS * 0.45, WHEEL_RADIUS * 0.45, WHEEL_WIDTH + 0.02, 8]} />
              <meshStandardMaterial color="#9aa5b1" flatShading />
            </mesh>
          </group>
        ))}
      </group>
    </RigidBody>
  )
}
