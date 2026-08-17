import { Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { camera as cameraTokens, map as tokens } from '../tokens'
import { baseStyle, landSource, landLayers, SRC_LAND } from './style'

export interface MapOptions {
  container: HTMLElement
  rings: [number, number][][]
}

/**
 * North-up and flat, on purpose.
 *
 * Rotation and tilt are switched off rather than merely left alone: the map's
 * job is comparing one gauge against another, and a tilted view makes the near
 * half of the country larger than the far half. A north-up map also means the
 * reader never has to re-orient after moving.
 */
export interface MapHandle {
  map: MapLibreMap
  /**
   * Resolves once the style exists and layers may be added.
   *
   * It has to be captured here rather than asked for later: by the time the
   * gauge data has been fetched, `load` has long since fired, and `loaded()` is
   * still false while the country outline settles — so a listener attached at
   * that point waits for an event that will never come again.
   */
  ready: Promise<void>
}

export function createMap({ container, rings }: MapOptions): MapHandle {
  const map = new MapLibreMap({
    container,
    style: baseStyle(),
    center: [cameraTokens.start.lon, cameraTokens.start.lat],
    zoom: cameraTokens.start.zoom,
    minZoom: cameraTokens.minZoom,
    maxZoom: cameraTokens.maxZoom,
    dragRotate: false,
    pitchWithRotate: false,
    rollEnabled: false,
    attributionControl: false,
    // The credits live in the app's own notice panel, which has to name the
    // BKG licence in words anyway.
    maxPitch: 0,
    // Same reasoning as the Cesium build: render at the device ratio, capped,
    // and never at its square.
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
  })
  map.touchZoomRotate.disableRotation()
  map.keyboard.disableRotation()

  const ready = new Promise<void>((resolve) => {
    map.on('load', () => {
      map.addSource(SRC_LAND, landSource(rings))
      for (const layer of landLayers) map.addLayer(layer)
      resolve()
    })
  })

  // Keeping the country inside a box stops the map being scrolled into empty
  // ocean, which on a data map reads as broken rather than as panning.
  map.setMaxBounds([
    [tokens.bounds.west, tokens.bounds.south],
    [tokens.bounds.east, tokens.bounds.north],
  ])
  return { map, ready }
}
