import type { Map as MapLibreMap } from 'maplibre-gl'
import type { TimeSource } from '../data/timeline'
import type { AppState, LayerId } from '../store'
import { store } from '../store'

export interface LayerContext {
  map: MapLibreMap
  /** Swapped when the mode changes, so layers must read it when they update. */
  timeline: TimeSource
}

// Every visual layer speaks this contract. `load` receives an AbortSignal:
// when the layer is switched off or torn down before its data arrived, the
// request is cancelled instead of piling up behind the next one.
export interface VisualLayer {
  readonly id: LayerId
  load(ctx: LayerContext, signal: AbortSignal): Promise<void>
  /** Repaint for this instant. Called when the clock moves, never per frame. */
  update(simTime: number): void
  setVisible(visible: boolean): void
  dispose(): void
}

/**
 * Nothing here runs per frame.
 *
 * The 3D build repainted every layer on Cesium's `preRender` because the rivers
 * carried a travelling pulse. Without it there is nothing to animate: colour
 * only changes when the clock does. So the host listens to the store and
 * coalesces onto one animation frame — dragging the slider across a month
 * costs one repaint per frame at most, not one per store write.
 */
export class LayerHost {
  private readonly layers = new Map<LayerId, VisualLayer>()
  private readonly loading = new Map<LayerId, AbortController>()
  private readonly loaded = new Set<LayerId>()
  private unsubscribe: (() => void) | null = null
  private frame = 0
  private painted = Number.NaN

  constructor(private readonly ctx: LayerContext) {
    this.unsubscribe = store.subscribe((state, prev) => {
      if (state.layers !== prev.layers) this.applyVisibility(state)
      if (state.simTime !== prev.simTime) this.invalidate()
    })
  }

  add(layer: VisualLayer): void {
    this.layers.set(layer.id, layer)
    if (store.getState().layers[layer.id]) void this.activate(layer)
    else layer.setVisible(false)
  }

  /** Point every layer at a different time source without reloading geometry. */
  setTimeline(timeline: TimeSource): void {
    this.ctx.timeline = timeline
    this.painted = Number.NaN
    this.invalidate()
  }

  private invalidate(): void {
    if (this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      const simTime = store.getState().simTime
      if (simTime === this.painted) return
      this.painted = simTime
      for (const id of this.loaded) this.layers.get(id)!.update(simTime)
    })
  }

  private async activate(layer: VisualLayer): Promise<void> {
    if (this.loaded.has(layer.id) || this.loading.has(layer.id)) return
    const controller = new AbortController()
    this.loading.set(layer.id, controller)
    try {
      await layer.load(this.ctx, controller.signal)
      this.loaded.add(layer.id)
      layer.setVisible(store.getState().layers[layer.id])
      layer.update(store.getState().simTime)
    } catch (err) {
      if (!controller.signal.aborted) console.error(`layer ${layer.id} failed to load`, err)
    } finally {
      this.loading.delete(layer.id)
    }
  }

  private applyVisibility(state: AppState): void {
    for (const layer of this.layers.values()) {
      const on = state.layers[layer.id]
      if (on && !this.loaded.has(layer.id)) void this.activate(layer)
      else if (!on && this.loading.has(layer.id)) this.loading.get(layer.id)!.abort()
      if (this.loaded.has(layer.id)) layer.setVisible(on)
    }
  }

  dispose(): void {
    if (this.frame) cancelAnimationFrame(this.frame)
    this.unsubscribe?.()
    for (const c of this.loading.values()) c.abort()
    for (const layer of this.layers.values()) layer.dispose()
  }
}
