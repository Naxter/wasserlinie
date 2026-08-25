import { anomalyRamp, hexToRgb, unknownColor } from '../tokens'
import { mixOklab } from './oklab'

// The ramp lives in tokens.ts as data. Here it becomes one function, which the
// river layer, the gauge layer and the legend all call, so a river, its gauge
// and the key underneath can never disagree about what a colour means.
//
// It used to build a 256x2 texture as well, carrying glow and flow speed in a
// second row for the shader. Flat on a map there is no shader and no second
// channel: everything the ramp says, it says in colour.

export const RAMP_MIN = anomalyRamp[0].state
export const RAMP_MAX = anomalyRamp[anomalyRamp.length - 1]!.state

const stops = anomalyRamp.map((s) => ({ ...s, rgb: hexToRgb(s.color) }))

export function sampleRamp(state: number): [number, number, number] {
  const s = Math.min(RAMP_MAX, Math.max(RAMP_MIN, state))
  let i = 0
  while (i < stops.length - 2 && stops[i + 1]!.state < s) i++
  const a = stops[i]!
  const b = stops[i + 1]!
  const t = b.state === a.state ? 0 : (s - a.state) / (b.state - a.state)
  return mixOklab(a.rgb, b.rgb, t)
}

/**
 * The legend has to show the ramp the map actually uses. A CSS gradient would
 * interpolate in sRGB and drift away from the Oklab one, so the stops are
 * sampled from the same function the map is painted from.
 */
export function rampGradientCss(steps = 24): string {
  const parts: string[] = []
  for (let i = 0; i <= steps; i++) {
    const f = i / steps
    const rgb = sampleRamp(RAMP_MIN + f * (RAMP_MAX - RAMP_MIN))
    parts.push(`rgb(${rgb.map(Math.round).join(',')}) ${(f * 100).toFixed(1)}%`)
  }
  return `linear-gradient(90deg, ${parts.join(', ')})`
}

export function rampCss(state: number | null): string {
  if (state === null || Number.isNaN(state)) return unknownColor
  return `rgb(${sampleRamp(state).map(Math.round).join(',')})`
}
