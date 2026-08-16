import { Color, Material } from 'cesium'
import riverSource from '../shaders/river.glsl?raw'
import { color } from '../tokens'

export const PATTERN_KM = 9

export interface FieldEncoding {
  indexOffset: number
  indexScale: number
}

export interface RiverMaterialOptions {
  field: HTMLCanvasElement | OffscreenCanvas
  encoding: FieldEncoding
  lengthKm: number
  baseWidth: number
  intensity?: number
}

export interface RiverUniforms {
  time: number
  clock: number
}

export function riverUniforms(material: Material): RiverUniforms {
  return material.uniforms as RiverUniforms
}

export function createRiverMaterial({ field, encoding, lengthKm, baseWidth, intensity = 1 }: RiverMaterialOptions): Material {
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
        indexOffset: encoding.indexOffset,
        indexScale: encoding.indexScale,
        tideColor: Color.fromCssColorString(color.tide),
        hazeColor: Color.fromCssColorString(color.haze),
      },
      source: riverSource,
    },
  })
}

/** A one-pixel field for rivers without gauges: a quiet, constant, "measured" look. */
export function stillField(index: number, encoding: FieldEncoding): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const ctx = canvas.getContext('2d')!
  const r = Math.round(((index - encoding.indexOffset) / encoding.indexScale) * 255)
  ctx.fillStyle = `rgb(${r},255,0)`
  ctx.fillRect(0, 0, 1, 1)
  return canvas
}
