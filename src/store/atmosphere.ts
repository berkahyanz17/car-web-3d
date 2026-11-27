/**
 * Mutable day/night blend, updated every frame by <Atmosphere />.
 * 0 = noon, 1 = night. Kept outside React state to avoid re-renders.
 */
export const atmosphere = { night: 0 }
