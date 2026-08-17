import { useApp } from '../store'
import { AnomalyList } from './AnomalyList'
import { LayerControl } from './LayerControl'
import { Legend } from './Legend'
import { RiverPanel } from './RiverPanel'
import { StationPanel } from './StationPanel'
import { StatusLine } from './StatusLine'
import { TimeBar } from './TimeBar'

export function App() {
  const status = useApp((s) => s.status)
  const error = useApp((s) => s.error)
  const stations = useApp((s) => s.stations)
  const selected = useApp((s) => s.selected)
  const selectedRiver = useApp((s) => s.selectedRiver)
  const hovered = useApp((s) => s.hovered)
  const hoveredRiver = useApp((s) => s.hoveredRiver)
  const rivers = useApp((s) => s.rivers)
  const ready = stations.length > 0
  const hoveredStation = hovered ? stations.find((s) => s.uuid === hovered) : null
  const underCursor = hoveredStation?.name ?? (hoveredRiver !== null ? rivers.get(hoveredRiver)?.name : null)

  return (
    <div className="hud">
      <header className="masthead">
        <h1>Wasserlinie</h1>
        <StatusLine />
      </header>

      {/* One column on the right, so the map never gains a second floating box. */}
      {ready && (
        <aside className="sidebar">
          {selected ? <StationPanel /> : selectedRiver !== null ? <RiverPanel /> : <AnomalyList />}
        </aside>
      )}

      <div className="controls">
        <LayerControl />
      </div>

      {ready && <Legend />}

      {underCursor && <div className="hovername">{underCursor.toLowerCase()}</div>}

      <TimeBar />

      {status && <div className="status">{status}</div>}
      {error && (
        <div className="status error">
          {error.split('\n').map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      )}
    </div>
  )
}
