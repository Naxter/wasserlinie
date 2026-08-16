// Fabric material for one river. `field` is a 2D texture: x runs along the
// river, y through time. R packs the level index (0 = low-water mark,
// 1 = high-water mark), G is 1 where measured and 0 where forecast,
// B is the width of the forecast band in index units.

czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material m = czm_getDefaultMaterial(materialInput);
  vec2 st = materialInput.st;
  vec4 f = texture(field, vec2(st.s, time));

  float index = f.r * indexScale + indexOffset;
  float measured = f.g;
  float spread = f.b;
  float level = clamp((index + 0.25) / 1.5, 0.0, 1.0);

  // Visual width comes from the data, the geometry stays wide and mostly transparent.
  float halfWidth = baseWidth * mix(0.35, 1.0, level);
  float d = abs(st.t - 0.5) * 2.0;
  float soft = mix(0.3, 0.9, (1.0 - measured) * (0.4 + 0.6 * spread));
  float core = 1.0 - smoothstep(halfWidth * (1.0 - soft), halfWidth, d);
  float halo = 1.0 - smoothstep(halfWidth * 0.5, halfWidth * (1.7 + spread * 1.5), d);

  // Pulses travelling downstream, quicker and brighter the higher the water.
  float speed = mix(0.35, 1.7, level);
  float phase = st.s * repeats - clock * speed;
  float pulse = 0.5 + 0.5 * sin(6.2831853 * phase);
  float flow = mix(0.5, 1.0, pulse * pulse);

  vec3 hue = mix(hazeColor.rgb, tideColor.rgb, measured);
  float glow = mix(0.75, 1.6, level) * intensity;

  m.diffuse = vec3(0.0);
  m.emission = hue * (core * flow * glow + halo * 0.3 * glow);
  m.alpha = clamp(core * 0.95 + halo * 0.35, 0.0, 1.0);
  return m;
}
