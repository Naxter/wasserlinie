import { describe, expect, it } from 'vitest'
import { mixOklab, oklabToRgb, rgbToOklab, type Rgb } from './oklab'

const round = (c: Rgb): Rgb => c.map(Math.round) as Rgb

describe('oklab', () => {
  it('round-trips a colour', () => {
    for (const c of [[0, 0, 0], [255, 255, 255], [79, 209, 217], [240, 74, 36]] as Rgb[]) {
      expect(round(oklabToRgb(rgbToOklab(c)))).toEqual(c)
    }
  })

  it('returns the endpoints untouched', () => {
    const a: Rgb = [228, 186, 92]
    const b: Rgb = [79, 209, 217]
    expect(round(mixOklab(a, b, 0))).toEqual(a)
    expect(round(mixOklab(a, b, 1))).toEqual(b)
  })

  it('puts the midpoint halfway in perceived lightness', () => {
    const amber: Rgb = [228, 186, 92]
    const teal: Rgb = [79, 209, 217]
    const lightness = (c: Rgb) => rgbToOklab(c)[0]
    const want = (lightness(amber) + lightness(teal)) / 2
    const naive = amber.map((c, i) => (c + teal[i]!) / 2) as Rgb
    // Averaging sRGB numbers lands off the perceptual midpoint; Oklab does not.
    expect(Math.abs(lightness(mixOklab(amber, teal, 0.5)) - want)).toBeLessThan(0.005)
    expect(Math.abs(lightness(naive) - want)).toBeGreaterThan(0.005)
  })

  it('keeps lightness moving smoothly across a mix', () => {
    const dark: Rgb = [20, 30, 40]
    const light: Rgb = [200, 230, 255]
    let last = -1
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const l = rgbToOklab(mixOklab(dark, light, t))[0]
      expect(l).toBeGreaterThan(last)
      last = l
    }
  })
})
