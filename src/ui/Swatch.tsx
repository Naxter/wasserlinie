import { rampCss } from '../layers/ramp'
import { unusual } from '../tokens'

// Colour alone cannot carry the direction. The ramp is well chosen for
// red-green deficiency, but in greyscale its lightness reverses — "selten
// niedrig" and "normal" come out as the same shade — and a deuteranope reads
// the grey of an unplaceable gauge as a healthy one. So the shape says it too:
// pointing down for low, up for high, round for ordinary, hollow for unknown.
export function Swatch({ state, size = 11 }: { state: number | null; size?: number }) {
  const known = state !== null && !Number.isNaN(state)
  const fill = rampCss(known ? state : null)
  const r = size / 2
  return (
    <svg className="swatch" width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      {!known ? (
        <rect x="1.5" y="1.5" width="9" height="9" fill="none" stroke={fill} strokeWidth="1.6" />
      ) : state <= unusual.low ? (
        <path d="M6 11 L1 2.5 H11 Z" fill={fill} />
      ) : state >= unusual.high ? (
        <path d="M6 1 L11 9.5 H1 Z" fill={fill} />
      ) : (
        <circle cx="6" cy="6" r={r * (12 / size) - 1.2} fill={fill} />
      )}
    </svg>
  )
}
