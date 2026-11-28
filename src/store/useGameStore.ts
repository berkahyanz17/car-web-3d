import { create } from 'zustand'
import type { Object3D } from 'three'

interface GameState {
  /** Interpolated visual root of the car (read by camera, shadow light, labels, minimap). */
  chassis: Object3D | null
  /** Incremented every time the player asks for a reset (R key). */
  resetNonce: number
  /** Target time of day. The visible blend is animated in <Atmosphere />. */
  isNight: boolean
  setChassis: (object: Object3D | null) => void
  requestReset: () => void
  toggleNight: () => void
}

export const useGameStore = create<GameState>((set) => ({
  chassis: null,
  resetNonce: 0,
  isNight: false,
  setChassis: (chassis) => set({ chassis }),
  requestReset: () => set((state) => ({ resetNonce: state.resetNonce + 1 })),
  toggleNight: () => set((state) => ({ isNight: !state.isNight })),
}))
