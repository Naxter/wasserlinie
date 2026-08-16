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
import { store } from '../store'
import { color, gauge } from '../tokens'
import type { FrameInfo, LayerContext, VisualLayer } from './plugin'

// Gauges are the only red thing on the map: red means someone actually
// measures here. When the slider crosses into the forecast the marks turn to
// haze and lose their edge, and grow with the spread of the forecast band.

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

const COLORS = {
  measured: Color.fromCssColorString(color.gauge),
  forecast: Color.fromCssColorString(color.haze),
  plain: Color.fromCssColorString(color.paper).withAlpha(0.5),
  silent: Color.fromCssColorString(color.paper).withAlpha(0.22),
  hover: Color.fromCssColorString(color.paper),
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
    const far = new NearFarScalar(gauge.nearDistance, 1.0, gauge.farDistance, 0.34)
    const fade = new NearFarScalar(gauge.nearDistance, 1.0, gauge.farDistance, 0.75)
    const fadeOut = new NearFarScalar(gauge.nearDistance, 1.0, gauge.farDistance * 0.35, 0.0)
    this.billboards = this.stations.map((s) =>
      collection.add({
        id: s.uuid,
        position: Cartesian3.fromDegrees(s.lon, s.lat),
        image: this.crisp,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: far,
        translucencyByDistance: s.low !== null ? fade : fadeOut,
        width: gauge.pixelSize * 2,
        height: gauge.pixelSize * 2,
        color: COLORS.silent,
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
    if (!this.timeline || !this.collection?.show) return
    const { hovered, selected } = store.getState()
    for (let i = 0; i < this.billboards.length; i++) {
      const b = this.billboards[i]!
      const st = this.stations[i]!
      const sample = this.timeline.sample(i, simTime)
      const emphasis = st.uuid === selected ? 1.45 : st.uuid === hovered ? 1.25 : 1
      if (!sample) {
        b.setImage('crisp', this.crisp)
        b.color = COLORS.silent
        b.scale = 0.4 * emphasis
        continue
      }
      if (Number.isNaN(sample.index)) {
        b.setImage('crisp', this.crisp)
        b.color = st.uuid === hovered ? COLORS.hover : COLORS.plain
        b.scale = 0.5 * emphasis
        continue
      }
      const level = Math.min(1.4, Math.max(0, sample.index + 0.2)) / 1.4
      const pulse = 1 + 0.06 * Math.sin(clock * 6.283 * (0.18 + level * 0.5) + i)
      if (sample.forecast) {
        b.setImage('soft', this.soft)
        b.color = st.uuid === hovered ? COLORS.hover : COLORS.forecast
        b.scale = (0.6 + 0.8 * level) * (1 + Math.min(1, sample.spread) * 0.9) * emphasis
      } else {
        b.setImage('crisp', this.crisp)
        b.color = st.uuid === hovered ? COLORS.hover : COLORS.measured
        b.scale = (0.5 + 0.75 * level) * pulse * emphasis
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
