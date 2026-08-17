import { useEffect, useMemo, useRef, useState } from 'react'
import { useServices } from '../services'
import { useApp } from '../store'
import { Swatch } from './Swatch'
import { useQuantizedTime } from './useQuantizedTime'

// Without this the only way to reach a gauge is to rotate a globe and hunt for
// a dot a few pixels wide. Looking up a place by name is what a person does
// first, and it is also the app's only keyboard route into the map.

const LIMIT = 8

/** Umlauts folded, so "koln" and "KÖLN" both find Köln. */
function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '')
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s\-(/.])([a-zäöüß])/g, (m) => m.toUpperCase())
}

interface Hit {
  key: string
  kind: 'gauge' | 'river'
  name: string
  detail: string
  state: number | null
  go: () => void
}

export function Search() {
  const stations = useApp((s) => s.stations)
  const rivers = useApp((s) => s.rivers)
  const select = useApp((s) => s.select)
  const selectRiver = useApp((s) => s.selectRiver)
  const simTime = useQuantizedTime()
  const services = useServices()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const box = useRef<HTMLInputElement>(null)

  // "/" focuses the field, the way every search-first interface behaves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (e.key !== '/' || target?.tagName === 'INPUT') return
      e.preventDefault()
      box.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const hits = useMemo<Hit[]>(() => {
    const needle = fold(query)
    if (needle.length < 2 || !services) return []
    const out: Hit[] = []

    for (const river of new Map([...rivers.values()].map((r) => [r.name, r])).values()) {
      if (!fold(river.name).includes(needle)) continue
      out.push({
        key: `river-${river.id}`,
        kind: 'river',
        name: titleCase(river.name),
        detail: `${river.gauges.length} Pegel`,
        state: null,
        go: () => selectRiver(river.id),
      })
      if (out.length >= 3) break
    }

    for (let i = 0; i < stations.length; i++) {
      const st = stations[i]!
      if (!fold(st.name).includes(needle) && !fold(st.water).includes(needle)) continue
      const sample = services.timeline.sample(i, simTime)
      out.push({
        key: st.uuid,
        kind: 'gauge',
        name: titleCase(st.name),
        detail: titleCase(st.water),
        state: sample && !Number.isNaN(sample.state) ? sample.state : null,
        go: () => select(st.uuid),
      })
      if (out.length >= LIMIT) break
    }
    // A name that starts with the query is almost always the one meant.
    return out.sort((a, b) => Number(fold(b.name).startsWith(needle)) - Number(fold(a.name).startsWith(needle)))
  }, [query, stations, rivers, services, simTime, select, selectRiver])

  const choose = (hit: Hit) => {
    hit.go()
    setQuery('')
    setActive(0)
    box.current?.blur()
  }

  return (
    <div className="search">
      <input
        ref={box}
        type="search"
        value={query}
        placeholder="Ort, Fluss oder Pegel suchen"
        aria-label="Ort, Fluss oder Pegel suchen"
        aria-expanded={hits.length > 0}
        aria-controls="search-hits"
        autoComplete="off"
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') return setQuery('')
          if (!hits.length) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((a) => (a + 1) % hits.length)
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => (a - 1 + hits.length) % hits.length)
          } else if (e.key === 'Enter') {
            e.preventDefault()
            const hit = hits[active]
            if (hit) choose(hit)
          }
        }}
      />
      {hits.length > 0 && (
        <ul id="search-hits" className="hits" role="listbox">
          {hits.map((hit, i) => (
            <li key={hit.key}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                className={i === active ? 'active' : undefined}
                onPointerEnter={() => setActive(i)}
                onClick={() => choose(hit)}
              >
                {hit.kind === 'river' ? <span className="kind">Fluss</span> : <Swatch state={hit.state} size={10} />}
                <b>{hit.name}</b>
                <em>{hit.detail}</em>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
