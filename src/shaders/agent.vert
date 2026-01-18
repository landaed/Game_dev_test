#version 300 es
precision highp float;

layout(location = 0) in vec3 a_pos;
layout(location = 1) in vec4 a_instance;

uniform mat4 u_viewProj;

out float v_type;
out vec3 v_normal;

void main() {
  vec2 base = a_instance.xy;
  float scale = a_instance.z;
  float type = a_instance.w;
  vec3 pos = a_pos * scale;
  pos.xz += base;
  pos.y += 0.02;
  v_type = type;

  // Calculate normal based on which face of the cube this vertex is on
  vec3 absPos = abs(a_pos);
  if (absPos.x > absPos.y && absPos.x > absPos.z) {
    v_normal = vec3(sign(a_pos.x), 0.0, 0.0);
  } else if (absPos.y > absPos.z) {
    v_normal = vec3(0.0, sign(a_pos.y), 0.0);
  } else {
    v_normal = vec3(0.0, 0.0, sign(a_pos.z));
  }

  gl_Position = u_viewProj * vec4(pos, 1.0);
}
