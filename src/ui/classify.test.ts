import { describe, expect, it } from 'vitest'
import { changeIn24h, classify, classifyShort } from './classify'

describe('classify', () => {
  it('only claims a seasonal comparison when there is one', () => {
    expect(classify(-0.8, 'seasonal')).toContain('Jahreszeit')
    expect(classify(-0.8, 'marks')).toContain('diesen Pegel')
    expect(classify(-0.8, 'marks')).not.toContain('Jahreszeit')
  })

  it('names a record at either end', () => {
    expect(classify(-1.2, 'seasonal')).toBe('niedriger als je zu dieser Jahreszeit gemessen')
    expect(classify(1.4, 'seasonal')).toBe('höher als je zu dieser Jahreszeit gemessen')
  })

  it('says nothing without a state', () => {
    expect(classify(null)).toBeNull()
    expect(classify(NaN)).toBeNull()
    expect(classifyShort(null)).toBeNull()
  })

  it('calls the middle normal', () => {
    expect(classifyShort(0)).toBe('normal')
    expect(classify(0, 'seasonal')).toBe('normal für die Jahreszeit')
  })
})

describe('changeIn24h', () => {
  const hour = 3_600_000
  const now = Date.UTC(2026, 7, 16, 12)
  const readings = Array.from({ length: 48 }, (_, i) => ({ t: now - (47 - i) * hour, value: 100 + i }))

  it('measures the change over the last day', () => {
    expect(changeIn24h(readings, now)).toBeCloseTo(24)
  })

  it('returns null when the history does not reach back', () => {
    expect(changeIn24h(readings.slice(-3), now)).toBeNull()
    expect(changeIn24h([], now)).toBeNull()
  })
})
