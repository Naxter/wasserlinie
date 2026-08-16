import { Cartesian3, GeometryInstance, GroundPolylineGeometry, GroundPolylinePrimitive, PolylineMaterialAppearance } from 'cesium'
import { CameraDirector } from './scene/camera'
import { createViewer } from './scene/viewer'
import type { Ring } from './scene/relief'
import { createRiverMaterial } from './layers/riverMaterial'
import { applyCssTokens, camera as cameraTokens } from './tokens'
import './ui/styles.css'

applyCssTokens()

const app = document.getElementById('app')!
const sceneEl = document.createElement('div')
sceneEl.className = 'scene'
const credits = document.createElement('div')
credits.className = 'credits'
app.append(sceneEl, credits)

async function boot() {
  const outline = (await (await fetch('/data/germany.json')).json()) as { rings: Ring[] }
  const viewer = createViewer({ container: sceneEl, credits, outline: outline.rings })
  const director = new CameraDirector(viewer)
  director.jumpTo(cameraTokens.approach)
  void director.flyTo(cameraTokens.germany, cameraTokens.introSeconds)

  // Look-dev stand-in for the river network: a rough Rhine with an invented field.
  const rhine = [
    [7.59, 47.59], [7.79, 48.05], [7.8, 48.55], [8.2, 48.95], [8.4, 49.4], [8.45, 49.9],
    [8.3, 50.0], [7.9, 50.05], [7.7, 50.2], [7.6, 50.36], [7.5, 50.7], [7.05, 50.9],
    [6.95, 51.2], [6.75, 51.4], [6.6, 51.7], [6.3, 51.85],
  ]
  const steps = 64
  const samples = 64
  const canvas = document.createElement('canvas')
  canvas.width = samples
  canvas.height = steps
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(samples, steps)
  for (let y = 0; y < steps; y++) {
    for (let x = 0; x < samples; x++) {
      const t = y / steps
      const ratio = 1 + 0.9 * Math.sin(t * 6.28 + x / 9) * Math.sin(x / 5)
      const o = (y * samples + x) * 4
      img.data[o] = Math.min(255, (ratio / 3) * 255)
      img.data[o + 1] = 255
      img.data[o + 2] = 0
      img.data[o + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)

  const material = createRiverMaterial({ field: canvas, lengthKm: 700, baseWidth: 0.55 })
  const primitive = new GroundPolylinePrimitive({
    geometryInstances: new GeometryInstance({
      geometry: new GroundPolylineGeometry({
        positions: Cartesian3.fromDegreesArray(rhine.flat()),
        width: 14,
      }),
    }),
    appearance: new PolylineMaterialAppearance({ material }),
  })
  viewer.scene.groundPrimitives.add(primitive)

  const start = performance.now()
  viewer.scene.preRender.addEventListener(() => {
    const t = (performance.now() - start) / 1000
    material.uniforms.clock = t
    material.uniforms.time = (t / 20) % 1
  })
}

void boot()
