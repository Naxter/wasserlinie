import { unknownColor, unusual } from '../tokens'
import { RAMP_MAX, RAMP_MIN, rampCss, rampGradientCss } from '../layers/ramp'

// Neutral wording on purpose: most gauges are ranked against their own record
// for the date, where these ticks are the 10th, 50th and 90th percentile — not
// MNW/MW/MHW. Only the handful still on year-round marks would fit those names.
const MARKS: { state: number; label: string }[] = [
  { state: -1, label: 'Rekord' },
  { state: unusual.low, label: 'selten' },
  { state: 0, label: 'normal' },
  { state: unusual.high, label: 'selten' },
  { state: 1, label: 'Rekord' },
]

/** What the colours mean. Without this the map is decoration. */
export function Legend() {
  const pos = (state: number) => `${((state - RAMP_MIN) / (RAMP_MAX - RAMP_MIN)) * 100}%`
  return (
    <figure className="legend-scale">
      <figcaption>Wie ungewöhnlich für diesen Pegel</figcaption>
      <div className="bar" style={{ background: rampGradientCss() }}>
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
