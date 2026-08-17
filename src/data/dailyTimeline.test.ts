import { describe, expect, it } from 'vitest'
import { DailyTimeline } from './dailyTimeline'
import type { History, HistoryMeta, Station } from './types'

const DAY = 86_400_000

function station(uuid: string): Station {
  return {
    uuid,
    name: uuid,
    water: 'Test',
    waterKey: 'test',
    lon: 0,
    lat: 0,
    km: null,
    zero: null,
    mw: null,
    low: null,
    high: null,
    ref: 'mean',
    marks: {},
    refYears: 20,
    basis: 'seasonal',
    hasData: true,
  }
}

const meta: HistoryMeta = {
  t0: '2000-01-01',
  days: 4,
  stateOffset: -1.5,
  stateScale: 3,
  stateLevels: 255,
  noData: 0,
  cmMissing: -32768,
  stations: ['a'],
}

/** The byte the pipeline would write for a state. */
function code(state: number): number {
  return Math.round(((state - meta.stateOffset) / meta.stateScale) * (meta.stateLevels - 1)) + 1
}

function build(bytes: number[], cm = [10, 20, 30, 40], stations = [station('a'), station('b')]): DailyTimeline {
  const history: History = { meta, grid: new Uint8Array(bytes), cm: new Int16Array(cm) }
  return new DailyTimeline(stations, history)
}

describe('DailyTimeline', () => {
  const day0 = Date.parse('2000-01-01T12:00:00Z')

  it('reads the state the pipeline packed', () => {
    const tl = build([code(-1), code(0), code(0.5), 0])
    expect(tl.sample(0, day0)?.state).toBeCloseTo(-1, 2)
    expect(tl.sample(0, day0 + 2 * DAY)?.state).toBeCloseTo(0.5, 2)
  })

  it('interpolates between two days', () => {
    const tl = build([code(-1), code(0), code(0), 0])
    expect(tl.sample(0, day0 + DAY / 2)?.state).toBeCloseTo(-0.5, 2)
  })

  it('treats the reserved byte as no reading, not as a record low', () => {
    const tl = build([0, 0, code(0), 0])
    expect(tl.sample(0, day0)).toBeNull()
    // The last day is also empty, so nothing to lean on either side.
    expect(tl.sample(0, day0 + 3 * DAY)).toBeNull()
  })

  it('has nothing for a gauge the archive never held', () => {
    const tl = build([code(0), code(0), code(0), code(0)])
    expect(tl.sample(1, day0)).toBeNull()
  })

  it('stops at the ends of the record', () => {
    const tl = build([code(0), code(0), code(0), code(0)])
    expect(tl.sample(0, day0 - DAY)).toBeNull()
    expect(tl.sample(0, day0 + 4 * DAY)).toBeNull()
  })

  it('never claims a forecast', () => {
    const tl = build([code(0), code(0), code(0), code(0)])
    expect(tl.sample(0, day0)?.forecast).toBe(false)
    expect(tl.now).toBe(tl.end)
  })

  it('carries the readings, and skips the days without one', () => {
    const tl = build([code(0), code(0), code(0), code(0)], [10, 20, meta.cmMissing, 40])
    expect(tl.sample(0, day0)?.cm).toBe(10)
    expect(tl.sample(0, day0 + DAY / 2)?.cm).toBe(15)
    expect(tl.series(0).map((p) => p.value)).toEqual([10, 20, 40])
    expect(tl.series(1)).toEqual([])
  })
})
