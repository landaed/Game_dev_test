#version 300 es
precision highp float;

layout(location = 0) in vec3 a_pos;
layout(location = 1) in vec4 a_instance;

uniform mat4 u_viewProj;

out float v_type;

void main() {
  vec2 base = a_instance.xy;
  float scale = a_instance.z;
  float type = a_instance.w;
  vec3 pos = a_pos * scale;
  pos.xz += base;
  pos.y += 0.02;
  v_type = type;
  gl_Position = u_viewProj * vec4(pos, 1.0);
}
