import { loadHistory, loadManifest, loadOutline, loadStations } from './data/assets'
import { DailyTimeline } from './data/dailyTimeline'
import { LevelStore } from './data/store'
import { Timeline, type TimeSource } from './data/timeline'
import { MapCamera } from './map/camera'
import { runClock } from './map/clock'
import { GaugeLayer } from './map/gauges'
import { bindPicking } from './map/picking'
import { LayerHost } from './map/plugin'
import { RiverLayer } from './map/rivers'
import { boundsOf } from './map/style'
import { createMap } from './map/viewer'
import { setServices } from './services'
import { store } from './store'
import { time as timeTokens } from './tokens'

const HOUR = 3_600_000

export interface AppHandles {
  dispose(): void
}

export async function startApp(sceneEl: HTMLElement): Promise<AppHandles> {
  const state = store.getState()
  const outline = await loadOutline()
  const { map, ready } = createMap({ container: sceneEl, rings: outline.rings })
  if (import.meta.env.DEV) Object.assign(window, { wasserlinieMap: map })
  // The constructor cannot know about the panels; this frames the country in
  // the part of the canvas they leave free.
  const camera = new MapCamera(map, boundsOf(outline.rings))
  void camera.home(false)
  const stopClock = runClock()

  state.setStatus('Pegel werden geladen')
  const [stationsFile, manifest] = await Promise.all([
    loadStations(),
    loadManifest().catch(() => ({ runs: [] })),
  ])
  const run = manifest.runs[0] ?? null
  const levels = await LevelStore.open(run?.file ?? null)
  if (levels.levels.station.length === 0) throw new Error('levels.parquet is empty')

  const now = levels.lastMeasurement
  const start = levels.firstMeasurement
  const end = now + timeTokens.forecastHours * HOUR
  const timeline = Timeline.build(stationsFile.stations, levels, start, now, end)

  state.setStations(stationsFile.stations)
  state.setRange({ start, now, end })
  state.setSimTime(now)
  state.setRun(levels.forecast ? run : null)
  state.setStatus(null)

  // Sources cannot be added before the style exists.
  await ready
  const host = new LayerHost({ map, timeline })
  host.add(new RiverLayer())
  host.add(new GaugeLayer())
  const unbindPicking = bindPicking(map)

  // The long view is several megabytes, so it is fetched the first time it is
  // asked for — by the mode toggle or by the chart — and kept afterwards.
  let history: DailyTimeline | null = null
  let active: TimeSource = timeline
  let fetching: Promise<DailyTimeline> | null = null

  const publish = (): void => setServices({ levels, timeline: active, history, openHistory, camera })

  const load = async (): Promise<DailyTimeline> => {
    if (history) return history
    fetching ??= loadHistory().then((h) => new DailyTimeline(stationsFile.stations, h))
    store.getState().setLoadingHistory(true)
    try {
      history = await fetching
      publish()
      return history
    } finally {
      store.getState().setLoadingHistory(false)
    }
  }

  async function openHistory(): Promise<void> {
    await load()
  }

  const useSource = (source: TimeSource): void => {
    active = source
    host.setTimeline(source)
    publish()
    store.getState().setRange({ start: source.start, now: source.now, end: source.end })
    store.getState().setSimTime(source.now)
  }

  publish()

  const unsubscribe = store.subscribe((s, prev) => {
    if (s.selected && s.selected !== prev.selected) {
      const station = s.stations.find((st) => st.uuid === s.selected)
      if (station) void camera.flyToPoint(station.lon, station.lat)
    }
    if (s.mode !== prev.mode) {
      if (s.mode === 'live') useSource(timeline)
      else {
        void load().then(useSource, (err: unknown) => {
          console.error('the long view could not be loaded', err)
          store.getState().setMode('live')
        })
      }
    }
  })

  return {
    dispose() {
      unsubscribe()
      unbindPicking()
      stopClock()
      host.dispose()
      map.remove()
    },
  }
}
