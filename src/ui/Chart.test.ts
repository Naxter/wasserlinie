import { describe, expect, it } from 'vitest'
import { clip, thin } from './Chart'

const DAY = 86_400_000

function ramp(n: number): { t: number; value: number }[] {
  return Array.from({ length: n }, (_, i) => ({ t: i * DAY, value: Math.sin(i / 40) * 100 + 200 }))
}

describe('thin', () => {
  it('leaves a short series alone', () => {
    const points = ramp(50)
    expect(thin(points, 300)).toBe(points)
  })

  it('keeps the record low and high of every bucket', () => {
    // 9,726 days is the real length of the archive.
    const points = ramp(9726)
    points[5000]!.value = -999
    points[5001]!.value = 999
    const out = thin(points, 300)
    expect(out.length).toBeLessThan(points.length / 4)
    // Averaging would erase exactly the extremes this app exists to show.
    expect(Math.min(...out.map((p) => p.value))).toBe(-999)
    expect(Math.max(...out.map((p) => p.value))).toBe(999)
  })

  it('keeps time moving forwards so the path does not zigzag', () => {
    const out = thin(ramp(9726), 300)
    for (let i = 1; i < out.length; i++) expect(out[i]!.t).toBeGreaterThanOrEqual(out[i - 1]!.t)
  })
})

describe('clip', () => {
  it('keeps one point beyond each edge so the line reaches them', () => {
    const points = ramp(100)
    const out = clip(points, 10 * DAY, 20 * DAY)
    expect(out[0]!.t).toBeLessThanOrEqual(10 * DAY)
    expect(out[out.length - 1]!.t).toBeGreaterThanOrEqual(20 * DAY)
    expect(out.length).toBeLessThan(20)
  })
})
