import { describe, expect, it } from 'vitest'
import { formatCm, formatLead, formatTime, startOfDay } from './format'

describe('format', () => {
  it('rounds centimetres with German grouping', () => {
    expect(formatCm(1234.6)).toBe('1.235')
    expect(formatCm(-3.4)).toBe('-3')
  })

  it('writes lead times in hours, then days', () => {
    expect(formatLead(3)).toBe('+3 h')
    expect(formatLead(40)).toBe('+1 d 16 h')
  })

  it('uses Berlin local time', () => {
    expect(formatTime(Date.UTC(2026, 7, 16, 16, 0))).toBe('18:00')
    const midnight = startOfDay(Date.UTC(2026, 7, 16, 16, 0))
    expect(formatTime(midnight)).toBe('00:00')
  })
})
