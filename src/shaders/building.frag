#version 300 es
precision highp float;

in vec3 v_local;
in vec3 v_world;
in float v_type;
in float v_height;

out vec4 outColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(269.5, 183.3))) * 43758.5453);
}

vec3 buildingBase(float type, float seed) {
  if (type < 2.5) return mix(vec3(0.65, 0.58, 0.55), vec3(0.75, 0.65, 0.60), seed);  // Residential
  if (type < 3.5) return mix(vec3(0.55, 0.62, 0.70), vec3(0.65, 0.72, 0.82), seed);  // Commercial
  if (type < 4.5) return mix(vec3(0.60, 0.58, 0.62), vec3(0.72, 0.65, 0.68), seed);  // Industrial
  if (type < 5.5) return mix(vec3(0.58, 0.68, 0.58), vec3(0.68, 0.78, 0.68), seed);  // Park
  if (type < 6.5) return mix(vec3(0.70, 0.65, 0.55), vec3(0.80, 0.75, 0.65), seed);  // School
  if (type < 7.5) return mix(vec3(0.62, 0.55, 0.58), vec3(0.75, 0.65, 0.70), seed);  // Night Market
  if (type < 8.5) return mix(vec3(0.78, 0.52, 0.42), vec3(0.88, 0.62, 0.48), seed);  // Temple (red/orange)
  return mix(vec3(0.68, 0.72, 0.78), vec3(0.78, 0.82, 0.88), seed);  // Mall (bright, modern)
}

void main() {
  vec2 worldXZ = v_world.xz;
  float buildingSeed = hash(floor(worldXZ));
  vec3 baseColor = buildingBase(v_type, buildingSeed);

  vec3 normal = vec3(0.0);
  if (abs(v_local.x) > abs(v_local.z)) {
    normal = vec3(sign(v_local.x), 0.0, 0.0);
  } else {
    normal = vec3(0.0, 0.0, sign(v_local.z));
  }

  float faceDot = dot(normal, normalize(vec3(0.5, 0.8, 0.3)));
  float lighting = 0.7 + faceDot * 0.3;

  vec3 color = baseColor * lighting;

  float isRoof = step(0.95, v_local.y);
  if (isRoof > 0.5) {
    color *= 1.15;
    float roofDetail = step(0.7, hash21(v_world.xz * 5.0));
    color = mix(color, color * 0.85, roofDetail * 0.3);
  } else {
    vec2 worldUV = v_world.xz;
    vec2 localUV = v_local.xz;

    float windowGrid = 0.0;
    if (abs(normal.x) > 0.5) {
      worldUV = vec2(v_world.z, v_world.y);
    } else {
      worldUV = vec2(v_world.x, v_world.y);
    }

    vec2 windowCoord = fract(worldUV * vec2(4.0, v_height * 3.0) + buildingSeed);
    float windowFrame = step(0.15, windowCoord.x) * step(windowCoord.x, 0.85) *
                        step(0.12, windowCoord.y) * step(windowCoord.y, 0.88);
    float windowInset = step(0.25, windowCoord.x) * step(windowCoord.x, 0.75) *
                        step(0.20, windowCoord.y) * step(windowCoord.y, 0.80);

    float floorMask = step(0.05, v_local.y);
    float windowLit = hash21(floor(worldUV * vec2(4.0, v_height * 3.0))) > 0.4 ? 1.0 : 0.3;

    vec3 windowColor = vec3(0.95, 0.90, 0.70) * windowLit;
    color = mix(color, color * 0.90, windowFrame * floorMask * 0.3);
    color = mix(color, windowColor, windowInset * floorMask * 0.7);

    float doorHeight = step(v_local.y, 0.15);
    float doorMask = step(0.3, localUV.x) * step(localUV.x, 0.7) *
                     step(-0.5, localUV.y) * step(localUV.y, 0.5);
    vec3 doorColor = baseColor * 0.4;
    color = mix(color, doorColor, doorMask * doorHeight);
  }

  float ao = smoothstep(0.0, 0.08, v_local.y);
  color *= mix(0.5, 1.0, ao);

  outColor = vec4(color, 1.0);
}
