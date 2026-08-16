import { describe, expect, it } from 'vitest'
import { anomalyRamp, unknownColor } from '../tokens'
import { RAMP_MAX, RAMP_MIN, RAMP_WIDTH, rampCss, rampPixels, sampleRamp } from './ramp'

describe('anomaly ramp', () => {
  it('returns each stop colour at its own state', () => {
    for (const stop of anomalyRamp) {
      const { rgb } = sampleRamp(stop.state)
      const hex = '#' + rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')
      expect(hex.toUpperCase()).toBe(stop.color.toUpperCase())
    }
  })

  it('keeps the normal band a single calm colour', () => {
    const left = sampleRamp(-0.2)
    const right = sampleRamp(0.2)
    expect(left.rgb).toEqual(right.rgb)
    expect(sampleRamp(0).rgb).toEqual(left.rgb)
  })

  it('is dim and slow when dry, bright and fast when wet', () => {
    expect(sampleRamp(-1).glow).toBeLessThan(sampleRamp(0).glow)
    expect(sampleRamp(1).glow).toBeGreaterThan(sampleRamp(0).glow)
    expect(sampleRamp(-1).speed).toBeLessThan(sampleRamp(1).speed)
  })

  it('clamps beyond the ends instead of extrapolating a colour', () => {
    expect(sampleRamp(-5).rgb).toEqual(sampleRamp(RAMP_MIN).rgb)
    expect(sampleRamp(5).rgb).toEqual(sampleRamp(RAMP_MAX).rgb)
  })

  it('says grey when there is no state at all', () => {
    expect(rampCss(null)).toBe(unknownColor)
    expect(rampCss(NaN)).toBe(unknownColor)
  })
})

describe('ramp texture', () => {
  it('puts the colour where the shader looks for it', () => {
    // Textures upload bottom-up: the shader reads colour at v=0.25, which is
    // the second row here. Swapping the rows paints a drought flood-red.
    const px = rampPixels()
    const dry = sampleRamp(RAMP_MIN)
    const colour = RAMP_WIDTH * 4
    expect([px[colour], px[colour + 1], px[colour + 2]]).toEqual(dry.rgb.map(Math.round))
    expect(px[0]).toBe(Math.round(dry.glow * 255))
    const wet = sampleRamp(RAMP_MAX)
    const last = (RAMP_WIDTH * 2 - 1) * 4
    expect([px[last], px[last + 1], px[last + 2]]).toEqual(wet.rgb.map(Math.round))
  })
})
