import { Color, Material } from 'cesium'
import riverSource from '../shaders/river.glsl?raw'
import { unknownColor } from '../tokens'
import { RAMP_MAX, RAMP_MIN, rampTexture } from './ramp'

export const PATTERN_KM = 9

export interface FieldEncoding {
  stateOffset: number
  stateScale: number
}

export interface RiverMaterialOptions {
  field: HTMLCanvasElement | OffscreenCanvas
  encoding: FieldEncoding
  lengthKm: number
  baseWidth: number
  intensity?: number
  /** 0 for rivers with no gauge behind them: drawn grey and quiet. */
  known?: boolean
}

export interface RiverUniforms {
  time: number
  clock: number
}

export function riverUniforms(material: Material): RiverUniforms {
  return material.uniforms as RiverUniforms
}

// One ramp texture for every river material; it never changes at runtime.
let sharedRamp: HTMLCanvasElement | null = null
function ramp(): HTMLCanvasElement {
  sharedRamp ??= rampTexture()
  return sharedRamp
}

export function createRiverMaterial({
  field,
  encoding,
  lengthKm,
  baseWidth,
  intensity = 1,
  known = true,
}: RiverMaterialOptions): Material {
  return new Material({
    translucent: true,
    fabric: {
      uniforms: {
        field,
        ramp: ramp(),
        time: 0.5,
        clock: 0,
        repeats: Math.max(1, Math.round(lengthKm / PATTERN_KM)),
        baseWidth,
        intensity,
        known: known ? 1 : 0,
        stateOffset: encoding.stateOffset,
        stateScale: encoding.stateScale,
        rampMin: RAMP_MIN,
        rampMax: RAMP_MAX,
        unknownColor: Color.fromCssColorString(unknownColor),
      },
      source: riverSource,
    },
  })
}

/** A one-pixel field for rivers without gauges: constant, "measured", no spread. */
export function stillField(state: number, encoding: FieldEncoding): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const ctx = canvas.getContext('2d')!
  const r = Math.round(((state - encoding.stateOffset) / encoding.stateScale) * 255)
  ctx.fillStyle = `rgb(${Math.min(255, Math.max(0, r))},255,0)`
  ctx.fillRect(0, 0, 1, 1)
  return canvas
}
