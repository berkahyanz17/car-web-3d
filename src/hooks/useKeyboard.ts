import { useEffect, useRef, type RefObject } from 'react'
import { useGameStore } from '../store/useGameStore'

export interface Controls {
  forward: boolean
  backward: boolean
  left: boolean
  right: boolean
  brake: boolean
}

const KEY_MAP: Readonly<Record<string, keyof Controls>> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'backward',
  ArrowDown: 'backward',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'brake',
}

/**
 * Returns a mutable ref (no re-renders) holding the current key state.
 * R triggers a car reset through the store.
 */
export function useKeyboard(): RefObject<Controls> {
  const controls = useRef<Controls>({
    forward: false,
    backward: false,
    left: false,
    right: false,
    brake: false,
  })

  useEffect(() => {
    const current = controls.current

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'KeyR' && !event.repeat) {
        useGameStore.getState().requestReset()
        return
      }
      if (event.code === 'KeyN' && !event.repeat) {
        useGameStore.getState().toggleNight()
        return
      }
      const action = KEY_MAP[event.code]
      if (action) {
        current[action] = true
        event.preventDefault()
      }
    }

    const onKeyUp = (event: KeyboardEvent) => {
      const action = KEY_MAP[event.code]
      if (action) {
        current[action] = false
        event.preventDefault()
      }
    }

    const releaseAll = () => {
      current.forward = false
      current.backward = false
      current.left = false
      current.right = false
      current.brake = false
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', releaseAll)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', releaseAll)
    }
  }, [])

  return controls
}
