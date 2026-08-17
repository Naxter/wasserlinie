import { useServices } from '../services'
import { useApp } from '../store'

// The way back. Picking a gauge zooms the map in on it, and there was no route
// from there to the national picture except zooming out by hand.
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
        // sidebar; the map would otherwise leave a station panel open for a
        // gauge no longer on screen.
        select(null)
        void services.camera.home()
      }}
    >
      Deutschland
    </button>
  )
}
