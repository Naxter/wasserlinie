// One river, drawn from its own level field.
//
// `field` is a small texture built by the Python pipeline: x runs along the
// river from source to mouth, y runs through time, six hours per row. The app
// sets `time` to where the slider sits, so sampling the texture is the whole
// of the "look up what the water was doing here, then" step.
//
//   R  state, packed: state = R * stateScale + stateOffset
//      -1 = this gauge's record low, 0 = mean water, +1 = its record high
//   G  1 where the value is measured, 0 where it is forecast
//   B  width of the forecast band, on the same state scale
//
// Three channels are kept strictly apart, because mixing them is what makes
// this kind of map unreadable:
//
//   state      -> colour, brightness and flow speed, all via the ramp texture
//   data kind  -> edge sharpness. Soft always means computed, never low.
//   river size -> line width, which stays absolute. The Rhine has to look like
//                 the Rhine at low water, or the network loses its hierarchy.
//
// `ramp` is 256x2: the top row is the colour for a state, the bottom row
// carries glow in red and speed in green. Both come from tokens.ts, so nothing
// about the palette is decided in here.

czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material m = czm_getDefaultMaterial(materialInput);
  vec2 st = materialInput.st;
  vec4 f = texture(field, vec2(st.s, time));

  float state = f.r * stateScale + stateOffset;
  float measured = f.g;
  float spread = f.b * stateScale;

  // Where this state sits on the ramp, 0..1.
  float u = clamp((state - rampMin) / (rampMax - rampMin), 0.0, 1.0);
  vec3 rampColor = texture(ramp, vec2(u, 0.25)).rgb;
  vec4 dynamics = texture(ramp, vec2(u, 0.75));
  float glow = dynamics.r;
  float speed = dynamics.g * 2.5;

  // Rivers with no reference levels say so by staying grey and still.
  vec3 tint = mix(unknownColor.rgb, rampColor, known);
  glow = mix(0.5, glow, known);
  speed = mix(0.6, speed, known);

  // Width follows the river, not the water: only a gentle swell so a flood
  // reads as fuller without the network changing shape.
  float halfWidth = baseWidth * (1.0 + 0.25 * clamp(state, -0.6, 1.0));
  float d = abs(st.t - 0.5) * 2.0;
  // Forecast edges blur, and blur further as the uncertainty band widens.
  float soft = mix(0.25, 0.9, (1.0 - measured) * clamp(0.35 + spread * 0.5, 0.0, 1.0));
  float core = 1.0 - smoothstep(halfWidth * (1.0 - soft), halfWidth, d);
  float halo = 1.0 - smoothstep(halfWidth * 0.5, halfWidth * (1.7 + spread * 1.2), d);

  // Pulses travelling downstream. `clock` is wall-clock seconds, not a frame
  // counter, so the flow runs at the same speed on any machine. `repeats` is
  // set from the river's length so the pattern keeps a constant size on the
  // ground whether the river is 40 km or 700 km long.
  float phase = st.s * repeats - clock * speed;
  float pulse = 0.5 + 0.5 * sin(6.2831853 * phase);
  float flow = mix(0.5, 1.0, pulse * pulse);

  // Emission only: rivers are lights on the terrain, not lit surfaces, so they
  // stay readable on the night side of the terminator.
  float strength = glow * intensity;
  m.diffuse = vec3(0.0);
  m.emission = tint * (core * flow * strength * 1.6 + halo * 0.3 * strength);
  m.alpha = clamp(core * 0.95 + halo * 0.35, 0.0, 1.0);
  return m;
}
