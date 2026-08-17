import { loadHistory, loadManifest, loadOutline, loadStations } from './data/assets'
import { DailyTimeline } from './data/dailyTimeline'
import { LevelStore } from './data/store'
import { Timeline, type TimeSource } from './data/timeline'
import { GaugeLayer } from './layers/gauges'
import { LayerHost } from './layers/plugin'
import { RiverLayer } from './layers/rivers'
import { CameraDirector } from './scene/camera'
import { bindPicking } from './scene/picking'
import { bindClock } from './scene/time'
import { createViewer } from './scene/viewer'
import { setServices } from './services'
import { store } from './store'
import { camera as cameraTokens, time as timeTokens } from './tokens'

const HOUR = 3_600_000
const STATION_RANGE_M = 90_000

export interface AppHandles {
  dispose(): void
}

export async function startApp(sceneEl: HTMLElement, creditsEl: HTMLElement): Promise<AppHandles> {
  const state = store.getState()
  const outline = await loadOutline()
  const viewer = createViewer({ container: sceneEl, credits: creditsEl, outline: outline.rings })
  const director = new CameraDirector(viewer)
  director.jumpTo(cameraTokens.approach)
  void director.flyTo(cameraTokens.germany, cameraTokens.introSeconds)
  const unbindClock = bindClock(viewer)

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

  const host = new LayerHost({ viewer, timeline })
  host.add(new RiverLayer())
  host.add(new GaugeLayer())
  const unbindPicking = bindPicking(viewer.scene)

  // The long view is several megabytes, so it is fetched the first time it is
  // asked for — by the mode toggle or by the chart — and kept afterwards.
  let history: DailyTimeline | null = null
  let active: TimeSource = timeline
  let fetching: Promise<DailyTimeline> | null = null

  const publish = (): void => setServices({ levels, timeline: active, history, openHistory, director })

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
      if (station) void director.flyToPoint(station.lon, station.lat, STATION_RANGE_M)
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
      unbindClock()
      host.dispose()
      viewer.destroy()
    },
  }
}
