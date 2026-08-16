import { useEffect, useState } from 'react'
import type { ForecastPoint, Reading } from '../data/db'
import { useServices } from '../services'
import { useApp } from '../store'
import { Chart } from './Chart'
import { formatCm, formatLead } from './format'

const REF_LABEL: Record<string, [string, string]> = {
  mean: ['MNW', 'MHW'],
  tidal: ['MTnw', 'MThw'],
  extremes: ['NW', 'HW'],
}

export function StationPanel() {
  const selected = useApp((s) => s.selected)
  const stations = useApp((s) => s.stations)
  const simTime = useApp((s) => s.simTime)
  const range = useApp((s) => s.range)
  const select = useApp((s) => s.select)
  const services = useServices()
  const [series, setSeries] = useState<{ uuid: string; readings: Reading[]; forecast: ForecastPoint[] } | null>(null)

  const station = stations.find((s) => s.uuid === selected) ?? null

  useEffect(() => {
    if (!station || !services) return
    let cancelled = false
    const { db } = services
    Promise.all([db.readings(station.uuid), db.forecast(station.uuid)])
      .then(([readings, forecast]) => {
        if (!cancelled) setSeries({ uuid: station.uuid, readings, forecast })
      })
      .catch((err: unknown) => console.error('station query failed', err))
    return () => {
      cancelled = true
    }
  }, [station, services])

  if (!station || !range || !services) return null
  const slot = services.timeline.slotOf(station.uuid)
  const sample = slot === undefined ? null : services.timeline.sample(slot, simTime)
  const refs = station.ref ? REF_LABEL[station.ref] : null
  const lead = (simTime - range.now) / 3_600_000

  return (
    <aside className="panel">
      <header>
        <div>
          <h2>{titleCase(station.name)}</h2>
          <div className="water">{titleCase(station.water)}</div>
        </div>
        <button className="close" onClick={() => select(null)} aria-label="Schließen">
          ×
        </button>
      </header>

      <div className="value">
        {sample ? (
          <>
            <strong data-kind={sample.forecast ? 'forecast' : 'measured'}>{formatCm(sample.cm)}</strong>
            <span>cm {sample.forecast ? `· Prognose ${formatLead(lead)}` : '· gemessen'}</span>
          </>
        ) : (
          <span>kein Wert zu diesem Zeitpunkt</span>
        )}
      </div>

      {refs && station.low !== null && station.high !== null && (
        <div className="marks">
          <span>
            {refs[0]} <b>{formatCm(station.low)}</b>
          </span>
          {station.mw !== null && (
            <span>
              MW <b>{formatCm(station.mw)}</b>
            </span>
          )}
          <span>
            {refs[1]} <b>{formatCm(station.high)}</b>
          </span>
        </div>
      )}
      {!refs && <div className="marks">ohne Referenzwerte, daher nicht im Flussnetz</div>}

      {series && series.uuid === station.uuid ? (
        <Chart
          station={station}
          readings={series.readings}
          forecast={series.forecast}
          start={range.start}
          now={range.now}
          end={range.end}
          simTime={simTime}
        />
      ) : (
        <p className="empty">Zeitreihe wird geladen …</p>
      )}

      <div className="legend">
        <span>
          <i /> gemessen
        </span>
        <span>
          <i className="p50" /> Prognose (Median)
        </span>
        <span>
          <i className="band" /> 10–90 %
        </span>
      </div>
    </aside>
  )
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s\-(/.])([a-zäöüß])/g, (m) => m.toUpperCase())
    .replace(/\b(Up|Op|Mpm|Ap)\b/g, (m) => m.toUpperCase())
}
