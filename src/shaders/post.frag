#version 300 es
precision highp float;

uniform sampler2D u_scene;
uniform sampler2D u_depth;
uniform vec2 u_resolution;
uniform float u_focusDistance;

in vec2 v_uv;

out vec4 outColor;

float linearizeDepth(float depth) {
  float z = depth * 2.0 - 1.0;
  float near = 0.1;
  float far = 200.0;
  return (2.0 * near * far) / (far + near - z * (far - near));
}

void main() {
  vec2 texel = 1.0 / u_resolution;
  float depth = texture(u_depth, v_uv).r;
  float linearDepth = linearizeDepth(depth);
  float blurAmount = clamp(abs(linearDepth - u_focusDistance) / u_focusDistance, 0.0, 1.0);
  float radius = mix(0.0, 6.0, blurAmount);

  vec3 color = texture(u_scene, v_uv).rgb * 0.2;
  color += texture(u_scene, v_uv + texel * vec2(1.0, 0.0) * radius).rgb * 0.1;
  color += texture(u_scene, v_uv + texel * vec2(-1.0, 0.0) * radius).rgb * 0.1;
  color += texture(u_scene, v_uv + texel * vec2(0.0, 1.0) * radius).rgb * 0.1;
  color += texture(u_scene, v_uv + texel * vec2(0.0, -1.0) * radius).rgb * 0.1;
  color += texture(u_scene, v_uv + texel * vec2(1.0, 1.0) * radius).rgb * 0.1;
  color += texture(u_scene, v_uv + texel * vec2(-1.0, 1.0) * radius).rgb * 0.1;
  color += texture(u_scene, v_uv + texel * vec2(1.0, -1.0) * radius).rgb * 0.1;
  color += texture(u_scene, v_uv + texel * vec2(-1.0, -1.0) * radius).rgb * 0.1;

  outColor = vec4(color, 1.0);
}
