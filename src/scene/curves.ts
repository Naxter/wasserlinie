import { terrain } from '../tokens'

// Slow start, slow stop. Nothing about the camera should ever feel abrupt.
export function cinematicEase(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

// Germany is flat: exaggerate from far away, ease back to 1.0 when close so
// the near view does not turn into a cartoon.
export function exaggerationFor(height: number): number {
  const span = terrain.exaggerationFarHeight - terrain.exaggerationNearHeight
  const t = Math.min(1, Math.max(0, (height - terrain.exaggerationNearHeight) / span))
  const s = t * t * (3 - 2 * t)
  return terrain.exaggerationNear + (terrain.exaggerationFar - terrain.exaggerationNear) * s
}
