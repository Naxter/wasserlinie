import {
  Cartesian3,
  GeometryInstance,
  GroundPolylineGeometry,
  GroundPolylinePrimitive,
  Material,
  PolylineMaterialAppearance,
  type Scene,
} from 'cesium'
import { loadField, loadRiverDetail, loadRivers } from '../data/assets'
import type { Field, River } from '../data/types'
import { createRiverMaterial, riverUniforms, stillField, type FieldEncoding } from './riverMaterial'
import type { FrameInfo, LayerContext, VisualLayer } from './plugin'

// The signature layer. Rivers with gauges each get their own primitive and a
// texture holding their level field over time; the rest of the network is
// batched by width class and drawn quiet.

const WIDTH_PX: Record<number, number> = { 200: 12, 125: 9, 42: 6.5, 12: 5 }
const BASE_WIDTH = 0.5
const BACKGROUND_INDEX = 0.2
const BACKGROUND_INTENSITY = 0.5
const HOUR = 3_600_000

function widthFor(cls: number): number {
  return WIDTH_PX[cls] ?? WIDTH_PX[42]!
}

function fieldTexture(field: Field, slot: number): HTMLCanvasElement {
  const { steps, samples, channels } = field.meta
  const canvas = document.createElement('canvas')
  canvas.width = samples
  canvas.height = steps
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(samples, steps)
  const base = slot * steps * samples * channels
  // Textures are uploaded bottom-up, so time step 0 goes on the last canvas row.
  for (let step = 0; step < steps; step++) {
    const row = steps - 1 - step
    for (let x = 0; x < samples; x++) {
      const src = base + (step * samples + x) * channels
      const dst = (row * samples + x) * 4
      img.data[dst] = field.data[src]!
      img.data[dst + 1] = field.data[src + 1]!
      img.data[dst + 2] = field.data[src + 2]!
      img.data[dst + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

function geometryFor(river: River): GroundPolylineGeometry {
  return new GroundPolylineGeometry({
    positions: Cartesian3.fromDegreesArray(river.coords.flat()),
    width: widthFor(river.cls),
  })
}

export class RiverLayer implements VisualLayer {
  readonly id = 'rivers' as const
  private scene: Scene | null = null
  private primitives: GroundPolylinePrimitive[] = []
  private live: Material[] = []
  private still: Material[] = []
  private readonly background = new Map<number, GeometryInstance[]>()
  private encoding: FieldEncoding | null = null
  private t0 = 0
  private stepMs = 1
  private steps = 1
  private visible = true

  async load(ctx: LayerContext, signal: AbortSignal): Promise<void> {
    const [rivers, field] = await Promise.all([loadRivers(signal), loadField(signal)])
    signal.throwIfAborted()
    this.scene = ctx.viewer.scene
    this.t0 = Date.parse(field.meta.t0)
    this.stepMs = field.meta.stepHours * HOUR
    this.steps = field.meta.steps
    this.encoding = field.meta

    for (const river of rivers.rivers) {
      const slot = field.slot.get(river.id)
      if (slot === undefined) {
        this.collectBackground(river)
        continue
      }
      const material = createRiverMaterial({
        field: fieldTexture(field, slot),
        encoding: field.meta,
        lengthKm: river.km,
        baseWidth: BASE_WIDTH,
      })
      this.live.push(material)
      this.addPrimitive([new GeometryInstance({ geometry: geometryFor(river), id: `river-${river.id}` })], material)
    }
    this.flushBackground()

    // The fine network is three times the size of the gauged rivers and adds
    // nothing to the first impression, so it arrives on its own.
    const detail = await loadRiverDetail(signal)
    signal.throwIfAborted()
    for (const river of detail.rivers) this.collectBackground(river)
    this.flushBackground()
  }

  private collectBackground(river: River): void {
    const list = this.background.get(river.cls) ?? []
    list.push(new GeometryInstance({ geometry: geometryFor(river), id: `river-${river.id}` }))
    this.background.set(river.cls, list)
  }

  private flushBackground(): void {
    for (const [cls, instances] of this.background) {
      const material = createRiverMaterial({
        field: stillField(BACKGROUND_INDEX, this.encoding!),
        encoding: this.encoding!,
        lengthKm: 60,
        baseWidth: BASE_WIDTH * (cls >= 125 ? 0.9 : 0.75),
        intensity: BACKGROUND_INTENSITY,
      })
      this.still.push(material)
      this.addPrimitive(instances, material)
    }
    this.background.clear()
  }

  private addPrimitive(instances: GeometryInstance[], material: Material): void {
    const primitive = new GroundPolylinePrimitive({
      geometryInstances: instances,
      appearance: new PolylineMaterialAppearance({ material }),
      show: this.visible,
    })
    this.primitives.push(this.scene!.groundPrimitives.add(primitive) as GroundPolylinePrimitive)
  }

  frame({ simTime, clock }: FrameInfo): void {
    if (!this.visible) return
    const row = (simTime - this.t0) / this.stepMs
    const time = Math.min(1 - 0.5 / this.steps, Math.max(0.5 / this.steps, (row + 0.5) / this.steps))
    for (const m of this.live) {
      const u = riverUniforms(m)
      u.time = time
      u.clock = clock
    }
    for (const m of this.still) riverUniforms(m).clock = clock
  }

  setVisible(visible: boolean): void {
    this.visible = visible
    for (const p of this.primitives) p.show = visible
  }

  dispose(): void {
    if (this.scene) for (const p of this.primitives) this.scene.groundPrimitives.remove(p)
    this.primitives = []
    this.live = []
    this.still = []
    this.background.clear()
  }
}
