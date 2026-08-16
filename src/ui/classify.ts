import { unusual } from '../tokens'

// Plain language for a state value. Deliberately statistical wording: this is a
// comparison with the gauge's own long-term levels, not an official warning.
const BANDS: { below: number; text: string }[] = [
  { below: -1.0, text: 'niedriger als je an diesem Pegel gemessen' },
  { below: -0.7, text: 'außergewöhnlich niedrig für diesen Pegel' },
  { below: unusual.low, text: 'niedrig für diesen Pegel' },
  { below: -0.2, text: 'etwas unter dem Mittelwasser' },
  { below: 0.2, text: 'im normalen Bereich' },
  { below: unusual.high, text: 'etwas über dem Mittelwasser' },
  { below: 0.7, text: 'hoch für diesen Pegel' },
  { below: 1.0, text: 'außergewöhnlich hoch für diesen Pegel' },
]

const SHORT: { below: number; text: string }[] = [
  { below: -1.0, text: 'unter Rekord' },
  { below: -0.7, text: 'extrem niedrig' },
  { below: unusual.low, text: 'niedrig' },
  { below: -0.2, text: 'unter MW' },
  { below: 0.2, text: 'normal' },
  { below: unusual.high, text: 'über MW' },
  { below: 0.7, text: 'hoch' },
  { below: 1.0, text: 'extrem hoch' },
]

/** Two or three words for a list row, where the full sentence will not fit. */
export function classifyShort(state: number | null): string | null {
  if (state === null || Number.isNaN(state)) return null
  for (const band of SHORT) if (state < band.below) return band.text
  return 'über Rekord'
}

export function classify(state: number | null): string | null {
  if (state === null || Number.isNaN(state)) return null
  for (const band of BANDS) if (state < band.below) return band.text
  return 'höher als je an diesem Pegel gemessen'
}

/** Change over the last day, in cm, or null if the history does not reach back. */
export function changeIn24h(readings: { t: number; value: number }[], at: number): number | null {
  const day = 86_400_000
  const pick = (t: number) => {
    let best: number | null = null
    let bestGap = Infinity
    for (const r of readings) {
      const gap = Math.abs(r.t - t)
      if (gap < bestGap) {
        bestGap = gap
        best = r.value
      }
    }
    return bestGap <= 3 * 3_600_000 ? best : null
  }
  const now = pick(at)
  const before = pick(at - day)
  return now === null || before === null ? null : now - before
}
