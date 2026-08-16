import { useMemo } from 'react'
import type { ForecastPoint, Reading } from '../data/db'
import type { Station } from '../data/types'
import { formatShortDate } from './format'

interface Props {
  station: Station
  readings: Reading[]
  forecast: ForecastPoint[]
  start: number
  now: number
  end: number
  simTime: number
}

const W = 300
const H = 128
const PAD = { top: 8, right: 6, bottom: 18, left: 34 }

// Measured is a crisp line. Forecast is a median inside a band that widens
// with the horizon — the uncertainty has to be visible without reading a number.
export function Chart({ station, readings, forecast, start, now, end, simTime }: Props) {
  const geometry = useMemo(() => {
    const values = readings.map((r) => r.value)
    for (const f of forecast) values.push(f.p10, f.p90)
    if (values.length === 0) return null
    let lo = Math.min(...values)
    let hi = Math.max(...values)
    // Reference marks join the axis only when they are near the data; a
    // flood mark 6 m above a summer level would flatten the curve to nothing.
    const reach = Math.max(40, (hi - lo) * 1.5)
    for (const mark of [station.low, station.high]) {
      if (mark !== null && mark > lo - reach && mark < hi + reach) {
        lo = Math.min(lo, mark)
        hi = Math.max(hi, mark)
      }
    }
    const pad = Math.max(5, (hi - lo) * 0.08)
    lo -= pad
    hi += pad
    const x = (t: number) => PAD.left + ((t - start) / (end - start)) * (W - PAD.left - PAD.right)
    const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom)

    const line = readings.map((r, i) => `${i ? 'L' : 'M'}${x(r.t).toFixed(1)} ${y(r.value).toFixed(1)}`).join(' ')
    const last = readings[readings.length - 1]
    const anchor = last ? [{ t: last.t, p10: last.value, p50: last.value, p90: last.value }] : []
    const fc = [...anchor, ...forecast]
    const median = fc.map((f, i) => `${i ? 'L' : 'M'}${x(f.t).toFixed(1)} ${y(f.p50).toFixed(1)}`).join(' ')
    const band = fc.length
      ? [
          ...fc.map((f, i) => `${i ? 'L' : 'M'}${x(f.t).toFixed(1)} ${y(f.p90).toFixed(1)}`),
          ...[...fc].reverse().map((f) => `L${x(f.t).toFixed(1)} ${y(f.p10).toFixed(1)}`),
          'Z',
        ].join(' ')
      : ''

    const yTicks = niceTicks(lo, hi, 4)
    const xTicks: number[] = []
    const day = 86_400_000
    const step = end - start > 45 * day ? 10 * day : 5 * day
    for (let t = Math.ceil(start / day) * day; t < end; t += step) xTicks.push(t)
    const marks = [station.low, station.high].filter((v): v is number => v !== null && v >= lo && v <= hi)
    return { x, y, line, median, band, yTicks, xTicks, marks }
  }, [station, readings, forecast, start, end])

  if (!geometry) return <p className="empty">Keine Messwerte im Zeitraum.</p>
  const { x, y, line, median, band, yTicks, xTicks, marks } = geometry

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Pegelverlauf">
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="grid" />
          <text x={PAD.left - 5} y={y(v) + 3} className="axis mono" textAnchor="end">
            {Math.round(v)}
          </text>
        </g>
      ))}
      {xTicks.map((t) => (
        <text key={t} x={x(t)} y={H - 4} className="axis mono" textAnchor="middle">
          {formatShortDate(t)}
        </text>
      ))}
      {marks.map((v) => (
        <line key={v} x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="mark" />
      ))}
      <rect x={x(now)} y={PAD.top} width={x(end) - x(now)} height={H - PAD.top - PAD.bottom} className="future" />
      {band && <path d={band} className="band" />}
      {median && <path d={median} className="median" />}
      {line && <path d={line} className="measured" />}
      <line x1={x(now)} x2={x(now)} y1={PAD.top} y2={H - PAD.bottom} className="nowline" />
      <line x1={x(simTime)} x2={x(simTime)} y1={PAD.top} y2={H - PAD.bottom} className="cursor" />
    </svg>
  )
}

function niceTicks(lo: number, hi: number, count: number): number[] {
  const raw = (hi - lo) / count
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v)
  return out
}
