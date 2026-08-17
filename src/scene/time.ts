import { JulianDate, type Viewer } from 'cesium'
import { store, type Mode } from '../store'
import { time as tokens } from '../tokens'

/** A frame this long or longer counts as this long: a backgrounded tab must
 * not come back and jump the slider to the end. */
export const MAX_FRAME_SECONDS = 0.25

/** Where the slider lands after `dt` real seconds of playback. */
export function advance(simTime: number, dt: number, mode: Mode): number {
  const speed = mode === 'history' ? tokens.historyPlaySpeed : tokens.playSpeed
  return simTime + Math.min(MAX_FRAME_SECONDS, dt) * speed * 1000
}

// The sun follows the slider. Cesium's clock is driven from the store, never
// the other way round, so scrubbing moves the terminator across the terrain.
export function bindClock(viewer: Viewer): () => void {
  viewer.clock.shouldAnimate = false
  let last = performance.now()
  const scratch = new JulianDate()

  const tick = (): void => {
    const now = performance.now()
    const dt = (now - last) / 1000
    last = now
    const state = store.getState()
    if (state.playing && state.range) {
      const next = advance(state.simTime, dt, state.mode)
      if (next >= state.range.end) {
        state.setSimTime(state.range.end)
        state.togglePlay()
      } else {
        state.setSimTime(next)
      }
    }
    viewer.clock.currentTime = JulianDate.fromDate(new Date(store.getState().simTime), scratch)
  }

  viewer.scene.preUpdate.addEventListener(tick)
  return () => viewer.scene.preUpdate.removeEventListener(tick)
}
