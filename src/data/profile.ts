/**
 * The state running down a river, interpolated between its gauges.
 *
 * This is the one piece of the old field pipeline the 2D map still needs. It
 * used to be baked into a texture by Python because a shader could only look
 * things up; a line gradient is rebuilt from the gauges directly, so the
 * interpolation happens here and `field.bin` is no longer fetched.
 *
 * Beyond the outermost gauges the value is held rather than extrapolated: a
 * river does not stop being a river above its first gauge, but nothing is
 * known about it there either.
 */
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
