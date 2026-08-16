import { JulianDate, type Viewer } from 'cesium'
import { store } from '../store'
import { time as tokens } from '../tokens'

// The sun follows the slider. Cesium's clock is driven from the store, never
// the other way round, so scrubbing moves the terminator across the terrain.
export function bindClock(viewer: Viewer): () => void {
  viewer.clock.shouldAnimate = false
  let last = performance.now()
  const scratch = new JulianDate()

  const tick = (): void => {
    const now = performance.now()
    const dt = Math.min(0.25, (now - last) / 1000)
    last = now
    const state = store.getState()
    if (state.playing && state.range) {
      const next = state.simTime + dt * tokens.playSpeed * 1000
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
