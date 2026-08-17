import { describe, expect, it } from 'vitest'
import { advance, MAX_FRAME_SECONDS } from './clock'

const DAY = 86_400_000
const t0 = Date.parse('2026-08-17T12:00:00Z')

/** Seconds of playback at a normal frame cadence, in simulated days. */
function play(seconds: number, mode: 'live' | 'history', fps = 60): number {
  let t = t0
  for (let i = 0; i < seconds * fps; i++) t = advance(t, 1 / fps, mode)
  return (t - t0) / DAY
}

describe('advance', () => {
  it('runs the live window at six hours a second', () => {
    expect(play(1, 'live')).toBeCloseTo(0.25, 6)
  })

  it('runs the whole record fast enough to watch', () => {
    // Twenty-six years at ninety days a second crosses in under two minutes;
    // at the live rate the same record would take eleven hours.
    expect(play(1, 'history')).toBeCloseTo(90, 6)
    const record = 9726
    expect(record / play(1, 'history')).toBeLessThan(120)
    expect(record / play(1, 'live')).toBeGreaterThan(30_000)
  })

  it('holds its rate whatever the frame rate', () => {
    // The clamp only bites on a stalled frame, not on a merely slow one.
    expect(play(1, 'history', 30)).toBeCloseTo(play(1, 'history', 60), 6)
    expect(play(1, 'history', 10)).toBeCloseTo(play(1, 'history', 60), 6)
  })

  it('does not let a stalled frame jump the slider', () => {
    // A backgrounded tab can hand back a dt of many seconds.
    const stalled = advance(t0, 30, 'history')
    expect(stalled).toBe(advance(t0, MAX_FRAME_SECONDS, 'history'))
  })
})
