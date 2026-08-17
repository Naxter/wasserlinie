import { describe, expect, it } from 'vitest'
import { ticksFor } from './ticks'

const DAY = 86_400_000

describe('ticksFor', () => {
  it('does not put a tick on every day of twenty-six years', () => {
    const start = new Date(2000, 0, 1).getTime()
    const end = new Date(2026, 7, 17).getTime()
    const ticks = ticksFor(start, end)
    // One per year, not 9,726 elements in the DOM.
    expect(ticks.length).toBeLessThan(40)
    expect(ticks.filter((t) => t.label).length).toBeLessThanOrEqual(11)
    expect(ticks.some((t) => t.label === '2010')).toBe(true)
  })

  it('switches to months over a year and days over a month', () => {
    const start = new Date(2025, 0, 1).getTime()
    const year = ticksFor(start, start + 300 * DAY)
    expect(year.length).toBeGreaterThan(8)
    expect(year.length).toBeLessThan(14)

    const month = ticksFor(start, start + 31 * DAY)
    expect(month.length).toBeGreaterThan(25)
    expect(month.length).toBeLessThan(35)
  })

  it('keeps labels readable, and fewer of them on a phone', () => {
    const start = new Date(2000, 0, 1).getTime()
    const end = new Date(2026, 7, 17).getTime()
    const wide = ticksFor(start, end, false).filter((t) => t.label).length
    const narrow = ticksFor(start, end, true).filter((t) => t.label).length
    expect(narrow).toBeLessThanOrEqual(5)
    expect(narrow).toBeLessThan(wide)
  })

  it('marks every tick inside the range', () => {
    const start = new Date(2020, 5, 10).getTime()
    const end = new Date(2026, 7, 17).getTime()
    for (const tick of ticksFor(start, end)) {
      expect(tick.t).toBeGreaterThanOrEqual(start)
      expect(tick.t).toBeLessThanOrEqual(end)
    }
  })
})
