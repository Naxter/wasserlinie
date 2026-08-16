import { describe, expect, it } from 'vitest'
import { toFloats } from './parquet'

describe('toFloats', () => {
  it('keeps a missing value missing', () => {
    // pandas writes NaN as a parquet null; Number(null) is 0, which would turn
    // "we cannot judge this gauge" into "this gauge is exactly normal".
    const out = toFloats([1.5, null, undefined, -0.25])
    expect(out[0]).toBeCloseTo(1.5)
    expect(Number.isNaN(out[1]!)).toBe(true)
    expect(Number.isNaN(out[2]!)).toBe(true)
    expect(out[3]).toBeCloseTo(-0.25)
  })
})
