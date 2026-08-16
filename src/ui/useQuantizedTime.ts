import { useApp } from '../store'

/**
 * The slider moves every frame while playing. Anything that walks all 691
 * gauges and rebuilds DOM must not follow it that closely, so it sees a
 * coarser clock: the picture is identical to the eye, and React re-renders a
 * few times a second instead of sixty.
 */
export function useQuantizedTime(stepMs = 900_000): number {
  return useApp((s) => Math.round(s.simTime / stepMs) * stepMs)
}
