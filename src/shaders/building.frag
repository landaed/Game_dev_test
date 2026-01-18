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
  if (type < 2.5) return mix(vec3(0.45, 0.42, 0.48), vec3(0.58, 0.50, 0.46), seed);
  if (type < 3.5) return mix(vec3(0.38, 0.48, 0.54), vec3(0.48, 0.56, 0.65), seed);
  if (type < 4.5) return mix(vec3(0.46, 0.44, 0.48), vec3(0.62, 0.52, 0.50), seed);
  return mix(vec3(0.38, 0.45, 0.40), vec3(0.52, 0.58, 0.52), seed);
}

void main() {
  float seed = hash(v_local.xz * 3.2 + v_type * 12.3);
  vec3 base = buildingBase(v_type, seed);
  float roof = smoothstep(0.75, 1.0, v_local.y);
  vec3 color = base + roof * 0.12;

  float faceLighting = abs(v_local.x) + abs(v_local.z);
  color *= mix(0.85, 1.0, faceLighting * 0.5);

  vec2 grid = fract(v_local.xz * 8.0 + seed);
  float windowMask = step(0.15, v_local.y) * step(v_local.y, 0.92) *
                     step(0.15, grid.x) * step(grid.x, 0.85) *
                     step(0.15, grid.y) * step(grid.y, 0.85);
  vec3 windowColor = vec3(0.95, 0.88, 0.65) * (0.4 + seed * 0.6);
  color = mix(color, windowColor, windowMask * 0.6);

  float shadow = smoothstep(0.0, 0.15, v_local.y) * 0.2;
  color -= shadow;

  outColor = vec4(color, 1.0);
}
