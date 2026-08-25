import type { ExpressionSpecification, Map as MapLibreMap } from 'maplibre-gl'
import { loadRiverDetail, loadRivers } from '../data/assets'
import { sampleRiver } from '../data/profile'
import type { TimeSource } from '../data/timeline'
import { rampCss } from '../color/ramp'
import { store } from '../store'
import { unknownColor } from '../tokens'
import type { LayerContext, VisualLayer } from './plugin'
import {
  gaugedRiverLayer,
  networkLayers,
  riverLayerId,
  riverSource,
  SRC_DETAIL,
  SRC_RIVERS,
} from './style'

// Stops per river gradient. The state between two gauges is a straight line,
// but the ramp bends on the way from amber to blue, so the gradient is sampled
// rather than given one stop per gauge — at one stop per gauge the colour
// between two of them would cut the corner off the ramp.
const STOPS = 24

/** Readings are hourly; repainting more finely than that only costs work. */
const QUANTUM = 15 * 60 * 1000

interface Gauged {
  id: number
  /** slots in the time source, ordered along the river */
  slots: number[]
  /** where each of those gauges sits, 0 at the head */
  pos: number[]
}

export class RiverLayer implements VisualLayer {
  readonly id = 'rivers' as const
  private map: MapLibreMap | null = null
  private ctx: LayerContext | null = null
  private gauged: Gauged[] = []
  private layerIds: string[] = []
  private visible = true
  private painted = Number.NaN
  /** Which source `painted` was painted from; the mode switch replaces it. */
  private source: TimeSource | null = null

  async load(ctx: LayerContext, signal: AbortSignal): Promise<void> {
    const rivers = await loadRivers(signal)
    signal.throwIfAborted()
    this.map = ctx.map
    // The context is held, never the time source on it: switching to the long
    // view swaps that source, and a layer holding the old one goes on asking
    // the ninety-day window about 2003 and gets null for every gauge.
    this.ctx = ctx

    this.map.addSource(SRC_RIVERS, riverSource(rivers.rivers))
    for (const layer of networkLayers()) {
      // The fine network's source has not arrived yet; its layer waits for it.
      if (layer.source === SRC_DETAIL) continue
      this.map.addLayer(layer)
    }

    for (const river of rivers.rivers) {
      const gauges = river.gauges
        .map((g) => ({ s: g.s, slot: ctx.timeline.slotOf(g.uuid) }))
        .filter((g): g is { s: number; slot: number } => g.slot !== undefined)
        .sort((a, b) => a.s - b.s)
      if (gauges.length === 0) continue
      this.map.addLayer(gaugedRiverLayer(river.id))
      this.layerIds.push(riverLayerId(river.id))
      this.gauged.push({ id: river.id, slots: gauges.map((g) => g.slot), pos: gauges.map((g) => g.s) })
    }

    // Every part is clickable, so the panel needs to find them by the id the
    // feature carries.
    const index = new Map(rivers.rivers.map((r) => [r.id, r]))
    store.getState().setRivers(index)

    // Three times the size of the gauged network and nothing to do with the
    // first impression, so it arrives on its own.
    const detail = await loadRiverDetail(signal)
    signal.throwIfAborted()
    this.map.addSource(SRC_DETAIL, riverSource(detail.rivers))
    const detailLayer = networkLayers().find((l) => l.source === SRC_DETAIL)
    if (detailLayer) this.map.addLayer(detailLayer, this.layerIds[0])
    for (const river of detail.rivers) index.set(river.id, river)
    store.getState().setRivers(new Map(index))
    this.applyVisibility()
  }

  update(simTime: number): void {
    if (!this.map || !this.ctx || !this.visible) return
    const timeline = this.ctx.timeline
    const t = Math.round(simTime / QUANTUM) * QUANTUM
    // The same instant means a different picture once the source has changed,
    // so the quantum cache only counts while the source is the same one.
    if (t === this.painted && timeline === this.source) return
    this.painted = t
    this.source = timeline
    for (const river of this.gauged) this.paint(river, timeline, simTime)
  }

  private paint(river: Gauged, timeline: TimeSource, simTime: number): void {
    const pos: number[] = []
    const values: number[] = []
    for (let i = 0; i < river.slots.length; i++) {
      const sample = timeline.sample(river.slots[i]!, simTime)
      if (!sample || Number.isNaN(sample.state)) continue
      pos.push(river.pos[i]!)
      values.push(sample.state)
    }
    const gradient: (number | string)[] = []
    if (values.length === 0) {
      // Nothing measured anywhere on it today: grey, rather than yesterday's
      // colours left lying on the map.
      gradient.push(0, unknownColor, 1, unknownColor)
    } else {
      const states = sampleRiver(pos, values, STOPS)
      for (let i = 0; i < STOPS; i++) gradient.push(i / (STOPS - 1), rampCss(states[i]!))
    }
    this.map!.setPaintProperty(riverLayerId(river.id), 'line-gradient', [
      'interpolate',
      ['linear'],
      ['line-progress'],
      ...gradient,
    ] as ExpressionSpecification)
  }

  setVisible(visible: boolean): void {
    this.visible = visible
    this.applyVisibility()
    if (visible) {
      this.painted = Number.NaN
      this.update(store.getState().simTime)
    }
  }

  private applyVisibility(): void {
    if (!this.map) return
    const value = this.visible ? 'visible' : 'none'
    for (const id of [...this.layerIds, 'rivers-quiet', 'rivers-detail']) {
      if (this.map.getLayer(id)) this.map.setLayoutProperty(id, 'visibility', value)
    }
  }

  dispose(): void {
    if (!this.map) return
    for (const id of [...this.layerIds, 'rivers-quiet', 'rivers-detail']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id)
    }
    for (const src of [SRC_RIVERS, SRC_DETAIL]) {
      if (this.map.getSource(src)) this.map.removeSource(src)
    }
    this.layerIds = []
    this.gauged = []
  }
}
