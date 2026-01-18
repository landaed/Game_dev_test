#version 300 es
precision highp float;

uniform sampler2D u_tileData;
uniform sampler2D u_metrics0;
uniform sampler2D u_metrics1;
uniform vec2 u_grid;
uniform float u_time;
uniform int u_viewMode;

in vec2 v_uv;
in vec2 v_tileCoord;

out vec4 outColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float value = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amp * noise(p);
    p *= 2.0;
    amp *= 0.5;
  }
  return value;
}

vec3 heatColor(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c1 = vec3(0.15, 0.35, 0.85);
  vec3 c2 = vec3(0.25, 0.85, 0.70);
  vec3 c3 = vec3(0.95, 0.85, 0.25);
  vec3 c4 = vec3(0.95, 0.35, 0.25);
  vec3 mid1 = mix(c1, c2, smoothstep(0.0, 0.4, t));
  vec3 mid2 = mix(c2, c3, smoothstep(0.4, 0.7, t));
  vec3 final = mix(mid2, c4, smoothstep(0.7, 1.0, t));
  return mix(mid1, final, step(0.4, t));
}

float arrowShape(vec2 uv) {
  vec2 p = uv * vec2(6.0, 4.0);
  vec2 cell = fract(p) - 0.5;
  float body = smoothstep(0.12, 0.06, abs(cell.x)) * smoothstep(0.45, 0.4, abs(cell.y));
  float head = smoothstep(0.35, 0.2, abs(cell.y + cell.x));
  return max(body, head);
}

bool isRoadTile(ivec2 coord) {
  vec4 data = texelFetch(u_tileData, coord, 0);
  return data.r > 0.5 && data.r < 1.5;
}

void main() {
  ivec2 coord = ivec2(v_tileCoord);
  vec4 tileData = texelFetch(u_tileData, coord, 0);
  vec4 metrics0 = texelFetch(u_metrics0, coord, 0);
  vec4 metrics1 = texelFetch(u_metrics1, coord, 0);

  float tileType = tileData.r;
  float lanes = tileData.g;
  float sidewalk = tileData.b;
  float speed = tileData.a;

  float traffic = metrics0.r;
  float noiseVal = metrics0.g;
  float ped = metrics0.b;
  float income = metrics0.a;
  float happiness = metrics1.r;
  float selected = metrics1.g;
  float oneWay = metrics1.b;

  vec2 uv = v_uv;
  vec2 tileUv = (v_tileCoord + uv) / u_grid;
  vec3 color = vec3(0.15, 0.18, 0.22);

  if (tileType < 0.5) {
    float grass = fbm(tileUv * 14.0);
    vec3 grassDark = vec3(0.15, 0.28, 0.18);
    vec3 grassLight = vec3(0.25, 0.42, 0.28);
    color = mix(grassDark, grassLight, grass);
  } else if (tileType < 1.5) {
    bool hasSidewalk = sidewalk > 0.01;
    float asphalt = fbm(tileUv * 24.0) * 0.2 + 0.2;

    if (!hasSidewalk) {
      color = vec3(0.18, 0.19, 0.20) * asphalt;
      float dirtPatch = fbm(tileUv * 18.0);
      color = mix(color, vec3(0.25, 0.20, 0.15), smoothstep(0.6, 0.7, dirtPatch) * 0.3);
    } else {
      color = vec3(0.22, 0.24, 0.26) * asphalt;
    }

    bool isOneWay = oneWay > 0.5;
    float laneCount = max(1.0, lanes);

    if (isOneWay) {
      float centerStripe = smoothstep(0.02, 0.01, abs(uv.x - 0.5));
      color = mix(color, vec3(0.95, 0.85, 0.3), centerStripe * 0.8);
    } else {
      float edgeStripeL = smoothstep(0.48, 0.5, abs(fract(uv.x * laneCount) - 0.5));
      float centerDashed = smoothstep(0.02, 0.01, abs(uv.x - 0.5)) * step(0.5, fract(uv.y * 8.0));
      color = mix(color, vec3(0.95, 0.9, 0.7), max(edgeStripeL * 0.6, centerDashed * 0.7));
    }

    float crack = smoothstep(0.56, 0.64, fbm(tileUv * 42.0));
    color -= crack * (hasSidewalk ? 0.08 : 0.15);

    if (isOneWay) {
      vec2 arrowUv = uv;
      if (oneWay > 1.5 && oneWay < 2.5) {
        arrowUv = vec2(uv.y, 1.0 - uv.x);
      } else if (oneWay > 2.5 && oneWay < 3.5) {
        arrowUv = vec2(1.0 - uv.x, 1.0 - uv.y);
      } else if (oneWay > 3.5) {
        arrowUv = vec2(1.0 - uv.y, uv.x);
      }
      float arrow = arrowShape(arrowUv) * 0.6;
      color = mix(color, vec3(1.0, 0.96, 0.75), arrow);
    } else {
      bool hasLeft = coord.x > 0 && isRoadTile(coord + ivec2(-1, 0));
      bool hasRight = coord.x < int(u_grid.x) - 1 && isRoadTile(coord + ivec2(1, 0));
      bool hasUp = coord.y > 0 && isRoadTile(coord + ivec2(0, -1));
      bool hasDown = coord.y < int(u_grid.y) - 1 && isRoadTile(coord + ivec2(0, 1));
      bool hasHorizontal = hasLeft || hasRight;
      bool hasVertical = hasUp || hasDown;
      float arrowNorth = arrowShape(uv);
      float arrowSouth = arrowShape(vec2(1.0 - uv.x, 1.0 - uv.y));
      float arrowEast = arrowShape(vec2(uv.y, 1.0 - uv.x));
      float arrowWest = arrowShape(vec2(1.0 - uv.y, uv.x));
      float arrowMask = 0.0;
      if (hasHorizontal && !hasVertical) {
        arrowMask = max(arrowEast, arrowWest) * 0.6;
      } else if (hasVertical && !hasHorizontal) {
        arrowMask = max(arrowNorth, arrowSouth) * 0.6;
      } else if (hasHorizontal && hasVertical) {
        arrowMask = max(max(arrowEast, arrowWest), max(arrowNorth, arrowSouth)) * 0.4;
      }
      color = mix(color, vec3(0.75, 0.95, 1.0), arrowMask);
    }

    if (hasSidewalk) {
      float curb = smoothstep(0.0, 0.05, uv.y) + smoothstep(1.0, 0.95, uv.y);
      float sidewalkMask = clamp(step(uv.y, sidewalk) + step(1.0 - sidewalk, uv.y), 0.0, 1.0);
      float slab = step(0.05, uv.x) * step(uv.x, 0.95) * sidewalkMask;
      float slabs = step(0.48, abs(fract(uv.x * 7.0) - 0.5));
      vec3 sidewalkColor = vec3(0.48, 0.50, 0.54) + fbm(tileUv * 20.0) * 0.12;
      color = mix(color, sidewalkColor, slab * 0.8 + curb * 0.5);
      color = mix(color, sidewalkColor * 1.15, slabs * slab * 0.35);
    } else {
      float edgeDirt = smoothstep(0.0, 0.15, uv.y) + smoothstep(1.0, 0.85, uv.y);
      vec3 dirtColor = vec3(0.22, 0.18, 0.14);
      color = mix(color, dirtColor, edgeDirt * 0.4);
    }
  } else {
    float seed = hash(v_tileCoord);
    vec3 base = mix(vec3(0.28, 0.32, 0.42), vec3(0.45, 0.40, 0.50), seed);
    float roof = smoothstep(0.15, 0.85, uv.y);
    color = base + roof * 0.10;
    float acUnit = step(0.72, uv.x) * step(0.72, uv.y) * step(uv.x, 0.90) * step(uv.y, 0.90);
    color = mix(color, vec3(0.65, 0.68, 0.75), acUnit);
    float shadow = smoothstep(0.0, 0.2, uv.y) * 0.15;
    color -= shadow;
  }

  if (u_viewMode > 0) {
    float metric = 0.0;
    if (u_viewMode == 1) metric = traffic;
    if (u_viewMode == 2) metric = noiseVal;
    if (u_viewMode == 3) metric = ped;
    if (u_viewMode == 4) metric = income;
    if (u_viewMode == 5) metric = happiness;
    float dither = fbm(tileUv * 30.0 + u_time * 0.05) * 0.08;
    vec3 heat = heatColor(metric + dither);
    color = mix(color, heat, 0.6);
  }

  if (selected > 0.5) {
    float pulse = 0.5 + 0.5 * sin(u_time * 4.0);
    float border = smoothstep(0.0, 0.05, uv.x) + smoothstep(1.0, 0.95, uv.x) +
      smoothstep(0.0, 0.05, uv.y) + smoothstep(1.0, 0.95, uv.y);
    color = mix(color, vec3(0.4, 0.8, 1.0), border * pulse * 0.6);
  }

  float vignetteDist = length(v_uv - vec2(0.5));
  float vignette = smoothstep(0.85, 0.3, vignetteDist);
  color *= mix(0.75, 1.1, vignette);

  vec3 tonemapped = color / (color + vec3(1.0));
  tonemapped = pow(tonemapped, vec3(0.95));
  color = mix(color, tonemapped, 0.3);

  float grain = fbm(v_uv * 500.0 + u_time * 0.5) * 0.015;
  color += grain;

  vec2 edgeDist = vec2(
    min(v_tileCoord.x / u_grid.x, 1.0 - v_tileCoord.x / u_grid.x),
    min(v_tileCoord.y / u_grid.y, 1.0 - v_tileCoord.y / u_grid.y)
  );
  float minEdge = min(edgeDist.x, edgeDist.y);
  float edgeFade = smoothstep(0.08, 0.45, minEdge);
  vec3 hazeBase = mix(vec3(0.08, 0.1, 0.14), vec3(0.16, 0.18, 0.24), fbm(tileUv * 6.0 + u_time * 0.015));
  float edgeBlur = clamp(1.0 - smoothstep(0.08, 0.28, minEdge), 0.0, 1.0);
  float luminance = dot(color, vec3(0.299, 0.587, 0.114));
  vec3 blurred = mix(vec3(luminance), hazeBase, 0.45);
  color = mix(blurred, color, 1.0 - edgeBlur * 0.6);
  color = mix(hazeBase, color, edgeFade);

  color = clamp(color, 0.0, 1.0);

  outColor = vec4(color, 1.0);
}
