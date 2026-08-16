import { Color, Material } from 'cesium'
import riverSource from '../shaders/river.glsl?raw'
import { color } from '../tokens'

export const PATTERN_KM = 9

export interface RiverMaterialOptions {
  field: HTMLCanvasElement | OffscreenCanvas
  lengthKm: number
  baseWidth: number
  intensity?: number
}

export function createRiverMaterial({ field, lengthKm, baseWidth, intensity = 1 }: RiverMaterialOptions): Material {
  return new Material({
    translucent: true,
    fabric: {
      uniforms: {
        field,
        time: 0.5,
        clock: 0,
        repeats: Math.max(1, Math.round(lengthKm / PATTERN_KM)),
        baseWidth,
        intensity,
        tideColor: Color.fromCssColorString(color.tide),
        hazeColor: Color.fromCssColorString(color.haze),
      },
      source: riverSource,
    },
  })
}
