import { describe, expect, it } from 'vitest'
import { yardstick } from './classify'
import { waterType } from './water'

describe('waterType', () => {
  it('calls the Nord-Ostsee-Kanal a canal, not the Baltic', () => {
    expect(waterType('NORD-OSTSEE-KANAL')).toBe('canal')
    expect(waterType('OSTSEE')).toBe('coast')
  })

  it('separates the three kinds that behave differently', () => {
    expect(waterType('RHEIN')).toBe('river')
    expect(waterType('ELBE')).toBe('river')
    expect(waterType('MITTELLANDKANAL')).toBe('canal')
    expect(waterType('MÜRITZ-ELDE-WASSERSTRASSE')).toBe('canal')
    expect(waterType('HAVEL-ODER-WASSERSTRASSE')).toBe('canal')
    expect(waterType('KLEINES HAFF')).toBe('coast')
    expect(waterType('NORDSEE')).toBe('coast')
  })
})

describe('yardstick', () => {
  it('describes the seasonal scale in years, not in marks', () => {
    // -0.5 is the 10th percentile for the date, not mean low water.
    expect(yardstick(-0.5, 'seasonal')).toBe('tiefer als 9 von 10 Jahren')
    expect(yardstick(0.5, 'seasonal')).toBe('höher als 9 von 10 Jahren')
    expect(yardstick(-0.25, 'seasonal')).toBe('tiefer als 3 von 4 Jahren')
  })

  it('uses mark language only where marks were actually used', () => {
    expect(yardstick(-0.5, 'marks')).toBe('unter dem mittleren Niedrigwasser')
    expect(yardstick(-1, 'marks')).toBe('unter dem Niedrigstwert')
  })

  it('never contradicts the direction the colour shows', () => {
    for (const basis of ['seasonal', 'marks'] as const) {
      for (const state of [-2, -1, -0.6, -0.3]) expect(yardstick(state, basis)).toMatch(/tiefer|unter/)
      for (const state of [0.3, 0.6, 1, 2]) expect(yardstick(state, basis)).toMatch(/höher|über/)
    }
  })

  it('says nothing when there is nothing to say', () => {
    expect(yardstick(null, 'seasonal')).toBeNull()
    expect(yardstick(NaN, 'marks')).toBeNull()
  })
})
