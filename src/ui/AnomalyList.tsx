import { useMemo, useState } from 'react'
import { isUnusual } from '../data/unusual'
import { useServices } from '../services'
import { useApp } from '../store'
import { unusual } from '../tokens'
import { classifyShort, yardstick } from './classify'
import { formatCm } from './format'
import { Swatch } from './Swatch'
import { useQuantizedTime } from './useQuantizedTime'
import { WATER_LABEL, WATER_NOTE, waterType, type Water } from './water'

interface Row {
  uuid: string
  name: string
  water: string
  kind: Water
  cm: number
  state: number
  forecast: boolean
  /** what the reading was actually compared against, derived from the state */
  reference: string | null
  verdict: string | null
}

const LIMIT = 60
const WATERS: Water[] = ['river', 'canal', 'coast']

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
  const [water, setWater] = useState<Water>('river')
  const simTime = useQuantizedTime()
  const services = useServices()

  const rows = useMemo(() => {
    if (!services) return []
    const out: Row[] = []
    for (let i = 0; i < stations.length; i++) {
      const sample = services.timeline.sample(i, simTime)
      if (!sample || Number.isNaN(sample.state) || !isUnusual(sample.state)) continue
      const st = stations[i]!
      out.push({
        uuid: st.uuid,
        name: st.name,
        water: st.water,
        kind: waterType(st.water),
        cm: sample.cm,
        state: sample.state,
        forecast: sample.forecast,
        reference: yardstick(sample.state, st.basis),
        verdict: classifyShort(sample.state),
      })
    }
    // Furthest from normal first — that is the reading order people want. Forty
    // gauges can share a state of -1.00, so name breaks the tie rather than
    // letting the order shuffle between frames.
    out.sort((a, b) => Math.abs(b.state) - Math.abs(a.state) || a.name.localeCompare(b.name, 'de'))
    return out
  }, [services, stations, simTime])

  const byWater = useMemo(() => {
    const counts = { river: 0, canal: 0, coast: 0 }
    for (const r of rows) counts[r.kind]++
    return counts
  }, [rows])

  const inWater = rows.filter((r) => r.kind === water)
  const shown = inWater.filter((r) =>
    filter === 'all' ? true : filter === 'low' ? r.state <= unusual.low : r.state >= unusual.high,
  )
  const lows = inWater.filter((r) => r.state <= unusual.low).length
  const highs = inWater.length - lows
  const note = WATER_NOTE[water]

  return (
    <section className="anomalies" aria-label="Auffällige Pegel">
      <header>
        <h2>Auffällige Pegel</h2>

        <div className="waters" role="group" aria-label="Gewässerart">
          {WATERS.map((w) => (
            <button
              key={w}
              type="button"
              aria-pressed={water === w}
              disabled={byWater[w] === 0}
              onClick={() => setWater(w)}
            >
              {WATER_LABEL[w]} <b className="mono">{byWater[w]}</b>
            </button>
          ))}
        </div>

        <div className="tabs" role="group" aria-label="Richtung">
          <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
            alle <b className="mono">{inWater.length}</b>
          </button>
          <button type="button" aria-pressed={filter === 'low'} disabled={lows === 0} onClick={() => setFilter('low')}>
            niedrig <b className="mono">{lows}</b>
          </button>
          <button
            type="button"
            aria-pressed={filter === 'high'}
            disabled={highs === 0}
            onClick={() => setFilter('high')}
          >
            hoch <b className="mono">{highs}</b>
          </button>
        </div>
      </header>

      {note && <p className="water-note">{note}</p>}

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
                aria-label={`${titleCase(r.name)}, ${titleCase(r.water)}: ${formatCm(r.cm)} Zentimeter, ${
                  r.verdict ?? ''
                }${r.reference ? `, ${r.reference}` : ''}${r.forecast ? ', Prognose' : ''}`}
              >
                <Swatch state={r.state} />
                {/* The comparison is the finding, so it gets the line under the
                    name; the reading is the evidence and sits to the side. */}
                <span className="who">
                  <b>{titleCase(r.name)}</b>
                  <em>
                    <span className="water">{titleCase(r.water)}</span>
                    {r.reference ? ` · ${r.reference}` : ''}
                    {r.forecast ? ' · Prognose' : ''}
                  </em>
                </span>
                <span className="what">
                  {Number.isFinite(r.cm) ? (
                    <b className="mono">
                      {formatCm(r.cm)} <span>cm</span>
                    </b>
                  ) : (
                    <b>{r.verdict}</b>
                  )}
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
