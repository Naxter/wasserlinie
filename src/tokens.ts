// The single source for colours, type and tuning values. The scene reads
// these directly; the UI gets them as CSS variables via applyCssTokens().

export const color = {
  abyss: '#06121C',
  chart: '#0E2A3A',
  shoal: '#1D5A6E',
  tide: '#4FD1D9',
  gauge: '#E8503A',
  paper: '#E6DFD1',
  haze: '#7B6FA8',
} as const

export type ColorName = keyof typeof color

// How a gauge's state is coloured. State is a position on the gauge's own
// named levels: -1 its record low, -0.5 mean low water, 0 mean water,
// +0.5 mean high water, +1 its record high.
//
// Three properties are carried separately so none of them can be misread:
//
//   hue    which way. Warm means the water is leaving — sand, then amber, then
//          the scorched red of a record low. Cool means it is rising, up to a
//          near-white blue. Nothing warm can ever mean flood.
//   glow   how unusual, in both directions. Normal is the dimmest point on the
//          ramp, so a quiet country recedes and any departure lights up. An
//          earlier version tied glow to the amount of water, which drew record
//          lows dimmest of all — precisely the thing you want to see.
//   speed  how much water there is: dry rivers crawl, full ones run.
//
// Stops are interpolated in Oklab (see layers/ramp.ts), so the way from amber
// to turquoise stays clean instead of sinking through grey.
export const anomalyRamp = [
  { state: -1.0, color: '#F04A24', glow: 1.0, speed: 0.25 },
  { state: -0.7, color: '#EF8B34', glow: 0.82, speed: 0.4 },
  { state: -0.5, color: '#E4BA5C', glow: 0.68, speed: 0.55 },
  { state: -0.2, color: '#4FD1D9', glow: 0.5, speed: 0.85 },
  { state: 0.2, color: '#4FD1D9', glow: 0.5, speed: 1.05 },
  { state: 0.5, color: '#4BA3F0', glow: 0.78, speed: 1.5 },
  { state: 1.0, color: '#C4E9FF', glow: 1.0, speed: 2.2 },
] as const

/**
 * Rivers and gauges we cannot judge. It has to sit clearly *above* the terrain
 * in brightness — a grey darker than the ground turns the unmeasured network
 * into dark cracks instead of quiet water.
 */
export const unknownColor = '#93AAB8'

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

export const terrain = {
  // Germany is flat. Overview views get exaggerated, close-ups do not.
  exaggerationFar: 1.7,
  exaggerationNear: 1.0,
  exaggerationFarHeight: 700_000,
  exaggerationNearHeight: 60_000,
  // Elevation colour ramp (metres).
  rampMin: 0,
  rampMax: 1400,
  seaLevel: 0.5,
  // Hillshade light: azimuth from north, altitude above horizon (degrees).
  lightAzimuth: 315,
  lightAltitude: 40,
  outsideDim: 0.62,
} as const

export const atmosphere = {
  fogDensity: 0.00035,
  fogMinimumBrightness: 0.02,
  skyBrightnessShift: -0.35,
  skySaturationShift: -0.5,
  groundBrightnessShift: -0.35,
  groundSaturationShift: -0.5,
} as const

export const render = {
  msaaSamples: 4,
  // Past 2x the cost climbs faster than the visible gain.
  maxPixelRatio: 2,
} as const

export const post = {
  bloomContrast: 110,
  bloomBrightness: -0.68,
  bloomSigma: 2.6,
  bloomStepSize: 1.5,
  vignette: 0.55,
} as const

export const camera = {
  // Where the app opens: over the Alps looking north across the country.
  germany: { lon: 10.4, lat: 45.3, height: 820_000, heading: 0, pitch: -50 },
  // First frame before the intro flight.
  approach: { lon: 2.0, lat: 36.0, height: 6_500_000, heading: 15, pitch: -75 },
  introSeconds: 4.5,
  flightSeconds: 2.8,
  idleAfterSeconds: 10,
  driftRadiansPerSecond: 0.0009,
  minZoom: 1500,
  maxZoom: 5_000_000,
} as const

export const time = {
  historyDays: 90,
  forecastHours: 72,
  playSpeed: 3600 * 6, // simulated seconds per real second
} as const

export const gauge = {
  pixelSize: 9,
  nearDistance: 40_000,
  farDistance: 1_600_000,
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

export function mixRgb(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}
