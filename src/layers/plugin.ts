import type { Viewer } from 'cesium'
import type { TimeSource } from '../data/timeline'
import type { AppState, LayerId } from '../store'
import { store } from '../store'

export interface LayerContext {
  viewer: Viewer
  /** Swapped when the mode changes, so layers must read it per frame. */
  timeline: TimeSource
}

export interface FrameInfo {
  /** simulated time in ms */
  simTime: number
  /** wall clock seconds since start, for animation */
  clock: number
}

// Every visual layer speaks this contract. `load` receives an AbortSignal:
// when the layer is switched off or torn down before its data arrived, the
// request is cancelled instead of piling up behind the next one.
export interface VisualLayer {
  readonly id: LayerId
  load(ctx: LayerContext, signal: AbortSignal): Promise<void>
  frame(info: FrameInfo): void
  setVisible(visible: boolean): void
  dispose(): void
}

export class LayerHost {
  private readonly layers = new Map<LayerId, VisualLayer>()
  private readonly loading = new Map<LayerId, AbortController>()
  private readonly loaded = new Set<LayerId>()
  private readonly start = performance.now()
  private unsubscribe: (() => void) | null = null

  constructor(private readonly ctx: LayerContext) {
    this.ctx.viewer.scene.preRender.addEventListener(this.tick)
    this.unsubscribe = store.subscribe((state, prev) => {
      if (state.layers !== prev.layers) this.applyVisibility(state)
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
  }

  private async activate(layer: VisualLayer): Promise<void> {
    if (this.loaded.has(layer.id) || this.loading.has(layer.id)) return
    const controller = new AbortController()
    this.loading.set(layer.id, controller)
    try {
      await layer.load(this.ctx, controller.signal)
      this.loaded.add(layer.id)
      layer.setVisible(store.getState().layers[layer.id])
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

  private readonly tick = (): void => {
    const info: FrameInfo = { simTime: store.getState().simTime, clock: (performance.now() - this.start) / 1000 }
    for (const id of this.loaded) this.layers.get(id)!.frame(info)
  }

  dispose(): void {
    this.ctx.viewer.scene.preRender.removeEventListener(this.tick)
    this.unsubscribe?.()
    for (const c of this.loading.values()) c.abort()
    for (const layer of this.layers.values()) layer.dispose()
  }
}
