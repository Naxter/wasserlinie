import { useApp, type LayerId } from '../store'

const LAYERS: { id: LayerId; label: string; hint: string }[] = [
  { id: 'rivers', label: 'Flussnetz', hint: 'Flüsse und Kanäle' },
  { id: 'gauges', label: 'Messstellen', hint: 'Pegel der WSV' },
]

export function LayerControl() {
  const layers = useApp((s) => s.layers)
  const toggleLayer = useApp((s) => s.toggleLayer)
  return (
    <div className="layer-control" role="group" aria-label="Ebenen">
      {LAYERS.map((l) => (
        <button
          key={l.id}
          type="button"
          role="switch"
          aria-checked={layers[l.id]}
          title={l.hint}
          onClick={() => toggleLayer(l.id)}
        >
          <span className="box" aria-hidden="true" />
          {l.label}
        </button>
      ))}
    </div>
  )
}
