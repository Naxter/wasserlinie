import { useServices } from '../services'
import { useApp } from '../store'
import { camera } from '../tokens'

// The way back. Picking a gauge flies the camera 800 km down and there was no
// route from there to the national picture except zooming out by hand, which
// also loses the heading the map is meant to be read at.
export function Overview() {
  const services = useServices()
  const select = useApp((s) => s.select)
  if (!services) return null
  return (
    <button
      type="button"
      className="overview"
      title="Zurück zur Übersicht über Deutschland"
      onClick={() => {
        // Clearing the selection puts the auffällige-Pegel list back in the
        // sidebar; the camera would otherwise leave a station panel open for a
        // gauge no longer on screen.
        select(null)
        void services.director.flyTo(camera.germany)
      }}
    >
      Deutschland
    </button>
  )
}
