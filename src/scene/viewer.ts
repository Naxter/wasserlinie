import { Color, ImageryLayer, Viewer, type ImageryProvider } from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { atmosphere, camera as cameraTokens, color, render } from '../tokens'
import { setupPostProcessing } from './postprocess'
import { ReliefImageryProvider, type Ring } from './relief'
import { TerrariumTerrainProvider } from './terrain'

export interface SceneOptions {
  container: HTMLElement
  credits: HTMLElement
  outline: Ring[]
}

export function createViewer({ container, credits, outline }: SceneOptions): Viewer {
  const viewer = new Viewer(container, {
    animation: false,
    baseLayerPicker: false,
    fullscreenButton: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    sceneModePicker: false,
    selectionIndicator: false,
    timeline: false,
    navigationHelpButton: false,
    shouldAnimate: true,
    baseLayer: false,
    terrainProvider: new TerrariumTerrainProvider(),
    skyBox: false,
    creditContainer: credits,
    requestRenderMode: false,
    // Cesium defaults to the browser's "recommended" resolution, which on a
    // HiDPI screen means rendering at 1x and letting the compositor upscale —
    // the whole map comes out soft. Render at the real device resolution and
    // let MSAA do the edge work instead of a post-process blur.
    useBrowserRecommendedResolution: false,
    msaaSamples: render.msaaSamples,
    contextOptions: {
      webgl: { alpha: false, antialias: false, powerPreference: 'high-performance' },
    },
  })
  // Cesium renders at `devicePixelRatio * resolutionScale` whenever
  // useBrowserRecommendedResolution is false, so handing it the ratio a second
  // time squares it: 4x linear and 16x the pixels on a 2x screen, before MSAA.
  // Divide it back out so the cap is the cap.
  const dpr = window.devicePixelRatio || 1
  viewer.resolutionScale = Math.min(dpr, render.maxPixelRatio) / dpr

  const scene = viewer.scene
  const globe = scene.globe

  scene.backgroundColor = Color.fromCssColorString(color.abyss)
  scene.highDynamicRange = false

  globe.baseColor = Color.fromCssColorString(color.chart)
  globe.enableLighting = true
  globe.dynamicAtmosphereLighting = true
  globe.dynamicAtmosphereLightingFromSun = true
  globe.showGroundAtmosphere = true
  globe.depthTestAgainstTerrain = true
  globe.vertexShadowDarkness = 0.35
  globe.lambertDiffuseMultiplier = 1.4
  globe.atmosphereBrightnessShift = atmosphere.groundBrightnessShift
  globe.atmosphereSaturationShift = atmosphere.groundSaturationShift
  globe.maximumScreenSpaceError = 1.6

  const relief = new ReliefImageryProvider(outline) as unknown as ImageryProvider
  scene.imageryLayers.add(new ImageryLayer(relief))

  if (scene.skyAtmosphere) {
    scene.skyAtmosphere.brightnessShift = atmosphere.skyBrightnessShift
    scene.skyAtmosphere.saturationShift = atmosphere.skySaturationShift
  }

  scene.fog.enabled = true
  scene.fog.density = atmosphere.fogDensity
  scene.fog.minimumBrightness = atmosphere.fogMinimumBrightness
  scene.fog.maxHeight = 2_500_000

  const controller = scene.screenSpaceCameraController
  controller.minimumZoomDistance = cameraTokens.minZoom
  controller.maximumZoomDistance = cameraTokens.maxZoom
  controller.enableCollisionDetection = true

  setupPostProcessing(scene)
  return viewer
}
