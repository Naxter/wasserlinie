import { describe, expect, it } from 'vitest'
import { anomalyRamp, hexToRgb, unknownColor } from '../tokens'
import { rgbToOklab } from './oklab'
import { RAMP_MAX, RAMP_MIN, rampCss, rampGradientCss, sampleRamp } from './ramp'

const dE = (a: [number, number, number], b: [number, number, number]): number => {
  const x = rgbToOklab(a)
  const y = rgbToOklab(b)
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])
}
const chroma = (c: [number, number, number]): number => {
  const [, a, b] = rgbToOklab(c)
  return Math.hypot(a, b)
}

describe('sampleRamp', () => {
  it('returns each stop at its own state', () => {
    // Rounded, because that is the form the map and the legend both use: the
    // Oklab round-trip lands a fraction of a channel away from the hex.
    for (const stop of anomalyRamp) {
      expect(sampleRamp(stop.state).map(Math.round)).toEqual(hexToRgb(stop.color))
    }
  })

  it('holds one colour across the normal band', () => {
    expect(sampleRamp(0)).toEqual(sampleRamp(-0.2))
    expect(sampleRamp(0)).toEqual(sampleRamp(0.2))
  })

  it('clamps beyond the ends rather than extrapolating', () => {
    expect(sampleRamp(-5)).toEqual(sampleRamp(RAMP_MIN))
    expect(sampleRamp(5)).toEqual(sampleRamp(RAMP_MAX))
  })
})

// The map has no glow and no second channel, so these are the properties that
// decide whether it can be read at all. A near-white wet end once put p90
// within dE 0.08 of normal, which made "üblich" and "selten, mehr als sonst"
// one colour on screen.
describe('readability', () => {
  it('keeps every unusual level clearly apart from normal', () => {
    const normal = sampleRamp(0)
    for (const state of [-1, -0.75, -0.5, 0.5, 0.75, 1]) {
      expect(dE(sampleRamp(state), normal)).toBeGreaterThan(0.15)
    }
  })

  it('treats the two directions alike', () => {
    // Neither arm may be more than half again as visible as the other.
    for (const s of [0.5, 0.75, 1]) {
      const dry = dE(sampleRamp(-s), sampleRamp(0))
      const wet = dE(sampleRamp(s), sampleRamp(0))
      expect(Math.max(dry, wet) / Math.min(dry, wet)).toBeLessThan(1.5)
    }
  })

  it('saturates outward from the normal band, so a quiet country recedes', () => {
    for (const arm of [-1, 1]) {
      const along = [0.2, 0.5, 0.75, 1].map((s) => chroma(sampleRamp(arm * s)))
      for (let i = 1; i < along.length; i++) expect(along[i]!).toBeGreaterThan(along[i - 1]!)
    }
  })

  it('separates the far end of each arm from the level that only just counts', () => {
    expect(dE(sampleRamp(1), sampleRamp(0.5))).toBeGreaterThan(0.15)
    expect(dE(sampleRamp(-1), sampleRamp(-0.5))).toBeGreaterThan(0.15)
  })

  it('keeps "no verdict" out of the ramp', () => {
    // Grey must not read as a level, in either direction.
    for (const state of [-1, -0.5, 0, 0.5, 1]) {
      expect(dE(sampleRamp(state), hexToRgb(unknownColor))).toBeGreaterThan(0.1)
    }
  })
})

describe('rampGradientCss', () => {
  it('runs from the dry end to the wet end', () => {
    const css = rampGradientCss(4)
    expect(css.startsWith('linear-gradient(90deg,')).toBe(true)
    expect(css).toContain(rampCss(RAMP_MIN).replace('rgb(', 'rgb(').replace(/\s/g, ''))
    expect(css).toContain('100.0%')
  })
})

describe('rampCss', () => {
  it('says grey when there is nothing to say', () => {
    expect(rampCss(null)).toBe(unknownColor)
    expect(rampCss(Number.NaN)).toBe(unknownColor)
  })
})
