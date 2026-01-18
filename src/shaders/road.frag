#version 300 es
precision highp float;

uniform float u_time;

in vec2 v_local;
in vec2 v_dir;
in vec4 v_meta0;
in vec4 v_meta1;

out vec4 outColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float arrowShape(vec2 uv) {
  vec2 p = uv * vec2(6.0, 4.0);
  vec2 cell = fract(p) - 0.5;
  float body = smoothstep(0.12, 0.06, abs(cell.x)) * smoothstep(0.45, 0.4, abs(cell.y));
  float head = smoothstep(0.35, 0.2, abs(cell.y + cell.x));
  return max(body, head);
}

void main() {
  float width = v_meta0.x;
  float sidewalk = v_meta0.y;
  float lanes = clamp(v_meta0.z, 1.0, 2.0);
  float oneWay = v_meta0.w;
  float hasSignal = v_meta1.x;
  float signalOffset = v_meta1.y;
  float hasCrosswalk = v_meta1.z;

  float sidewalkFrac = clamp(sidewalk / max(width, 0.001), 0.02, 0.4);
  float inner = 1.0 - sidewalkFrac * 2.0;
  float roadX = clamp((v_local.x - sidewalkFrac) / max(inner, 0.001), 0.0, 1.0);

  vec3 asphalt = vec3(0.17, 0.18, 0.2) + hash(v_local * 40.0) * 0.03;
  vec3 sidewalkColor = vec3(0.46, 0.49, 0.52) + hash(v_local * 25.0) * 0.04;
  vec3 color = asphalt;

  float sidewalkMask = step(v_local.x, sidewalkFrac) + step(1.0 - sidewalkFrac, v_local.x);
  color = mix(color, sidewalkColor, clamp(sidewalkMask, 0.0, 1.0));

  float laneScale = lanes;
  float lanePos = fract(roadX * laneScale);
  float laneStripe = smoothstep(0.47, 0.5, abs(lanePos - 0.5));
  float centerDashed = smoothstep(0.02, 0.01, abs(roadX - 0.5)) * step(0.5, fract(v_local.y * 9.0));
  color = mix(color, vec3(0.95, 0.9, 0.7), max(laneStripe * 0.35, centerDashed * 0.8));

  float arrow = arrowShape(vec2(roadX, v_local.y));
  if (oneWay > 0.5) {
    color = mix(color, vec3(0.95, 0.85, 0.4), arrow * 0.6);
  } else {
    color = mix(color, vec3(0.75, 0.9, 1.0), arrow * 0.2);
  }

  if (hasCrosswalk > 0.5) {
    float atEnd = smoothstep(0.0, 0.08, v_local.y) + smoothstep(1.0, 0.92, v_local.y);
    float zebra = step(0.5, fract(roadX * 10.0));
    color = mix(color, vec3(0.95, 0.95, 0.95), zebra * atEnd * 0.7);
  }

  if (hasSignal > 0.5) {
    float phase = fract(u_time / 6.0 + signalOffset);
    float green = phase < 0.5 ? 1.0 : 0.0;
    vec2 lightPos = vec2(0.15, 0.1);
    float light = smoothstep(0.12, 0.02, distance(v_local, lightPos));
    vec3 lightColor = mix(vec3(0.9, 0.2, 0.2), vec3(0.2, 0.9, 0.3), green);
    color = mix(color, lightColor, light * 0.9);
  }

  outColor = vec4(color, 0.95);
}
