import { rampGradientCss } from '../layers/ramp'
import { Swatch } from './Swatch'

// The scale's own anchors are percentiles of this gauge's record for this date:
// p10 sits at -0.5 and p90 at +0.5 (see anomaly.py). So the honest label for
// "selten" is the quantity itself — one year in ten — and the honest width for
// "normal" is eight tenths of the bar. Drawing the bands equal-width taught the
// opposite.
//
// "Niedrigwasser" and "Hochwasser" are deliberately not used: in German those
// name official events with legal warning thresholds, and this app has neither
// the data nor the standing to assert one.
// The record bands are a twentieth of the bar each — too narrow to hold a word
// without truncating it, so they are left to the sentence underneath.
const BANDS: { width: number; label: string }[] = [
  { width: 5, label: '' },
  { width: 10, label: 'selten' },
  { width: 70, label: 'üblich' },
  { width: 10, label: 'selten' },
  { width: 5, label: '' },
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
