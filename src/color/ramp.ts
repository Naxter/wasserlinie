import { anomalyRamp, hexToRgb, unknownColor } from '../tokens'
import { mixOklab } from './oklab'

// The ramp lives in tokens.ts as data. Here it becomes two things: a texture
// the shader samples, and a plain function the UI and the gauge layer use, so
// a river and its gauge can never disagree about what a colour means.

export const RAMP_MIN = anomalyRamp[0].state
export const RAMP_MAX = anomalyRamp[anomalyRamp.length - 1]!.state
const WIDTH = 256

export interface RampSample {
  rgb: [number, number, number]
  glow: number
  speed: number
}

const stops = anomalyRamp.map((s) => ({ ...s, rgb: hexToRgb(s.color) }))

export function sampleRamp(state: number): RampSample {
  const s = Math.min(RAMP_MAX, Math.max(RAMP_MIN, state))
  let i = 0
  while (i < stops.length - 2 && stops[i + 1]!.state < s) i++
  const a = stops[i]!
  const b = stops[i + 1]!
  const t = b.state === a.state ? 0 : (s - a.state) / (b.state - a.state)
  return {
    rgb: mixOklab(a.rgb, b.rgb, t),
    glow: a.glow + (b.glow - a.glow) * t,
    speed: a.speed + (b.speed - a.speed) * t,
  }
}

/**
 * The legend has to show the ramp the map actually uses. A CSS gradient would
 * interpolate in sRGB and drift away from the Oklab one, so the stops are
 * sampled from the same function the shader texture is built from.
 */
export function rampGradientCss(steps = 24): string {
  const parts: string[] = []
  for (let i = 0; i <= steps; i++) {
    const f = i / steps
    const { rgb } = sampleRamp(RAMP_MIN + f * (RAMP_MAX - RAMP_MIN))
    parts.push(`rgb(${rgb.map(Math.round).join(',')}) ${(f * 100).toFixed(1)}%`)
  }
  return `linear-gradient(90deg, ${parts.join(', ')})`
}

export function rampCss(state: number | null): string {
  if (state === null || Number.isNaN(state)) return unknownColor
  const { rgb } = sampleRamp(state)
  return `rgb(${rgb.map(Math.round).join(',')})`
}

/**
 * Two rows: the colour, and glow in red with speed in green.
 *
 * Textures are uploaded bottom-up, so the colour goes in the *last* canvas row
 * to arrive at v = 0.25 in the shader, and the dynamics in the first to arrive
 * at v = 0.75. Getting this backwards silently swaps colour and glow, which
 * paints a record low in the colour of a record high.
 */
export const RAMP_WIDTH = WIDTH

export function rampPixels(): Uint8ClampedArray {
  const out = new Uint8ClampedArray(WIDTH * 2 * 4)
  for (let x = 0; x < WIDTH; x++) {
    const { rgb, glow, speed } = sampleRamp(RAMP_MIN + (x / (WIDTH - 1)) * (RAMP_MAX - RAMP_MIN))
    const dynamics = x * 4
    out[dynamics] = Math.round(glow * 255)
    out[dynamics + 1] = Math.round((speed / 2.5) * 255)
    out[dynamics + 2] = 0
    out[dynamics + 3] = 255
    const colour = (WIDTH + x) * 4
    out[colour] = rgb[0]
    out[colour + 1] = rgb[1]
    out[colour + 2] = rgb[2]
    out[colour + 3] = 255
  }
  return out
}

export function rampTexture(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = 2
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(WIDTH, 2)
  img.data.set(rampPixels())
  ctx.putImageData(img, 0, 0)
  return canvas
}
