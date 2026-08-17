// Mixing two colours by averaging their sRGB numbers is not mixing light: the
// halfway point between amber and turquoise comes out a muddy grey, because
// sRGB is a storage encoding, not a perceptual one. Oklab is built so that
// equal steps look like equal steps, which keeps a gradient clean end to end.
//
// Coefficients from Björn Ottosson's Oklab (2020), public domain.

export type Rgb = [number, number, number]
export type Lab = [number, number, number]

const toLinear = (c: number): number => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

const toSrgb = (c: number): number => {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
  return Math.min(255, Math.max(0, v * 255))
}

const cube = (x: number): number => x * x * x

export function rgbToOklab([r, g, b]: Rgb): Lab {
  const lr = toLinear(r)
  const lg = toLinear(g)
  const lb = toLinear(b)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

export function oklabToRgb([L, a, b]: Lab): Rgb {
  const l = cube(L + 0.3963377774 * a + 0.2158037573 * b)
  const m = cube(L - 0.1055613458 * a - 0.0638541728 * b)
  const s = cube(L - 0.0894841775 * a - 1.291485548 * b)
  return [
    toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}

export function mixOklab(a: Rgb, b: Rgb, t: number): Rgb {
  const la = rgbToOklab(a)
  const lb = rgbToOklab(b)
  return oklabToRgb([la[0] + (lb[0] - la[0]) * t, la[1] + (lb[1] - la[1]) * t, la[2] + (lb[2] - la[2]) * t])
}
