import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ForecastPoint, Reading } from '../data/store'
import type { Station } from '../data/types'
import { classify } from './classify'
import { formatCm, formatDate, formatShortDate } from './format'
import { ticksFor } from './ticks'

interface Props {
  station: Station
  /** hourly readings from the live window */
  readings: Reading[]
  /** the whole daily record, empty until it has been fetched */
  daily: Reading[]
  forecast: ForecastPoint[]
  now: number
  simTime: number
  /** Where a reading sat on the gauge's scale, for the hover readout. */
  stateAt: (t: number) => number | null
}

const W = 300
const H = 150
const PAD = { top: 8, right: 6, bottom: 30, left: 34 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom
const DAY = 86_400_000
const MIN_SPAN = 2 * DAY

// Measured is a crisp line, forecast a median inside a band that widens with
// the horizon. The window is the reader's: wheel to zoom, drag to pan, double
// click to see everything again.
export function Chart({ station, readings, daily, forecast, now, simTime, stateAt }: Props) {
  const svg = useRef<SVGSVGElement>(null)
  const [window_, setWindow] = useState<[number, number] | null>(null)
  const [cursor, setCursor] = useState<number | null>(null)
  const drag = useRef<{ x: number; from: number; to: number } | null>(null)

  // The daily record where it exists, the hourly window on top of it: the two
  // overlap in the last month and the hourly one is the better answer there.
  const series = daily.length ? daily : readings
  const full = useMemo<[number, number]>(() => {
    const first = series[0]?.t ?? readings[0]?.t ?? now - 31 * DAY
    const last = forecast[forecast.length - 1]?.t ?? readings[readings.length - 1]?.t ?? now
    return [first, Math.max(last, now)]
  }, [series, readings, forecast, now])
  const [from, to] = window_ ?? full

  const view = useMemo(() => {
    const points = clip(series, from, to)
    const hourly = daily.length ? clip(readings, from, to) : []
    const band = forecast.filter((f) => f.t >= from && f.t <= to)
    const values: number[] = []
    for (const p of thin(points, PLOT_W)) values.push(p.value)
    for (const p of hourly) values.push(p.value)
    for (const f of band) values.push(f.p10, f.p90)
    if (values.length === 0) return null

    let lo = Math.min(...values)
    let hi = Math.max(...values)
    const pad = Math.max(5, (hi - lo) * 0.08)
    lo -= pad
    hi += pad
    const x = (t: number) => PAD.left + ((t - from) / (to - from)) * PLOT_W
    const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * PLOT_H
    return {
      x,
      y,
      lo,
      hi,
      line: path(thin(points, PLOT_W), x, y),
      hourly: path(hourly, x, y),
      median: path(
        band.map((f) => ({ t: f.t, value: f.p50 })),
        x,
        y,
      ),
      band: band.length
        ? [
            ...band.map((f, i) => `${i ? 'L' : 'M'}${x(f.t).toFixed(1)} ${y(f.p90).toFixed(1)}`),
            ...[...band].reverse().map((f) => `L${x(f.t).toFixed(1)} ${y(f.p10).toFixed(1)}`),
            'Z',
          ].join(' ')
        : '',
      yTicks: niceTicks(lo, hi, 4),
      xTicks: ticksFor(from, to).filter((t) => t.label),
      points,
    }
  }, [series, readings, daily.length, forecast, from, to])

  const timeAt = useCallback(
    (clientX: number): number => {
      const rect = svg.current?.getBoundingClientRect()
      if (!rect) return from
      const f = (clientX - rect.left) / rect.width
      return from + ((f * W - PAD.left) / PLOT_W) * (to - from)
    },
    [from, to],
  )

  const zoom = useCallback(
    (clientX: number, deltaY: number) => {
      const at = timeAt(clientX)
      const factor = Math.exp(deltaY * 0.0015)
      const span = Math.min(full[1] - full[0], Math.max(MIN_SPAN, (to - from) * factor))
      // Keep the instant under the pointer where it is, so zooming feels anchored.
      const share = (at - from) / (to - from)
      const next = shift([at - share * span, at + (1 - share) * span], full)
      setWindow(next[1] - next[0] >= full[1] - full[0] ? null : next)
    },
    [timeAt, from, to, full],
  )

  // React attaches `onWheel` passively, so preventDefault there is ignored and
  // the sidebar scrolls away underneath the zoom. This one has to be its own
  // non-passive listener.
  useEffect(() => {
    const el = svg.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      zoom(e.clientX, e.deltaY)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoom])

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, from, to }
  }

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current
    if (d && (e.buttons & 1) !== 0) {
      const rect = svg.current?.getBoundingClientRect()
      if (!rect) return
      const moved = ((e.clientX - d.x) / rect.width) * (W / PLOT_W) * (d.to - d.from)
      setWindow(shift([d.from - moved, d.to - moved], full))
      return
    }
    setCursor(timeAt(e.clientX))
  }

  const onPointerUp = () => {
    drag.current = null
  }

  if (!view) return <p className="empty">Keine Messwerte im Zeitraum.</p>
  const hit = cursor === null ? null : nearest(view.points, cursor)
  const zoomed = window_ !== null

  return (
    <figure className="chart-figure">
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="chart"
        role="img"
        aria-label={`Pegelverlauf ${station.name}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          setCursor(null)
          onPointerUp()
        }}
        onDoubleClick={() => setWindow(null)}
      >
        {view.yTicks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={view.y(v)} y2={view.y(v)} className="grid" />
            <text x={PAD.left - 5} y={view.y(v) + 3} className="axis mono" textAnchor="end">
              {Math.round(v)}
            </text>
          </g>
        ))}
        {view.xTicks.map((t) => (
          <text key={t.t} x={view.x(t.t)} y={H - 18} className="axis mono" textAnchor="middle">
            {t.label}
          </text>
        ))}
        {now > from && now < to && (
          <rect x={view.x(now)} y={PAD.top} width={view.x(to) - view.x(now)} height={PLOT_H} className="future" />
        )}
        {view.band && <path d={view.band} className="band" />}
        {view.median && <path d={view.median} className="median" />}
        {view.line && <path d={view.line} className="measured" />}
        {view.hourly && <path d={view.hourly} className="measured hourly" />}
        {now > from && now < to && (
          <line x1={view.x(now)} x2={view.x(now)} y1={PAD.top} y2={H - PAD.bottom} className="nowline" />
        )}
        {simTime >= from && simTime <= to && (
          <line x1={view.x(simTime)} x2={view.x(simTime)} y1={PAD.top} y2={H - PAD.bottom} className="cursor" />
        )}
        {hit && (
          <g className="hit">
            <line x1={view.x(hit.t)} x2={view.x(hit.t)} y1={PAD.top} y2={H - PAD.bottom} />
            <circle cx={view.x(hit.t)} cy={view.y(hit.value)} r={2.5} />
          </g>
        )}
      </svg>
      <figcaption className="readout">
        {hit ? (
          <>
            <b className="mono">{formatDate(hit.t)}</b>
            <span className="mono">{formatCm(hit.value)} cm</span>
            <span className="verdict">{classify(stateAt(hit.t), station.basis) ?? ''}</span>
          </>
        ) : (
          <span className="hint">
            {zoomed
              ? `${formatShortDate(from)} – ${formatShortDate(to)} · Doppelklick für alles`
              : 'Scrollen zoomt, ziehen verschiebt'}
          </span>
        )}
      </figcaption>
    </figure>
  )
}

export function clip(points: Reading[], from: number, to: number): Reading[] {
  // One point either side of the window so the line reaches the edges.
  let lo = 0
  while (lo < points.length - 1 && points[lo + 1]!.t < from) lo++
  let hi = points.length - 1
  while (hi > 0 && points[hi - 1]!.t > to) hi--
  return points.slice(lo, hi + 1)
}

/**
 * At most two points per pixel column, keeping the highest and lowest in each.
 * Averaging would quietly erase the record lows this whole app is about.
 */
export function thin(points: Reading[], width: number): Reading[] {
  if (points.length <= width * 2) return points
  const first = points[0]!.t
  const span = points[points.length - 1]!.t - first || 1
  const out: Reading[] = []
  let bucket = 0
  let min: Reading | null = null
  let max: Reading | null = null
  const flush = () => {
    if (!min || !max) return
    if (min.t <= max.t) out.push(min, max)
    else out.push(max, min)
  }
  for (const p of points) {
    const b = Math.floor(((p.t - first) / span) * width)
    if (b !== bucket) {
      flush()
      bucket = b
      min = max = null
    }
    if (!min || p.value < min.value) min = p
    if (!max || p.value > max.value) max = p
  }
  flush()
  return out
}

function path(points: Reading[], x: (t: number) => number, y: (v: number) => number): string {
  return points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ')
}

function nearest(points: Reading[], t: number): Reading | null {
  let best: Reading | null = null
  let gap = Infinity
  for (const p of points) {
    const d = Math.abs(p.t - t)
    if (d < gap) {
      gap = d
      best = p
    }
  }
  return best
}

/** Keep a window inside the data rather than letting it drift off the end. */
function shift([from, to]: [number, number], full: [number, number]): [number, number] {
  const span = Math.min(to - from, full[1] - full[0])
  if (from < full[0]) return [full[0], full[0] + span]
  if (to > full[1]) return [full[1] - span, full[1]]
  return [from, to]
}

function niceTicks(lo: number, hi: number, count: number): number[] {
  const raw = (hi - lo) / count
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v)
  return out
}
