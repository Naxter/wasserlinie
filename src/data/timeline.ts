import type { Station } from './types'

const HOUR = 3_600_000

export interface Sample {
  cm: number
  /**
   * Where the level sits on the gauge's own scale: -1 its record low, 0 mean
   * water, +1 its record high. NaN when the gauge publishes no reference
   * levels. Computed by the pipeline, never derived here.
   */
  state: number
  /** forecast band width on the same state scale, 0 for measurements */
  spread: number
  forecast: boolean
}

/** What the timeline needs to read; rows must arrive grouped by station and in time order. */
export interface LevelSource {
  eachLevel(visit: (station: string, t: number, cm: number, state: number) => void): void
  eachForecast(visit: (station: string, t: number, cm: number, state: number, spread: number) => void): void
}

/**
 * What everything downstream of the slider actually needs. The hourly
 * `Timeline` and the daily `DailyTimeline` both answer it, so the layers and
 * the panels never learn which one is behind the map.
 */
export interface TimeSource {
  readonly stations: Station[]
  readonly start: number
  readonly now: number
  readonly end: number
  slotOf(uuid: string): number | undefined
  sample(station: number, t: number): Sample | null
}

// One hourly grid for every station, measurements first, forecast median
// after `now`. Everything that moves with the time slider reads from here.
export class Timeline {
  readonly hours: number
  readonly cm: Float32Array
  readonly state: Float32Array
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
    this.state = new Float32Array(n).fill(NaN)
    this.spread = new Float32Array(n)
    stations.forEach((s, i) => this.slot.set(s.uuid, i))
  }

  static build(stations: Station[], source: LevelSource, start: number, now: number, end: number): Timeline {
    const tl = new Timeline(stations, start, now, end)
    source.eachLevel((station, t, cm, state) => {
      const s = tl.slot.get(station)
      const h = tl.hourOf(t)
      if (s === undefined || h === null || t > now) return
      tl.cm[s * tl.hours + h] = cm
      tl.state[s * tl.hours + h] = state
    })
    tl.placeForecast(source)
    return tl
  }

  private hourOf(t: number): number | null {
    const h = Math.round((t - this.start) / HOUR)
    return h >= 0 && h < this.hours ? h : null
  }

  private placeForecast(source: LevelSource): void {
    const nowHour = this.hourOf(this.now)
    if (nowHour === null) return
    let current: string | null = null
    let lastHour = nowHour
    let lastCm = NaN
    let lastState = NaN
    let lastSpread = 0
    source.eachForecast((station, t, cm, state, spread) => {
      const s = this.slot.get(station)
      const h = this.hourOf(t)
      if (s === undefined || h === null || h <= nowHour) return
      if (station !== current) {
        current = station
        lastHour = nowHour
        lastCm = this.cm[s * this.hours + nowHour]!
        lastState = this.state[s * this.hours + nowHour]!
        lastSpread = 0
      }
      // Forecast points come every few hours; fill the hours between them linearly.
      for (let k = lastHour + 1; k <= h; k++) {
        const f = (k - lastHour) / (h - lastHour)
        const fromCm = Number.isNaN(lastCm) ? cm : lastCm
        const fromState = Number.isNaN(lastState) ? state : lastState
        this.cm[s * this.hours + k] = fromCm + (cm - fromCm) * f
        this.state[s * this.hours + k] = fromState + (state - fromState) * f
        this.spread[s * this.hours + k] = lastSpread + (spread - lastSpread) * f
      }
      lastHour = h
      lastCm = cm
      lastState = state
      lastSpread = spread
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
    let state: number
    let spread: number
    if (!Number.isNaN(a) && !Number.isNaN(b)) {
      cm = a + (b - a) * f
      state = this.state[base + h0]! + (this.state[base + h1]! - this.state[base + h0]!) * f
      spread = this.spread[base + h0]! + (this.spread[base + h1]! - this.spread[base + h0]!) * f
    } else if (!Number.isNaN(a) && f < 0.5) {
      cm = a
      state = this.state[base + h0]!
      spread = this.spread[base + h0]!
    } else if (!Number.isNaN(b) && f >= 0.5) {
      cm = b
      state = this.state[base + h1]!
      spread = this.spread[base + h1]!
    } else {
      return null
    }
    return { cm, state, spread, forecast: t > this.now }
  }
}
