import { describe, expect, it } from 'vitest'
import { Timeline, type LevelSource } from './timeline'
import type { Station } from './types'

const HOUR = 3_600_000
const start = Date.UTC(2026, 7, 1)
const now = start + 3 * HOUR
const end = now + 6 * HOUR

const station = (uuid: string, placed: boolean): Station => ({
  uuid,
  name: uuid.toUpperCase(),
  water: 'TEST',
  waterKey: 'test',
  lon: 8,
  lat: 50,
  km: null,
  zero: null,
  mw: null,
  low: placed ? 100 : null,
  high: placed ? 300 : null,
  ref: placed ? 'mean' : null,
  marks: {},
  refYears: placed ? 20 : null,
  basis: placed ? 'marks' : null,
  hasData: true,
})

// Station 'a' is placed on its own scale by the pipeline; 'b' has no reference
// levels, so its state arrives as NaN and must stay NaN.
const source: LevelSource = {
  eachLevel(visit) {
    visit('a', start, 100, -0.5)
    visit('a', start + HOUR, 200, 0)
    visit('a', now, 300, 0.5)
    visit('b', now, 42, NaN)
  },
  eachForecast(visit) {
    visit('a', now + 3 * HOUR, 300, 0.5, 0.25)
    visit('a', now + 6 * HOUR, 300, 0.5, 0.5)
  },
}

const build = () => Timeline.build([station('a', true), station('b', false)], source, start, now, end)

describe('Timeline', () => {
  it('interpolates measurements and their state between hours', () => {
    const s = build().sample(0, start + 0.5 * HOUR)!
    expect(s.cm).toBeCloseTo(150)
    expect(s.state).toBeCloseTo(-0.25)
    expect(s.forecast).toBe(false)
    expect(s.spread).toBe(0)
  })

  it('fills the forecast hours between the model points', () => {
    const tl = build()
    const mid = tl.sample(0, now + 1.5 * HOUR)!
    expect(mid.forecast).toBe(true)
    expect(mid.cm).toBeCloseTo(300)
    expect(mid.spread).toBeCloseTo(0.125)
    expect(tl.sample(0, now + 6 * HOUR)!.spread).toBeCloseTo(0.5)
  })

  it('keeps the state NaN for stations the pipeline could not place', () => {
    const s = build().sample(1, now)!
    expect(s.cm).toBe(42)
    expect(Number.isNaN(s.state)).toBe(true)
  })

  it('returns null outside the range and where nothing is known', () => {
    const tl = build()
    expect(tl.sample(0, start - HOUR)).toBeNull()
    expect(tl.sample(1, start)).toBeNull()
  })

  it('is deterministic: seeking away and back gives the same sample', () => {
    const tl = build()
    const before = tl.sample(0, start + 1.25 * HOUR)!
    tl.sample(0, end)
    tl.sample(0, start)
    expect(tl.sample(0, start + 1.25 * HOUR)).toEqual(before)
  })
})
