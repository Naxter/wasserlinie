import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import type { ForecastRun, Station } from './data/types'

export interface TimeRange {
  start: number
  now: number
  end: number
}

export type Filter = 'all' | 'low' | 'high'

export type LayerId = 'rivers' | 'gauges'

/**
 * `live` is the last month at hourly steps with the forecast on the end;
 * `history` is the whole record since 2000 at one value a day. Two different
 * questions, so they get two sliders rather than one compromise.
 */
export type Mode = 'live' | 'history'

export interface AppState {
  range: TimeRange | null
  simTime: number
  playing: boolean
  mode: Mode
  /** set while the long view is being fetched for the first time */
  loadingHistory: boolean
  layers: Record<LayerId, boolean>
  stations: Station[]
  run: ForecastRun | null
  filter: Filter
  selected: string | null
  hovered: string | null
  status: string | null
  error: string | null

  setRange: (range: TimeRange) => void
  setSimTime: (t: number) => void
  setMode: (mode: Mode) => void
  setLoadingHistory: (loading: boolean) => void
  togglePlay: () => void
  toggleLayer: (id: LayerId) => void
  setStations: (stations: Station[]) => void
  setRun: (run: ForecastRun | null) => void
  setFilter: (filter: Filter) => void
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
  mode: 'live',
  loadingHistory: false,
  layers: { rivers: true, gauges: true },
  stations: [],
  run: null,
  filter: 'all',
  selected: null,
  hovered: null,
  status: null,
  error: null,

  setRange: (range) => set({ range, simTime: clamp(get().simTime, range) }),
  setSimTime: (t) => {
    const { range } = get()
    set({ simTime: range ? clamp(t, range) : t })
  },
  // Playback does not survive the switch: the two modes run at wildly
  // different speeds, and carrying it over just looks like a bug.
  setMode: (mode) => set(mode === get().mode ? {} : { mode, playing: false }),
  setLoadingHistory: (loadingHistory) => set({ loadingHistory }),
  togglePlay: () => {
    const { playing, simTime, range } = get()
    if (!playing && range && simTime >= range.end - 1) set({ simTime: range.start })
    set({ playing: !playing })
  },
  toggleLayer: (id) => set((s) => ({ layers: { ...s.layers, [id]: !s.layers[id] } })),
  setStations: (stations) => set({ stations }),
  setRun: (run) => set({ run }),
  setFilter: (filter) => set((s) => ({ filter: s.filter === filter ? 'all' : filter })),
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
