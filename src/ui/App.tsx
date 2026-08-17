import { useApp } from '../store'
import { AnomalyList } from './AnomalyList'
import { Credits } from './Credits'
import { LayerControl } from './LayerControl'
import { Legend } from './Legend'
import { Overview } from './Overview'
import { RiverPanel } from './RiverPanel'
import { Search } from './Search'
import { StationPanel } from './StationPanel'
import { StatusLine } from './StatusLine'
import { TimeBar } from './TimeBar'
import { useCounts } from './useCounts'

export function App() {
  const status = useApp((s) => s.status)
  const error = useApp((s) => s.error)
  const stations = useApp((s) => s.stations)
  const selected = useApp((s) => s.selected)
  const selectedRiver = useApp((s) => s.selectedRiver)
  const hovered = useApp((s) => s.hovered)
  const hoveredRiver = useApp((s) => s.hoveredRiver)
  const rivers = useApp((s) => s.rivers)
  const counts = useCounts()
  const ready = stations.length > 0
  const hoveredStation = hovered ? stations.find((s) => s.uuid === hovered) : null
  const underCursor = hoveredStation?.name ?? (hoveredRiver !== null ? rivers.get(hoveredRiver)?.name : null)

  return (
    <div className="hud">
      {/* Sixty list rows sit between the sidebar and every other control. */}
      <a className="skip" href="#zeitleiste">
        Zur Zeitleiste springen
      </a>

      <header className="masthead">
        <h1>Wasserlinie</h1>
        <StatusLine />
        {ready && <Search />}
      </header>

      {/* The map is a WebGL canvas with no text in it. This is the same
          information in words, and it is the only version a screen reader or a
          machine without WebGL can read. */}
      <p className="visually-hidden" role="status">
        {counts
          ? `Karte Deutschlands. ${counts.low} von ${counts.placed} eingeordneten Pegeln stehen ungewöhnlich niedrig, ${counts.high} ungewöhnlich hoch. Die Liste nennt sie einzeln.`
          : 'Karte Deutschlands wird geladen.'}
      </p>

      {/* One column on the right, so the map never gains a second floating box. */}
      {ready && (
        <aside className="sidebar" aria-label="Pegel">
          {selected ? <StationPanel /> : selectedRiver !== null ? <RiverPanel /> : <AnomalyList />}
        </aside>
      )}

      <div className="controls">
        {ready && <Overview />}
        <LayerControl />
      </div>

      {ready && <Legend />}

      {underCursor && <div className="hovername">{underCursor.toLowerCase()}</div>}

      <TimeBar />

      <Credits />

      {status && (
        <div className="status" role="status">
          {status}
        </div>
      )}
      {error && (
        <div className="status error" role="alert">
          {error.split('\n').map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      )}
    </div>
  )
}
