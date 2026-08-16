import { readSeries, type Series } from './parquet'
import type { LevelSource } from './timeline'

// Everything the app knows about levels, kept as typed arrays with one
// index of where each station's rows start and end. The parquet files are
// sorted by station, then time, so a station is one contiguous slice — the
// station panel needs no query engine, just an offset.

export interface Reading {
  t: number
  value: number
}

export interface ForecastPoint {
  t: number
  p10: number
  p50: number
  p90: number
}

type Range = [from: number, to: number]

function indexByStation(station: string[]): Map<string, Range> {
  const ranges = new Map<string, Range>()
  let from = 0
  for (let i = 1; i <= station.length; i++) {
    if (i === station.length || station[i] !== station[from]) {
      ranges.set(station[from]!, [from, i])
      from = i
    }
  }
  return ranges
}

export class LevelStore implements LevelSource {
  private constructor(
    readonly levels: Series,
    readonly levelRange: Map<string, Range>,
    readonly forecast: Series | null,
    readonly forecastRange: Map<string, Range>,
  ) {}

  static async open(forecastFile: string | null, signal?: AbortSignal): Promise<LevelStore> {
    const levels = await readSeries('levels.parquet', ['value'], signal)
    let forecast: Series | null = null
    if (forecastFile) {
      try {
        forecast = await readSeries(`forecast/${forecastFile}`, ['p10', 'p50', 'p90'], signal)
      } catch (err) {
        if (signal?.aborted) throw err
        console.warn('forecast unavailable, showing measurements only', err)
      }
    }
    return new LevelStore(
      levels,
      indexByStation(levels.station),
      forecast,
      forecast ? indexByStation(forecast.station) : new Map<string, Range>(),
    )
  }

  get lastMeasurement(): number {
    let max = -Infinity
    for (const t of this.levels.t) if (t > max) max = t
    return max
  }

  get firstMeasurement(): number {
    let min = Infinity
    for (const t of this.levels.t) if (t < min) min = t
    return min
  }

  eachLevel(visit: (station: string, t: number, value: number) => void): void {
    const { station, t, columns } = this.levels
    const value = columns.value!
    for (let i = 0; i < station.length; i++) visit(station[i]!, t[i]!, value[i]!)
  }

  eachForecast(visit: (station: string, t: number, p10: number, p50: number, p90: number) => void): void {
    if (!this.forecast) return
    const { station, t, columns } = this.forecast
    for (let i = 0; i < station.length; i++) {
      visit(station[i]!, t[i]!, columns.p10![i]!, columns.p50![i]!, columns.p90![i]!)
    }
  }

  readings(uuid: string): Reading[] {
    const range = this.levelRange.get(uuid)
    if (!range) return []
    const { t, columns } = this.levels
    const value = columns.value!
    const out: Reading[] = []
    for (let i = range[0]; i < range[1]; i++) out.push({ t: t[i]!, value: value[i]! })
    return out
  }

  forecastFor(uuid: string): ForecastPoint[] {
    const range = this.forecastRange.get(uuid)
    if (!range || !this.forecast) return []
    const { t, columns } = this.forecast
    const out: ForecastPoint[] = []
    for (let i = range[0]; i < range[1]; i++) {
      out.push({ t: t[i]!, p10: columns.p10![i]!, p50: columns.p50![i]!, p90: columns.p90![i]! })
    }
    return out
  }
}
