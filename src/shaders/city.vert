#version 300 es
precision highp float;

layout(location = 0) in vec2 a_pos;

uniform vec2 u_grid;

out vec2 v_uv;
out vec2 v_tileCoord;

void main() {
  float idx = float(gl_InstanceID);
  float x = mod(idx, u_grid.x);
  float y = floor(idx / u_grid.x);
  vec2 tileSize = vec2(2.0 / u_grid.x, 2.0 / u_grid.y);
  vec2 base = vec2(-1.0 + tileSize.x * (x + 0.5), -1.0 + tileSize.y * (y + 0.5));
  vec2 pos = base + a_pos * tileSize * 0.5;
  v_uv = a_pos * 0.5 + 0.5;
  v_tileCoord = vec2(x, y);
  gl_Position = vec4(pos, 0.0, 1.0);
}
