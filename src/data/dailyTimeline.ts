import type { Sample, TimeSource } from './timeline'
import type { History, Station } from './types'

const DAY = 86_400_000

/**
 * The long view: 2000 to now at one value a day, read straight out of the byte
 * grid the pipeline writes.
 *
 * There is no forecast here and no centimetres — the grid carries only where
 * each reading sat on its gauge's scale, which is what the map is coloured by.
 * A gauge's actual readings are fetched per gauge when its panel opens.
 */
export class DailyTimeline implements TimeSource {
  readonly start: number
  readonly now: number
  readonly end: number
  private readonly days: number
  private readonly grid: Uint8Array
  private readonly readings: Int16Array
  private readonly cmMissing: number
  private readonly noData: number
  private readonly offset: number
  private readonly scale: number
  private readonly steps: number
  /** station index → row in the grid, -1 when the archive has nothing */
  private readonly row: Int32Array
  private readonly slot = new Map<string, number>()

  constructor(
    readonly stations: Station[],
    history: History,
  ) {
    const { meta, grid, cm } = history
    this.grid = grid
    this.readings = cm
    this.cmMissing = meta.cmMissing
    this.days = meta.days
    this.noData = meta.noData
    this.offset = meta.stateOffset
    this.scale = meta.stateScale
    this.steps = meta.stateLevels - 1
    // Days are local calendar days; anchoring at UTC noon keeps every day the
    // same width and stops a timezone shifting readings onto the day before.
    this.start = Date.parse(`${meta.t0}T12:00:00Z`)
    this.end = this.start + (meta.days - 1) * DAY
    this.now = this.end

    const rowOf = new Map(meta.stations.map((uuid, i) => [uuid, i]))
    this.row = new Int32Array(stations.length)
    stations.forEach((s, i) => {
      this.slot.set(s.uuid, i)
      this.row[i] = rowOf.get(s.uuid) ?? -1
    })
  }

  slotOf(uuid: string): number | undefined {
    return this.slot.get(uuid)
  }

  private stateAt(row: number, day: number): number {
    const code = this.grid[row * this.days + day]!
    return code === this.noData ? NaN : this.offset + ((code - 1) / this.steps) * this.scale
  }

  private cmAt(row: number, day: number): number {
    const value = this.readings[row * this.days + day]!
    return value === this.cmMissing ? NaN : value
  }

  /** A gauge's whole daily record, for the chart. Gaps come back as NaN. */
  series(station: number): { t: number; value: number }[] {
    const row = this.row[station]
    if (row === undefined || row < 0) return []
    const out: { t: number; value: number }[] = []
    for (let d = 0; d < this.days; d++) {
      const value = this.cmAt(row, d)
      if (!Number.isNaN(value)) out.push({ t: this.start + d * DAY, value })
    }
    return out
  }

  sample(station: number, t: number): Sample | null {
    const row = this.row[station]
    if (row === undefined || row < 0) return null
    const d = (t - this.start) / DAY
    if (d < 0 || d > this.days - 1) return null
    const d0 = Math.floor(d)
    const d1 = Math.min(this.days - 1, d0 + 1)
    const f = d - d0
    const a = this.stateAt(row, d0)
    const b = this.stateAt(row, d1)
    const ca = this.cmAt(row, d0)
    const cb = this.cmAt(row, d1)
    let state: number
    let cm: number
    if (!Number.isNaN(a) && !Number.isNaN(b)) {
      state = a + (b - a) * f
      cm = ca + (cb - ca) * f
    } else if (!Number.isNaN(a) && f < 0.5) {
      state = a
      cm = ca
    } else if (!Number.isNaN(b) && f >= 0.5) {
      state = b
      cm = cb
    } else return null
    return { cm, state, spread: 0, forecast: false }
  }
}
