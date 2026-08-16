import { loadManifest, loadOutline, loadStations } from './data/assets'
import { LevelStore } from './data/store'
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
  host.add(new GaugeLayer((uuid) => store.getState().select(uuid)))

  const unsubscribe = store.subscribe((s, prev) => {
    if (s.selected && s.selected !== prev.selected) {
      const station = s.stations.find((st) => st.uuid === s.selected)
      if (station) void director.flyToPoint(station.lon, station.lat, STATION_RANGE_M)
    }
  })

  setServices({ levels, timeline, director })

  return {
    dispose() {
      unsubscribe()
      unbindClock()
      host.dispose()
      viewer.destroy()
    },
  }
}
