import { useMemo } from 'react'
import { rampCss } from '../layers/ramp'
import { sampleRiver } from '../layers/rivers'
import { useServices } from '../services'
import { useApp } from '../store'
import { classifyShort } from './classify'
import { formatCm } from './format'
import { useQuantizedTime } from './useQuantizedTime'

/** Segments in the strip that shows the state running down the river. */
const PROFILE = 40

export function RiverPanel() {
  const id = useApp((s) => s.selectedRiver)
  const rivers = useApp((s) => s.rivers)
  const select = useApp((s) => s.select)
  const selectRiver = useApp((s) => s.selectRiver)
  const hover = useApp((s) => s.hover)
  const simTime = useQuantizedTime()
  const services = useServices()
  const river = id === null ? null : (rivers.get(id) ?? null)

  const gauges = useMemo(() => {
    if (!river || !services) return []
    return river.gauges
      .map((g) => {
        const slot = services.timeline.slotOf(g.uuid)
        const station = services.timeline.stations.find((s) => s.uuid === g.uuid)
        const sample = slot === undefined ? null : services.timeline.sample(slot, simTime)
        return { uuid: g.uuid, s: g.s, name: station?.name ?? g.uuid, sample }
      })
      .sort((a, b) => a.s - b.s)
  }, [river, services, simTime])

  const profile = useMemo(() => {
    const placed = gauges.filter((g) => g.sample && !Number.isNaN(g.sample.state))
    if (placed.length === 0) return null
    return Array.from(
      sampleRiver(
        placed.map((g) => g.s),
        placed.map((g) => g.sample!.state),
        PROFILE,
      ),
    )
  }, [gauges])

  if (!river) return null
  const measured = gauges.filter((g) => g.sample && !Number.isNaN(g.sample.state)).length

  return (
    <article className="panel river">
      <button className="back" onClick={() => selectRiver(null)}>
        ← Auffällige Pegel
      </button>
      <header>
        <div>
          <h2>{titleCase(river.name)}</h2>
          <div className="water">
            {river.km < 1 ? 'unter 1 km' : `${Math.round(river.km)} km`} · {river.gauges.length}{' '}
            {river.gauges.length === 1 ? 'Pegel' : 'Pegel'}
          </div>
        </div>
      </header>

      {profile ? (
        <>
          {/* Upstream on the left, downstream on the right — the same
              interpolation the shader paints the river itself with. */}
          <div className="profile" aria-hidden="true">
            {profile.map((state, i) => (
              <i key={i} style={{ background: rampCss(state) }} />
            ))}
          </div>
          <div className="profile-ends">
            <span>flussauf</span>
            <span>flussab</span>
          </div>
        </>
      ) : (
        <p className="empty">
          {river.gauges.length === 0
            ? 'Auf diesem Abschnitt liegt kein Pegel. Er wird nach dem Hintergrundnetz gezeichnet.'
            : 'Für diesen Zeitpunkt liegt hier kein Messwert vor.'}
        </p>
      )}

      {gauges.length > 0 && (
        <ol className="river-gauges">
          {gauges.map((g) => {
            const state = g.sample?.state ?? NaN
            return (
              <li key={g.uuid}>
                <button
                  type="button"
                  onClick={() => select(g.uuid)}
                  onPointerEnter={() => hover(g.uuid)}
                  onPointerLeave={() => hover(null)}
                >
                  <i style={{ background: rampCss(Number.isNaN(state) ? null : state) }} aria-hidden="true" />
                  <b>{titleCase(g.name)}</b>
                  <em>
                    {g.sample && Number.isFinite(g.sample.cm)
                      ? `${formatCm(g.sample.cm)} cm`
                      : (classifyShort(Number.isNaN(state) ? null : state) ?? '—')}
                  </em>
                </button>
              </li>
            )
          })}
        </ol>
      )}

      <footer className="disclaimer">
        {measured} von {river.gauges.length} Pegeln auf diesem Abschnitt sind zu diesem Zeitpunkt eingeordnet. Die
        Farbe dazwischen ist zwischen ihnen interpoliert, keine eigene Messung.
      </footer>
    </article>
  )
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s\-(/.])([a-zäöüß])/g, (m) => m.toUpperCase())
    .replace(/\b(Up|Op|Mpm|Ap)\b/g, (m) => m.toUpperCase())
}
