import type { Map as MapLibreMap } from 'maplibre-gl'
import type { TimeSource } from '../data/timeline'
import { rampCss } from '../color/ramp'
import { store } from '../store'
import type { LayerContext, VisualLayer } from './plugin'
import { gaugeLayers, gaugeSource, LAYER_GAUGE_HIT, LAYER_GAUGES, SRC_GAUGES } from './style'

const QUANTUM = 15 * 60 * 1000

/**
 * The gauges themselves: one dot each, coloured by the same ramp as the river
 * under it.
 *
 * Colour is pushed through feature state rather than by replacing the source
 * data, so moving the clock never re-parses seven hundred points. The cache of
 * the last colour written matters more than it looks: during playback most
 * gauges hold their colour from one step to the next, so a repaint usually
 * touches a few dozen features instead of all of them.
 */
export class GaugeLayer implements VisualLayer {
  readonly id = 'gauges' as const
  private map: MapLibreMap | null = null
  private timeline: TimeSource | null = null
  private last: string[] = []
  private visible = true
  private painted = Number.NaN
  private active: number | null = null
  private unsubscribe: (() => void) | null = null

  // Nothing to fetch: the stations are already in the timeline by the time any
  // layer loads. The signature stays async because the contract is.
  load(ctx: LayerContext, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    this.map = ctx.map
    this.timeline = ctx.timeline
    const stations = ctx.timeline.stations
    this.last = new Array<string>(stations.length).fill('')
    this.map.addSource(SRC_GAUGES, gaugeSource(stations))
    for (const layer of gaugeLayers()) this.map.addLayer(layer)

    this.unsubscribe = store.subscribe((s, prev) => {
      if (s.selected !== prev.selected || s.hovered !== prev.hovered) this.mark(s.selected ?? s.hovered)
    })
    return Promise.resolve()
  }

  /** Ring the gauge the sidebar is talking about, so the two agree on screen. */
  private mark(uuid: string | null): void {
    if (!this.map || !this.timeline) return
    const next = uuid === undefined || uuid === null ? null : (this.timeline.slotOf(uuid) ?? null)
    if (next === this.active) return
    if (this.active !== null) this.map.setFeatureState({ source: SRC_GAUGES, id: this.active }, { active: false })
    if (next !== null) this.map.setFeatureState({ source: SRC_GAUGES, id: next }, { active: true })
    this.active = next
  }

  update(simTime: number): void {
    if (!this.map || !this.timeline || !this.visible) return
    const t = Math.round(simTime / QUANTUM) * QUANTUM
    if (t === this.painted) return
    this.painted = t
    for (let i = 0; i < this.last.length; i++) {
      const sample = this.timeline.sample(i, simTime)
      const color = sample && !Number.isNaN(sample.state) ? rampCss(sample.state) : ''
      if (color === this.last[i]) continue
      this.last[i] = color
      this.map.setFeatureState({ source: SRC_GAUGES, id: i }, { color: color || null })
    }
  }

  setVisible(visible: boolean): void {
    this.visible = visible
    if (!this.map) return
    const value = visible ? 'visible' : 'none'
    for (const id of [LAYER_GAUGES, LAYER_GAUGE_HIT]) {
      if (this.map.getLayer(id)) this.map.setLayoutProperty(id, 'visibility', value)
    }
    if (visible) {
      this.painted = Number.NaN
      this.update(store.getState().simTime)
    }
  }

  dispose(): void {
    this.unsubscribe?.()
    if (!this.map) return
    for (const id of [LAYER_GAUGES, LAYER_GAUGE_HIT]) {
      if (this.map.getLayer(id)) this.map.removeLayer(id)
    }
    if (this.map.getSource(SRC_GAUGES)) this.map.removeSource(SRC_GAUGES)
  }
}
