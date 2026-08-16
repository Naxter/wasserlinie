import * as duckdb from '@duckdb/duckdb-wasm'
import ehWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'
import mvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url'
import { dataUrl } from './assets'

// The readings live in Parquet files on plain static hosting. DuckDB reads
// them straight from the URL with range requests, so there is no database
// server anywhere in this project.

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

export type LevelRow = Reading & { station: string }
export type ForecastRow = ForecastPoint & { station: string }

const LEVELS = 'levels.parquet'
const FORECAST = 'forecast.parquet'

interface RowTable {
  toArray(): unknown[]
}

function rows<T>(table: RowTable): T[] {
  return table.toArray().map((r) => ({ ...(r as Record<string, unknown>) }) as T)
}

export class LevelDb {
  private constructor(
    private readonly db: duckdb.AsyncDuckDB,
    private readonly conn: duckdb.AsyncDuckDBConnection,
    readonly hasForecast: boolean,
  ) {}

  static async open(forecastFile: string | null): Promise<LevelDb> {
    const bundle = await duckdb.selectBundle({
      mvp: { mainModule: mvpWasm, mainWorker: mvpWorker },
      eh: { mainModule: ehWasm, mainWorker: ehWorker },
    })
    const worker = new Worker(bundle.mainWorker!)
    const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker)
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
    const absolute = (path: string) => new URL(dataUrl(path), window.location.href).href
    await db.registerFileURL(LEVELS, absolute('levels.parquet'), duckdb.DuckDBDataProtocol.HTTP, false)
    if (forecastFile) {
      await db.registerFileURL(FORECAST, absolute(`forecast/${forecastFile}`), duckdb.DuckDBDataProtocol.HTTP, false)
    }
    const conn = await db.connect()
    return new LevelDb(db, conn, forecastFile !== null)
  }

  async allLevels(): Promise<LevelRow[]> {
    const table = await this.conn.query(
      `SELECT station, epoch_ms(ts)::DOUBLE AS t, value::DOUBLE AS value FROM '${LEVELS}' ORDER BY station, ts`,
    )
    return rows<LevelRow>(table)
  }

  async allForecasts(): Promise<ForecastRow[]> {
    if (!this.hasForecast) return []
    const table = await this.conn.query(
      `SELECT station, epoch_ms(ts)::DOUBLE AS t, p10::DOUBLE AS p10, p50::DOUBLE AS p50, p90::DOUBLE AS p90
       FROM '${FORECAST}' ORDER BY station, ts`,
    )
    return rows<ForecastRow>(table)
  }

  async readings(station: string): Promise<Reading[]> {
    const stmt = await this.conn.prepare(
      `SELECT epoch_ms(ts)::DOUBLE AS t, value::DOUBLE AS value FROM '${LEVELS}' WHERE station = ? ORDER BY ts`,
    )
    try {
      return rows<Reading>(await stmt.query(station))
    } finally {
      await stmt.close()
    }
  }

  async forecast(station: string): Promise<ForecastPoint[]> {
    if (!this.hasForecast) return []
    const stmt = await this.conn.prepare(
      `SELECT epoch_ms(ts)::DOUBLE AS t, p10::DOUBLE AS p10, p50::DOUBLE AS p50, p90::DOUBLE AS p90
       FROM '${FORECAST}' WHERE station = ? ORDER BY ts`,
    )
    try {
      return rows<ForecastPoint>(await stmt.query(station))
    } finally {
      await stmt.close()
    }
  }

  async close(): Promise<void> {
    await this.conn.close()
    await this.db.terminate()
  }
}
