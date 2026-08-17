import { useCallback, useMemo, useRef } from 'react'
import { useApp } from '../store'
import { formatDate, formatLead, formatTime, formatWeekday } from './format'
import { ticksFor } from './ticks'
import { useMediaQuery } from './useMediaQuery'

const DAY = 86_400_000

export function TimeBar() {
  const range = useApp((s) => s.range)
  const simTime = useApp((s) => s.simTime)
  const playing = useApp((s) => s.playing)
  const mode = useApp((s) => s.mode)
  const loadingHistory = useApp((s) => s.loadingHistory)
  const setSimTime = useApp((s) => s.setSimTime)
  const setMode = useApp((s) => s.setMode)
  const togglePlay = useApp((s) => s.togglePlay)
  const track = useRef<HTMLDivElement>(null)
  const narrow = useMediaQuery('(max-width: 640px)')

  const ticks = useMemo(() => (range ? ticksFor(range.start, range.end, narrow) : []), [range, narrow])

  const seek = useCallback(
    (clientX: number) => {
      if (!range || !track.current) return
      const rect = track.current.getBoundingClientRect()
      const f = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      setSimTime(range.start + f * (range.end - range.start))
    },
    [range, setSimTime],
  )

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    seek(e.clientX)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons & 1) seek(e.clientX)
  }

  if (!range) return null
  const span = range.end - range.start
  const pos = (t: number) => `${((t - range.start) / span) * 100}%`
  const forecast = simTime > range.now
  const lead = (simTime - range.now) / 3_600_000

  return (
    <div className="timebar" id="zeitleiste">
      <div className="modes" role="group" aria-label="Zeitraum">
        <button aria-pressed={mode === 'live'} onClick={() => setMode('live')}>
          Jetzt
        </button>
        <button aria-pressed={mode === 'history'} onClick={() => setMode('history')} disabled={loadingHistory}>
          {loadingHistory ? 'lädt …' : 'Seit 2000'}
        </button>
      </div>
      <button className="play" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Abspielen'}>
        {playing ? (
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <rect x="1.5" y="1" width="3" height="10" fill="currentColor" />
            <rect x="7.5" y="1" width="3" height="10" fill="currentColor" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2 1.2v9.6L10.5 6z" fill="currentColor" />
          </svg>
        )}
      </button>
      <div
        className="track"
        ref={track}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        role="slider"
        aria-label="Zeitpunkt"
        aria-valuemin={range.start}
        aria-valuemax={range.end}
        aria-valuenow={simTime}
        aria-valuetext={`${formatDate(simTime)} ${formatTime(simTime)}`}
        tabIndex={0}
        onKeyDown={(e) => {
          // One arrow press should move one readable step, which is an hour in
          // the live view and a day across twenty-six years.
          const fine = mode === 'history' ? DAY : 3_600_000
          const step = e.shiftKey ? fine * 30 : fine
          if (e.key === 'ArrowLeft') setSimTime(simTime - step)
          if (e.key === 'ArrowRight') setSimTime(simTime + step)
        }}
      >
        <div className="rail">
          <div className="past" style={{ width: pos(range.now) }} />
          <div className="future" style={{ left: pos(range.now) }} />
        </div>
        <div className="ticks">
          {ticks.map(({ t, label }) => (
            <span key={t} className={label ? 'tick labelled' : 'tick'} style={{ left: pos(t) }}>
              {label && <em>{label}</em>}
            </span>
          ))}
        </div>
        <div className="now" style={{ left: pos(range.now) }} />
        <div className="handle" style={{ left: pos(simTime) }} />
      </div>
      <div className="readout">
        <span className="date">
          {formatWeekday(simTime)} {formatDate(simTime)}
          {mode === 'live' && ` · ${formatTime(simTime)}`}
        </span>
        <span className="kind" data-kind={forecast ? 'forecast' : 'measured'}>
          {mode === 'history' ? 'Tagesmittel' : forecast ? `Prognose ${formatLead(lead)}` : 'gemessen'}
        </span>
      </div>
    </div>
  )
}
