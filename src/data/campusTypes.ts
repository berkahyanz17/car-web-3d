export type LabelCategory = 'support' | 'prodi' | 'eng' | 'agri' | 'sport'

export interface BuildingLabel {
  text: string
  /** Colour group, taken from the master-plan legend. */
  cat: LabelCategory
}

export interface BuildingSpec {
  id: string
  kind: 'shed' | 'block' | 'hip' | 'round'
  /** Centre in map pixels (1 px = 1 m, origin = top-left of the cropped drone photo). */
  x: number
  y: number
  /** Local x / z extents in metres. */
  w: number
  d: number
  /** Degrees: direction of the local +x axis in map space (y down). */
  theta: number
  /** Wall height in metres. */
  h: number
  /** Round buildings only: 'cone' (red conical roof) or 'flat'. */
  roof?: 'cone' | 'flat'
  roofColor?: string
  facade?: 'navy' | 'light' | 'dorm'
  /** Extra wings as [localX, localZ, w, d]; replaces the single w x d box. */
  parts?: ReadonlyArray<readonly [number, number, number, number]>
  label?: BuildingLabel
}

export interface RoadSpec {
  id: string
  /** Road width in metres. */
  width: number
  /** Flat [x, y, x, y, ...] centre line in map pixels. */
  pts: ReadonlyArray<number>
}

export interface RampSpec {
  x: number
  y: number
  /** Degrees; negative tilts face the other way. */
  tilt: number
}
