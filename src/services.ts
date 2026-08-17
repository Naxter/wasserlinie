import { useSyncExternalStore } from 'react'
import type { DailyTimeline } from './data/dailyTimeline'
import type { LevelStore } from './data/store'
import type { TimeSource } from './data/timeline'
import type { MapCamera } from './map/camera'

// What the UI needs once the scene and data are up. Set by startApp(), and
// again whenever the mode switches the time source; components read them
// through useServices() and re-render when it changes.
export interface Services {
  levels: LevelStore
  timeline: TimeSource
  /** The whole daily record, once it has been fetched. */
  history: DailyTimeline | null
  /** Fetches it. Safe to call repeatedly; the work happens once. */
  openHistory: () => Promise<void>
  camera: MapCamera
}

let current: Services | null = null
const listeners = new Set<() => void>()

export function setServices(services: Services): void {
  current = services
  if (import.meta.env.DEV) Object.assign(window, { wasserlinieServices: services })
  for (const l of listeners) l()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useServices(): Services | null {
  return useSyncExternalStore(subscribe, () => current)
}
