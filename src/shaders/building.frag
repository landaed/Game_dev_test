#version 300 es
precision highp float;

in vec3 v_local;
in float v_type;
in float v_height;

out vec4 outColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

vec3 buildingBase(float type, float seed) {
  if (type < 2.5) return mix(vec3(0.25, 0.25, 0.3), vec3(0.35, 0.3, 0.28), seed);
  if (type < 3.5) return mix(vec3(0.2, 0.28, 0.32), vec3(0.28, 0.34, 0.4), seed);
  if (type < 4.5) return mix(vec3(0.26, 0.26, 0.28), vec3(0.4, 0.32, 0.3), seed);
  return mix(vec3(0.2, 0.25, 0.22), vec3(0.3, 0.34, 0.3), seed);
}

void main() {
  float seed = hash(v_local.xz * 3.2 + v_type * 12.3);
  vec3 base = buildingBase(v_type, seed);
  float roof = smoothstep(0.7, 1.0, v_local.y);
  vec3 color = base + roof * 0.08;

  vec2 grid = fract(v_local.xz * 6.0 + seed);
  float windowMask = step(0.85, v_local.y) * step(0.2, grid.x) * step(0.2, grid.y);
  vec3 windowColor = vec3(0.9, 0.8, 0.6) * (0.3 + seed);
  color = mix(color, windowColor, windowMask * 0.5);

  outColor = vec4(color, 1.0);
}
