import { useApp, type TimeRange } from '../store'

const FALLBACK_STEP_MS = 900_000
const MIN_STEP_MS = 60_000

export function quantumFor(span: number, steps = 2000): number {
  return span > 0 ? Math.max(MIN_STEP_MS, span / steps) : FALLBACK_STEP_MS
}

/**
 * A coarse clock, snapped so it cannot cross a boundary the fine one has not.
 *
 * Rounding to the nearest step is not enough on its own. Half a step past
 * `now` makes every measured reading report itself as a forecast, and half a
 * step past `end` is off the far side of the daily grid, where every gauge
 * returns nothing and the list empties. Both happen on load, where the slider
 * sits exactly on the boundary — so it was a coin toss on every visit.
 */
export function quantize(simTime: number, range: TimeRange | null, steps = 2000): number {
  const step = quantumFor(range ? range.end - range.start : 0, steps)
  const rounded = Math.round(simTime / step) * step
  if (!range) return rounded
  const ceiling = simTime <= range.now ? range.now : range.end
  return Math.min(ceiling, Math.max(range.start, rounded))
}

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
export function useQuantizedTime(steps = 2000): number {
  return useApp((s) => quantize(s.simTime, s.range, steps))
}
