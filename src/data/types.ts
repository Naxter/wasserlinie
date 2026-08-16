// Shapes of the static assets the pipeline writes into public/data.

export interface Station {
  uuid: string
  name: string
  water: string
  waterKey: string
  lon: number
  lat: number
  km: number | null
  zero: number | null
  mw: number | null
  low: number | null
  high: number | null
  ref: 'mean' | 'tidal' | 'extremes' | null
  /** every long-term mark the gauge publishes, in cm */
  marks: Record<string, number>
  /** years those marks were computed over */
  refYears: number | null
  hasData: boolean
}

export interface StationsFile {
  generated: string
  stations: Station[]
}

export interface RiverGauge {
  uuid: string
  s: number
}

export interface River {
  id: number
  name: string
  cls: number
  km: number
  coords: [number, number][]
  gauges: RiverGauge[]
}

export interface RiversFile {
  rivers: River[]
}

export interface FieldMeta {
  t0: string
  now: string
  stepHours: number
  steps: number
  samples: number
  channels: number
  stateOffset: number
  stateScale: number
  horizonHours: number
  forecastRun: string | null
  rivers: number[]
}

export interface ForecastRun {
  id: string
  model: string
  issued: string
  generated: string
  horizonHours: number
  stepHours: number
  file: string
  stations: number
}

export interface Manifest {
  runs: ForecastRun[]
}

export interface Field {
  meta: FieldMeta
  data: Uint8Array
  /** river id → slot in `data` */
  slot: Map<number, number>
}
