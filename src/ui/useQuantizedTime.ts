import { useApp } from '../store'

const FALLBACK_STEP_MS = 900_000
const MIN_STEP_MS = 60_000

/**
 * The slider moves every frame while playing. Anything that walks all 691
 * gauges and rebuilds DOM must not follow it that closely, so it sees a
 * coarser clock: the picture is identical to the eye, and React re-renders a
 * few times a second instead of sixty.
 *
 * The step is a share of the range rather than a fixed number of minutes,
 * because the two modes move at wildly different speeds — a quarter hour is a
 * sensible grain across a month and an invisible one across twenty-six years.
 *
 * Quantising *inside* the selector is the point: the hook returns the same
 * number for a whole step, so the store's equality check stops the render
 * before it starts.
 */
export function quantumFor(span: number, steps = 2000): number {
  return span > 0 ? Math.max(MIN_STEP_MS, span / steps) : FALLBACK_STEP_MS
}

export function useQuantizedTime(steps = 2000): number {
  return useApp((s) => {
    const step = quantumFor(s.range ? s.range.end - s.range.start : 0, steps)
    return Math.round(s.simTime / step) * step
  })
}
