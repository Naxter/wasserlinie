import type { ForecastRow, LevelRow } from './db'
import type { Station } from './types'

const HOUR = 3_600_000

export interface Sample {
  cm: number
  /** 0 at the station's low-water mark, 1 at its high-water mark; NaN without reference */
  index: number
  /** forecast band width (p90 - p10) in index units, 0 for measurements */
  spread: number
  forecast: boolean
}

// One hourly grid for every station, measurements first, forecast median
// after `now`. Everything that moves with the time slider reads from here.
export class Timeline {
  readonly hours: number
  readonly cm: Float32Array
  readonly index: Float32Array
  readonly spread: Float32Array
  private readonly slot = new Map<string, number>()

  constructor(
    readonly stations: Station[],
    readonly start: number,
    readonly now: number,
    readonly end: number,
  ) {
    this.hours = Math.round((end - start) / HOUR) + 1
    const n = stations.length * this.hours
    this.cm = new Float32Array(n).fill(NaN)
    this.index = new Float32Array(n).fill(NaN)
    this.spread = new Float32Array(n)
    stations.forEach((s, i) => this.slot.set(s.uuid, i))
  }

  static build(stations: Station[], levels: LevelRow[], forecast: ForecastRow[], start: number, now: number, end: number): Timeline {
    const tl = new Timeline(stations, start, now, end)
    for (const row of levels) {
      const s = tl.slot.get(row.station)
      const h = tl.hourOf(row.t)
      if (s === undefined || h === null || row.t > now) continue
      tl.cm[s * tl.hours + h] = row.value
    }
    tl.placeForecast(forecast)
    tl.deriveIndex()
    return tl
  }

  private hourOf(t: number): number | null {
    const h = Math.round((t - this.start) / HOUR)
    return h >= 0 && h < this.hours ? h : null
  }

  private placeForecast(rows: ForecastRow[]): void {
    const nowHour = this.hourOf(this.now)
    if (nowHour === null) return
    let current: string | null = null
    let lastHour = nowHour
    let lastCm = NaN
    let lastSpread = 0
    for (const row of rows) {
      const s = this.slot.get(row.station)
      const h = this.hourOf(row.t)
      if (s === undefined || h === null || h <= nowHour) continue
      if (row.station !== current) {
        current = row.station
        lastHour = nowHour
        lastCm = this.cm[s * this.hours + nowHour]!
        lastSpread = 0
      }
      const spread = row.p90 - row.p10
      // Forecast points come every few hours; fill the hours between them linearly.
      for (let k = lastHour + 1; k <= h; k++) {
        const f = (k - lastHour) / (h - lastHour)
        const from = Number.isNaN(lastCm) ? row.p50 : lastCm
        this.cm[s * this.hours + k] = from + (row.p50 - from) * f
        this.spread[s * this.hours + k] = lastSpread + (spread - lastSpread) * f
      }
      lastHour = h
      lastCm = row.p50
      lastSpread = spread
    }
  }

  private deriveIndex(): void {
    this.stations.forEach((st, s) => {
      if (st.low === null || st.high === null) return
      const span = st.high - st.low
      const base = s * this.hours
      for (let h = 0; h < this.hours; h++) {
        this.index[base + h] = (this.cm[base + h]! - st.low) / span
        this.spread[base + h] = this.spread[base + h]! / span
      }
    })
  }

  slotOf(uuid: string): number | undefined {
    return this.slot.get(uuid)
  }

  sample(station: number, t: number): Sample | null {
    const h = (t - this.start) / HOUR
    if (h < 0 || h > this.hours - 1) return null
    const h0 = Math.floor(h)
    const h1 = Math.min(this.hours - 1, h0 + 1)
    const f = h - h0
    const base = station * this.hours
    const a = this.cm[base + h0]!
    const b = this.cm[base + h1]!
    let cm: number
    let idx: number
    let spread: number
    if (!Number.isNaN(a) && !Number.isNaN(b)) {
      cm = a + (b - a) * f
      idx = this.index[base + h0]! + (this.index[base + h1]! - this.index[base + h0]!) * f
      spread = this.spread[base + h0]! + (this.spread[base + h1]! - this.spread[base + h0]!) * f
    } else if (!Number.isNaN(a) && f < 0.5) {
      cm = a
      idx = this.index[base + h0]!
      spread = this.spread[base + h0]!
    } else if (!Number.isNaN(b) && f >= 0.5) {
      cm = b
      idx = this.index[base + h1]!
      spread = this.spread[base + h1]!
    } else {
      return null
    }
    return { cm, index: idx, spread, forecast: t > this.now }
  }
}
