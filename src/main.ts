import vertSource from "./shaders/city.vert?raw";
import fragSource from "./shaders/city.frag?raw";
import buildingVert from "./shaders/building.vert?raw";
import buildingFrag from "./shaders/building.frag?raw";
import agentVert from "./shaders/agent.vert?raw";
import agentFrag from "./shaders/agent.frag?raw";
import "./styles.css";

type TileType = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
type AgentType = "pedestrian" | "scooter" | "car" | "truck";

const GRID_WIDTH = 40;
const GRID_HEIGHT = 30;
const TILE_COUNT = GRID_WIDTH * GRID_HEIGHT;

const SPEED_OPTIONS = [20, 30, 40, 50];

const ELECTION_INTERVAL = 600;
const QUICK_ELECTION_INTERVAL = 180;
const REQUIRED_APPROVAL = 50;
const MAX_CASH_DEFICIT = 200000;
const MAX_DEBT = 500000;

const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
const hud = document.getElementById("hud") as HTMLDivElement;
const leftPanel = document.getElementById("left-panel") as HTMLDivElement;
const rightPanel = document.getElementById("right-panel") as HTMLDivElement;
const bottomBar = document.getElementById("bottom-bar") as HTMLDivElement;
const modal = document.getElementById("modal") as HTMLDivElement;
const toast = document.getElementById("toast") as HTMLDivElement;

let viewMode = 0;
let simSpeed = 1;
let quickElections = true;
let selectedIndex: number | null = null;

let cameraDistance = 28;
let cameraAngle = Math.PI / 6;
let cameraPanX = 0;
let cameraPanZ = 0;
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

const tileType = new Float32Array(TILE_COUNT);
const tileLanes = new Float32Array(TILE_COUNT);
const tileSidewalk = new Float32Array(TILE_COUNT);
const tileSpeed = new Float32Array(TILE_COUNT);
const tileOneWay = new Float32Array(TILE_COUNT);
const tilePedOnly = new Float32Array(TILE_COUNT);
const tileScooterRestrict = new Float32Array(TILE_COUNT);
const tileNoiseBarrier = new Float32Array(TILE_COUNT);

const traffic = new Float32Array(TILE_COUNT);
const noise = new Float32Array(TILE_COUNT);
const ped = new Float32Array(TILE_COUNT);
const income = new Float32Array(TILE_COUNT);
const happinessTile = new Float32Array(TILE_COUNT);
const selection = new Float32Array(TILE_COUNT);

const tileDataTexels = new Float32Array(TILE_COUNT * 4);
const metrics0Texels = new Float32Array(TILE_COUNT * 4);
const metrics1Texels = new Float32Array(TILE_COUNT * 4);

type Agent = {
  id: number;
  type: AgentType;
  path: number[];
  pathIndex: number;
  progress: number;
  position: { x: number; z: number };
  destination: number;
};

const agents: Agent[] = [];
let selectedAgent: Agent | null = null;
let buildingInstanceCount = 0;
let buildingInstances = new Float32Array(0);

const policyList = [
  {
    id: "congestion",
    name: "Congestion Pricing",
    pp: 30,
    cost: 15000,
    description: "Charges drivers during peak hours, reducing trips and boosting revenue.",
    active: false
  },
  {
    id: "scooter",
    name: "Scooter Licensing Crackdown",
    pp: 20,
    cost: 8000,
    description: "Cuts scooter share and noise, but irritates riders.",
    active: false
  },
  {
    id: "curfew",
    name: "Night Noise Curfew",
    pp: 25,
    cost: 5000,
    description: "Quiet hours reduce nighttime noise around markets.",
    active: false
  },
  {
    id: "sidewalks",
    name: "Sidewalk Expansion Program",
    pp: 35,
    cost: 12000,
    description: "Subsidizes sidewalk upgrades and improves walkability.",
    active: false
  },
  {
    id: "transit",
    name: "Public Transit Subsidy",
    pp: 40,
    cost: 20000,
    description: "Reduces car trips gradually as transit use rises.",
    active: false
  },
  {
    id: "parking",
    name: "Parking Enforcement",
    pp: 15,
    cost: 6000,
    description: "Cuts cruising traffic, minor annoyance for drivers.",
    active: false
  },
  {
    id: "vendors",
    name: "Street Vendor Permits",
    pp: 18,
    cost: 4000,
    description: "Boosts income but adds localized noise.",
    active: false
  },
  {
    id: "vision",
    name: "Vision Zero Campaign",
    pp: 28,
    cost: 9000,
    description: "Citywide speed reductions improve safety and walkability.",
    active: false
  }
];

const state = {
  time: 0,
  population: 42000,
  happiness: 52,
  approval: 51,
  cash: 120000,
  debt: 40000,
  interestRate: 0.05,
  monthlyBalance: 0,
  taxRate: 0.18,
  politicalPoints: 40,
  electionTimer: quickElections ? QUICK_ELECTION_INTERVAL : ELECTION_INTERVAL,
  electionCount: 0,
  recentDiscontent: 0,
  achievements: new Set<string>(),
  lost: false,
  won: false
};

const tileIndicesByType: Record<number, number[]> = {};

const gl = canvas.getContext("webgl2", { antialias: true });
if (!gl) {
  throw new Error("WebGL2 not supported");
}

function mat4Identity() {
  const out = new Float32Array(16);
  out[0] = 1;
  out[5] = 1;
  out[10] = 1;
  out[15] = 1;
  return out;
}

function mat4Multiply(a: Float32Array, b: Float32Array) {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[row + col * 4] =
        a[row + 0 * 4] * b[0 + col * 4] +
        a[row + 1 * 4] * b[1 + col * 4] +
        a[row + 2 * 4] * b[2 + col * 4] +
        a[row + 3 * 4] * b[3 + col * 4];
    }
  }
  return out;
}

function mat4Perspective(fov: number, aspect: number, near: number, far: number) {
  const f = 1.0 / Math.tan(fov / 2);
  const out = new Float32Array(16);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

function mat4LookAt(eye: [number, number, number], target: [number, number, number], up: [number, number, number]) {
  const [ex, ey, ez] = eye;
  const [tx, ty, tz] = target;
  const [ux, uy, uz] = up;
  let zx = ex - tx;
  let zy = ey - ty;
  let zz = ez - tz;
  const zLen = Math.hypot(zx, zy, zz) || 1;
  zx /= zLen;
  zy /= zLen;
  zz /= zLen;
  let xx = uy * zz - uz * zy;
  let xy = uz * zx - ux * zz;
  let xz = ux * zy - uy * zx;
  const xLen = Math.hypot(xx, xy, xz) || 1;
  xx /= xLen;
  xy /= xLen;
  xz /= xLen;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  const out = mat4Identity();
  out[0] = xx;
  out[1] = yx;
  out[2] = zx;
  out[4] = xy;
  out[5] = yy;
  out[6] = zy;
  out[8] = xz;
  out[9] = yz;
  out[10] = zz;
  out[12] = -(xx * ex + xy * ey + xz * ez);
  out[13] = -(yx * ex + yy * ey + yz * ez);
  out[14] = -(zx * ex + zy * ey + zz * ez);
  return out;
}

function mat4Invert(m: Float32Array) {
  const out = new Float32Array(16);
  const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
  const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
  const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
  const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return mat4Identity();
  det = 1.0 / det;
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return out;
}

function transformPoint(m: Float32Array, v: [number, number, number, number]) {
  const [x, y, z, w] = v;
  const nx = m[0] * x + m[4] * y + m[8] * z + m[12] * w;
  const ny = m[1] * x + m[5] * y + m[9] * z + m[13] * w;
  const nz = m[2] * x + m[6] * y + m[10] * z + m[14] * w;
  const nw = m[3] * x + m[7] * y + m[11] * z + m[15] * w;
  return [nx, ny, nz, nw] as const;
}

function screenToWorld(screenX: number, screenY: number, invViewProj: Float32Array) {
  const ndcX = (screenX / canvas.width) * 2 - 1;
  const ndcY = -((screenY / canvas.height) * 2 - 1);
  const near = transformPoint(invViewProj, [ndcX, ndcY, -1, 1]);
  const far = transformPoint(invViewProj, [ndcX, ndcY, 1, 1]);
  const nearPos = { x: near[0] / near[3], y: near[1] / near[3], z: near[2] / near[3] };
  const farPos = { x: far[0] / far[3], y: far[1] / far[3], z: far[2] / far[3] };
  const dirX = farPos.x - nearPos.x;
  const dirY = farPos.y - nearPos.y;
  const dirZ = farPos.z - nearPos.z;
  const t = -nearPos.y / dirY;
  if (t < 0) return null;
  return {
    x: nearPos.x + dirX * t,
    z: nearPos.z + dirZ * t
  };
}

function createShader(type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error("Shader create failed");
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? "Shader compile failed");
  }
  return shader;
}

function createProgram(vertexSource: string, fragmentSource: string) {
  const program = gl.createProgram();
  if (!program) {
    throw new Error("Program create failed");
  }
  gl.attachShader(program, createShader(gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, createShader(gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? "Program link failed");
  }
  return program;
}

const groundProgram = createProgram(vertSource, fragSource);
const buildingProgram = createProgram(buildingVert, buildingFrag);
const agentProgram = createProgram(agentVert, agentFrag);

const positionBuffer = gl.createBuffer();
const cubeBuffer = gl.createBuffer();
const groundVao = gl.createVertexArray();
const buildingVao = gl.createVertexArray();
const agentVao = gl.createVertexArray();
const buildingInstanceBuffer = gl.createBuffer();
const agentInstanceBuffer = gl.createBuffer();

if (!groundVao || !positionBuffer || !cubeBuffer || !buildingVao || !agentVao || !buildingInstanceBuffer || !agentInstanceBuffer) {
  throw new Error("WebGL buffer failed");
}

const quad = new Float32Array([
  -1, -1,
  1, -1,
  -1, 1,
  -1, 1,
  1, -1,
  1, 1
]);

const cube = new Float32Array([
  -0.4, 0, -0.4, 0.4, 0, -0.4, 0.4, 1, -0.4,
  -0.4, 0, -0.4, 0.4, 1, -0.4, -0.4, 1, -0.4,
  -0.4, 0, 0.4, 0.4, 0, 0.4, 0.4, 1, 0.4,
  -0.4, 0, 0.4, 0.4, 1, 0.4, -0.4, 1, 0.4,
  -0.4, 0, -0.4, -0.4, 0, 0.4, -0.4, 1, 0.4,
  -0.4, 0, -0.4, -0.4, 1, 0.4, -0.4, 1, -0.4,
  0.4, 0, -0.4, 0.4, 0, 0.4, 0.4, 1, 0.4,
  0.4, 0, -0.4, 0.4, 1, 0.4, 0.4, 1, -0.4,
  -0.4, 1, -0.4, 0.4, 1, -0.4, 0.4, 1, 0.4,
  -0.4, 1, -0.4, 0.4, 1, 0.4, -0.4, 1, 0.4,
  -0.4, 0, -0.4, 0.4, 0, -0.4, 0.4, 0, 0.4,
  -0.4, 0, -0.4, 0.4, 0, 0.4, -0.4, 0, 0.4
]);

const uGrid = gl.getUniformLocation(groundProgram, "u_grid");
const uTime = gl.getUniformLocation(groundProgram, "u_time");
const uViewMode = gl.getUniformLocation(groundProgram, "u_viewMode");
const uViewProj = gl.getUniformLocation(groundProgram, "u_viewProj");
const uBuildingViewProj = gl.getUniformLocation(buildingProgram, "u_viewProj");
const uAgentViewProj = gl.getUniformLocation(agentProgram, "u_viewProj");

const tileDataTex = gl.createTexture();
const metrics0Tex = gl.createTexture();
const metrics1Tex = gl.createTexture();

if (!tileDataTex || !metrics0Tex || !metrics1Tex) {
  throw new Error("Texture creation failed");
}

let viewProj = mat4Identity();
let invViewProj = mat4Identity();

function setupTexture(tex: WebGLTexture) {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

setupTexture(tileDataTex);
setupTexture(metrics0Tex);
setupTexture(metrics1Tex);

function resizeCanvas() {
  const { clientWidth, clientHeight } = canvas;
  if (canvas.width !== clientWidth || canvas.height !== clientHeight) {
    canvas.width = clientWidth;
    canvas.height = clientHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
}

function updateCamera() {
  const aspect = canvas.width / Math.max(1, canvas.height);
  const fov = Math.PI / 3;
  const projection = mat4Perspective(fov, aspect, 0.1, 200);
  const centerX = GRID_WIDTH * 0.5 + cameraPanX;
  const centerZ = GRID_HEIGHT * 0.5 + cameraPanZ;
  const eyeX = centerX + Math.sin(cameraAngle) * cameraDistance;
  const eyeY = cameraDistance * 0.85;
  const eyeZ = centerZ + Math.cos(cameraAngle) * cameraDistance;
  const eye: [number, number, number] = [eyeX, eyeY, eyeZ];
  const target: [number, number, number] = [centerX, 0, centerZ];
  const view = mat4LookAt(eye, target, [0, 1, 0]);
  viewProj = mat4Multiply(projection, view);
  invViewProj = mat4Invert(viewProj);
}

function projectToScreen(pos: { x: number; y: number; z: number }) {
  const [nx, ny, nz, nw] = transformPoint(viewProj, [pos.x, pos.y, pos.z, 1]);
  const w = nw || 1;
  const sx = ((nx / w + 1) * 0.5) * canvas.width;
  const sy = ((1 - ny / w) * 0.5) * canvas.height;
  return { x: sx, y: sy, z: nz / w };
}

function indexFor(x: number, y: number) {
  return y * GRID_WIDTH + x;
}

function tileCenter(index: number) {
  const x = index % GRID_WIDTH;
  const y = Math.floor(index / GRID_WIDTH);
  return { x: x + 0.5, z: y + 0.5 };
}

function resetTileIndex() {
  [2, 3, 4, 5, 6, 7].forEach((type) => {
    tileIndicesByType[type] = [];
  });
}

function rebuildTileIndex() {
  resetTileIndex();
  for (let i = 0; i < TILE_COUNT; i++) {
    if (tileType[i] >= 2) {
      tileIndicesByType[tileType[i]]?.push(i);
    }
  }
}

function generateMap() {
  resetTileIndex();

  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      const idx = indexFor(x, y);
      const isRoad = x % 5 === 0 || y % 6 === 0;
      if (isRoad) {
        tileType[idx] = 1;
        tileLanes[idx] = Math.random() > 0.7 ? 2 : 1;
        tileSidewalk[idx] = Math.random() > 0.55 ? 0.05 : 0.0;
        tileSpeed[idx] = SPEED_OPTIONS[Math.floor(Math.random() * SPEED_OPTIONS.length)];
      } else {
        const r = Math.random();
        let type: TileType = 2;
        if (r > 0.8) type = 3;
        if (r > 0.9) type = 4;
        if (r > 0.96) type = 5;
        if (r > 0.98) type = 6;
        if (r > 0.985) type = 7;
        tileType[idx] = type;
        tileLanes[idx] = 0;
        tileSidewalk[idx] = 0;
        tileSpeed[idx] = 0;
        tileIndicesByType[type]?.push(idx);
      }
      tileOneWay[idx] = Math.random() > 0.85 ? Math.ceil(Math.random() * 4) : 0;
      tilePedOnly[idx] = 0;
      tileScooterRestrict[idx] = 0;
      tileNoiseBarrier[idx] = 0;
    }
  }
}
generateMap();

function buildBuildingInstances() {
  const instances: number[] = [];
  for (let i = 0; i < TILE_COUNT; i++) {
    if (tileType[i] <= 1) continue;
    const x = i % GRID_WIDTH;
    const y = Math.floor(i / GRID_WIDTH);
    const height =
      tileType[i] === 2 ? 1.4 : tileType[i] === 3 ? 2.0 : tileType[i] === 4 ? 1.6 : tileType[i] === 7 ? 1.2 : 0.8;
    instances.push(x + 0.5, y + 0.5, height + (Math.sin(i) * 0.2 + 0.2), tileType[i]);
  }
  buildingInstances = new Float32Array(instances);
  buildingInstanceCount = buildingInstances.length / 4;
  gl.bindBuffer(gl.ARRAY_BUFFER, buildingInstanceBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, buildingInstances, gl.DYNAMIC_DRAW);
}

function updateTileOrientation() {
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      const idx = indexFor(x, y);
      if (tileType[idx] !== 1) continue;
      const left = x > 0 && tileType[indexFor(x - 1, y)] === 1;
      const right = x < GRID_WIDTH - 1 && tileType[indexFor(x + 1, y)] === 1;
      const up = y > 0 && tileType[indexFor(x, y - 1)] === 1;
      const down = y < GRID_HEIGHT - 1 && tileType[indexFor(x, y + 1)] === 1;
      if (left || right) {
        tileOneWay[idx] = tileOneWay[idx] === 0 ? 0 : tileOneWay[idx];
      }
      if (up || down) {
        tileOneWay[idx] = tileOneWay[idx] === 0 ? 0 : tileOneWay[idx];
      }
    }
  }
}

updateTileOrientation();
buildBuildingInstances();
spawnAgents();

function buildBuffers() {
  gl.bindVertexArray(groundVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  gl.bindVertexArray(buildingVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, cube, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, buildingInstanceBuffer);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(1, 1);
  gl.bindVertexArray(null);

  gl.bindVertexArray(agentVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuffer);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, agentInstanceBuffer);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(1, 1);
  gl.bindVertexArray(null);
}

buildBuffers();

function updateTextures() {
  for (let i = 0; i < TILE_COUNT; i++) {
    tileDataTexels[i * 4] = tileType[i];
    tileDataTexels[i * 4 + 1] = tileLanes[i];
    tileDataTexels[i * 4 + 2] = tileSidewalk[i];
    tileDataTexels[i * 4 + 3] = tileSpeed[i];

    metrics0Texels[i * 4] = clamp01(traffic[i]);
    metrics0Texels[i * 4 + 1] = clamp01(noise[i]);
    metrics0Texels[i * 4 + 2] = clamp01(ped[i]);
    metrics0Texels[i * 4 + 3] = clamp01(income[i]);

    metrics1Texels[i * 4] = clamp01(happinessTile[i]);
    metrics1Texels[i * 4 + 1] = selection[i];
    metrics1Texels[i * 4 + 2] = tileOneWay[i];
    metrics1Texels[i * 4 + 3] = tilePedOnly[i];
  }

  gl.bindTexture(gl.TEXTURE_2D, tileDataTex);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA32F,
    GRID_WIDTH,
    GRID_HEIGHT,
    0,
    gl.RGBA,
    gl.FLOAT,
    tileDataTexels
  );

  gl.bindTexture(gl.TEXTURE_2D, metrics0Tex);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA32F,
    GRID_WIDTH,
    GRID_HEIGHT,
    0,
    gl.RGBA,
    gl.FLOAT,
    metrics0Texels
  );

  gl.bindTexture(gl.TEXTURE_2D, metrics1Tex);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA32F,
    GRID_WIDTH,
    GRID_HEIGHT,
    0,
    gl.RGBA,
    gl.FLOAT,
    metrics1Texels
  );
}

function render() {
  resizeCanvas();
  updateCamera();
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.useProgram(groundProgram);
  gl.uniform2f(uGrid, GRID_WIDTH, GRID_HEIGHT);
  gl.uniform1f(uTime, state.time);
  gl.uniform1i(uViewMode, viewMode);
  gl.uniformMatrix4fv(uViewProj, false, viewProj);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tileDataTex);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, metrics0Tex);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, metrics1Tex);

  const uTileData = gl.getUniformLocation(groundProgram, "u_tileData");
  const uMetrics0 = gl.getUniformLocation(groundProgram, "u_metrics0");
  const uMetrics1 = gl.getUniformLocation(groundProgram, "u_metrics1");
  gl.uniform1i(uTileData, 0);
  gl.uniform1i(uMetrics0, 1);
  gl.uniform1i(uMetrics1, 2);

  gl.bindVertexArray(groundVao);
  gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, TILE_COUNT);
  gl.bindVertexArray(null);

  gl.useProgram(buildingProgram);
  gl.uniformMatrix4fv(uBuildingViewProj, false, viewProj);
  gl.bindVertexArray(buildingVao);
  gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, buildingInstanceCount);
  gl.bindVertexArray(null);

  gl.useProgram(agentProgram);
  gl.uniformMatrix4fv(uAgentViewProj, false, viewProj);
  gl.bindVertexArray(agentVao);
  gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, agents.length);
  gl.bindVertexArray(null);
}

function showToast(message: string) {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2400);
}

function showModal(title: string, body: string, actionLabel = "Close") {
  modal.innerHTML = `
    <div class="modal-card">
      <h3>${title}</h3>
      <p>${body}</p>
      <button id="modal-close">${actionLabel}</button>
    </div>
  `;
  modal.classList.add("active");
  const button = document.getElementById("modal-close");
  button?.addEventListener("click", () => {
    modal.classList.remove("active");
  });
}

function updateHud() {
  const ppRate = 60 * (0.4 + state.happiness / 100 + state.population / 100000);
  hud.innerHTML = `
    <div class="stat">💰 Cash: ${formatMoney(state.cash)}<br><span class="small">Monthly: ${formatMoney(state.monthlyBalance)}</span></div>
    <div class="stat">🏦 Debt: ${formatMoney(state.debt)}<br><span class="small">Interest: ${(state.interestRate * 100).toFixed(1)}%</span></div>
    <div class="stat">👥 Population: ${state.population.toFixed(0)}<br><span class="small">Happiness: ${state.happiness.toFixed(1)}</span></div>
    <div class="stat">🗳️ Approval: ${state.approval.toFixed(1)}<br><span class="small">Election in ${state.electionTimer.toFixed(0)}s · PP ${state.politicalPoints.toFixed(0)} (+${ppRate.toFixed(1)}/min)</span></div>
  `;
}

function updateBottomBar() {
  const viewModes = [
    { label: "Normal", mode: 0 },
    { label: "Traffic", mode: 1 },
    { label: "Noise", mode: 2 },
    { label: "Ped", mode: 3 },
    { label: "Income", mode: 4 },
    { label: "Happiness", mode: 5 }
  ];
  bottomBar.innerHTML = `
    <div class="view-modes">
      ${viewModes
        .map(
          (v) =>
            `<button class="${viewMode === v.mode ? "active" : ""}" data-view="${v.mode}">${v.label}</button>`
        )
        .join("")}
    </div>
    <div class="controls">
      <button data-speed="1" class="${simSpeed === 1 ? "active" : ""}">1x</button>
      <button data-speed="2" class="${simSpeed === 2 ? "active" : ""}">2x</button>
      <button data-speed="4" class="${simSpeed === 4 ? "active" : ""}">4x</button>
      <button data-save="true">Save</button>
      <button data-load="true">Load</button>
    </div>
  `;

  bottomBar.querySelectorAll("button[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      viewMode = Number((btn as HTMLButtonElement).dataset.view);
      updateBottomBar();
    });
  });

  bottomBar.querySelectorAll("button[data-speed]").forEach((btn) => {
    btn.addEventListener("click", () => {
      simSpeed = Number((btn as HTMLButtonElement).dataset.speed);
      updateBottomBar();
    });
  });

  bottomBar.querySelector("button[data-save]")?.addEventListener("click", saveGame);
  bottomBar.querySelector("button[data-load]")?.addEventListener("click", loadGame);
}

function updateLeftPanel() {
  leftPanel.innerHTML = `
    <h2>City Actions</h2>
    <div class="list" id="city-actions"></div>
    <h2>Policies</h2>
    <div class="list" id="policy-list"></div>
  `;
  const actionList = leftPanel.querySelector("#city-actions") as HTMLDivElement;
  actionList.innerHTML = `
    <div class="card">Political Points: <strong>${state.politicalPoints.toFixed(0)}</strong></div>
    <button data-action="toggle-oneway">Toggle One-Way</button>
    <button data-action="speed">Set Speed Limit</button>
    <button data-action="sidewalk">Add Sidewalk</button>
    <button data-action="ped">Pedestrianize</button>
    <button data-action="scooter">Scooter Restriction</button>
    <button data-action="barrier">Noise Barrier</button>
  `;

  actionList.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => handleAction(button.dataset.action ?? ""));
  });

  const policyListEl = leftPanel.querySelector("#policy-list") as HTMLDivElement;
  policyListEl.innerHTML = policyList
    .map(
      (policy) => `
        <div class="card">
          <div><strong>${policy.name}</strong></div>
          <div class="small">${policy.description}</div>
          <div class="badge">PP ${policy.pp} · ${formatMoney(policy.cost)}</div>
          <button data-policy="${policy.id}">${policy.active ? "Repeal" : "Enact"}</button>
        </div>
      `
    )
    .join("");
  policyListEl.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => handlePolicy(button.dataset.policy ?? ""));
  });
}

function updateRightPanel() {
  if (selectedAgent) {
    rightPanel.innerHTML = `
      <h2>Agent</h2>
      <div class="card">
        <div><strong>${selectedAgent.type.toUpperCase()}</strong></div>
        <div class="small">Destination tile: ${selectedAgent.destination}</div>
        <div class="small">Path step: ${selectedAgent.pathIndex + 1}/${selectedAgent.path.length}</div>
        <div class="small">Position: (${selectedAgent.position.x.toFixed(2)}, ${selectedAgent.position.z.toFixed(2)})</div>
      </div>
    `;
    return;
  }
  if (selectedIndex === null) {
    rightPanel.innerHTML = `
      <h2>Selection</h2>
      <div class="card">Select a tile to inspect details.</div>
    `;
    return;
  }
  const type = tileType[selectedIndex];
  const name = tileTypeName(type);
  rightPanel.innerHTML = `
    <h2>Selection</h2>
    <div class="card">
      <div><strong>${name}</strong></div>
      <div class="small">Traffic ${(traffic[selectedIndex] * 100).toFixed(0)} · Noise ${(noise[selectedIndex] * 100).toFixed(0)}</div>
      <div class="small">Ped ${(ped[selectedIndex] * 100).toFixed(0)} · Income ${(income[selectedIndex] * 100).toFixed(0)}</div>
      <div class="small">Speed ${tileSpeed[selectedIndex] || 0} · Sidewalk ${(tileSidewalk[selectedIndex] * 100).toFixed(0)}%</div>
    </div>
    <div class="card small">One-way: ${tileOneWay[selectedIndex] ? directionName(tileOneWay[selectedIndex]) : "Two-way"}</div>
  `;
}

function tileTypeName(type: number) {
  switch (type) {
    case 0:
      return "Open space";
    case 1:
      return "Road";
    case 2:
      return "Residential";
    case 3:
      return "Commercial";
    case 4:
      return "Industrial";
    case 5:
      return "Park";
    case 6:
      return "School";
    case 7:
      return "Night Market";
    default:
      return "Unknown";
  }
}

function directionName(value: number) {
  if (value === 1) return "Northbound";
  if (value === 2) return "Eastbound";
  if (value === 3) return "Southbound";
  if (value === 4) return "Westbound";
  return "Two-way";
}

function formatMoney(value: number) {
  const sign = value < 0 ? "-" : "";
  const amount = Math.abs(value).toFixed(0);
  return `${sign}$${Number(amount).toLocaleString()}`;
}

function handleAction(action: string) {
  if (selectedIndex === null) {
    showToast("Select a road tile first.");
    return;
  }
  if (tileType[selectedIndex] !== 1) {
    showToast("Actions only apply to road tiles.");
    return;
  }

  let cost = 3000;
  let ppCost = 6;
  if (action === "sidewalk" && policyList.find((p) => p.id === "sidewalks")?.active) {
    cost = 1500;
  }
  if (state.cash < cost || state.politicalPoints < ppCost) {
    showToast("Not enough cash or political points.");
    return;
  }

  if (action === "toggle-oneway") {
    tileOneWay[selectedIndex] = (tileOneWay[selectedIndex] + 1) % 5;
  }
  if (action === "speed") {
    const current = tileSpeed[selectedIndex] || SPEED_OPTIONS[0];
    const nextIndex = (SPEED_OPTIONS.indexOf(current) + 1) % SPEED_OPTIONS.length;
    tileSpeed[selectedIndex] = SPEED_OPTIONS[nextIndex];
  }
  if (action === "sidewalk") {
    tileSidewalk[selectedIndex] = Math.min(0.28, tileSidewalk[selectedIndex] + 0.08);
  }
  if (action === "ped") {
    tilePedOnly[selectedIndex] = tilePedOnly[selectedIndex] > 0 ? 0 : 1;
  }
  if (action === "scooter") {
    tileScooterRestrict[selectedIndex] = tileScooterRestrict[selectedIndex] > 0 ? 0 : 1;
    state.recentDiscontent += 3;
  }
  if (action === "barrier") {
    tileNoiseBarrier[selectedIndex] = tileNoiseBarrier[selectedIndex] > 0 ? 0 : 1;
  }

  state.cash -= cost;
  state.politicalPoints -= ppCost;
  updateRightPanel();
  updateLeftPanel();
  showToast("Action applied.");
}

function handlePolicy(id: string) {
  const policy = policyList.find((p) => p.id === id);
  if (!policy) return;

  if (!policy.active) {
    if (state.politicalPoints < policy.pp || state.cash < policy.cost) {
      showToast("Not enough resources to enact policy.");
      return;
    }
    state.politicalPoints -= policy.pp;
    state.cash -= policy.cost;
    policy.active = true;
    state.recentDiscontent += 4;
    showToast(`${policy.name} enacted.`);
  } else {
    policy.active = false;
    state.recentDiscontent += 2;
    showToast(`${policy.name} repealed.`);
  }
  updateLeftPanel();
}

function saveGame() {
  const saveState = {
    ...state,
    achievements: Array.from(state.achievements)
  };
  const save = {
    state: saveState,
    tileType: Array.from(tileType),
    tileLanes: Array.from(tileLanes),
    tileSidewalk: Array.from(tileSidewalk),
    tileSpeed: Array.from(tileSpeed),
    tileOneWay: Array.from(tileOneWay),
    tilePedOnly: Array.from(tilePedOnly),
    tileScooterRestrict: Array.from(tileScooterRestrict),
    tileNoiseBarrier: Array.from(tileNoiseBarrier),
    policies: policyList.map((p) => ({ id: p.id, active: p.active }))
  };
  localStorage.setItem("sidewalk-save", JSON.stringify(save));
  showToast("Game saved.");
}

function loadGame() {
  const raw = localStorage.getItem("sidewalk-save");
  if (!raw) {
    showToast("No save found.");
    return;
  }
  const save = JSON.parse(raw);
  Object.assign(state, save.state);
  state.achievements = new Set(save.state.achievements ?? []);
  tileType.set(save.tileType);
  tileLanes.set(save.tileLanes);
  tileSidewalk.set(save.tileSidewalk);
  tileSpeed.set(save.tileSpeed);
  tileOneWay.set(save.tileOneWay);
  tilePedOnly.set(save.tilePedOnly);
  tileScooterRestrict.set(save.tileScooterRestrict);
  tileNoiseBarrier.set(save.tileNoiseBarrier);
  save.policies.forEach((p: { id: string; active: boolean }) => {
    const policy = policyList.find((item) => item.id === p.id);
    if (policy) policy.active = p.active;
  });
  rebuildTileIndex();
  buildBuildingInstances();
  showToast("Save loaded.");
  updateLeftPanel();
  updateRightPanel();
}

function passable(index: number) {
  return tileType[index] === 1 && tilePedOnly[index] === 0;
}

function neighbors(index: number) {
  const x = index % GRID_WIDTH;
  const y = Math.floor(index / GRID_WIDTH);
  const list: number[] = [];
  if (x > 0) list.push(index - 1);
  if (x < GRID_WIDTH - 1) list.push(index + 1);
  if (y > 0) list.push(index - GRID_WIDTH);
  if (y < GRID_HEIGHT - 1) list.push(index + GRID_WIDTH);
  return list;
}

function isMoveAllowed(from: number, to: number) {
  const dir = tileOneWay[from];
  if (dir === 0) return true;
  const fx = from % GRID_WIDTH;
  const fy = Math.floor(from / GRID_WIDTH);
  const tx = to % GRID_WIDTH;
  const ty = Math.floor(to / GRID_WIDTH);
  if (dir === 1) return ty < fy;
  if (dir === 2) return tx > fx;
  if (dir === 3) return ty > fy;
  if (dir === 4) return tx < fx;
  return true;
}

function aStar(start: number, goal: number) {
  const open: number[] = [start];
  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>();
  gScore.set(start, 0);

  function heuristic(a: number, b: number) {
    const ax = a % GRID_WIDTH;
    const ay = Math.floor(a / GRID_WIDTH);
    const bx = b % GRID_WIDTH;
    const by = Math.floor(b / GRID_WIDTH);
    return Math.abs(ax - bx) + Math.abs(ay - by);
  }

  while (open.length > 0) {
    open.sort((a, b) => (gScore.get(a) ?? 0) + heuristic(a, goal) - ((gScore.get(b) ?? 0) + heuristic(b, goal)));
    const current = open.shift();
    if (current === undefined) break;
    if (current === goal) {
      const path = [current];
      let temp = current;
      while (cameFrom.has(temp)) {
        temp = cameFrom.get(temp) as number;
        path.push(temp);
      }
      return path;
    }
    for (const next of neighbors(current)) {
      if (!passable(next)) continue;
      if (!isMoveAllowed(current, next)) continue;
      const tentative = (gScore.get(current) ?? 0) + 1;
      if (tentative < (gScore.get(next) ?? Infinity)) {
        cameFrom.set(next, current);
        gScore.set(next, tentative);
        if (!open.includes(next)) open.push(next);
      }
    }
  }
  return null;
}

function randomTile(type: number) {
  const list = tileIndicesByType[type] ?? [];
  if (list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function runTrips(count: number) {
  traffic.fill(0);

  for (let i = 0; i < count; i++) {
    const start = randomTile(2);
    const end = randomTile(Math.random() > 0.6 ? 3 : 4);
    if (start === null || end === null) continue;
    const startRoad = findNearestRoad(start);
    const endRoad = findNearestRoad(end);
    if (startRoad === null || endRoad === null) continue;
    const path = aStar(startRoad, endRoad);
    if (!path) continue;
    for (const step of path) {
      traffic[step] += 0.01;
    }
  }
}

function spawnAgents() {
  agents.length = 0;
  const types: AgentType[] = ["pedestrian", "scooter", "car", "truck"];
  for (let i = 0; i < 80; i++) {
    const type = types[i % types.length];
    const start = randomTile(2) ?? randomTile(3);
    const end = randomTile(3) ?? randomTile(2);
    if (start === null || end === null) continue;
    const startRoad = findNearestRoad(start);
    const endRoad = findNearestRoad(end);
    if (startRoad === null || endRoad === null) continue;
    const path = aStar(startRoad, endRoad) ?? [];
    const startPos = tileCenter(startRoad);
    agents.push({
      id: i,
      type,
      path,
      pathIndex: 0,
      progress: 0,
      position: { x: startPos.x, z: startPos.z },
      destination: endRoad
    });
  }
}

function agentSpeed(type: AgentType) {
  if (type === "pedestrian") return 0.3;
  if (type === "scooter") return 0.7;
  if (type === "car") return 0.5;
  return 0.4;
}

function updateAgents(dt: number) {
  for (const agent of agents) {
    if (agent.path.length === 0) continue;
    const currentIndex = agent.path[agent.pathIndex];
    const nextIndex = agent.path[Math.min(agent.pathIndex + 1, agent.path.length - 1)];
    const currentPos = tileCenter(currentIndex);
    const nextPos = tileCenter(nextIndex);
    const speed = agentSpeed(agent.type) * dt;
    agent.progress += speed;
    if (agent.progress >= 1) {
      agent.pathIndex = Math.min(agent.pathIndex + 1, agent.path.length - 1);
      agent.progress = 0;
      if (agent.pathIndex >= agent.path.length - 1) {
        const newEnd = randomTile(Math.random() > 0.6 ? 3 : 2);
        const newEndRoad = newEnd !== null ? findNearestRoad(newEnd) : null;
        if (newEndRoad !== null) {
          agent.destination = newEndRoad;
          const newPath = aStar(currentIndex, newEndRoad);
          if (newPath) {
            agent.path = newPath;
            agent.pathIndex = 0;
          }
        }
      }
    }
    const t = agent.progress;
    agent.position.x = currentPos.x + (nextPos.x - currentPos.x) * t;
    agent.position.z = currentPos.z + (nextPos.z - currentPos.z) * t;
  }
}

function updateAgentInstances() {
  const data = new Float32Array(agents.length * 4);
  agents.forEach((agent, i) => {
    const base = i * 4;
    data[base] = agent.position.x;
    data[base + 1] = agent.position.z;
    data[base + 2] = agent.type === "pedestrian" ? 0.18 : agent.type === "scooter" ? 0.22 : agent.type === "car" ? 0.3 : 0.4;
    data[base + 3] = agent.type === "pedestrian" ? 0 : agent.type === "scooter" ? 1 : agent.type === "car" ? 2 : 3;
  });
  gl.bindBuffer(gl.ARRAY_BUFFER, agentInstanceBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
}

function findNearestRoad(index: number) {
  const queue: number[] = [index];
  const visited = new Set<number>([index]);
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    if (tileType[current] === 1 && tilePedOnly[current] === 0) return current;
    for (const next of neighbors(current)) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return null;
}

function evaluateSimulation(dt: number) {
  const policyEffects = {
    trafficFactor: 1,
    incomeBonus: 0,
    noiseFactor: 1,
    sidewalkBonus: 0,
    speedCap: 50,
    transitFactor: 1
  };

  if (policyList.find((p) => p.id === "congestion")?.active) {
    policyEffects.trafficFactor *= 0.85;
    policyEffects.incomeBonus += 0.05;
  }
  if (policyList.find((p) => p.id === "scooter")?.active) {
    policyEffects.noiseFactor *= 0.85;
    state.recentDiscontent += 0.01;
  }
  if (policyList.find((p) => p.id === "curfew")?.active) {
    policyEffects.noiseFactor *= 0.9;
  }
  if (policyList.find((p) => p.id === "sidewalks")?.active) {
    policyEffects.sidewalkBonus += 0.1;
  }
  if (policyList.find((p) => p.id === "transit")?.active) {
    policyEffects.transitFactor *= 0.9;
  }
  if (policyList.find((p) => p.id === "parking")?.active) {
    policyEffects.trafficFactor *= 0.92;
  }
  if (policyList.find((p) => p.id === "vendors")?.active) {
    policyEffects.incomeBonus += 0.08;
    policyEffects.noiseFactor *= 1.05;
  }
  if (policyList.find((p) => p.id === "vision")?.active) {
    policyEffects.speedCap = 30;
    policyEffects.sidewalkBonus += 0.05;
  }

  const tripCount = Math.floor(state.population / 1200) * policyEffects.trafficFactor * policyEffects.transitFactor;
  runTrips(Math.max(20, tripCount));

  let totalIncome = 0;
  let totalNoise = 0;
  let totalPed = 0;
  let totalCongestion = 0;
  let roadCount = 0;
  let happyTotal = 0;

  for (let i = 0; i < TILE_COUNT; i++) {
    const type = tileType[i];
    if (type !== 1) continue;
    const speed = Math.min(tileSpeed[i], policyEffects.speedCap);
    const capacity = Math.max(0.2, tileLanes[i]) * (speed / 30) * (tilePedOnly[i] ? 0.1 : 1);
    const congestion = Math.min(1, traffic[i] / capacity);
    const scooterPenalty = tileScooterRestrict[i] ? -0.1 : 0;
    const barrier = tileNoiseBarrier[i] ? 0.7 : 1;
    noise[i] = (congestion * 0.7 + speed / 100) * policyEffects.noiseFactor * barrier;
    ped[i] =
      0.3 +
      tileSidewalk[i] * 2 +
      policyEffects.sidewalkBonus -
      congestion * 0.4 +
      scooterPenalty +
      (tilePedOnly[i] ? 0.4 : 0);
    income[i] = 0.0;
    happinessTile[i] = clamp01(0.5 + ped[i] * 0.3 - noise[i] * 0.3);
    totalNoise += noise[i];
    totalPed += ped[i];
    totalCongestion += congestion;
    roadCount += 1;
  }

  for (let i = 0; i < TILE_COUNT; i++) {
    const type = tileType[i];
    if (type === 1) continue;
    const neighborNoise = neighbors(i)
      .filter((n) => tileType[n] === 1)
      .reduce((sum, n) => sum + noise[n], 0);
    const neighborCount = neighbors(i).filter((n) => tileType[n] === 1).length;
    const propagatedNoise = neighborCount > 0 ? neighborNoise / neighborCount : 0.05;
    noise[i] = propagatedNoise * 0.6 + noise[i] * 0.2;
    ped[i] = Math.max(0.2, ped[i] * 0.9 + 0.3);
    const baseIncome = type === 3 ? 0.9 : type === 4 ? 0.6 : type === 7 ? 0.8 : 0.2;
    income[i] = baseIncome * (1 + policyEffects.incomeBonus) * clamp01(1 - noise[i] * 0.3 + ped[i] * 0.3);
    happinessTile[i] = clamp01(0.45 + ped[i] * 0.4 - noise[i] * 0.35);
    totalIncome += income[i];
    happyTotal += happinessTile[i];
  }

  const avgNoise = totalNoise / Math.max(1, roadCount);
  const avgPed = totalPed / Math.max(1, roadCount);
  const avgCongestion = totalCongestion / Math.max(1, roadCount);

  const economy = totalIncome * 1200;
  const taxRevenue = economy * state.taxRate;
  const maintenance = 6000 + roadCount * 8;
  const policyCosts = policyList.filter((p) => p.active).length * 900;
  const interestPayment = state.debt * state.interestRate * dt / 60;

  state.monthlyBalance = taxRevenue - maintenance - policyCosts - interestPayment;
  state.cash += state.monthlyBalance * dt;
  if (state.cash < 0) {
    state.debt += Math.abs(state.monthlyBalance) * dt * 0.5;
  }
  state.debt = Math.max(0, state.debt - Math.max(0, state.cash) * 0.02);
  state.interestRate = clamp(0.04 + state.debt / 800000, 0.04, 0.12);

  const happinessBase = 60 + avgPed * 20 - avgNoise * 25 - avgCongestion * 20 - state.taxRate * 35;
  state.happiness = clamp(happinessBase + clamp01(happyTotal / TILE_COUNT) * 8 - state.recentDiscontent, 0, 100);
  state.approval = clamp(
    state.happiness + (state.monthlyBalance > 0 ? 5 : -5) - state.debt / 100000,
    0,
    100
  );

  if (state.happiness > 60) {
    state.population += (state.happiness - 60) * 0.6;
  } else if (state.happiness < 45) {
    state.population -= (45 - state.happiness) * 0.5;
  }
  state.population = Math.max(10000, state.population);

  state.politicalPoints += dt * (0.4 + state.happiness / 100 + state.population / 100000);
  state.recentDiscontent = Math.max(0, state.recentDiscontent - dt * 0.2);
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function checkWinLose() {
  if (state.lost || state.won) return;
  if (state.cash < -MAX_CASH_DEFICIT || state.debt > MAX_DEBT) {
    state.lost = true;
    showModal("Bankruptcy!", "The city has fallen into a debt spiral. You are forced to resign.");
    return;
  }
  if (state.electionTimer <= 0) {
    state.electionCount += 1;
    if (state.approval < REQUIRED_APPROVAL) {
      state.lost = true;
      showModal("Election Lost", "Voters rejected your chaotic reforms. Game over.");
      return;
    }
    state.electionTimer = quickElections ? QUICK_ELECTION_INTERVAL : ELECTION_INTERVAL;
    showModal("Election Night", `You held on to power! Elections survived: ${state.electionCount}`);
    if (state.electionCount >= 3 && state.approval > 60) {
      state.won = true;
      showModal("Victory!", "Three elections survived and the city is thriving.");
    }
  }
}

let frameCounter = 0;
function tick(dt: number) {
  if (state.lost || state.won) return;
  state.time += dt;
  state.electionTimer -= dt;
  evaluateSimulation(dt);
  updateAgents(dt);
  frameCounter++;
  if (frameCounter % 2 === 0) {
    updateTextures();
    updateHud();
    updateRightPanel();
  }
  updateAgentInstances();
}

function loop() {
  const step = 1 / 30;
  let accumulator = 0;
  let last = performance.now();
  function frame(now: number) {
    const delta = (now - last) / 1000;
    last = now;
    accumulator += delta * simSpeed;
    while (accumulator >= step) {
      tick(step);
      accumulator -= step;
    }
    render();
    checkWinLose();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

canvas.addEventListener("click", (event) => {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  updateCamera();
  let pickedAgent: Agent | null = null;
  let minDist = Infinity;
  agents.forEach((agent) => {
    const screen = projectToScreen({ x: agent.position.x, y: 0.2, z: agent.position.z });
    const dx = screen.x - x;
    const dy = screen.y - y;
    const dist = Math.hypot(dx, dy);
    if (dist < 14 && dist < minDist) {
      pickedAgent = agent;
      minDist = dist;
    }
  });
  if (pickedAgent) {
    selectedAgent = pickedAgent;
    selectedIndex = null;
    selection.fill(0);
    updateRightPanel();
    return;
  }
  selectedAgent = null;
  const worldPos = screenToWorld(x, y, invViewProj);
  if (worldPos) {
    const tileX = clamp(Math.floor(worldPos.x), 0, GRID_WIDTH - 1);
    const tileY = clamp(Math.floor(worldPos.z), 0, GRID_HEIGHT - 1);
    const idx = indexFor(tileX, tileY);
    selectedIndex = idx;
    selection.fill(0);
    selection[idx] = 1;
    updateRightPanel();
    updateTextures();
  }
});

canvas.addEventListener("mousedown", (event) => {
  if (event.button === 0) {
    isDragging = true;
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;
  }
});

canvas.addEventListener("mousemove", (event) => {
  if (isDragging) {
    const dx = event.clientX - lastMouseX;
    const dy = event.clientY - lastMouseY;
    cameraPanX -= dx * 0.03;
    cameraPanZ += dy * 0.03;
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;
  }
});

canvas.addEventListener("mouseup", () => {
  isDragging = false;
});

canvas.addEventListener("mouseleave", () => {
  isDragging = false;
});

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  const zoomSpeed = 0.002;
  cameraDistance = clamp(cameraDistance + event.deltaY * zoomSpeed, 10, 50);
}, { passive: false });

function initUI() {
  updateHud();
  updateLeftPanel();
  updateRightPanel();
  updateBottomBar();
  showModal(
    "Mayor, welcome to Sidewalk Savior",
    "Your city is infamous for missing sidewalks and scooter swarms. Fix the chaos without losing elections or bankrupting the treasury."
  );
}

initUI();
updateTextures();
updateAgentInstances();
loop();
