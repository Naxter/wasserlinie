import { describe, expect, it } from 'vitest'
import { terrain } from '../tokens'
import { cinematicEase, exaggerationFor } from './curves'

describe('cinematicEase', () => {
  it('starts at 0, ends at 1 and passes the middle', () => {
    expect(cinematicEase(0)).toBe(0)
    expect(cinematicEase(1)).toBe(1)
    expect(cinematicEase(0.5)).toBeCloseTo(0.5)
  })

  it('is slow at both ends', () => {
    expect(cinematicEase(0.1)).toBeLessThan(0.1)
    expect(cinematicEase(0.9)).toBeGreaterThan(0.9)
  })
})

describe('exaggerationFor', () => {
  it('is flat when close and full when far', () => {
    expect(exaggerationFor(0)).toBe(terrain.exaggerationNear)
    expect(exaggerationFor(terrain.exaggerationNearHeight)).toBe(terrain.exaggerationNear)
    expect(exaggerationFor(terrain.exaggerationFarHeight * 3)).toBe(terrain.exaggerationFar)
  })

  it('never decreases with height', () => {
    let last = -Infinity
    for (let h = 0; h < 2_000_000; h += 25_000) {
      const e = exaggerationFor(h)
      expect(e).toBeGreaterThanOrEqual(last)
      last = e
    }
  })
})
