import { PostProcessStage, type Scene } from 'cesium'
import vignetteSource from '../shaders/vignette.frag.glsl?raw'
import { post } from '../tokens'

// Bloom only strong enough for rivers and gauges to glow, a vignette to pull
// the eye inwards, FXAA on top. Nothing else.
export function setupPostProcessing(scene: Scene): void {
  const stages = scene.postProcessStages

  const bloom = stages.bloom
  bloom.enabled = true
  bloom.uniforms.glowOnly = false
  bloom.uniforms.contrast = post.bloomContrast
  bloom.uniforms.brightness = post.bloomBrightness
  bloom.uniforms.delta = 1.0
  bloom.uniforms.sigma = post.bloomSigma
  bloom.uniforms.stepSize = post.bloomStepSize

  stages.add(
    new PostProcessStage({
      name: 'wasserlinie_vignette',
      fragmentShader: vignetteSource,
      uniforms: { strength: post.vignette },
    }),
  )

  stages.fxaa.enabled = true
}
