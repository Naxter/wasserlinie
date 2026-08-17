import type { FeatureCollection } from 'geojson'
import type {
  ExpressionSpecification,
  GeoJSONSourceSpecification,
  StyleSpecification,
} from 'maplibre-gl'
import type { River, Station } from '../data/types'
import { color, map as tokens, unknownColor } from '../tokens'

// The whole basemap is the four files the pipeline already writes. There is no
// tile server, no style URL and no key: the country outline is one polygon, the
// network is two line files, and the gauges are points. Anything a hosted
// basemap would add — roads, terrain, place names — is context this map does
// not read against.

export const SRC_LAND = 'land'
export const SRC_RIVERS = 'rivers'
export const SRC_DETAIL = 'detail'
export const SRC_GAUGES = 'gauges'

/** `river-<id>`, one per gauged river, because a gradient is per layer. */
export const riverLayerId = (id: number): string => `river-${id}`
export const LAYER_QUIET = 'rivers-quiet'
export const LAYER_DETAIL = 'rivers-detail'
export const LAYER_GAUGES = 'gauges'
export const LAYER_GAUGE_HIT = 'gauges-hit'

function lineFeatures(rivers: River[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: rivers.map((r) => ({
      type: 'Feature',
      id: r.id,
      properties: { id: r.id, name: r.name, cls: r.cls, gauged: r.gauges.length > 0 },
      geometry: { type: 'LineString', coordinates: r.coords },
    })),
  }
}

/** The country's own extent, so the overview never needs a tuned zoom. */
export function boundsOf(rings: [number, number][][]): [[number, number], [number, number]] {
  let west = 180
  let east = -180
  let south = 90
  let north = -90
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      if (lon < west) west = lon
      if (lon > east) east = lon
      if (lat < south) south = lat
      if (lat > north) north = lat
    }
  }
  return [
    [west, south],
    [east, north],
  ]
}

export function landSource(rings: [number, number][][]): GeoJSONSourceSpecification {
  return {
    type: 'geojson',
    data: {
      type: 'Feature',
      properties: {},
      // Each ring is its own polygon: the file carries the mainland and the
      // islands as separate rings, and nesting them would punch holes.
      geometry: { type: 'MultiPolygon', coordinates: rings.map((ring) => [ring]) },
    },
  }
}

export function riverSource(rivers: River[]): GeoJSONSourceSpecification {
  // line-gradient needs the distance along each line, which costs nothing here
  // and is the only way to paint a value that varies down a river.
  return { type: 'geojson', lineMetrics: true, data: lineFeatures(rivers) }
}

export function gaugeSource(stations: Station[]): GeoJSONSourceSpecification {
  return {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: stations.map((s, i) => ({
        type: 'Feature',
        // Feature state needs a numeric id, and the index is the same slot the
        // timeline samples by, so no lookup is needed when colours change.
        id: i,
        properties: { uuid: s.uuid, name: s.name, water: s.water },
        geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
      })),
    },
  }
}

/** Line width by river class, growing with zoom so the hierarchy survives. */
function widthByClass(scale = 1): ExpressionSpecification {
  const at = (i: 0 | 1): ExpressionSpecification => [
    'match',
    ['get', 'cls'],
    200,
    tokens.width[200][i] * scale,
    125,
    tokens.width[125][i] * scale,
    42,
    tokens.width[42][i] * scale,
    tokens.width[12][i] * scale,
  ]
  return ['interpolate', ['linear'], ['zoom'], tokens.detailFromZoom - 2, at(0), tokens.maxZoomForWidth, at(1)]
}

export const baseStyle = (): StyleSpecification => ({
  version: 8,
  // No glyph or sprite server either; labels come later from a local font.
  sources: {},
  layers: [{ id: 'sea', type: 'background', paint: { 'background-color': tokens.sea } }],
})

export const landLayers = [
  {
    id: 'land',
    type: 'fill' as const,
    source: SRC_LAND,
    paint: { 'fill-color': tokens.land },
  },
  {
    id: 'land-edge',
    type: 'line' as const,
    source: SRC_LAND,
    paint: { 'line-color': tokens.landEdge, 'line-width': 1 },
  },
]

export function networkLayers() {
  return [
    {
      id: LAYER_DETAIL,
      type: 'line' as const,
      source: SRC_DETAIL,
      // The fine network is three times the size of the gauged one and says
      // nothing at country scale, so it only appears once it can be read.
      minzoom: tokens.detailFromZoom,
      paint: {
        'line-color': tokens.quiet,
        'line-width': widthByClass(0.8),
        'line-opacity': ['interpolate', ['linear'], ['zoom'], tokens.detailFromZoom, 0, tokens.detailFromZoom + 1, 0.55] as ExpressionSpecification,
      },
      layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const },
    },
    {
      id: LAYER_QUIET,
      type: 'line' as const,
      source: SRC_RIVERS,
      filter: ['!', ['get', 'gauged']] as ExpressionSpecification,
      paint: { 'line-color': tokens.quiet, 'line-width': widthByClass(), 'line-opacity': 0.7 },
      layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const },
    },
  ]
}

/** One layer per gauged river; `line-gradient` is a layer property, not a feature one. */
export function gaugedRiverLayer(id: number) {
  return {
    id: riverLayerId(id),
    type: 'line' as const,
    source: SRC_RIVERS,
    filter: ['==', ['get', 'id'], id] as ExpressionSpecification,
    paint: {
      'line-width': widthByClass(),
      // Replaced every time the clock moves; grey until the first sample.
      'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, unknownColor, 1, unknownColor] as ExpressionSpecification,
    },
    layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const },
  }
}

export function gaugeLayers() {
  const radius: ExpressionSpecification = [
    'interpolate',
    ['linear'],
    ['zoom'],
    tokens.detailFromZoom - 2,
    tokens.gaugeRadius[0],
    tokens.maxZoomForWidth,
    tokens.gaugeRadius[1],
  ]
  const stateColor: ExpressionSpecification = [
    'case',
    ['==', ['feature-state', 'color'], null],
    unknownColor,
    ['feature-state', 'color'],
  ]
  return [
    {
      id: LAYER_GAUGES,
      type: 'circle' as const,
      source: SRC_GAUGES,
      paint: {
        'circle-radius': radius,
        'circle-color': stateColor,
        // A gauge has to stay findable against the river it sits on.
        'circle-stroke-width': ['case', ['boolean', ['feature-state', 'active'], false], 2, 1] as ExpressionSpecification,
        'circle-stroke-color': [
          'case',
          ['boolean', ['feature-state', 'active'], false],
          color.paper,
          tokens.sea,
        ] as ExpressionSpecification,
      },
    },
    {
      // A 3px dot is not a pointer target; this one is invisible and wide.
      id: LAYER_GAUGE_HIT,
      type: 'circle' as const,
      source: SRC_GAUGES,
      paint: { 'circle-radius': 11, 'circle-color': tokens.sea, 'circle-opacity': 0 },
    },
  ]
}
