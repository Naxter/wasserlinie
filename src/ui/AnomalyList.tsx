import { useMemo } from 'react'
import { isUnusual } from '../layers/gauges'
import { rampCss } from '../layers/ramp'
import { useServices } from '../services'
import { useApp } from '../store'
import { unusual } from '../tokens'
import { classifyShort } from './classify'
import { formatCm } from './format'
import { useQuantizedTime } from './useQuantizedTime'

interface Row {
  uuid: string
  name: string
  water: string
  cm: number
  state: number
  forecast: boolean
  /** the mark the reading is being judged against, so the number means something */
  reference: string | null
}

const LIMIT = 60

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s\-(/.])([a-zäöüß])/g, (m) => m.toUpperCase())
}

/** The gauges that are actually saying something, worst first. */
export function AnomalyList() {
  const stations = useApp((s) => s.stations)
  const filter = useApp((s) => s.filter)
  const setFilter = useApp((s) => s.setFilter)
  const select = useApp((s) => s.select)
  const hover = useApp((s) => s.hover)
  const hovered = useApp((s) => s.hovered)
  const simTime = useQuantizedTime()
  const services = useServices()

  const rows = useMemo(() => {
    if (!services) return []
    const out: Row[] = []
    for (let i = 0; i < stations.length; i++) {
      const sample = services.timeline.sample(i, simTime)
      if (!sample || Number.isNaN(sample.state) || !isUnusual(sample.state)) continue
      const st = stations[i]!
      // Half the list can read "below record" at once, which says nothing about
      // any single row. The mark it is measured against does.
      const mark = sample.state < 0 ? st.low : st.high
      const label = sample.state < 0 ? 'MNW' : 'MHW'
      out.push({
        uuid: st.uuid,
        name: st.name,
        water: st.water,
        cm: sample.cm,
        state: sample.state,
        forecast: sample.forecast,
        reference: mark === null ? null : `${label} ${formatCm(mark)}`,
      })
    }
    // Furthest from normal first — that is the reading order people want.
    out.sort((a, b) => Math.abs(b.state) - Math.abs(a.state))
    return out
  }, [services, stations, simTime])

  const shown = rows.filter((r) => (filter === 'all' ? true : filter === 'low' ? r.state <= unusual.low : r.state >= unusual.high))
  const lows = rows.filter((r) => r.state <= unusual.low).length
  const highs = rows.length - lows

  return (
    <section className="anomalies" aria-label="Auffällige Pegel">
      <header>
        <h2>Auffällige Pegel</h2>
        <div className="tabs" role="group">
          <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
            alle <b className="mono">{rows.length}</b>
          </button>
          <button type="button" aria-pressed={filter === 'low'} disabled={lows === 0} onClick={() => setFilter('low')}>
            niedrig <b className="mono">{lows}</b>
          </button>
          <button type="button" aria-pressed={filter === 'high'} disabled={highs === 0} onClick={() => setFilter('high')}>
            hoch <b className="mono">{highs}</b>
          </button>
        </div>
      </header>

      {shown.length === 0 ? (
        <p className="empty">Zu diesem Zeitpunkt liegt kein Pegel außerhalb seines normalen Bereichs.</p>
      ) : (
        <ol>
          {shown.slice(0, LIMIT).map((r) => (
            <li key={r.uuid} className={r.uuid === hovered ? 'row hovered' : 'row'}>
              <button
                type="button"
                onClick={() => select(r.uuid)}
                onPointerEnter={() => hover(r.uuid)}
                onPointerLeave={() => hover(null)}
              >
                <i style={{ background: rampCss(r.state) }} aria-hidden="true" />
                <span className="who">
                  <b>{titleCase(r.name)}</b>
                  <em>{titleCase(r.water)}</em>
                </span>
                <span className="what">
                  <b className="mono">{formatCm(r.cm)} cm</b>
                  <em className="mono">{r.forecast ? 'Prognose' : (r.reference ?? (classifyShort(r.state) ?? ''))}</em>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {shown.length > LIMIT && <p className="more">… und {shown.length - LIMIT} weitere</p>}
    </section>
  )
}
