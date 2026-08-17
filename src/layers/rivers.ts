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
import type { TimeSource } from '../data/timeline'
import type { Field, River } from '../data/types'
import { store } from '../store'
import { createRiverMaterial, riverUniforms, stillField, type FieldEncoding } from './riverMaterial'
import type { FrameInfo, LayerContext, VisualLayer } from './plugin'
import { reducedMotion } from '../scene/motion'

// The signature layer. Rivers with gauges each get their own primitive and a
// texture holding their level field over time; the rest of the network is
// batched by width class and drawn quiet.

const WIDTH_PX: Record<number, number> = { 200: 12, 125: 9, 42: 6.5, 12: 5 }
const BASE_WIDTH = 0.5
const BACKGROUND_INTENSITY = 0.38
const HOUR = 3_600_000
const DAY_MS = 86_400_000

function row(samples: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = samples
  canvas.height = 1
  return canvas
}

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

/** Linear interpolation along the river; beyond the outermost gauges the value is held. */
export function sampleRiver(pos: number[], values: number[], samples: number): Float64Array {
  const out = new Float64Array(samples)
  for (let i = 0; i < samples; i++) {
    const x = (i + 0.5) / samples
    let k = 0
    while (k < pos.length - 1 && pos[k + 1]! < x) k++
    const a = pos[k]!
    const b = pos[Math.min(k + 1, pos.length - 1)]!
    if (x <= a || b === a) out[i] = values[k]!
    else if (x >= b) out[i] = values[Math.min(k + 1, values.length - 1)]!
    else out[i] = values[k]! + (values[k + 1]! - values[k]!) * ((x - a) / (b - a))
  }
  return out
}

/**
 * One row of field for the day on screen.
 *
 * The baked `field.bin` cannot cover the long view — 48 rivers over 9,726 days
 * would be 67 MB — so in that mode the row is interpolated here instead, from
 * the gauge states the daily grid already holds. Two canvases per river,
 * alternated: Cesium only re-uploads a texture when the uniform is a different
 * object, and this way at most two ever exist.
 */
function writeRow(canvas: HTMLCanvasElement, states: Float64Array, encoding: FieldEncoding): void {
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(states.length, 1)
  for (let i = 0; i < states.length; i++) {
    const state = states[i]!
    const known = Number.isFinite(state)
    const unit = known ? (state - encoding.stateOffset) / encoding.stateScale : 0
    img.data[i * 4] = Math.max(0, Math.min(255, Math.round(unit * 255)))
    img.data[i * 4 + 1] = 255 // measured, never forecast
    img.data[i * 4 + 2] = 0 // no spread
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
}

function geometryFor(river: River): GroundPolylineGeometry {
  return new GroundPolylineGeometry({
    positions: Cartesian3.fromDegreesArray(river.coords.flat()),
    width: widthFor(river.cls),
  })
}

/** A gauged river, kept so its field row can be rebuilt for any day. */
interface LiveRiver {
  material: Material
  /** gauge slots in the time source, ordered along the river */
  slots: number[]
  /** where each of those gauges sits, 0 at the head */
  pos: number[]
  baked: HTMLCanvasElement
  swap: [HTMLCanvasElement, HTMLCanvasElement]
  next: number
}

export class RiverLayer implements VisualLayer {
  readonly id = 'rivers' as const
  private scene: Scene | null = null
  private ctx: LayerContext | null = null
  private primitives: GroundPolylinePrimitive[] = []
  private live: LiveRiver[] = []
  private still: Material[] = []
  private readonly background = new Map<number, GeometryInstance[]>()
  private encoding: FieldEncoding | null = null
  private samples = 1
  private t0 = 0
  private stepMs = 1
  private steps = 1
  private visible = true
  private day = Number.NaN

  async load(ctx: LayerContext, signal: AbortSignal): Promise<void> {
    const [rivers, field] = await Promise.all([loadRivers(signal), loadField(signal)])
    signal.throwIfAborted()
    this.scene = ctx.viewer.scene
    this.ctx = ctx
    this.t0 = Date.parse(field.meta.t0)
    this.stepMs = field.meta.stepHours * HOUR
    this.steps = field.meta.steps
    this.samples = field.meta.samples
    this.encoding = field.meta

    for (const river of rivers.rivers) {
      const slot = field.slot.get(river.id)
      if (slot === undefined) {
        this.collectBackground(river)
        continue
      }
      const baked = fieldTexture(field, slot)
      const material = createRiverMaterial({
        field: baked,
        encoding: field.meta,
        lengthKm: river.km,
        baseWidth: BASE_WIDTH,
      })
      const gauges = river.gauges
        .map((g) => ({ s: g.s, slot: ctx.timeline.slotOf(g.uuid) }))
        .filter((g): g is { s: number; slot: number } => g.slot !== undefined)
        .sort((a, b) => a.s - b.s)
      this.live.push({
        material,
        slots: gauges.map((g) => g.slot),
        pos: gauges.map((g) => g.s),
        baked,
        swap: [row(this.samples), row(this.samples)],
        next: 0,
      })
      this.addPrimitive([new GeometryInstance({ geometry: geometryFor(river), id: `river-${river.id}` })], material)
    }
    this.flushBackground()

    // Every part is clickable, so the panel needs to find them by the id the
    // geometry carries.
    const index = new Map(rivers.rivers.map((r) => [r.id, r]))
    store.getState().setRivers(index)

    // The fine network is three times the size of the gauged rivers and adds
    // nothing to the first impression, so it arrives on its own.
    const detail = await loadRiverDetail(signal)
    signal.throwIfAborted()
    for (const river of detail.rivers) {
      this.collectBackground(river)
      index.set(river.id, river)
    }
    this.flushBackground()
    store.getState().setRivers(new Map(index))
  }

  private collectBackground(river: River): void {
    const list = this.background.get(river.cls) ?? []
    list.push(new GeometryInstance({ geometry: geometryFor(river), id: `river-${river.id}` }))
    this.background.set(river.cls, list)
  }

  private flushBackground(): void {
    for (const [cls, instances] of this.background) {
      const material = createRiverMaterial({
        field: stillField(0, this.encoding!),
        encoding: this.encoding!,
        lengthKm: 60,
        baseWidth: BASE_WIDTH * (cls >= 125 ? 0.9 : 0.75),
        intensity: BACKGROUND_INTENSITY,
        known: false,
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
    if (!this.visible || !this.ctx) return
    // Holding the clock still freezes the pulse travelling down every
    // river; the colours stay exactly as they are.
    if (reducedMotion()) clock = 0
    const source = this.ctx.timeline
    // The baked field only covers the live window. Anywhere outside it the row
    // is built for the day on screen instead.
    const baked = simTime >= this.t0 && simTime <= this.t0 + this.steps * this.stepMs
    if (baked) {
      const step = (simTime - this.t0) / this.stepMs
      const time = Math.min(1 - 0.5 / this.steps, Math.max(0.5 / this.steps, (step + 0.5) / this.steps))
      for (const r of this.live) {
        if (riverUniforms(r.material).field !== r.baked) riverUniforms(r.material).field = r.baked
        riverUniforms(r.material).time = time
        riverUniforms(r.material).clock = clock
      }
      this.day = Number.NaN
    } else {
      const day = Math.floor(simTime / DAY_MS)
      if (day !== this.day) {
        this.day = day
        for (const r of this.live) this.rebuild(r, source, simTime)
      }
      for (const r of this.live) {
        riverUniforms(r.material).time = 0.5
        riverUniforms(r.material).clock = clock
      }
    }
    for (const m of this.still) riverUniforms(m).clock = clock
  }

  private rebuild(r: LiveRiver, source: TimeSource, simTime: number): void {
    if (!this.encoding || r.slots.length === 0) return
    const pos: number[] = []
    const values: number[] = []
    for (let i = 0; i < r.slots.length; i++) {
      const sample = source.sample(r.slots[i]!, simTime)
      if (!sample || Number.isNaN(sample.state)) continue
      pos.push(r.pos[i]!)
      values.push(sample.state)
    }
    const canvas = r.swap[r.next]!
    r.next = 1 - r.next
    // No gauge on this river has a reading for the day: draw it flat rather
    // than leaving yesterday's colours on it.
    writeRow(canvas, values.length ? sampleRiver(pos, values, this.samples) : new Float64Array(this.samples).fill(NaN), this.encoding)
    riverUniforms(r.material).field = canvas
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
