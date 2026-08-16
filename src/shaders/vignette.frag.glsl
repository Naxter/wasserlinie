uniform sampler2D colorTexture;
uniform float strength;

in vec2 v_textureCoordinates;

void main() {
  vec4 c = texture(colorTexture, v_textureCoordinates);
  vec2 d = (v_textureCoordinates - 0.5) * vec2(1.15, 1.0);
  float edge = smoothstep(0.18, 0.72, dot(d, d) * 2.0);
  out_FragColor = vec4(c.rgb * (1.0 - strength * edge), c.a);
}
