import { Request, Resource } from 'cesium'

// AWS Terrain Tiles, "terrarium" encoding: height = R*256 + G + B/256 - 32768.
// The same tile feeds both the terrain mesh and the relief imagery, so decoded
// tiles are cached here and handed to whichever provider asks second.

export const TILE_SIZE = 256
export const MAX_LEVEL = 15

const TILE_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
const CACHE_LIMIT = 400

export interface HeightTile {
  heights: Float32Array
  min: number
  max: number
}

const cache = new Map<string, Promise<HeightTile>>()

export function tileUrl(x: number, y: number, level: number): string {
  return TILE_URL.replace('{z}', String(level)).replace('{x}', String(x)).replace('{y}', String(y))
}

export function loadHeightTile(x: number, y: number, level: number, request?: Request): Promise<HeightTile> | undefined {
  const key = `${level}/${x}/${y}`
  const cached = cache.get(key)
  if (cached) return cached

  const resource = new Resource({ url: tileUrl(x, y, level), request })
  const image = resource.fetchImage({ preferImageBitmap: true, flipY: false })
  if (!image) return undefined

  const promise = image.then((img) => decode(img as ImageBitmap))
  cache.set(key, promise)
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  promise.catch(() => cache.delete(key))
  return promise
}

let scratch: OffscreenCanvasRenderingContext2D | null = null

function decode(img: ImageBitmap): HeightTile {
  if (!scratch) {
    scratch = new OffscreenCanvas(TILE_SIZE, TILE_SIZE).getContext('2d', { willReadFrequently: true })
    if (!scratch) throw new Error('2d context unavailable')
  }
  scratch.drawImage(img, 0, 0)
  img.close()
  const rgba = scratch.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data
  const heights = new Float32Array(TILE_SIZE * TILE_SIZE)
  let min = Infinity
  let max = -Infinity
  for (let i = 0, p = 0; i < heights.length; i++, p += 4) {
    const h = rgba[p]! * 256 + rgba[p + 1]! + rgba[p + 2]! / 256 - 32768
    heights[i] = h
    if (h < min) min = h
    if (h > max) max = h
  }
  return { heights, min, max }
}
