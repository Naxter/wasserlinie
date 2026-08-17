import { ScreenSpaceEventHandler, ScreenSpaceEventType, type Cartesian2, type Scene } from 'cesium'
import { store } from '../store'

// One handler for the whole scene rather than one per layer: gauges sit on top
// of the rivers they measure, so two handlers would both fire on the same click
// and the last one to run would win.

const RIVER_PREFIX = 'river-'
const HOVER_INTERVAL_MS = 60

export type Picked = { kind: 'gauge'; uuid: string } | { kind: 'river'; id: number } | null

/** What is under the cursor, from the ids the layers put on their geometry. */
export function pickAt(scene: Scene, position: Cartesian2): Picked {
  const hit = scene.pick(position) as { id?: unknown } | undefined
  const id = hit?.id
  if (typeof id !== 'string') return null
  if (!id.startsWith(RIVER_PREFIX)) return { kind: 'gauge', uuid: id }
  const river = Number(id.slice(RIVER_PREFIX.length))
  return Number.isFinite(river) ? { kind: 'river', id: river } : null
}

export function bindPicking(scene: Scene): () => void {
  const handler = new ScreenSpaceEventHandler(scene.canvas)

  handler.setInputAction((e: ScreenSpaceEventHandler.PositionedEvent) => {
    const picked = pickAt(scene, e.position)
    if (picked?.kind === 'gauge') store.getState().select(picked.uuid)
    else if (picked?.kind === 'river') store.getState().selectRiver(picked.id)
  }, ScreenSpaceEventType.LEFT_CLICK)

  let last = 0
  handler.setInputAction((e: ScreenSpaceEventHandler.MotionEvent) => {
    const now = performance.now()
    if (now - last < HOVER_INTERVAL_MS) return
    last = now
    const picked = pickAt(scene, e.endPosition)
    const state = store.getState()
    if (picked?.kind === 'gauge') state.hover(picked.uuid)
    else if (picked?.kind === 'river') state.hoverRiver(picked.id)
    else {
      state.hover(null)
      state.hoverRiver(null)
    }
    scene.canvas.style.cursor = picked ? 'pointer' : ''
  }, ScreenSpaceEventType.MOUSE_MOVE)

  return () => handler.destroy()
}
