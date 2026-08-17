import { describe, expect, it } from 'vitest'
import type { River } from '../data/types'
import { mainSegments } from './Search'

function seg(id: number, name: string, gauges: number, km: number): River {
  return {
    id,
    name,
    cls: 42,
    km,
    coords: [],
    gauges: Array.from({ length: gauges }, (_, i) => ({ uuid: `${id}-${i}`, s: i / gauges })),
  }
}

describe('mainSegments', () => {
  it('keeps the segment with the most gauges, not the last one', () => {
    const picked = mainSegments([seg(1, 'Rhein', 27, 400), seg(2, 'Rhein', 0, 5)])
    expect(picked).toHaveLength(1)
    expect(picked[0]!.id).toBe(1)
    expect(picked[0]!.gauges).toHaveLength(27)
  })

  it('falls back to the longest segment when no segment has a gauge', () => {
    const picked = mainSegments([seg(1, 'Wupper', 0, 12), seg(2, 'Wupper', 0, 60), seg(3, 'Wupper', 0, 3)])
    expect(picked[0]!.id).toBe(2)
  })

  it('leaves distinct rivers alone', () => {
    const picked = mainSegments([seg(1, 'Mosel', 4, 200), seg(2, 'Saar', 3, 100)])
    expect(picked.map((r) => r.name).sort()).toEqual(['Mosel', 'Saar'])
  })
})
