import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import type { Station } from './data/types'

export interface TimeRange {
  start: number
  now: number
  end: number
}

export type LayerId = 'rivers' | 'gauges'

export interface AppState {
  range: TimeRange | null
  simTime: number
  playing: boolean
  layers: Record<LayerId, boolean>
  stations: Station[]
  selected: string | null
  hovered: string | null
  status: string | null
  error: string | null

  setRange: (range: TimeRange) => void
  setSimTime: (t: number) => void
  togglePlay: () => void
  toggleLayer: (id: LayerId) => void
  setStations: (stations: Station[]) => void
  select: (uuid: string | null) => void
  hover: (uuid: string | null) => void
  setStatus: (text: string | null) => void
  fail: (message: string) => void
}

// One store, two consumers: React reads it through the hook, the scene
// subscribes to it directly. Nothing that touches WebGL lives here.
export const store = createStore<AppState>((set, get) => ({
  range: null,
  simTime: Date.now(),
  playing: false,
  layers: { rivers: true, gauges: true },
  stations: [],
  selected: null,
  hovered: null,
  status: null,
  error: null,

  setRange: (range) => set({ range, simTime: clamp(get().simTime, range) }),
  setSimTime: (t) => {
    const { range } = get()
    set({ simTime: range ? clamp(t, range) : t })
  },
  togglePlay: () => {
    const { playing, simTime, range } = get()
    if (!playing && range && simTime >= range.end - 1) set({ simTime: range.start })
    set({ playing: !playing })
  },
  toggleLayer: (id) => set((s) => ({ layers: { ...s.layers, [id]: !s.layers[id] } })),
  setStations: (stations) => set({ stations }),
  select: (uuid) => set({ selected: uuid }),
  hover: (uuid) => set((s) => (s.hovered === uuid ? s : { hovered: uuid })),
  setStatus: (status) => set({ status }),
  fail: (error) => set({ error, status: null }),
}))

function clamp(t: number, range: TimeRange): number {
  return Math.min(range.end, Math.max(range.start, t))
}

export function useApp<T>(selector: (s: AppState) => T): T {
  return useStore(store, selector)
}
