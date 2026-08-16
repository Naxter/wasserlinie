import { useSyncExternalStore } from 'react'
import type { LevelStore } from './data/store'
import type { Timeline } from './data/timeline'
import type { CameraDirector } from './scene/camera'

// Handles the UI needs once the scene and data are up. Set exactly once by
// startApp(); components read them through useServices().
export interface Services {
  levels: LevelStore
  timeline: Timeline
  director: CameraDirector
}

let current: Services | null = null
const listeners = new Set<() => void>()

export function setServices(services: Services): void {
  current = services
  for (const l of listeners) l()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useServices(): Services | null {
  return useSyncExternalStore(subscribe, () => current)
}
