import { loadManifest, loadOutline, loadStations } from './data/assets'
import { LevelDb } from './data/db'
import { Timeline } from './data/timeline'
import { GaugeLayer } from './layers/gauges'
import { LayerHost } from './layers/plugin'
import { RiverLayer } from './layers/rivers'
import { CameraDirector } from './scene/camera'
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
  const outline = await loadOutline()
  const viewer = createViewer({ container: sceneEl, credits: creditsEl, outline: outline.rings })
  const director = new CameraDirector(viewer)
  director.jumpTo(cameraTokens.approach)
  void director.flyTo(cameraTokens.germany, cameraTokens.introSeconds)
  const unbindClock = bindClock(viewer)

  const state = store.getState()
  state.setStatus('Pegel werden geladen')
  const [stationsFile, manifest] = await Promise.all([
    loadStations(),
    loadManifest().catch(() => ({ runs: [] })),
  ])
  const run = manifest.runs[0] ?? null
  const db = await LevelDb.open(run?.file ?? null)
  const [levels, forecasts] = await Promise.all([db.allLevels(), db.allForecasts()])
  if (levels.length === 0) throw new Error('levels.parquet is empty')

  let start = Infinity
  let now = -Infinity
  for (const row of levels) {
    if (row.t < start) start = row.t
    if (row.t > now) now = row.t
  }
  const end = now + timeTokens.forecastHours * HOUR
  const timeline = Timeline.build(stationsFile.stations, levels, forecasts, start, now, end)

  state.setStations(stationsFile.stations)
  state.setRange({ start, now, end })
  state.setSimTime(now)
  state.setStatus(null)

  const host = new LayerHost({ viewer, timeline })
  host.add(new RiverLayer())
  host.add(new GaugeLayer((uuid) => store.getState().select(uuid)))

  const unsubscribe = store.subscribe((s, prev) => {
    if (s.selected && s.selected !== prev.selected) {
      const station = s.stations.find((st) => st.uuid === s.selected)
      if (station) void director.flyToPoint(station.lon, station.lat, STATION_RANGE_M)
    }
  })

  setServices({ db, timeline, director })

  return {
    dispose() {
      unsubscribe()
      unbindClock()
      host.dispose()
      void db.close()
      viewer.destroy()
    },
  }
}
