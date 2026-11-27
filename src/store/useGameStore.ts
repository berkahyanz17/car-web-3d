import { create } from 'zustand'
import type { Object3D } from 'three'
import type { HeightFn } from '../utils/terrainMath'

export interface MapPoint {
  x: number
  z: number
}

interface GameState {
  /** Interpolated visual root of the car (read by camera, shadow light, minimap). */
  chassis: Object3D | null
  /** Incremented every time the player asks for a reset (R key). */
  resetNonce: number
  /** Target time of day. The visible blend is animated in <Atmosphere />. */
  isNight: boolean
  /** Data the minimap needs, published by Terrain and Trees. */
  mapTerrain: { heightFn: HeightFn; signature: string } | null
  mapTrees: MapPoint[]
  setChassis: (object: Object3D | null) => void
  requestReset: () => void
  toggleNight: () => void
  setMapTerrain: (terrain: { heightFn: HeightFn; signature: string }) => void
  setMapTrees: (trees: MapPoint[]) => void
}

export const useGameStore = create<GameState>((set) => ({
  chassis: null,
  resetNonce: 0,
  isNight: false,
  mapTerrain: null,
  mapTrees: [],
  setChassis: (chassis) => set({ chassis }),
  requestReset: () => set((state) => ({ resetNonce: state.resetNonce + 1 })),
  toggleNight: () => set((state) => ({ isNight: !state.isNight })),
  setMapTerrain: (mapTerrain) => set({ mapTerrain }),
  setMapTrees: (mapTrees) => set({ mapTrees }),
}))
