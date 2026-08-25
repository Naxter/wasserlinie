// The single source for colours, type and tuning values. The scene reads
// these directly; the UI gets them as CSS variables via applyCssTokens().

export const color = {
  abyss: '#06121C',
  tide: '#4FD1D9',
  gauge: '#E8503A',
  paper: '#E6DFD1',
  haze: '#7B6FA8',
} as const

// How a gauge's state is coloured. State is a position on the gauge's own
// scale: -1 its record low, -0.5 p10, 0 normal, +0.5 p90, +1 its record high.
//
// Colour is the only channel left. The 3D build carried "how unusual" in a
// separate glow value the shader multiplied in, and the middle of the ramp
// could afford to be a bright cyan because glow made it recede anyway. Flat on
// a map there is no glow, so unusualness has to live in the colour itself:
//
//   hue     which way. Warm means the water is leaving — sand, then amber,
//           then the scorched red of a record low. Cool means it is rising.
//           Nothing warm can ever mean flood.
//   chroma  how unusual. It climbs from the middle outward on both arms, so a
//           quiet country stays muted and any departure saturates.
//
// The wet arm used to run to a near-white blue, which sent chroma *down* as
// the water got higher — p90 and a record high came out within dE 0.08 of
// normal in Oklab, close enough to be one colour. It now darkens and saturates
// instead, and carries three stops beyond p90 to match the three the dry arm
// has beyond p10. Symmetry is the point: the two directions must be equally
// easy to see.
//
// Stops are interpolated in Oklab (see color/ramp.ts), so the way from amber
// to teal stays clean instead of sinking through grey.
export const anomalyRamp = [
  { state: -1.0, color: '#F04A24' },
  { state: -0.7, color: '#EF8B34' },
  { state: -0.5, color: '#E4BA5C' },
  { state: -0.2, color: '#4FB39F' },
  { state: 0.2, color: '#4FB39F' },
  { state: 0.5, color: '#2E8AD8' },
  { state: 0.7, color: '#2A62DC' },
  { state: 1.0, color: '#2A46D0' },
] as const

/**
 * Rivers and gauges we cannot judge.
 *
 * Neutral on purpose, and brighter than the land. It used to carry a blue
 * cast, which was harmless while the ramp's cool arm ended near white — now
 * that the arm is blue all the way, any blue in this grey reads as "slightly
 * high" rather than "no verdict". A grey darker than the ground would be worse
 * still: it turns the unmeasured network into dark cracks instead of quiet
 * water.
 */
export const unknownColor = '#AEB2B4'

/** Beyond these the level counts as worth pointing at. */
export const unusual = { low: -0.5, high: 0.5 } as const

// Names and readings are set like the sounding numbers on a nautical chart:
// a document serif, with the sans kept for running text and the mono for
// labels and anything that has to line up in a column.
export const font = {
  display: "'Source Serif 4 Variable', 'Bricolage Grotesque Variable', serif",
  body: "'Inter Tight Variable', system-ui, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
} as const

// North-up, no tilt, no rotation: the map is read by comparing places, and a
// tilt makes the near half of the country bigger than the far half.
//
// There is no overview zoom number here on purpose. The country view is fitted
// to the outline's own bounding box against whatever the panels leave free, so
// it stays right at any window size instead of being tuned for one.
export const camera = {
  /** Roughly the middle of the country, for the first frame before the fit. */
  start: { lon: 10.45, lat: 51.1, zoom: 5 },
  /** Where a picked gauge is framed. */
  stationZoom: 9.5,
  flightSeconds: 1.1,
  minZoom: 4.5,
  maxZoom: 13,
} as const

// The land is a quiet stage: one flat fill inside the border, the sea darker
// outside it, and no relief at all. Everything bright on the map is data.
export const map = {
  land: '#102C3C',
  landEdge: '#2B5468',
  sea: '#06121C',
  /** Rivers with no gauge to judge them by, and the fine network. */
  quiet: '#5C7788',
  /** Line widths in pixels at the country view and fully zoomed in. */
  width: {
    200: [2.2, 9],
    125: [1.5, 6.5],
    42: [0.9, 4],
    12: [0.5, 2.4],
  },
  // Wide enough that the country view fits inside it: max bounds constrain the
  // *viewport*, not the country, so a box drawn tightly round Germany silently
  // forces the overview to zoom in until it fits.
  bounds: { west: -6, east: 28, south: 40, north: 62 },
  /** Below this zoom the fine network is not drawn at all. */
  detailFromZoom: 7.5,
  /** Widths and radii reach their largest value here and stop growing. */
  maxZoomForWidth: 12,
  /** Past 2x the cost climbs faster than the visible gain. */
  maxPixelRatio: 2,
  gaugeRadius: [3.2, 7],
} as const

// Simulated seconds per real second. One rate cannot serve both sliders: the
// live window is a month, the long view is twenty-six years, and at six hours
// a second the whole record would take eleven hours to play. The long view
// runs at fifty days a second, so it crosses in a little over three minutes —
// slow enough to watch one dry summer arrive rather than see the whole record
// flicker past, and still not a sitting.
export const time = {
  historyDays: 90,
  forecastHours: 72,
  playSpeed: 3600 * 6,
  historyPlaySpeed: 86_400 * 50,
} as const

export function applyCssTokens(root: HTMLElement = document.documentElement): void {
  for (const [name, value] of Object.entries(color)) root.style.setProperty(`--${name}`, value)
  root.style.setProperty('--font-display', font.display)
  root.style.setProperty('--font-body', font.body)
  root.style.setProperty('--font-mono', font.mono)
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
