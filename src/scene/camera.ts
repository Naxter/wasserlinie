import {
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  HeadingPitchRange,
  Math as CesiumMath,
  Matrix4,
  type Scene,
  type Viewer,
} from 'cesium'
import { camera as tokens, terrain } from '../tokens'

export interface View {
  lon: number
  lat: number
  height: number
  heading: number
  pitch: number
}

// Slow start, slow stop. Nothing about the camera should ever feel abrupt.
export function cinematicEase(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

export function exaggerationFor(height: number): number {
  const t = CesiumMath.clamp(
    (height - terrain.exaggerationNearHeight) / (terrain.exaggerationFarHeight - terrain.exaggerationNearHeight),
    0,
    1,
  )
  const s = t * t * (3 - 2 * t)
  return terrain.exaggerationNear + (terrain.exaggerationFar - terrain.exaggerationNear) * s
}

interface Orbit {
  focus: Cartesian3
  heading: number
  pitch: number
  range: number
}

export class CameraDirector {
  private readonly scene: Scene
  private lastInput = performance.now()
  private lastFrame = performance.now()
  private flying = false
  private orbit: Orbit | null = null
  private exaggeration = terrain.exaggerationFar

  constructor(private readonly viewer: Viewer) {
    this.scene = viewer.scene
    const canvas = viewer.canvas
    const touch = () => this.noteInput()
    for (const type of ['pointerdown', 'wheel', 'keydown', 'touchstart']) {
      canvas.addEventListener(type, touch, { passive: true })
    }
    canvas.tabIndex = 0
    this.scene.preRender.addEventListener(this.tick)
  }

  noteInput(): void {
    this.lastInput = performance.now()
    this.orbit = null
  }

  jumpTo(view: View): void {
    this.viewer.camera.setView({
      destination: Cartesian3.fromDegrees(view.lon, view.lat, view.height),
      orientation: {
        heading: CesiumMath.toRadians(view.heading),
        pitch: CesiumMath.toRadians(view.pitch),
        roll: 0,
      },
    })
  }

  flyTo(view: View, seconds: number = tokens.flightSeconds): Promise<void> {
    return this.fly((done) =>
      this.viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(view.lon, view.lat, view.height),
        orientation: {
          heading: CesiumMath.toRadians(view.heading),
          pitch: CesiumMath.toRadians(view.pitch),
          roll: 0,
        },
        duration: seconds,
        easingFunction: cinematicEase,
        complete: done,
        cancel: done,
      }),
    )
  }

  // Regional flight: frame a point from the current heading, tilted, at a range.
  flyToPoint(lon: number, lat: number, range: number, seconds: number = tokens.flightSeconds): Promise<void> {
    const camera = this.viewer.camera
    const pitch = CesiumMath.toRadians(-38)
    return this.fly((done) =>
      camera.flyToBoundingSphere(new BoundingSphere(Cartesian3.fromDegrees(lon, lat, 0), 1), {
        offset: new HeadingPitchRange(camera.heading, pitch, range),
        duration: seconds,
        easingFunction: cinematicEase,
        complete: done,
        cancel: done,
      }),
    )
  }

  private fly(start: (done: () => void) => void): Promise<void> {
    this.flying = true
    this.orbit = null
    this.lastInput = performance.now()
    return new Promise((resolve) => {
      start(() => {
        this.flying = false
        this.lastInput = performance.now()
        resolve()
      })
    })
  }

  private readonly tick = (): void => {
    const now = performance.now()
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000)
    this.lastFrame = now
    this.updateExaggeration(dt)
    if (!this.flying && now - this.lastInput > tokens.idleAfterSeconds * 1000) this.drift(dt)
  }

  private updateExaggeration(dt: number): void {
    const target = exaggerationFor(this.viewer.camera.positionCartographic.height)
    this.exaggeration += (target - this.exaggeration) * Math.min(1, dt * 2.5)
    this.scene.verticalExaggeration = this.exaggeration
  }

  private drift(dt: number): void {
    const camera = this.viewer.camera
    if (!this.orbit) {
      const canvas = this.scene.canvas
      const ray = camera.getPickRay(new Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2))
      const focus = ray ? this.scene.globe.pick(ray, this.scene) : undefined
      if (!focus) return
      this.orbit = {
        focus,
        heading: camera.heading,
        pitch: camera.pitch,
        range: Cartesian3.distance(camera.positionWC, focus),
      }
    }
    this.orbit.heading += tokens.driftRadiansPerSecond * dt
    camera.lookAt(this.orbit.focus, new HeadingPitchRange(this.orbit.heading, this.orbit.pitch, this.orbit.range))
    camera.lookAtTransform(Matrix4.IDENTITY)
  }
}
