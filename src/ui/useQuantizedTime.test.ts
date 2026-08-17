import { describe, expect, it } from 'vitest'
import { store } from '../store'
import { quantize, quantumFor } from './useQuantizedTime'

const DAY = 86_400_000

describe('quantize', () => {
  const live = { start: 0, now: 34 * DAY, end: 37 * DAY }
  const history = { start: 0, now: 9726 * DAY, end: 9726 * DAY }

  it('never rounds a measured reading into the forecast', () => {
    // On load the slider sits exactly on `now`, and half a step of rounding
    // used to carry it past — labelling every row a forecast on half of visits.
    for (let i = 0; i < 500; i++) {
      const at = live.now - i * 37_000
      expect(quantize(at, live)).toBeLessThanOrEqual(live.now)
    }
  })

  it('never rounds past the end of the daily record', () => {
    // Past `end` the grid has nothing, so every gauge returned null and the
    // list emptied out.
    for (let i = 0; i < 500; i++) {
      const at = history.now - i * 3_600_000
      expect(quantize(at, history)).toBeLessThanOrEqual(history.end)
    }
  })

  it('still lets the forecast be reached when the slider is really there', () => {
    const ahead = live.now + 2 * DAY
    expect(quantize(ahead, live)).toBeGreaterThan(live.now)
    expect(quantize(ahead, live)).toBeLessThanOrEqual(live.end)
  })

  it('stays inside the range at the bottom too', () => {
    expect(quantize(live.start, live)).toBeGreaterThanOrEqual(live.start)
    expect(quantize(live.start - 5 * DAY, live)).toBeGreaterThanOrEqual(live.start)
  })
})

describe('quantumFor', () => {
  it('gives the live window a grain of about a quarter hour', () => {
    const step = quantumFor(34 * DAY)
    expect(step / 60_000).toBeGreaterThan(10)
    expect(step / 60_000).toBeLessThan(40)
  })

  it('grows the grain for twenty-six years so playback does not render every frame', () => {
    // At ninety days a second, a fixed quarter-hour grain would change on
    // every single frame and re-render the whole list sixty times a second.
    const step = quantumFor(9726 * DAY)
    const rendersPerSecond = 90 / (step / DAY)
    expect(rendersPerSecond).toBeLessThan(30)
    expect(rendersPerSecond).toBeGreaterThan(5)
  })

  it('never grinds finer than a minute', () => {
    expect(quantumFor(0)).toBeGreaterThanOrEqual(60_000)
    expect(quantumFor(1000)).toBeGreaterThanOrEqual(60_000)
  })

  it('holds one value for a whole step, so the store can skip the render', () => {
    store.getState().setRange({ start: 0, now: 9726 * DAY, end: 9726 * DAY })
    const step = quantumFor(9726 * DAY)
    const at = (t: number) => Math.round(t / step) * step
    expect(at(step * 4)).toBe(at(step * 4 + step * 0.3))
    expect(at(step * 4)).not.toBe(at(step * 5.2))
  })
})
