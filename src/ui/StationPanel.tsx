import { useMemo } from 'react'
import { useServices } from '../services'
import { useApp } from '../store'
import { Chart } from './Chart'
import { rampCss } from '../layers/ramp'
import { classify, changeIn24h } from './classify'
import { formatCm, formatDate, formatLead, formatTime } from './format'

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
  const run = useApp((s) => s.run)
  const services = useServices()

  const station = stations.find((s) => s.uuid === selected) ?? null
  const series = useMemo(
    () =>
      station && services
        ? { readings: services.levels.readings(station.uuid), forecast: services.levels.forecastFor(station.uuid) }
        : null,
    [station, services],
  )

  if (!station || !range || !services || !series) return null
  const slot = services.timeline.slotOf(station.uuid)
  const sample = slot === undefined ? null : services.timeline.sample(slot, simTime)
  const refs = station.ref ? REF_LABEL[station.ref] : null
  const lead = (simTime - range.now) / 3_600_000
  const verdict = classify(sample ? sample.state : null, station.basis)
  const change = sample && !sample.forecast ? changeIn24h(series.readings, simTime) : null

  return (
    <article className="panel">
      <button className="back" onClick={() => select(null)}>
        ← Auffällige Pegel
      </button>
      <header>
        <div>
          <h2>{titleCase(station.name)}</h2>
          <div className="water">{titleCase(station.water)}</div>
        </div>
      </header>

      <div className="value">
        {sample ? (
          <>
            <strong data-kind={sample.forecast ? 'forecast' : 'measured'}>{formatCm(sample.cm)}</strong>
            <span>cm {sample.forecast ? `· Prognose ${formatLead(lead)}` : '· gemessen'}</span>
            {change !== null && (
              <span className="trend mono">
                {change > 0 ? '↑' : change < 0 ? '↓' : '→'} {change > 0 ? '+' : ''}
                {formatCm(change)} cm / 24 h
              </span>
            )}
          </>
        ) : (
          <span>kein Wert zu diesem Zeitpunkt</span>
        )}
      </div>

      {sample && (
        <p className="verdict">
          {verdict ? (
            <>
              <i style={{ background: rampCss(sample.state) }} />
              {verdict}
            </>
          ) : (
            <span className="muted">Zu wenig Kennwerte für eine Einordnung</span>
          )}
        </p>
      )}

      {sample?.forecast && run && (
        <p className="provenance">
          Lauf {formatDate(Date.parse(run.issued))} {formatTime(Date.parse(run.issued))} · Modell {run.model}
        </p>
      )}

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

      <Chart
        station={station}
        readings={series.readings}
        forecast={series.forecast}
        start={range.start}
        now={range.now}
        end={range.end}
        simTime={simTime}
      />

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

      <footer className="disclaimer">
        {station.basis === 'seasonal'
          ? 'Statistischer Vergleich mit den eigenen Messwerten dieses Pegels seit 2000, jeweils ±15 Tage um den Kalendertag.'
          : `Statistischer Vergleich mit den Kennwerten dieses Pegels${station.refYears ? ` (${station.refYears} Referenzjahre)` : ''}.`}{' '}
        Keine amtliche Aussage. Warnungen geben die Landesbehörden heraus. Daten: PEGELONLINE (WSV).
      </footer>
    </article>
  )
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s\-(/.])([a-zäöüß])/g, (m) => m.toUpperCase())
    .replace(/\b(Up|Op|Mpm|Ap)\b/g, (m) => m.toUpperCase())
}
