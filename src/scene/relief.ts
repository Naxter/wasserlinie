import { Credit, Ellipsoid, Event, Rectangle, Request, WebMercatorTilingScheme, type ImageryTypes } from 'cesium'
import { color, hexToRgb, mixRgb, terrain } from '../tokens'
import { MAX_LEVEL, TILE_SIZE, loadHeightTile } from './terrarium'

// No satellite basemap. The globe gets a hillshade rendered on the fly from
// the height tiles, tinted with the elevation ramp, and everything outside
// the country is dimmed so the eye lands on Germany first.

export type Ring = [number, number][]

const RGB = {
  abyss: hexToRgb(color.abyss),
  chart: hexToRgb(color.chart),
  shoal: hexToRgb(color.shoal),
  paper: hexToRgb(color.paper),
}
const SEA = mixRgb(RGB.abyss, RGB.chart, 0.45)
const OUTLINE = color.tide + '85'
const DIM = `rgba(${RGB.abyss.join(',')},${terrain.outsideDim})`
const EARTH_CIRCUMFERENCE = 2 * Math.PI * Ellipsoid.WGS84.maximumRadius

const light = (() => {
  const az = (terrain.lightAzimuth * Math.PI) / 180
  const alt = (terrain.lightAltitude * Math.PI) / 180
  return [Math.sin(az) * Math.cos(alt), Math.cos(az) * Math.cos(alt), Math.sin(alt)] as const
})()

const ramp = buildRamp()

function buildRamp(): Uint8ClampedArray {
  const steps = 512
  const out = new Uint8ClampedArray(steps * 3)
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1)
    const c = t < 0.75
      ? mixRgb(mixRgb(RGB.chart, RGB.shoal, 0.22), RGB.shoal, Math.pow(t / 0.75, 0.6))
      : mixRgb(RGB.shoal, RGB.paper, ((t - 0.75) / 0.25) * 0.3)
    out[i * 3] = c[0]
    out[i * 3 + 1] = c[1]
    out[i * 3 + 2] = c[2]
  }
  return out
}

function rampIndex(h: number): number {
  // 0..rampMax maps to the first three quarters, higher ground eases into paper.
  const upper = terrain.rampMax + 2600
  const t = h < terrain.rampMax
    ? (0.75 * (h - terrain.rampMin)) / (terrain.rampMax - terrain.rampMin)
    : 0.75 + (0.25 * (h - terrain.rampMax)) / (upper - terrain.rampMax)
  return Math.max(0, Math.min(511, Math.round(t * 511))) * 3
}

export class ReliefImageryProvider {
  readonly tilingScheme = new WebMercatorTilingScheme({ ellipsoid: Ellipsoid.WGS84 })
  readonly rectangle: Rectangle = this.tilingScheme.rectangle
  readonly tileWidth = TILE_SIZE
  readonly tileHeight = TILE_SIZE
  readonly maximumLevel = MAX_LEVEL
  readonly minimumLevel = 0
  readonly tileDiscardPolicy = undefined
  readonly errorEvent = new Event()
  readonly credit = new Credit('Outline: © GeoBasis-DE / BKG 2025 (dl-de/by-2-0)')
  readonly proxy = undefined
  readonly hasAlphaChannel = false

  constructor(private readonly rings: Ring[]) {}

  getTileCredits(): Credit[] {
    return []
  }

  pickFeatures(): undefined {
    return undefined
  }

  requestImage(x: number, y: number, level: number, request?: Request): Promise<ImageryTypes> | undefined {
    const tile = loadHeightTile(x, y, level, request)
    if (!tile) return undefined
    return tile.then(({ heights }) => this.render(heights, x, y, level))
  }

  private render(heights: Float32Array, x: number, y: number, level: number): OffscreenCanvas {
    const canvas = new OffscreenCanvas(TILE_SIZE, TILE_SIZE)
    const ctx = canvas.getContext('2d')!
    const img = ctx.createImageData(TILE_SIZE, TILE_SIZE)
    shade(heights, img.data, y, level)
    ctx.putImageData(img, 0, 0)
    this.maskOutside(ctx, x, y, level)
    return canvas
  }

  private maskOutside(ctx: OffscreenCanvasRenderingContext2D, x: number, y: number, level: number): void {
    const n = 1 << level
    const path = new Path2D()
    for (const ring of this.rings) {
      ring.forEach(([lon, lat], i) => {
        const px = ((lon + 180) / 360) * n * TILE_SIZE - x * TILE_SIZE
        const py = mercatorY(lat) * n * TILE_SIZE - y * TILE_SIZE
        if (i === 0) path.moveTo(px, py)
        else path.lineTo(px, py)
      })
      path.closePath()
    }
    const outside = new Path2D()
    outside.rect(-4, -4, TILE_SIZE + 8, TILE_SIZE + 8)
    outside.addPath(path)
    ctx.fillStyle = DIM
    ctx.fill(outside, 'evenodd')
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 1.1
    ctx.lineJoin = 'round'
    ctx.stroke(path)
  }
}

function mercatorY(lat: number): number {
  const rad = (lat * Math.PI) / 180
  return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2
}

function shade(h: Float32Array, out: Uint8ClampedArray, y: number, level: number): void {
  const n = 1 << level
  const size = TILE_SIZE
  const last = size - 1
  const [lx, ly, lz] = light
  // Coarse tiles smooth the slopes away, so overview levels get more gain.
  const gain = 2 + Math.max(0, 9 - level) * 0.45
  for (let row = 0; row < size; row++) {
    const merc = (y + (row + 0.5) / size) / n
    const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * merc)))
    const res = (EARTH_CIRCUMFERENCE * Math.cos(lat)) / (size * n)
    const up = row > 0 ? row - 1 : row
    const down = row < last ? row + 1 : row
    const dy = (down - up) * res
    for (let col = 0; col < size; col++) {
      const i = row * size + col
      const height = h[i]!
      const o = i * 4
      const left = col > 0 ? col - 1 : col
      const right = col < last ? col + 1 : col
      const dzdx = ((h[row * size + right]! - h[row * size + left]!) / ((right - left) * res)) * gain
      const dzdy = ((h[up * size + col]! - h[down * size + col]!) / dy) * gain
      const inv = 1 / Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1)
      const nl = (-dzdx * lx - dzdy * ly + lz) * inv
      const bright = 0.42 + 0.92 * Math.max(0, nl)
      if (height <= terrain.seaLevel) {
        // Sea, but also open-pit mines: keep the shading so a hole reads as a hole.
        out[o] = SEA[0] * bright
        out[o + 1] = SEA[1] * bright
        out[o + 2] = SEA[2] * bright
      } else {
        const r = rampIndex(height)
        out[o] = ramp[r]! * bright
        out[o + 1] = ramp[r + 1]! * bright
        out[o + 2] = ramp[r + 2]! * bright
      }
      out[o + 3] = 255
    }
  }
}
