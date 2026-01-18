#version 300 es
precision highp float;

layout(location = 0) in vec2 a_pos;
layout(location = 1) in vec4 a_startEnd;
layout(location = 2) in vec4 a_meta0;
layout(location = 3) in vec4 a_meta1;

uniform mat4 u_viewProj;

out vec2 v_local;
out vec2 v_dir;
out vec4 v_meta0;
out vec4 v_meta1;

void main() {
  vec2 start = a_startEnd.xy;
  vec2 end = a_startEnd.zw;
  vec2 dir = end - start;
  float lengthSeg = max(0.001, length(dir));
  vec2 forward = dir / lengthSeg;
  vec2 normal = vec2(-forward.y, forward.x);
  vec2 pos = start + forward * (a_pos.y * lengthSeg) + normal * (a_pos.x * a_meta0.x);
  v_local = vec2(a_pos.x + 0.5, a_pos.y);
  v_dir = forward;
  v_meta0 = a_meta0;
  v_meta1 = a_meta1;
  gl_Position = u_viewProj * vec4(pos.x, 0.02 + a_meta1.w, pos.y, 1.0);
}
