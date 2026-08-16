import { anomalyRamp, unknownColor, unusual } from '../tokens'
import { RAMP_MAX, RAMP_MIN, rampCss } from '../layers/ramp'

const STOPS = anomalyRamp.map((s) => `${s.color} ${(((s.state - RAMP_MIN) / (RAMP_MAX - RAMP_MIN)) * 100).toFixed(0)}%`)
const MARKS: { state: number; label: string }[] = [
  { state: -1, label: 'Rekord' },
  { state: unusual.low, label: 'MNW' },
  { state: 0, label: 'MW' },
  { state: unusual.high, label: 'MHW' },
  { state: 1, label: 'Rekord' },
]

/** What the colours mean. Without this the map is decoration. */
export function Legend() {
  const pos = (state: number) => `${((state - RAMP_MIN) / (RAMP_MAX - RAMP_MIN)) * 100}%`
  return (
    <figure className="legend-scale">
      <figcaption>Wasserstand gegenüber den eigenen Kennwerten</figcaption>
      <div className="bar" style={{ background: `linear-gradient(90deg, ${STOPS.join(', ')})` }}>
        {MARKS.map((m) => (
          <span key={m.state} className="mark" style={{ left: pos(m.state) }} />
        ))}
      </div>
      <div className="ticks mono">
        {MARKS.map((m) => (
          <span key={m.state} style={{ left: pos(m.state) }}>
            {m.label}
          </span>
        ))}
      </div>
      <div className="ends">
        <span>Niedrigwasser</span>
        <span>normal</span>
        <span>Hochwasser</span>
      </div>
      <p className="note">
        <i style={{ background: rampCss(null) }} /> ohne Kennwerte, keine Einordnung möglich
        <br />
        <span style={{ color: unknownColor }}>weiche Kanten = Prognose</span>
      </p>
    </figure>
  )
}
