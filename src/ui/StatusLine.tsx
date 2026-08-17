import { useApp } from '../store'
import { formatDate } from './format'
import { Swatch } from './Swatch'
import { useCounts } from './useCounts'
import { useQuantizedTime } from './useQuantizedTime'

/** Counts how many gauges sit outside their normal band at the chosen moment. */
export function StatusLine() {
  const simTime = useQuantizedTime()
  const filter = useApp((s) => s.filter)
  const setFilter = useApp((s) => s.setFilter)
  const counts = useCounts()

  if (!counts) return null
  const quiet = counts.low === 0 && counts.high === 0

  return (
    <div className="statusline">
      <span className="date">{formatDate(simTime)}</span>
      {quiet ? (
        <span className="calm">Alle Pegel im normalen Bereich</span>
      ) : (
        <>
          <button
            type="button"
            aria-pressed={filter === 'high'}
            disabled={counts.high === 0}
            onClick={() => setFilter('high')}
          >
            <Swatch state={0.8} size={10} />
            <b className="mono">{counts.high}</b> ungewöhnlich hoch
          </button>
          <button
            type="button"
            aria-pressed={filter === 'low'}
            disabled={counts.low === 0}
            onClick={() => setFilter('low')}
          >
            <Swatch state={-0.8} size={10} />
            <b className="mono">{counts.low}</b> ungewöhnlich niedrig
          </button>
        </>
      )}
      <span className="of">von {counts.placed} eingeordneten Pegeln</span>
    </div>
  )
}
