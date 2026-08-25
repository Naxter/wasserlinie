import type { History, HistoryMeta, Manifest, RiversFile, StationsFile } from './types'

const DATA_URL = (import.meta.env.VITE_DATA_URL as string | undefined) ?? '/data'

export function dataUrl(path: string): string {
  return `${DATA_URL.replace(/\/$/, '')}/${path}`
}

/** Thrown when the data assets are simply not there, which needs its own advice. */
export class MissingDataError extends Error {
  constructor(readonly path: string) {
    super(
      `${path} fehlt. Die Daten liegen nicht im Repository — erst die Pipeline laufen lassen:
` +
        'cd pipeline && python -m wasserlinie all',
    )
    this.name = 'MissingDataError'
  }
}

async function fetchJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(dataUrl(path), { signal })
  if (res.status === 404) throw new MissingDataError(path)
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  return (await res.json()) as T
}

export const loadStations = (signal?: AbortSignal) => fetchJson<StationsFile>('stations.json', signal)
export const loadRivers = (signal?: AbortSignal) => fetchJson<RiversFile>('rivers.json', signal)
export const loadRiverDetail = (signal?: AbortSignal) => fetchJson<RiversFile>('rivers-detail.json', signal)
export const loadManifest = (signal?: AbortSignal) => fetchJson<Manifest>('forecast/manifest.json', signal)
export const loadOutline = (signal?: AbortSignal) => fetchJson<{ rings: [number, number][][] }>('germany.json', signal)

/**
 * The whole record at one value a day: the verdicts and the readings behind
 * them. About 8 MB compressed, so it is fetched when the long view is first
 * opened rather than on first paint.
 */
export async function loadHistory(signal?: AbortSignal): Promise<History> {
  const [meta, gridRes, cmRes] = await Promise.all([
    fetchJson<HistoryMeta>('history.json', signal),
    fetch(dataUrl('history.bin'), { signal }),
    fetch(dataUrl('history-cm.bin'), { signal }),
  ])
  for (const [name, res] of [
    ['history.bin', gridRes],
    ['history-cm.bin', cmRes],
  ] as const) {
    if (res.status === 404) throw new MissingDataError(name)
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`)
  }
  const grid = new Uint8Array(await gridRes.arrayBuffer())
  const cm = new Int16Array(await cmRes.arrayBuffer())
  const expected = meta.stations.length * meta.days
  if (grid.length !== expected) throw new Error(`history.bin has ${grid.length} bytes, expected ${expected}`)
  if (cm.length !== expected) throw new Error(`history-cm.bin has ${cm.length} values, expected ${expected}`)
  return { meta, grid, cm }
}
