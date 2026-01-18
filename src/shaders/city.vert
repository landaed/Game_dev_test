#version 300 es
precision highp float;

layout(location = 0) in vec2 a_pos;

uniform vec2 u_grid;
uniform mat4 u_viewProj;

out vec2 v_uv;
out vec2 v_tileCoord;

void main() {
  float idx = float(gl_InstanceID);
  float x = mod(idx, u_grid.x);
  float y = floor(idx / u_grid.x);
  vec2 tileSize = vec2(1.0, 1.0);
  vec2 center = vec2(x + 0.5, y + 0.5) * tileSize;
  vec2 pos = center + a_pos * 0.5 * tileSize;
  v_uv = a_pos * 0.5 + 0.5;
  v_tileCoord = vec2(x, y);
  gl_Position = u_viewProj * vec4(pos.x, 0.0, pos.y, 1.0);
}
