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

/**
 * Playback, and nothing else.
 *
 * The 3D build ran this off Cesium's clock so that scrubbing time also moved
 * the sun across the terrain. That coupled two things a reader has to be able
 * to separate: with the light moving, the same water on two different days did
 * not look the same, so the map could not be compared against itself. Here the
 * clock only moves the data.
 */
export function runClock(): () => void {
  let last = performance.now()
  let frame = requestAnimationFrame(function tick(now) {
    frame = requestAnimationFrame(tick)
    const dt = (now - last) / 1000
    last = now
    const state = store.getState()
    if (!state.playing || !state.range) return
    const next = advance(state.simTime, dt, state.mode)
    if (next >= state.range.end) {
      state.setSimTime(state.range.end)
      state.togglePlay()
    } else {
      state.setSimTime(next)
    }
  })
  return () => cancelAnimationFrame(frame)
}
