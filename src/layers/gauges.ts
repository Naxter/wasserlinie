import {
  Billboard,
  BillboardCollection,
  Cartesian2,
  Cartesian3,
  Color,
  HeightReference,
  NearFarScalar,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  type Scene,
} from 'cesium'
import type { Timeline } from '../data/timeline'
import type { Station } from '../data/types'
import { store, type Filter } from '../store'
import { color, gauge, unknownColor, unusual } from '../tokens'
import type { FrameInfo, LayerContext, VisualLayer } from './plugin'
import { sampleRamp } from './ramp'

// Gauges carry the same colour scale as the rivers, so a mark and the water it
// sits in always agree. From the overview only the gauges worth pointing at are
// drawn; the rest fade in on the way down. That keeps the country calm on an
// ordinary day and makes a dry summer visible at a glance.

const SPRITE = 40

function sprite(soft: boolean): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SPRITE
  const ctx = canvas.getContext('2d')!
  const c = SPRITE / 2
  const g = ctx.createRadialGradient(c, c, 0, c, c, c)
  if (soft) {
    g.addColorStop(0, 'rgba(255,255,255,0.9)')
    g.addColorStop(0.45, 'rgba(255,255,255,0.35)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
  } else {
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.5, 'rgba(255,255,255,1)')
    g.addColorStop(0.62, 'rgba(255,255,255,0.55)')
    g.addColorStop(0.72, 'rgba(255,255,255,0)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
  }
  ctx.fillStyle = g
  ctx.fillRect(0, 0, SPRITE, SPRITE)
  return canvas
}

const UNKNOWN = Color.fromCssColorString(unknownColor)
const HOVER = Color.fromCssColorString(color.paper)
const scratch = new Color()

/** Below this height every gauge is shown, not just the notable ones. */
const ALL_VISIBLE_HEIGHT = 260_000

export function isUnusual(state: number): boolean {
  return state <= unusual.low || state >= unusual.high
}

function passesFilter(state: number, filter: Filter): boolean {
  if (filter === 'all') return true
  if (Number.isNaN(state)) return false
  return filter === 'low' ? state <= unusual.low : state >= unusual.high
}

export class GaugeLayer implements VisualLayer {
  readonly id = 'gauges' as const
  private scene: Scene | null = null
  private timeline: Timeline | null = null
  private collection: BillboardCollection | null = null
  private billboards: Billboard[] = []
  private stations: Station[] = []
  private handler: ScreenSpaceEventHandler | null = null
  private readonly crisp = sprite(false)
  private readonly soft = sprite(true)

  constructor(private readonly onSelect: (uuid: string) => void) {}

  load(ctx: LayerContext): Promise<void> {
    this.scene = ctx.viewer.scene
    this.timeline = ctx.timeline
    this.stations = ctx.timeline.stations
    const collection = new BillboardCollection({ scene: this.scene })
    const scaleByDistance = new NearFarScalar(gauge.nearDistance, 1.0, gauge.farDistance, 0.34)
    this.billboards = this.stations.map((s) =>
      collection.add({
        id: s.uuid,
        position: Cartesian3.fromDegrees(s.lon, s.lat),
        image: this.crisp,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance,
        width: gauge.pixelSize * 2,
        height: gauge.pixelSize * 2,
        color: UNKNOWN,
      }),
    )
    this.collection = this.scene.primitives.add(collection) as BillboardCollection
    this.bindPointer(ctx)
    return Promise.resolve()
  }

  private bindPointer(ctx: LayerContext): void {
    const scene = ctx.viewer.scene
    const handler = new ScreenSpaceEventHandler(scene.canvas)
    const pickStation = (position: Cartesian2): string | null => {
      const picked = scene.pick(position) as { id?: unknown; primitive?: unknown } | undefined
      if (!picked || picked.primitive !== this.collection) return null
      return typeof picked.id === 'string' ? picked.id : null
    }
    handler.setInputAction((e: ScreenSpaceEventHandler.PositionedEvent) => {
      const uuid = pickStation(e.position)
      if (uuid) this.onSelect(uuid)
    }, ScreenSpaceEventType.LEFT_CLICK)
    let last = 0
    handler.setInputAction((e: ScreenSpaceEventHandler.MotionEvent) => {
      const now = performance.now()
      if (now - last < 60) return
      last = now
      const uuid = pickStation(e.endPosition)
      store.getState().hover(uuid)
      scene.canvas.style.cursor = uuid ? 'pointer' : ''
    }, ScreenSpaceEventType.MOUSE_MOVE)
    this.handler = handler
  }

  frame({ simTime, clock }: FrameInfo): void {
    if (!this.timeline || !this.collection?.show || !this.scene) return
    const { hovered, selected, filter } = store.getState()
    const onlyNotable = this.scene.camera.positionCartographic.height > ALL_VISIBLE_HEIGHT
    for (let i = 0; i < this.billboards.length; i++) {
      const b = this.billboards[i]!
      const st = this.stations[i]!
      const picked = st.uuid === selected || st.uuid === hovered
      const sample = this.timeline.sample(i, simTime)
      if (!sample) {
        b.show = false
        continue
      }
      const state = sample.state
      const known = !Number.isNaN(state)
      const notable = known && isUnusual(state)
      b.show = passesFilter(state, filter) && (picked || notable || !onlyNotable)
      if (!b.show) continue

      const emphasis = st.uuid === selected ? 1.5 : st.uuid === hovered ? 1.3 : 1
      if (!known) {
        b.setImage('crisp', this.crisp)
        b.color = st.uuid === hovered ? HOVER : UNKNOWN
        b.scale = 0.45 * emphasis
        continue
      }
      const { rgb, glow, speed } = sampleRamp(state)
      const pulse = 1 + 0.07 * Math.sin(clock * 6.283 * (0.15 + speed * 0.25) + i)
      Color.fromBytes(rgb[0], rgb[1], rgb[2], 255, scratch)
      b.color = st.uuid === hovered ? HOVER : scratch
      if (sample.forecast) {
        b.setImage('soft', this.soft)
        b.scale = (0.6 + 0.7 * glow) * (1 + Math.min(1, sample.spread) * 0.8) * emphasis
      } else {
        b.setImage('crisp', this.crisp)
        // Notable gauges sit larger so they read before the quiet ones.
        b.scale = (0.5 + 0.6 * glow) * (notable ? 1.4 : 1) * pulse * emphasis
      }
    }
  }

  setVisible(visible: boolean): void {
    if (this.collection) this.collection.show = visible
  }

  dispose(): void {
    this.handler?.destroy()
    if (this.scene && this.collection) this.scene.primitives.remove(this.collection)
    this.collection = null
    this.billboards = []
  }
}
