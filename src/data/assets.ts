import type { Field, FieldMeta, Manifest, RiversFile, StationsFile } from './types'

export const DATA_URL = (import.meta.env.VITE_DATA_URL as string | undefined) ?? '/data'

export function dataUrl(path: string): string {
  return `${DATA_URL.replace(/\/$/, '')}/${path}`
}

async function fetchJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(dataUrl(path), { signal })
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  return (await res.json()) as T
}

export const loadStations = (signal?: AbortSignal) => fetchJson<StationsFile>('stations.json', signal)
export const loadRivers = (signal?: AbortSignal) => fetchJson<RiversFile>('rivers.json', signal)
export const loadRiverDetail = (signal?: AbortSignal) => fetchJson<RiversFile>('rivers-detail.json', signal)
export const loadManifest = (signal?: AbortSignal) => fetchJson<Manifest>('forecast/manifest.json', signal)
export const loadOutline = (signal?: AbortSignal) => fetchJson<{ rings: [number, number][][] }>('germany.json', signal)

export async function loadField(signal?: AbortSignal): Promise<Field> {
  const [meta, res] = await Promise.all([fetchJson<FieldMeta>('field.json', signal), fetch(dataUrl('field.bin'), { signal })])
  if (!res.ok) throw new Error(`field.bin: HTTP ${res.status}`)
  const data = new Uint8Array(await res.arrayBuffer())
  const expected = meta.rivers.length * meta.steps * meta.samples * meta.channels
  if (data.length !== expected) throw new Error(`field.bin has ${data.length} bytes, expected ${expected}`)
  return { meta, data, slot: new Map(meta.rivers.map((id, i) => [id, i])) }
}
