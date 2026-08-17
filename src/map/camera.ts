import type { Map as MapLibreMap } from 'maplibre-gl'
import { camera as tokens } from '../tokens'
import { reducedMotion } from './motion'

export type Bounds = [[number, number], [number, number]]

/**
 * The panels sit on top of the map, so the middle of the canvas is not the
 * middle of what can be seen. Without this the country centres itself half
 * under the sidebar. The breakpoint is the one in styles.css, where the panels
 * stop floating and become a column under the map.
 */
const STACKED = '(max-width: 860px), (max-height: 620px)'

export function chromePadding(): { top: number; bottom: number; left: number; right: number } {
  if (typeof matchMedia === 'function' && matchMedia(STACKED).matches) {
    return { top: 0, bottom: 0, left: 0, right: 0 }
  }
  return { top: 24, bottom: 96, left: 24, right: 388 }
}

/**
 * What the UI is allowed to ask of the camera.
 *
 * There is no intro flight, no orbit and no idle motion. The map moves when the
 * reader asks it to and at no other time — a map that drifts while a panel is
 * being read cannot be compared against itself a moment later.
 */
export class MapCamera {
  constructor(
    private readonly map: MapLibreMap,
    private readonly country: Bounds,
  ) {}

  private get seconds(): number {
    return reducedMotion() ? 0 : tokens.flightSeconds
  }

  /** Frame one gauge without losing the reader: pan and zoom, never rotate. */
  flyToPoint(lon: number, lat: number): Promise<void> {
    const zoom = Math.max(this.map.getZoom(), tokens.stationZoom)
    return this.settle(() =>
      this.map.easeTo({ center: [lon, lat], zoom, padding: chromePadding(), duration: this.seconds * 1000 }),
    )
  }

  /**
   * The whole country, fitted rather than zoomed to a number.
   *
   * `padding` alone is not enough: it moves the centre out from under the
   * panels but leaves the zoom where it was, so the country ends up correctly
   * off-centre and still too large for the space. Fitting the outline's bounds
   * against the same padding solves both at once.
   */
  home(animate = true): Promise<void> {
    return this.settle(() =>
      this.map.fitBounds(this.country, {
        padding: chromePadding(),
        duration: animate ? this.seconds * 1000 : 0,
      }),
    )
  }

  private settle(start: () => void): Promise<void> {
    return new Promise((resolve) => {
      this.map.once('moveend', () => resolve())
      start()
    })
  }
}
