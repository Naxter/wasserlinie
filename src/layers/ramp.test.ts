import { describe, expect, it } from 'vitest'
import { anomalyRamp, unknownColor } from '../tokens'
import { RAMP_MAX, RAMP_MIN, RAMP_WIDTH, rampCss, rampGradientCss, rampPixels, sampleRamp } from './ramp'

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

describe('ramp semantics', () => {
  it('is warm when dry and cool when wet', () => {
    const dry = sampleRamp(-1)
    const wet = sampleRamp(1)
    expect(dry.rgb[0]).toBeGreaterThan(dry.rgb[2]) // red beats blue
    expect(wet.rgb[2]).toBeGreaterThan(wet.rgb[0]) // blue beats red
  })

  it('is dimmest at normal and brightest at both extremes', () => {
    const normal = sampleRamp(0).glow
    expect(sampleRamp(-1).glow).toBeGreaterThan(normal)
    expect(sampleRamp(1).glow).toBeGreaterThan(normal)
    // A record low must not be drawn fainter than a record high.
    expect(sampleRamp(-1).glow).toBeCloseTo(sampleRamp(1).glow, 5)
  })

  it('still runs slow when dry and fast when full', () => {
    expect(sampleRamp(-1).speed).toBeLessThan(sampleRamp(0).speed)
    expect(sampleRamp(1).speed).toBeGreaterThan(sampleRamp(0).speed)
  })

  it('gives the legend the same colours as the map', () => {
    const css = rampGradientCss(4)
    const mid = sampleRamp(0).rgb.map(Math.round).join(',')
    expect(css).toContain(`rgb(${mid}) 50.0%`)
  })
})
