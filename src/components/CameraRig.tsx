import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useControls } from 'leva'
import { Vector3, Quaternion } from 'three'
import { useGameStore } from '../store/useGameStore'

const pos = new Vector3()
const quat = new Quaternion()
const forward = new Vector3()
const desired = new Vector3()
const lookTarget = new Vector3()

/** Smooth chase camera: sits behind the car and looks slightly ahead. */
export function CameraRig() {
  const lastForward = useRef(new Vector3(0, 0, -1))
  const smoothLook = useRef(new Vector3())
  const initialised = useRef(false)

  const { distance, height, lookAhead, stiffness } = useControls('Camera', {
    distance: { value: 9, min: 3, max: 25, step: 0.5 },
    height: { value: 4, min: 1, max: 15, step: 0.5 },
    lookAhead: { value: 5, min: 0, max: 20, step: 0.5, label: 'look ahead' },
    stiffness: { value: 4, min: 0.5, max: 15, step: 0.5, label: 'follow stiffness' },
  })

  useFrame((state, delta) => {
    const car = useGameStore.getState().chassis
    if (!car) return

    car.updateWorldMatrix(true, false)
    car.getWorldPosition(pos)
    car.getWorldQuaternion(quat)

    // Heading projected on the ground; keep the last good one if the car is vertical.
    forward.set(0, 0, -1).applyQuaternion(quat)
    forward.y = 0
    if (forward.lengthSq() > 1e-4) lastForward.current.copy(forward.normalize())
    const heading = lastForward.current

    desired.copy(pos).addScaledVector(heading, -distance)
    desired.y = pos.y + height
    lookTarget.copy(pos).addScaledVector(heading, lookAhead)
    lookTarget.y = pos.y + 1

    if (!initialised.current) {
      state.camera.position.copy(desired)
      smoothLook.current.copy(lookTarget)
      initialised.current = true
    }

    // Frame-rate independent damping.
    const t = 1 - Math.exp(-stiffness * delta)
    state.camera.position.lerp(desired, t)
    smoothLook.current.lerp(lookTarget, 1 - Math.exp(-stiffness * 1.5 * delta))
    state.camera.lookAt(smoothLook.current)
  })

  return null
}
