#version 300 es
precision highp float;

in float v_type;

out vec4 outColor;

void main() {
  vec3 color = vec3(0.85, 0.85, 0.85);
  if (v_type < 0.5) {
    color = vec3(0.35, 0.75, 0.95);
  } else if (v_type < 1.5) {
    color = vec3(0.95, 0.45, 0.85);
  } else if (v_type < 2.5) {
    color = vec3(0.95, 0.35, 0.35);
  } else {
    color = vec3(0.95, 0.85, 0.35);
  }
  outColor = vec4(color, 1.0);
}
