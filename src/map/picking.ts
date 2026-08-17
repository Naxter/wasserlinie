import type { MapMouseEvent, Map as MapLibreMap } from 'maplibre-gl'
import { store } from '../store'
import { LAYER_DETAIL, LAYER_GAUGE_HIT, LAYER_QUIET } from './style'

// One handler for the whole map rather than one per layer: gauges sit on top of
// the rivers they measure, so two handlers would both fire on the same click and
// the last one to run would win. `queryRenderedFeatures` returns them in draw
// order, topmost first, which is the order to honour.

const HOVER_INTERVAL_MS = 60

export type Picked = { kind: 'gauge'; uuid: string } | { kind: 'river'; id: number } | null

function riverLayerIds(map: MapLibreMap): string[] {
  return map
    .getStyle()
    .layers.map((l) => l.id)
    .filter((id) => id.startsWith('river-') || id === LAYER_QUIET || id === LAYER_DETAIL)
}

/** What is under the cursor, from the ids the sources carry. */
export function pickAt(map: MapLibreMap, point: MapMouseEvent['point']): Picked {
  const gauge = map.queryRenderedFeatures(point, { layers: [LAYER_GAUGE_HIT] })[0]
  // Feature properties come back untyped, so they are narrowed, not trusted.
  const uuid: unknown = gauge?.properties?.uuid
  if (typeof uuid === 'string') return { kind: 'gauge', uuid }
  // A wider box for lines: a 2px river is not a pointer target either.
  const box: [[number, number], [number, number]] = [
    [point.x - 5, point.y - 5],
    [point.x + 5, point.y + 5],
  ]
  const river = map.queryRenderedFeatures(box, { layers: riverLayerIds(map) })[0]
  const id: unknown = river?.properties?.id
  return typeof id === 'number' ? { kind: 'river', id } : null
}

export function bindPicking(map: MapLibreMap): () => void {
  const onClick = (e: MapMouseEvent): void => {
    const picked = pickAt(map, e.point)
    if (picked?.kind === 'gauge') store.getState().select(picked.uuid)
    else if (picked?.kind === 'river') store.getState().selectRiver(picked.id)
  }

  let last = 0
  const onMove = (e: MapMouseEvent): void => {
    const now = performance.now()
    if (now - last < HOVER_INTERVAL_MS) return
    last = now
    const picked = pickAt(map, e.point)
    const state = store.getState()
    if (picked?.kind === 'gauge') state.hover(picked.uuid)
    else if (picked?.kind === 'river') state.hoverRiver(picked.id)
    else {
      state.hover(null)
      state.hoverRiver(null)
    }
    map.getCanvas().style.cursor = picked ? 'pointer' : ''
  }

  map.on('click', onClick)
  map.on('mousemove', onMove)
  return () => {
    map.off('click', onClick)
    map.off('mousemove', onMove)
  }
}
