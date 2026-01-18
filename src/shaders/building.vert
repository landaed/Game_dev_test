#version 300 es
precision highp float;

layout(location = 0) in vec3 a_pos;
layout(location = 1) in vec4 a_instance;

uniform mat4 u_viewProj;

out vec3 v_local;
out float v_type;
out float v_height;

void main() {
  vec2 base = a_instance.xy;
  float height = a_instance.z;
  float type = a_instance.w;
  vec3 pos = a_pos;
  pos.y *= height;
  pos.xz += base;
  v_local = a_pos;
  v_type = type;
  v_height = height;
  gl_Position = u_viewProj * vec4(pos, 1.0);
}
