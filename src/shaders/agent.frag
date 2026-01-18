#version 300 es
precision highp float;

in float v_type;

out vec4 outColor;

void main() {
  vec3 color = vec3(0.8, 0.8, 0.8);
  if (v_type < 0.5) {
    color = vec3(0.9, 0.9, 0.95);
  } else if (v_type < 1.5) {
    color = vec3(0.3, 0.6, 0.9);
  } else if (v_type < 2.5) {
    color = vec3(0.9, 0.4, 0.3);
  } else {
    color = vec3(0.9, 0.8, 0.3);
  }
  outColor = vec4(color, 1.0);
}
