import {
  Billboard,
  BillboardCollection,
  Cartesian2,
  Cartesian3,
  Color,
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

/** The quiet gauges fade out between these camera heights instead of popping. */
const QUIET_NEAR = 220_000
const QUIET_FAR = 300_000

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/**
 * Where to hang the billboard.
 *
 * Not `CLAMP_TO_GROUND`: that re-clamps every time a terrain tile refines, so
 * all 691 dots crawl across the map while the camera moves. The gauge datum is
 * a real height above sea level and never changes. The 86 gauges that publish
 * none borrow the nearest one that does — they sit on the same rivers, and the
 * depth test is off anyway, so a few metres out is invisible.
 */
function heights(stations: Station[]): number[] {
  const known = stations.filter((s) => s.zero !== null)
  return stations.map((s) => {
    if (s.zero !== null) return s.zero
    let best = 0
    let bestGap = Infinity
    for (const k of known) {
      const gap = (k.lon - s.lon) ** 2 + (k.lat - s.lat) ** 2
      if (gap < bestGap) {
        bestGap = gap
        best = k.zero!
      }
    }
    return best
  })
}

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
  private sprites: ('crisp' | 'soft')[] = []
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
    const altitude = heights(this.stations)
    this.sprites = this.stations.map(() => 'crisp')
    this.billboards = this.stations.map((s, i) =>
      collection.add({
        id: s.uuid,
        position: Cartesian3.fromDegrees(s.lon, s.lat, altitude[i]),
        image: this.crisp,
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

  /** `setImage` every frame re-does an atlas lookup per gauge; only switch on change. */
  private useSprite(i: number, want: 'crisp' | 'soft'): void {
    if (this.sprites[i] === want) return
    this.sprites[i] = want
    this.billboards[i]!.setImage(want, want === 'crisp' ? this.crisp : this.soft)
  }

  frame({ simTime }: FrameInfo): void {
    if (!this.timeline || !this.collection?.show || !this.scene) return
    const { hovered, selected, filter } = store.getState()
    const height = this.scene.camera.positionCartographic.height
    const quiet = 1 - clamp01((height - QUIET_NEAR) / (QUIET_FAR - QUIET_NEAR))
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
      // From far out only the notable gauges carry the picture; the rest fade
      // away over a band of altitude rather than blinking out at one height.
      const alpha = picked || notable ? 1 : quiet
      b.show = passesFilter(state, filter) && alpha > 0.02
      if (!b.show) continue

      const emphasis = st.uuid === selected ? 1.5 : st.uuid === hovered ? 1.3 : 1
      if (!known) {
        this.useSprite(i, 'crisp')
        b.color = Color.clone(st.uuid === hovered ? HOVER : UNKNOWN, scratch)
        b.color.alpha = alpha
        b.scale = 0.45 * emphasis
        continue
      }
      const { rgb, glow } = sampleRamp(state)
      Color.fromBytes(rgb[0], rgb[1], rgb[2], 255, scratch)
      b.color = st.uuid === hovered ? Color.clone(HOVER, scratch) : scratch
      b.color.alpha = alpha
      if (sample.forecast) {
        this.useSprite(i, 'soft')
        b.scale = (0.6 + 0.7 * glow) * (1 + Math.min(1, sample.spread) * 0.8) * emphasis
      } else {
        this.useSprite(i, 'crisp')
        // Notable gauges sit larger so they read before the quiet ones.
        b.scale = (0.5 + 0.6 * glow) * (notable ? 1.4 : 1) * emphasis
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
    this.sprites = []
  }
}
