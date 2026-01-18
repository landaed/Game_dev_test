#version 300 es
precision highp float;

in float v_type;
in vec3 v_normal;

uniform vec3 u_lightDir;

out vec4 outColor;

void main() {
  vec3 color = vec3(0.85, 0.85, 0.85);
  if (v_type < 0.5) {
    color = vec3(0.35, 0.75, 0.95);  // Pedestrian - light blue
  } else if (v_type < 1.5) {
    color = vec3(0.95, 0.45, 0.85);  // Scooter - pink
  } else if (v_type < 2.5) {
    color = vec3(0.95, 0.35, 0.35);  // Car - red
  } else {
    color = vec3(0.95, 0.85, 0.35);  // Truck - yellow
  }

  // Apply directional lighting
  float diffuse = max(0.0, dot(normalize(v_normal), u_lightDir));
  float ambient = 0.5;
  float lighting = ambient + diffuse * 0.5;

  color *= lighting;
  outColor = vec4(color, 1.0);
}
