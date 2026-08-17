import { rampGradientCss } from '../layers/ramp'
import { Swatch } from './Swatch'

// What sits under these labels is the colour ramp, so the widths have to be
// positions on it and nothing else. The scale's anchors are percentiles of this
// gauge's record for this date: p10 at -0.5 and p90 at +0.5 on a -1..+1 axis
// (see anomaly.py), which puts the two dividing lines at a quarter and three
// quarters.
//
// They used to be drawn as frequencies instead — a 70% "üblich" for something
// the text called eight years in ten — which put the line under the label at
// state ±0.7. Anyone tracing a river's colour down to the boundary read the
// wrong verdict off it. How often each band happens is what the sentence
// underneath is for; the bar can only carry one axis, and it is this one.
//
// "Niedrigwasser" and "Hochwasser" are deliberately not used: in German those
// name official events with legal warning thresholds, and this app has neither
// the data nor the standing to assert one.
const BANDS: { width: number; label: string }[] = [
  { width: 25, label: 'selten' },
  { width: 50, label: 'üblich' },
  { width: 25, label: 'selten' },
]

/** What the colours mean. Without this the map is decoration. */
export function Legend() {
  return (
    <figure className="legend-scale">
      <figcaption>Verglichen mit demselben Datum seit 2000</figcaption>
      <div className="bar" style={{ background: rampGradientCss() }} />
      <div className="bands">
        {BANDS.map((b, i) => (
          <span key={i} style={{ flexGrow: b.width }}>
            {b.label}
          </span>
        ))}
      </div>
      <div className="ends">
        <span>weniger Wasser als sonst</span>
        <span>mehr als sonst</span>
      </div>
      {/* The widths are the frequencies; this says what they mean. */}
      <p className="reading">
        <b>üblich</b> ist, was an diesem Datum in 8 von 10 Jahren gemessen wurde. Auf <b>selten</b> entfällt je ein
        Zehntel der Jahre. Ganz außen: so tief oder so hoch wie nie zuvor an diesem Tag.
      </p>
      <p className="note">
        <span>
          <Swatch state={null} size={10} /> ohne Langzeit-Archiv, nicht einzuordnen
        </span>
        <span>weiche Kanten = Prognose, nicht gemessen</span>
      </p>
    </figure>
  )
}
