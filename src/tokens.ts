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
// The normal band is wide and quiet on purpose, so an ordinary day is a calm
// turquoise country and anything else stands out. Both ends are warm, but the
// dry end is desaturated and dim while the wet end is saturated and bright —
// brightness, not hue alone, separates them.
export const anomalyRamp = [
  { state: -1.0, color: '#C88A2E', glow: 0.55, speed: 0.3 },
  { state: -0.5, color: '#A8B072', glow: 0.62, speed: 0.55 },
  { state: -0.2, color: '#4FD1D9', glow: 0.72, speed: 1.0 },
  { state: 0.2, color: '#4FD1D9', glow: 0.72, speed: 1.0 },
  { state: 0.5, color: '#E0632B', glow: 0.88, speed: 1.6 },
  { state: 1.0, color: '#E8324A', glow: 1.0, speed: 2.2 },
] as const

/** Gauges with no reference levels get this: a statement that we cannot say. */
export const unknownColor = '#6E7A85'

/** Beyond these the level counts as worth pointing at. */
export const unusual = { low: -0.5, high: 0.5 } as const

export const font = {
  display: "'Bricolage Grotesque Variable', 'Inter Tight Variable', sans-serif",
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
