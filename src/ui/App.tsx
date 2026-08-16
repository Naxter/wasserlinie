import { useApp } from '../store'
import { Legend } from './Legend'
import { StationPanel } from './StationPanel'
import { StatusLine } from './StatusLine'
import { TimeBar } from './TimeBar'

export function App() {
  const layers = useApp((s) => s.layers)
  const toggleLayer = useApp((s) => s.toggleLayer)
  const status = useApp((s) => s.status)
  const error = useApp((s) => s.error)
  const stations = useApp((s) => s.stations)
  const hovered = useApp((s) => s.hovered)
  const hoveredStation = hovered ? stations.find((s) => s.uuid === hovered) : null

  return (
    <div className="hud">
      <header className="masthead">
        <div className="title">
          <h1>Wasserlinie</h1>
          <StatusLine />
        </div>
        <nav className="layers" aria-label="Ebenen">
          <button aria-pressed={layers.rivers} onClick={() => toggleLayer('rivers')}>
            Flüsse
          </button>
          <button aria-pressed={layers.gauges} onClick={() => toggleLayer('gauges')}>
            Pegel
          </button>
        </nav>
      </header>

      <StationPanel />
      <Legend />

      {hoveredStation && <div className="hovername">{hoveredStation.name.toLowerCase()}</div>}

      <TimeBar />

      {status && <div className="status">{status}</div>}
      {error && <div className="status error">{error}</div>}
    </div>
  )
}
