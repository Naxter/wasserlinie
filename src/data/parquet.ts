import { parquetRead } from 'hyparquet'
import { compressors } from 'hyparquet-compressors'
import { dataUrl } from './assets'

// Both parquet files are small enough to fetch whole and read column by
// column. Reading columns instead of rows keeps 500k readings out of the heap
// as objects; what survives is three typed arrays.

export interface Series {
  /** station uuid per row, sorted; rows of one station are contiguous */
  station: string[]
  /** epoch ms */
  t: Float64Array
  columns: Record<string, Float32Array>
}

async function fetchBuffer(path: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const res = await fetch(dataUrl(path), { signal })
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  return res.arrayBuffer()
}

async function column(file: ArrayBuffer, name: string): Promise<unknown[]> {
  let rows: unknown[][] = []
  await parquetRead({ file, compressors, columns: [name], onComplete: (data) => (rows = data) })
  return rows.map((r) => r[0])
}

function toMillis(values: unknown[]): Float64Array {
  const out = new Float64Array(values.length)
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    out[i] = v instanceof Date ? v.getTime() : Number(v)
  }
  return out
}

function toFloats(values: unknown[]): Float32Array {
  const out = new Float32Array(values.length)
  for (let i = 0; i < values.length; i++) out[i] = Number(values[i])
  return out
}

export async function readSeries(path: string, names: string[], signal?: AbortSignal): Promise<Series> {
  const file = await fetchBuffer(path, signal)
  signal?.throwIfAborted()
  const station = (await column(file, 'station')) as string[]
  const t = toMillis(await column(file, 'ts'))
  const columns: Record<string, Float32Array> = {}
  for (const name of names) columns[name] = toFloats(await column(file, name))
  return { station, t, columns }
}
