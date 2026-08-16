// One river, drawn from its own level field.
//
// `field` is a small texture built by the Python pipeline: x runs along the
// river from source to mouth, y runs through time, six hours per row. The app
// sets `time` to where the slider sits, so sampling the texture is the whole
// of the "look up what the water was doing here, then" step.
//
//   R  level index, packed: index = R * indexScale + indexOffset
//      0 = the gauge's low-water mark, 1 = its high-water mark
//   G  1 where the value is measured, 0 where it is forecast
//   B  width of the forecast band (p90 - p10) in the same index units
//
// Two things are kept apart on purpose: the level drives colour, brightness
// and speed; the data kind drives edge sharpness. A soft edge always means
// "computed", never "low".
//
// st.s is the distance along the polyline (0..1), st.t is across it, so
// st.t == 0.5 is the centre line. The geometry is a wide, mostly transparent
// ribbon and the visible width is carved out of it here — that way the width
// can follow the data without rebuilding geometry.

czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material m = czm_getDefaultMaterial(materialInput);
  vec2 st = materialInput.st;
  vec4 f = texture(field, vec2(st.s, time));

  float index = f.r * indexScale + indexOffset;
  float measured = f.g;
  float spread = f.b;
  // Slightly below the low-water mark still reads as "some water", so the
  // usable range starts a little under 0 and saturates before the high mark.
  float level = clamp((index + 0.25) / 1.5, 0.0, 1.0);

  // Visual width comes from the data; the ribbon itself never changes size.
  float halfWidth = baseWidth * mix(0.35, 1.0, level);
  float d = abs(st.t - 0.5) * 2.0;
  // Forecast edges blur, and blur further as the uncertainty band widens.
  float soft = mix(0.3, 0.9, (1.0 - measured) * (0.4 + 0.6 * spread));
  float core = 1.0 - smoothstep(halfWidth * (1.0 - soft), halfWidth, d);
  float halo = 1.0 - smoothstep(halfWidth * 0.5, halfWidth * (1.7 + spread * 1.5), d);

  // Pulses travelling downstream. `clock` is wall-clock seconds, not a frame
  // counter, so the flow runs at the same speed on any machine. `repeats` is
  // set from the river's length so the pattern keeps a constant size on the
  // ground whether the river is 40 km or 700 km long.
  float speed = mix(0.35, 1.7, level);
  float phase = st.s * repeats - clock * speed;
  float pulse = 0.5 + 0.5 * sin(6.2831853 * phase);
  float flow = mix(0.5, 1.0, pulse * pulse);

  // Colours arrive as uniforms from tokens.ts; nothing is hard-coded here.
  vec3 hue = mix(hazeColor.rgb, tideColor.rgb, measured);
  float glow = mix(0.75, 1.6, level) * intensity;

  // Emission only: rivers are lights on the terrain, not lit surfaces, so they
  // stay readable on the night side of the terminator.
  m.diffuse = vec3(0.0);
  m.emission = hue * (core * flow * glow + halo * 0.3 * glow);
  m.alpha = clamp(core * 0.95 + halo * 0.35, 0.0, 1.0);
  return m;
}
