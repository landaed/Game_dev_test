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
  bool isPark = v_type > 4.5 && v_type < 5.5;
  bool isNightMarket = v_type > 6.5 && v_type < 7.5;

  vec3 normal = vec3(0.0);
  if (abs(v_local.x) > abs(v_local.z)) {
    normal = vec3(sign(v_local.x), 0.0, 0.0);
  } else {
    normal = vec3(0.0, 0.0, sign(v_local.z));
  }

  // Enhanced directional lighting with shadows
  vec3 lightDir = normalize(vec3(0.5, 0.8, 0.3));
  float faceDot = max(0.0, dot(normal, lightDir));

  // Ambient + diffuse lighting
  float ambient = 0.4;
  float diffuse = faceDot * 0.6;
  float lighting = ambient + diffuse;

  // Simple soft shadow based on building height and position
  float shadowFactor = 1.0 - smoothstep(0.0, 0.3, v_local.y) * 0.15;
  lighting *= shadowFactor;

  vec3 color = baseColor * lighting;

  if (isPark) {
    float grassNoise = hash21(v_world.xz * 6.0);
    vec3 grass = mix(vec3(0.16, 0.34, 0.21), vec3(0.24, 0.48, 0.28), grassNoise);
    float path = smoothstep(0.12, 0.16, abs(v_local.x)) * smoothstep(0.12, 0.16, abs(v_local.z));
    color = mix(grass, vec3(0.32, 0.28, 0.22), path * 0.8);
  }

  float isRoof = step(0.95, v_local.y);
  if (isRoof > 0.5 && !isPark) {
    color *= 1.15;
    float roofDetail = step(0.7, hash21(v_world.xz * 5.0));
    color = mix(color, color * 0.85, roofDetail * 0.3);
    if (isNightMarket) {
      float canopy = step(0.4, fract((v_world.x + v_world.z) * 2.0 + buildingSeed));
      color = mix(color, vec3(0.85, 0.35, 0.25), canopy * 0.5);
    }
  } else {
    if (isPark) {
      float ao = smoothstep(0.0, 0.08, v_local.y);
      color *= mix(0.6, 1.0, ao);
      outColor = vec4(color, 1.0);
      return;
    }
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
    if (isNightMarket) {
      float lantern = step(0.7, hash21(worldUV * 6.0 + buildingSeed));
      windowColor = mix(vec3(0.95, 0.75, 0.5), vec3(1.0, 0.45, 0.35), lantern);
    }
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
