import { useMemo } from 'react'
import { isUnusual } from '../layers/gauges'
import { useServices } from '../services'
import { useApp } from '../store'
import { unusual } from '../tokens'
import { rampCss } from '../layers/ramp'
import { formatDate } from './format'

/** Counts how many gauges sit outside their normal band at the chosen moment. */
export function StatusLine() {
  const simTime = useApp((s) => s.simTime)
  const filter = useApp((s) => s.filter)
  const setFilter = useApp((s) => s.setFilter)
  const stations = useApp((s) => s.stations)
  const services = useServices()

  const counts = useMemo(() => {
    if (!services) return null
    const { timeline } = services
    let low = 0
    let high = 0
    let placed = 0
    for (let i = 0; i < stations.length; i++) {
      const sample = timeline.sample(i, simTime)
      if (!sample || Number.isNaN(sample.state)) continue
      placed++
      if (!isUnusual(sample.state)) continue
      if (sample.state <= unusual.low) low++
      else high++
    }
    return { low, high, placed }
  }, [services, stations, simTime])

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
            <i style={{ background: rampCss(0.8) }} />
            <b className="mono">{counts.high}</b> ungewöhnlich hoch
          </button>
          <button
            type="button"
            aria-pressed={filter === 'low'}
            disabled={counts.low === 0}
            onClick={() => setFilter('low')}
          >
            <i style={{ background: rampCss(-0.8) }} />
            <b className="mono">{counts.low}</b> ungewöhnlich niedrig
          </button>
        </>
      )}
      <span className="of">von {counts.placed} eingeordneten Pegeln</span>
    </div>
  )
}
