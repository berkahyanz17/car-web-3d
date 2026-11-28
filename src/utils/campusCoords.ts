import { MAP_H, MAP_W } from '../data/jatinangor'

/** Map pixels (drone photo crop, 1 px = 1 m) -> world metres. World origin = centre of the map; -Z is north. */
export function mapToWorld(px: number, py: number): [number, number] {
  return [px - MAP_W / 2, py - MAP_H / 2]
}
