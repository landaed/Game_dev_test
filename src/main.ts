import vertSource from "./shaders/city.vert?raw";
import fragSource from "./shaders/city.frag?raw";
import roadVert from "./shaders/road.vert?raw";
import roadFrag from "./shaders/road.frag?raw";
import postVert from "./shaders/post.vert?raw";
import postFrag from "./shaders/post.frag?raw";
import buildingVert from "./shaders/building.vert?raw";
import buildingFrag from "./shaders/building.frag?raw";
import agentVert from "./shaders/agent.vert?raw";
import agentFrag from "./shaders/agent.frag?raw";
import "./styles.css";

type TileType = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
type AgentType = "pedestrian" | "scooter" | "car" | "truck";

enum TileKind {
  GRASS = 0,
  ROAD = 1,
  RESIDENTIAL = 2,
  COMMERCIAL = 3,
  INDUSTRIAL = 4,
  PARK = 5,
  SCHOOL = 6,
  NIGHT_MARKET = 7,
  TEMPLE = 8,
  MALL = 9
}

interface WFCTile {
  type: TileType;
  connections: { north: boolean; east: boolean; south: boolean; west: boolean };
  oneWay?: number;
  weight: number;
}

const WFC_TILES: WFCTile[] = [
  // Grass/open
  { type: 0, connections: { north: false, east: false, south: false, west: false }, weight: 5 },
  // Four-way intersection
  { type: 1, connections: { north: true, east: true, south: true, west: true }, weight: 2 },
  // T-junctions
  { type: 1, connections: { north: true, east: true, south: true, west: false }, weight: 3 },
  { type: 1, connections: { north: true, east: false, south: true, west: true }, weight: 3 },
  { type: 1, connections: { north: true, east: true, south: false, west: true }, weight: 3 },
  { type: 1, connections: { north: false, east: true, south: true, west: true }, weight: 3 },
  // Straight roads
  { type: 1, connections: { north: true, east: false, south: true, west: false }, weight: 4 },
  { type: 1, connections: { north: false, east: true, south: false, west: true }, weight: 4 },
  // Corners
  { type: 1, connections: { north: true, east: true, south: false, west: false }, weight: 5 },
  { type: 1, connections: { north: true, east: false, south: false, west: true }, weight: 5 },
  { type: 1, connections: { north: false, east: true, south: true, west: false }, weight: 5 },
  { type: 1, connections: { north: false, east: false, south: true, west: true }, weight: 5 },
  // Dead ends (keep rare)
  { type: 1, connections: { north: true, east: false, south: false, west: false }, weight: 0.35 },
  { type: 1, connections: { north: false, east: true, south: false, west: false }, weight: 0.35 },
  { type: 1, connections: { north: false, east: false, south: true, west: false }, weight: 0.35 },
  { type: 1, connections: { north: false, east: false, south: false, west: true }, weight: 0.35 },
  // Buildings - no road connections
  { type: 2, connections: { north: false, east: false, south: false, west: false }, weight: 15 },
  { type: 3, connections: { north: false, east: false, south: false, west: false }, weight: 12 },
  { type: 4, connections: { north: false, east: false, south: false, west: false }, weight: 8 },
  { type: 5, connections: { north: false, east: false, south: false, west: false }, weight: 4 },
  { type: 6, connections: { north: false, east: false, south: false, west: false }, weight: 3 },
  { type: 7, connections: { north: false, east: false, south: false, west: false }, weight: 3 },
  { type: 8, connections: { north: false, east: false, south: false, west: false }, weight: 2 },
  { type: 9, connections: { north: false, east: false, south: false, west: false }, weight: 2 },
];

class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private uiGain: GainNode | null = null;
  private gameGain: GainNode | null = null;
  private listener: AudioListener | null = null;
  private ambientSources: Map<string, AudioBufferSourceNode> = new Map();
  private initialized = false;

  async init() {
    if (this.initialized) return;
    try {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.3;
      this.masterGain.connect(this.ctx.destination);

      this.uiGain = this.ctx.createGain();
      this.uiGain.gain.value = 0.5;
      this.uiGain.connect(this.masterGain);

      this.gameGain = this.ctx.createGain();
      this.gameGain.gain.value = 0.4;
      this.gameGain.connect(this.masterGain);

      this.listener = this.ctx.listener;
      this.initialized = true;
    } catch (e) {
      console.warn("Audio context init failed:", e);
    }
  }

  private createTone(freq: number, duration: number, type: OscillatorType = "sine"): AudioBuffer | null {
    if (!this.ctx) return null;
    const sampleRate = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, duration * sampleRate, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const envelope = Math.exp(-3 * t);
      if (type === "sine") {
        data[i] = Math.sin(2 * Math.PI * freq * t) * envelope;
      } else if (type === "square") {
        data[i] = (Math.sin(2 * Math.PI * freq * t) > 0 ? 1 : -1) * envelope;
      } else if (type === "sawtooth") {
        data[i] = (2 * ((freq * t) % 1) - 1) * envelope;
      }
    }
    return buffer;
  }

  private createNoise(duration: number, color: "white" | "pink" = "white"): AudioBuffer | null {
    if (!this.ctx) return null;
    const sampleRate = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, duration * sampleRate, sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      if (color === "pink") {
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      } else {
        data[i] = white;
      }
      const t = i / sampleRate;
      const envelope = Math.exp(-2 * t);
      data[i] *= envelope * 0.3;
    }
    return buffer;
  }

  playUIClick() {
    if (!this.ctx || !this.uiGain) return;
    const buffer = this.createTone(800, 0.08, "sine");
    if (!buffer) return;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.2;
    source.connect(gain);
    gain.connect(this.uiGain);
    source.start();
  }

  playUIHover() {
    if (!this.ctx || !this.uiGain) return;
    const buffer = this.createTone(1200, 0.05, "sine");
    if (!buffer) return;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.1;
    source.connect(gain);
    gain.connect(this.uiGain);
    source.start();
  }

  playUISuccess() {
    if (!this.ctx || !this.uiGain) return;
    const osc = this.ctx.createOscillator();
    osc.frequency.setValueAtTime(600, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(900, this.ctx.currentTime + 0.15);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(this.uiGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  }

  playUIError() {
    if (!this.ctx || !this.uiGain) return;
    const osc = this.ctx.createOscillator();
    osc.frequency.setValueAtTime(400, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, this.ctx.currentTime + 0.2);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(this.uiGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }

  playSelectionPing() {
    if (!this.ctx || !this.uiGain) return;
    const osc = this.ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(520, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(820, this.ctx.currentTime + 0.1);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(this.uiGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.12);
  }

  playActionThump() {
    if (!this.ctx || !this.uiGain) return;
    const buffer = this.createNoise(0.12, "white");
    if (!buffer) return;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 480;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.18;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.uiGain);
    source.start();
  }

  playPolicyToggle() {
    if (!this.ctx || !this.uiGain) return;
    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(260, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(340, this.ctx.currentTime + 0.18);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(this.uiGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.18);
  }

  updateListener(x: number, y: number, z: number, lookX: number, lookY: number, lookZ: number) {
    if (!this.listener || !this.ctx) return;
    if (this.listener.positionX) {
      this.listener.positionX.value = x;
      this.listener.positionY.value = y;
      this.listener.positionZ.value = z;
      this.listener.forwardX.value = lookX - x;
      this.listener.forwardY.value = lookY - y;
      this.listener.forwardZ.value = lookZ - z;
      this.listener.upY.value = 1;
    }
  }

  startAmbientTraffic() {
    if (!this.ctx || !this.gameGain || this.ambientSources.has("traffic")) return;
    const buffer = this.createNoise(4, "pink");
    if (!buffer) return;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const panner = this.ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "exponential";
    panner.refDistance = 5;
    panner.maxDistance = 30;
    panner.rolloffFactor = 2;
    panner.positionX.value = GRID_WIDTH * 0.5;
    panner.positionY.value = 0;
    panner.positionZ.value = GRID_HEIGHT * 0.5;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.15;
    source.connect(gain);
    gain.connect(panner);
    panner.connect(this.gameGain);
    source.start();
    this.ambientSources.set("traffic", source);
  }

  stopAllAmbient() {
    this.ambientSources.forEach(source => {
      source.stop();
      source.disconnect();
    });
    this.ambientSources.clear();
  }

  setGameVolume(distance: number) {
    if (!this.gameGain) return;
    const maxDist = 35;
    const minDist = 15;
    const volume = distance > maxDist ? 0 : distance < minDist ? 0.4 : 0.4 * (1 - (distance - minDist) / (maxDist - minDist));
    this.gameGain.gain.setValueAtTime(volume, this.ctx?.currentTime || 0);
  }
}

const audioEngine = new AudioEngine();

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
const compassNeedle = document.querySelector(".compass-needle") as HTMLDivElement | null;

let viewMode = 0;
let simSpeed = 1;
let quickElections = true;
let selectedIndex: number | null = null;

let cameraDistance = 28;
let cameraAngle = Math.PI / 6;
let cameraTilt = Math.PI / 4;
let cameraPanX = 0;
let cameraPanZ = 0;
let isDraggingPan = false;
let isDraggingRotate = false;
let lastMouseX = 0;
let lastMouseY = 0;

const tileType = new Float32Array(TILE_COUNT);
const tileLanes = new Float32Array(TILE_COUNT);
const tileSidewalk = new Float32Array(TILE_COUNT);
const tileSpeed = new Float32Array(TILE_COUNT);
const tileOneWay = new Float32Array(TILE_COUNT);
const tileDirMask = new Float32Array(TILE_COUNT);
const tilePedOnly = new Float32Array(TILE_COUNT);
const tileScooterRestrict = new Float32Array(TILE_COUNT);
const tileNoiseBarrier = new Float32Array(TILE_COUNT);
const tileRoadSegment = new Int16Array(TILE_COUNT);
const roadClass = new Uint8Array(TILE_COUNT);
const tileCrosswalk = new Float32Array(TILE_COUNT);
const tileSignal = new Float32Array(TILE_COUNT);
const tileSignalOffset = new Float32Array(TILE_COUNT);

const traffic = new Float32Array(TILE_COUNT);
const noise = new Float32Array(TILE_COUNT);
const ped = new Float32Array(TILE_COUNT);
const income = new Float32Array(TILE_COUNT);
const happinessTile = new Float32Array(TILE_COUNT);
const selection = new Float32Array(TILE_COUNT);

const tileDataTexels = new Float32Array(TILE_COUNT * 4);
const metrics0Texels = new Float32Array(TILE_COUNT * 4);
const metrics1Texels = new Float32Array(TILE_COUNT * 4);
const metrics2Texels = new Float32Array(TILE_COUNT * 4);

type Agent = {
  id: number;
  type: AgentType;
  path: number[];
  pathIndex: number;
  progress: number;
  position: { x: number; z: number };
  destination: number;
  laneBias: number;
  splineSegment: number | null;
  splineProgress: number;
  splineDirection: number;
};

type RoadPoint = { x: number; z: number };
type RoadWidth = "wide" | "medium" | "narrow";
type RoadSegment = {
  id: number;
  tiles: number[];
  points: RoadPoint[];
  lanes: number;
  sidewalk: number;
  speed: number;
  isArterial: boolean;
  hasCrosswalk: boolean;
  hasSignal: boolean;
  oneWay: number;
  roadWidth: RoadWidth;
};

type Intersection = {
  position: { x: number; z: number };
  connectedSegments: number[];
  size: number;
  hasSignal: boolean;
};

const agents: Agent[] = [];
let selectedAgent: Agent | null = null;
let selectedRoadSegment: number | null = null;
let buildingInstanceCount = 0;
let buildingInstances = new Float32Array(0);
let roadSegments: RoadSegment[] = [];
let roadPolylines: { points: RoadPoint[]; isArterial: boolean; roadWidth: RoadWidth }[] = [];
let roadInstanceCount = 0;
let roadInstances = new Float32Array(0);
let intersections: Intersection[] = [];

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
const roadProgram = createProgram(roadVert, roadFrag);
const postProgram = createProgram(postVert, postFrag);
const buildingProgram = createProgram(buildingVert, buildingFrag);
const agentProgram = createProgram(agentVert, agentFrag);

const positionBuffer = gl.createBuffer();
const roadPositionBuffer = gl.createBuffer();
const cubeBuffer = gl.createBuffer();
const groundVao = gl.createVertexArray();
const roadVao = gl.createVertexArray();
const postVao = gl.createVertexArray();
const buildingVao = gl.createVertexArray();
const agentVao = gl.createVertexArray();
const buildingInstanceBuffer = gl.createBuffer();
const agentInstanceBuffer = gl.createBuffer();
const roadInstanceBuffer = gl.createBuffer();

if (!groundVao || !roadVao || !postVao || !positionBuffer || !roadPositionBuffer || !cubeBuffer || !buildingVao || !agentVao || !buildingInstanceBuffer || !agentInstanceBuffer || !roadInstanceBuffer) {
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

const roadQuad = new Float32Array([
  -0.5, 0,
  0.5, 0,
  -0.5, 1,
  -0.5, 1,
  0.5, 0,
  0.5, 1
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
const uHideRoadTiles = gl.getUniformLocation(groundProgram, "u_hideRoadTiles");
const uBuildingViewProj = gl.getUniformLocation(buildingProgram, "u_viewProj");
const uAgentViewProj = gl.getUniformLocation(agentProgram, "u_viewProj");
const uRoadViewProj = gl.getUniformLocation(roadProgram, "u_viewProj");
const uRoadTime = gl.getUniformLocation(roadProgram, "u_time");
const uPostScene = gl.getUniformLocation(postProgram, "u_scene");
const uPostDepth = gl.getUniformLocation(postProgram, "u_depth");
const uPostResolution = gl.getUniformLocation(postProgram, "u_resolution");
const uPostFocus = gl.getUniformLocation(postProgram, "u_focusDistance");

const tileDataTex = gl.createTexture();
const metrics0Tex = gl.createTexture();
const metrics1Tex = gl.createTexture();
const metrics2Tex = gl.createTexture();
const sceneColorTex = gl.createTexture();
const sceneDepthTex = gl.createTexture();
const sceneFbo = gl.createFramebuffer();

if (!tileDataTex || !metrics0Tex || !metrics1Tex || !metrics2Tex || !sceneColorTex || !sceneDepthTex || !sceneFbo) {
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
setupTexture(metrics2Tex);
setupTexture(sceneColorTex);
setupTexture(sceneDepthTex);

function resizeCanvas() {
  const { clientWidth, clientHeight } = canvas;
  if (canvas.width !== clientWidth || canvas.height !== clientHeight) {
    canvas.width = clientWidth;
    canvas.height = clientHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.bindTexture(gl.TEXTURE_2D, sceneColorTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindTexture(gl.TEXTURE_2D, sceneDepthTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, canvas.width, canvas.height, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneColorTex, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, sceneDepthTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
}

function updateCamera() {
  const aspect = canvas.width / Math.max(1, canvas.height);
  const fov = Math.PI / 3;
  const projection = mat4Perspective(fov, aspect, 0.1, 200);
  const centerX = clamp(GRID_WIDTH * 0.5 + cameraPanX, 5, GRID_WIDTH - 5);
  const centerZ = clamp(GRID_HEIGHT * 0.5 + cameraPanZ, 5, GRID_HEIGHT - 5);
  cameraPanX = centerX - GRID_WIDTH * 0.5;
  cameraPanZ = centerZ - GRID_HEIGHT * 0.5;
  const horizontalDist = cameraDistance * Math.cos(cameraTilt);
  const eyeX = centerX + Math.sin(cameraAngle) * horizontalDist;
  const eyeY = cameraDistance * Math.sin(cameraTilt);
  const eyeZ = centerZ + Math.cos(cameraAngle) * horizontalDist;
  const eye: [number, number, number] = [eyeX, eyeY, eyeZ];
  const target: [number, number, number] = [centerX, 0, centerZ];
  const view = mat4LookAt(eye, target, [0, 1, 0]);
  viewProj = mat4Multiply(projection, view);
  invViewProj = mat4Invert(viewProj);

  audioEngine.updateListener(eyeX, eyeY, eyeZ, centerX, 0, centerZ);
  audioEngine.setGameVolume(cameraDistance);

  if (compassNeedle) {
    const heading = -cameraAngle * (180 / Math.PI);
    compassNeedle.style.transform = `rotate(${heading}deg)`;
  }
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
  [2, 3, 4, 5, 6, 7, 8, 9].forEach((type) => {
    tileIndicesByType[type] = [];
  });
}

function tilesCompatible(tile1: WFCTile, tile2: WFCTile, direction: 'north' | 'east' | 'south' | 'west'): boolean {
  const opposites = { north: 'south', east: 'west', south: 'north', west: 'east' } as const;
  const opposite = opposites[direction];
  const tile1Connects = tile1.connections[direction];
  const tile2Connects = tile2.connections[opposite];

  if (tile1.type === 1) {
    if (tile1Connects) {
      return tile2.type === 1 && tile2Connects;
    }
    return tile2.type !== 1;
  }

  if (tile2.type === 1) {
    return !tile2Connects;
  }

  return tile1Connects === tile2Connects;
}

function connectionMask(connections: WFCTile["connections"]) {
  let mask = 0;
  if (connections.north) mask |= 1;
  if (connections.east) mask |= 2;
  if (connections.south) mask |= 4;
  if (connections.west) mask |= 8;
  return mask;
}

function deriveRoadMaskFromNeighbors() {
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      const idx = indexFor(x, y);
      if (tileType[idx] !== 1) {
        tileDirMask[idx] = 0;
        continue;
      }
      const north = y > 0 && tileType[indexFor(x, y - 1)] === 1;
      const east = x < GRID_WIDTH - 1 && tileType[indexFor(x + 1, y)] === 1;
      const south = y < GRID_HEIGHT - 1 && tileType[indexFor(x, y + 1)] === 1;
      const west = x > 0 && tileType[indexFor(x - 1, y)] === 1;
      let mask = 0;
      if (north) mask |= 1;
      if (east) mask |= 2;
      if (south) mask |= 4;
      if (west) mask |= 8;
      tileDirMask[idx] = mask;
    }
  }
}

function randomRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function distanceToSegment(point: RoadPoint, start: RoadPoint, end: RoadPoint) {
  const vx = end.x - start.x;
  const vz = end.z - start.z;
  const wx = point.x - start.x;
  const wz = point.z - start.z;
  const lenSq = vx * vx + vz * vz;
  const t = lenSq > 0 ? clamp((wx * vx + wz * vz) / lenSq, 0, 1) : 0;
  const cx = start.x + vx * t;
  const cz = start.z + vz * t;
  const dx = point.x - cx;
  const dz = point.z - cz;
  return { dist: Math.hypot(dx, dz), t };
}

function generateRoadSplines() {
  roadPolylines = [];
  tileType.fill(0);
  tileLanes.fill(0);
  tileSidewalk.fill(0);
  tileSpeed.fill(0);
  tileOneWay.fill(0);
  tileDirMask.fill(0);
  tilePedOnly.fill(0);
  tileScooterRestrict.fill(0);
  tileNoiseBarrier.fill(0);
  tileRoadSegment.fill(-1);
  roadClass.fill(0);
  tileCrosswalk.fill(0);
  tileSignal.fill(0);
  tileSignalOffset.fill(0);
  resetTileIndex();

  const horizontalCount = 3;
  const verticalCount = 3;
  const amplitude = 2.4;
  const phaseSeed = Math.random() * Math.PI * 2;

  for (let i = 0; i < horizontalCount; i++) {
    const baseY = Math.round(((i + 1) * GRID_HEIGHT) / (horizontalCount + 1));
    const phase = phaseSeed + i * 1.7;
    const points: RoadPoint[] = [];
    for (let x = 0; x < GRID_WIDTH; x++) {
      const wobble = Math.sin((x / GRID_WIDTH) * Math.PI * 2 + phase) * amplitude;
      const y = clamp(baseY + wobble, 1, GRID_HEIGHT - 2);
      points.push({ x, z: y });
    }
    roadPolylines.push({ points, isArterial: true, roadWidth: "wide" });
  }

  for (let i = 0; i < verticalCount; i++) {
    const baseX = Math.round(((i + 1) * GRID_WIDTH) / (verticalCount + 1));
    const phase = phaseSeed + i * 1.9;
    const points: RoadPoint[] = [];
    for (let y = 0; y < GRID_HEIGHT; y++) {
      const wobble = Math.sin((y / GRID_HEIGHT) * Math.PI * 2 + phase) * amplitude;
      const x = clamp(baseX + wobble, 1, GRID_WIDTH - 2);
      points.push({ x, z: y });
    }
    roadPolylines.push({ points, isArterial: true, roadWidth: "wide" });
  }

  for (let x = 2; x < GRID_WIDTH - 2; x += 6) {
    for (let y = 2; y < GRID_HEIGHT - 2; y += 6) {
      if (Math.random() < 0.5) {
        const endY = clamp(y + (Math.random() > 0.5 ? 4 : -4), 1, GRID_HEIGHT - 2);
        const rand = Math.random();
        const roadWidth: RoadWidth = rand < 0.3 ? "narrow" : rand < 0.7 ? "medium" : "wide";
        roadPolylines.push({ points: [{ x, z: y }, { x, z: endY }], isArterial: false, roadWidth });
      }
      if (Math.random() < 0.5) {
        const endX = clamp(x + (Math.random() > 0.5 ? 4 : -4), 1, GRID_WIDTH - 2);
        const rand = Math.random();
        const roadWidth: RoadWidth = rand < 0.3 ? "narrow" : rand < 0.7 ? "medium" : "wide";
        roadPolylines.push({ points: [{ x, z: y }, { x: endX, z: y }], isArterial: false, roadWidth });
      }
    }
  }
}

function applySplineRoadsToGrid() {
  roadSegments = roadPolylines.map((spline, idx) => {
    const isArterial = spline.isArterial;
    const roadWidth = spline.roadWidth;

    let lanes: number;
    let sidewalk: number;
    let baseSpeed: number;

    if (roadWidth === "wide") {
      lanes = 2;
      sidewalk = randomRange(0.08, 0.14);
      baseSpeed = isArterial ? 50 : 40;
    } else if (roadWidth === "medium") {
      lanes = 1;
      sidewalk = randomRange(0.06, 0.10);
      baseSpeed = 30;
    } else {
      lanes = 1;
      sidewalk = randomRange(0.12, 0.20);
      baseSpeed = 15;
    }

    const speed = Math.max(15, baseSpeed - Math.round(sidewalk * 30));
    return {
      id: idx,
      tiles: [],
      points: spline.points,
      lanes,
      sidewalk,
      speed,
      isArterial,
      hasCrosswalk: false,
      hasSignal: false,
      oneWay: 0,
      roadWidth
    };
  });

  for (let i = 0; i < TILE_COUNT; i++) {
    const center = tileCenter(i);
    let closest = { dist: Infinity, segmentId: -1 };
    for (const segment of roadSegments) {
      const points = segment.points;
      for (let p = 0; p < points.length - 1; p++) {
        const { dist } = distanceToSegment(center, points[p], points[p + 1]);
        if (dist < closest.dist) {
          closest = { dist, segmentId: segment.id };
        }
      }
    }
    if (closest.segmentId >= 0) {
      const segment = roadSegments[closest.segmentId];
      const width = 0.35 + segment.lanes * 0.16 + segment.sidewalk * 2;
      if (closest.dist <= width) {
        tileType[i] = 1;
        tileLanes[i] = segment.lanes;
        tileSidewalk[i] = segment.sidewalk;
        tileSpeed[i] = segment.speed;
        tileOneWay[i] = segment.oneWay;
        tilePedOnly[i] = 0;
        tileScooterRestrict[i] = 0;
        tileNoiseBarrier[i] = 0;
        tileRoadSegment[i] = segment.id;
        roadClass[i] = segment.isArterial ? 1 : 0;
        segment.tiles.push(i);
      }
    }
  }
}

function detectIntersections() {
  intersections = [];
  const intersectionThreshold = 1.5;

  // Check all pairs of road segments for intersections
  for (let i = 0; i < roadSegments.length; i++) {
    for (let j = i + 1; j < roadSegments.length; j++) {
      const seg1 = roadSegments[i];
      const seg2 = roadSegments[j];

      // Check if segments' point clouds are close enough
      for (const p1 of seg1.points) {
        for (const p2 of seg2.points) {
          const dist = Math.hypot(p1.x - p2.x, p1.z - p2.z);
          if (dist < intersectionThreshold) {
            // Found an intersection point
            const existingIntersection = intersections.find(
              (int) => Math.hypot(int.position.x - p1.x, int.position.z - p1.z) < intersectionThreshold
            );

            if (existingIntersection) {
              // Add to existing intersection
              if (!existingIntersection.connectedSegments.includes(i)) {
                existingIntersection.connectedSegments.push(i);
              }
              if (!existingIntersection.connectedSegments.includes(j)) {
                existingIntersection.connectedSegments.push(j);
              }
            } else {
              // Create new intersection
              const avgX = (p1.x + p2.x) / 2;
              const avgZ = (p1.z + p2.z) / 2;
              const maxWidth = Math.max(
                0.35 + seg1.lanes * 0.16 + seg1.sidewalk * 2,
                0.35 + seg2.lanes * 0.16 + seg2.sidewalk * 2
              );
              intersections.push({
                position: { x: avgX, z: avgZ },
                connectedSegments: [i, j],
                size: maxWidth * 1.2,
                hasSignal: seg1.isArterial || seg2.isArterial
              });
            }
          }
        }
      }
    }
  }

  // Mark segments that have intersections
  for (const intersection of intersections) {
    for (const segId of intersection.connectedSegments) {
      const segment = roadSegments[segId];
      if (intersection.connectedSegments.length >= 3) {
        segment.hasSignal = intersection.hasSignal;
        segment.hasCrosswalk = true;
      }
    }
  }
}

function distanceToSplineSegments() {
  const dist = new Float32Array(TILE_COUNT);
  for (let i = 0; i < TILE_COUNT; i++) {
    const center = tileCenter(i);
    let closest = Infinity;
    for (const segment of roadSegments) {
      const points = segment.points;
      for (let p = 0; p < points.length - 1; p++) {
        const { dist: segDist } = distanceToSegment(center, points[p], points[p + 1]);
        if (segDist < closest) {
          closest = segDist;
        }
      }
    }
    dist[i] = closest;
  }
  return dist;
}

function generateBuildingLayout() {
  const BUILDING_TYPES = [2, 3, 4, 5, 6, 7, 8, 9, 0];
  const baseWeights: Record<number, number> = {
    2: 14,
    3: 11,
    4: 8,
    5: 6,
    6: 3,
    7: 3,
    8: 2,
    9: 2,
    0: 2
  };
  const compatibility: Record<number, number[]> = {
    0: [0, 2, 3, 4, 5, 6, 7, 8, 9],
    2: [0, 2, 3, 5, 6, 8],
    3: [0, 2, 3, 5, 7, 8, 9],
    4: [0, 3, 4],
    5: [0, 2, 3, 5, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
    7: [0, 2, 3, 7, 8],
    8: [0, 2, 3, 5, 6, 7, 8],
    9: [0, 3, 9]
  };

  function buildingCompatible(a: number, b: number) {
    return compatibility[a]?.includes(b) ?? true;
  }

  const dist = distanceToSplineSegments();

  interface Cell {
    possibilities: number[];
    collapsed: boolean;
  }

  const grid: Cell[] = [];
  for (let i = 0; i < TILE_COUNT; i++) {
    if (tileType[i] === 1) {
      grid[i] = { possibilities: [1], collapsed: true };
    } else {
      grid[i] = { possibilities: BUILDING_TYPES.slice(), collapsed: false };
    }
  }

  function tileWeightForCell(idx: number, type: number) {
    let weight = baseWeights[type] ?? 1;
    const distance = dist[idx];
    const nearArterial = neighbors(idx).some((n) => roadClass[n] === 1);
    if (distance <= 1) {
      if (type === 3 || type === 7 || type === 9) weight *= 1.6;
      if (type === 2) weight *= 1.2;
    } else if (distance <= 2) {
      if (type === 2 || type === 5) weight *= 1.3;
    } else if (distance >= 4) {
      if (type === 4 || type === 5 || type === 0) weight *= 1.4;
    }
    if (nearArterial) {
      if (type === 3 || type === 9) weight *= 1.4;
    }
    return weight;
  }

  function propagateConstraints(idx: number) {
    const stack = [idx];
    const visited = new Set<number>();

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      if (tileType[current] === 1) continue;
      const currentTile = grid[current];
      for (const neighbor of neighbors(current)) {
        if (tileType[neighbor] === 1) continue;
        const validNeighbors = new Set<number>();
        for (const possIdx of currentTile.possibilities) {
          for (const neighPossIdx of grid[neighbor].possibilities) {
            if (buildingCompatible(possIdx, neighPossIdx)) {
              validNeighbors.add(neighPossIdx);
            }
          }
        }
        const newPoss = [...validNeighbors];
        if (newPoss.length > 0 && newPoss.length < grid[neighbor].possibilities.length) {
          grid[neighbor].possibilities = newPoss;
          if (!stack.includes(neighbor)) {
            stack.push(neighbor);
          }
        }
      }
    }
  }

  function collapse() {
    let minEntropy = Infinity;
    let minIdx = -1;
    for (let i = 0; i < TILE_COUNT; i++) {
      if (grid[i].collapsed || tileType[i] === 1) continue;
      const entropy = grid[i].possibilities.length;
      if (entropy < minEntropy && entropy > 0) {
        minEntropy = entropy;
        minIdx = i;
      }
    }
    if (minIdx === -1) return false;
    const cell = grid[minIdx];
    const weights = cell.possibilities.map((type) => tileWeightForCell(minIdx, type));
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * (totalWeight || 1);
    let chosenIdx = 0;
    for (let i = 0; i < weights.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        chosenIdx = i;
        break;
      }
    }
    cell.possibilities = [cell.possibilities[chosenIdx]];
    cell.collapsed = true;
    propagateConstraints(minIdx);
    return true;
  }

  let iterations = 0;
  while (collapse() && iterations++ < TILE_COUNT * 2) {
    // collapse
  }

  for (let i = 0; i < TILE_COUNT; i++) {
    if (tileType[i] === 1) continue;
    if (!grid[i].collapsed) {
      const options = grid[i].possibilities;
      grid[i].possibilities = [options[Math.floor(Math.random() * options.length)]];
      grid[i].collapsed = true;
    }
    tileType[i] = grid[i].possibilities[0];
    tileLanes[i] = 0;
    tileSidewalk[i] = 0;
    tileSpeed[i] = 0;
    tileOneWay[i] = 0;
    tileDirMask[i] = 0;
    tilePedOnly[i] = 0;
    tileScooterRestrict[i] = 0;
    tileNoiseBarrier[i] = 0;
    if (tileType[i] >= 2) {
      tileIndicesByType[tileType[i]]?.push(i);
    }
  }
}

function updateTrafficControls() {
  tileCrosswalk.fill(0);
  tileSignal.fill(0);
  tileSignalOffset.fill(0);
  roadSegments.forEach((segment) => {
    segment.hasCrosswalk = false;
    segment.hasSignal = false;
  });

  for (let i = 0; i < TILE_COUNT; i++) {
    if (tileType[i] !== 1) continue;
    const mask = Math.round(tileDirMask[i] || 0);
    const connections = ((mask & 1) > 0 ? 1 : 0) + ((mask & 2) > 0 ? 1 : 0) + ((mask & 4) > 0 ? 1 : 0) + ((mask & 8) > 0 ? 1 : 0);
    const hasSidewalk = tileSidewalk[i] > 0.02;
    if (connections >= 3) {
      tileSignal[i] = 1;
      tileCrosswalk[i] = hasSidewalk ? 1 : 0;
    } else if (connections === 2 && hasSidewalk && Math.random() < 0.12) {
      tileCrosswalk[i] = 1;
    }
    const offsetSeed = Math.abs(Math.sin(i * 12.9898) * 43758.5453);
    tileSignalOffset[i] = offsetSeed - Math.floor(offsetSeed);
    const segId = tileRoadSegment[i];
    if (segId >= 0) {
      if (tileCrosswalk[i] > 0.5) roadSegments[segId].hasCrosswalk = true;
      if (tileSignal[i] > 0.5) roadSegments[segId].hasSignal = true;
    }
  }
}

function generateCityFromSplines() {
  generateRoadSplines();
  applySplineRoadsToGrid();
  detectIntersections();
  deriveRoadMaskFromNeighbors();
  updateTrafficControls();
  generateBuildingLayout();
}

function generateMapSimple() {
  resetTileIndex();

  // First pass: create a grid road network
  for (let i = 0; i < TILE_COUNT; i++) {
    const x = i % GRID_WIDTH;
    const y = Math.floor(i / GRID_WIDTH);

    // Create regular grid of roads
    const isHorizontalRoad = y % 6 === 2;
    const isVerticalRoad = x % 5 === 2;

    if (isHorizontalRoad || isVerticalRoad) {
      tileType[i] = 1; // Road
      tileLanes[i] = Math.random() > 0.5 ? 2 : 1;
      tileSidewalk[i] = Math.random() > 0.8 ? 0.08 : 0.0;
      const speedRand = Math.random();
      tileSpeed[i] = speedRand < 0.2 ? 20 : speedRand < 0.5 ? 30 : speedRand < 0.8 ? 40 : 50;

      // One-way streets (some of them)
      if (Math.random() > 0.7) {
        if (isVerticalRoad && !isHorizontalRoad) {
          tileOneWay[i] = Math.random() > 0.5 ? 1 : 3; // N or S
        } else if (isHorizontalRoad && !isVerticalRoad) {
          tileOneWay[i] = Math.random() > 0.5 ? 2 : 4; // E or W
        }
      }

      let mask = 0;
      if (isVerticalRoad) {
        mask |= 1;
        mask |= 4;
      }
      if (isHorizontalRoad) {
        mask |= 2;
        mask |= 8;
      }
      tileDirMask[i] = mask;
      tilePedOnly[i] = 0;
      tileScooterRestrict[i] = 0;
      tileNoiseBarrier[i] = 0;
    } else {
      // Buildings or grass
      const rand = Math.random();
      if (rand < 0.05) {
        tileType[i] = 0; // Grass
      } else if (rand < 0.35) {
        tileType[i] = 2; // Residential
        tileIndicesByType[2]?.push(i);
      } else if (rand < 0.60) {
        tileType[i] = 3; // Commercial
        tileIndicesByType[3]?.push(i);
      } else if (rand < 0.80) {
        tileType[i] = 4; // Industrial
        tileIndicesByType[4]?.push(i);
      } else if (rand < 0.87) {
        tileType[i] = 5; // Park
        tileIndicesByType[5]?.push(i);
      } else if (rand < 0.92) {
        tileType[i] = 6; // School
        tileIndicesByType[6]?.push(i);
      } else if (rand < 0.96) {
        tileType[i] = 7; // Night Market
        tileIndicesByType[7]?.push(i);
      } else if (rand < 0.98) {
        tileType[i] = 8; // Temple
        tileIndicesByType[8]?.push(i);
      } else {
        tileType[i] = 9; // Mall
        tileIndicesByType[9]?.push(i);
      }

      tileLanes[i] = 0;
      tileSidewalk[i] = 0;
      tileSpeed[i] = 0;
      tileOneWay[i] = 0;
      tileDirMask[i] = 0;
      tilePedOnly[i] = 0;
      tileScooterRestrict[i] = 0;
      tileNoiseBarrier[i] = 0;
    }
  }

  const typeCounts: Record<number, number> = {};
  for (let i = 0; i < TILE_COUNT; i++) {
    typeCounts[tileType[i]] = (typeCounts[tileType[i]] || 0) + 1;
  }
  console.log('Generated tiles by type:', typeCounts);
  console.log('tileIndicesByType counts:', Object.entries(tileIndicesByType).map(([k, v]) => `${k}: ${v.length}`).join(', '));
}

function generateMapWFC() {
  resetTileIndex();

  interface Cell {
    possibilities: number[];
    collapsed: boolean;
  }

  const corridorRows = new Set<number>();
  const corridorCols = new Set<number>();
  for (let y = 0; y < GRID_HEIGHT; y++) {
    if (y % 6 === 2 && Math.random() > 0.55) {
      corridorRows.add(y);
    }
  }
  for (let x = 0; x < GRID_WIDTH; x++) {
    if (x % 5 === 2 && Math.random() > 0.6) {
      corridorCols.add(x);
    }
  }

  const maxAttempts = 4;
  const targetRoadRatio = 0.24;
  const roadWeightAttempts = [0.35, 0.3, 0.26, 0.22];
  let finalGrid: Cell[] | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const grid: Cell[] = [];
    for (let i = 0; i < TILE_COUNT; i++) {
      grid[i] = {
        possibilities: WFC_TILES.map((_, idx) => idx),
        collapsed: false
      };
    }

    const corridorMask = new Uint8Array(TILE_COUNT);
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        let mask = 0;
        if (corridorRows.has(y)) mask |= 1;
        if (corridorCols.has(x)) mask |= 2;
        corridorMask[indexFor(x, y)] = mask;
      }
    }

    function getNeighborIndices(idx: number) {
      const x = idx % GRID_WIDTH;
      const y = Math.floor(idx / GRID_WIDTH);
      return {
        north: y > 0 ? idx - GRID_WIDTH : null,
        east: x < GRID_WIDTH - 1 ? idx + 1 : null,
        south: y < GRID_HEIGHT - 1 ? idx + GRID_WIDTH : null,
        west: x > 0 ? idx - 1 : null
      };
    }

    function tileWeightForCell(idx: number, tileIdx: number) {
      const tile = WFC_TILES[tileIdx];
      let weight = tile.weight;
      const mask = corridorMask[idx];
      const isRoad = tile.type === 1;
      const roadBias = roadWeightAttempts[Math.min(attempt, roadWeightAttempts.length - 1)];
      if (isRoad) {
        weight *= roadBias;
      }
      if (mask > 0) {
        if (isRoad) {
          const wantsHorizontal = (mask & 1) === 1;
          const wantsVertical = (mask & 2) === 2;
          const hasHorizontal = tile.connections.east || tile.connections.west;
          const hasVertical = tile.connections.north || tile.connections.south;
          if (wantsHorizontal && !hasHorizontal) weight *= 0.1;
          if (wantsVertical && !hasVertical) weight *= 0.1;
          if (wantsHorizontal && hasHorizontal) weight *= 1.2;
          if (wantsVertical && hasVertical) weight *= 1.2;
        } else {
          weight *= 1.1;
        }
      } else if (isRoad) {
        weight *= 0.2;
      }
      const x = idx % GRID_WIDTH;
      const y = Math.floor(idx / GRID_WIDTH);
      const edge = x === 0 || y === 0 || x === GRID_WIDTH - 1 || y === GRID_HEIGHT - 1;
      if (edge && isRoad) weight *= 0.25;
      return weight;
    }

    function propagateConstraints(idx: number) {
      const stack = [idx];
      const visited = new Set<number>();

      while (stack.length > 0) {
        const current = stack.pop()!;
        if (visited.has(current)) continue;
        visited.add(current);

        const neighbors = getNeighborIndices(current);
        const currentTile = grid[current];

        for (const [dir, neighborIdx] of Object.entries(neighbors)) {
          if (neighborIdx === null) continue;

          const validNeighbors = new Set<number>();
          for (const possIdx of currentTile.possibilities) {
            const tile = WFC_TILES[possIdx];
            for (const neighPossIdx of grid[neighborIdx].possibilities) {
              const neighTile = WFC_TILES[neighPossIdx];
              if (tilesCompatible(tile, neighTile, dir as "north" | "east" | "south" | "west")) {
                validNeighbors.add(neighPossIdx);
              }
            }
          }

          const newPoss = [...validNeighbors];
          if (newPoss.length < grid[neighborIdx].possibilities.length) {
            grid[neighborIdx].possibilities = newPoss.length > 0 ? newPoss : grid[neighborIdx].possibilities;
            if (!stack.includes(neighborIdx)) {
              stack.push(neighborIdx);
            }
          }
        }
      }
    }

    function collapse() {
      let minEntropy = Infinity;
      let minIdx = -1;

      for (let i = 0; i < TILE_COUNT; i++) {
        if (grid[i].collapsed) continue;
        const entropy = grid[i].possibilities.length;
        if (entropy < minEntropy && entropy > 0) {
          minEntropy = entropy;
          minIdx = i;
        } else if (entropy === minEntropy && entropy > 0 && Math.random() > 0.6) {
          minIdx = i;
        }
      }

      if (minIdx === -1) return false;

      const cell = grid[minIdx];
      const weights = cell.possibilities.map(idx => tileWeightForCell(minIdx, idx));
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      let random = Math.random() * (totalWeight || 1);
      let chosenIdx = 0;

      for (let i = 0; i < weights.length; i++) {
        random -= weights[i];
        if (random <= 0) {
          chosenIdx = i;
          break;
        }
      }

      cell.possibilities = [cell.possibilities[chosenIdx]];
      cell.collapsed = true;

      propagateConstraints(minIdx);
      return true;
    }

    let iterations = 0;
    while (collapse() && iterations++ < TILE_COUNT * 3) {
      // Keep collapsing
    }

    for (let i = 0; i < TILE_COUNT; i++) {
      if (!grid[i].collapsed && grid[i].possibilities.length > 0) {
        const options = grid[i].possibilities;
        grid[i].possibilities = [options[Math.floor(Math.random() * options.length)]];
        grid[i].collapsed = true;
      } else if (grid[i].possibilities.length === 0) {
        grid[i].possibilities = [0];
        grid[i].collapsed = true;
      }
    }

    const roadCount = grid.filter((cell) => WFC_TILES[cell.possibilities[0]].type === 1).length;
    const roadRatio = roadCount / TILE_COUNT;
    if (roadRatio <= targetRoadRatio || attempt === maxAttempts - 1) {
      finalGrid = grid;
      break;
    }
  }

  if (!finalGrid) return;

  const typeCounts: Record<number, number> = {};
  for (let i = 0; i < TILE_COUNT; i++) {
    const wfcTile = WFC_TILES[finalGrid[i].possibilities[0]];
    tileType[i] = wfcTile.type;
    typeCounts[wfcTile.type] = (typeCounts[wfcTile.type] || 0) + 1;

    if (wfcTile.type === 1) {
      tileLanes[i] = Math.random() > 0.5 ? 2 : 1;
      tileSidewalk[i] = Math.random() > 0.7 ? (Math.random() > 0.5 ? 0.05 : 0.08) : 0.0;
      const speedWeighted = Math.random();
      if (speedWeighted < 0.18) {
        tileSpeed[i] = 20;
      } else if (speedWeighted < 0.45) {
        tileSpeed[i] = 30;
      } else if (speedWeighted < 0.8) {
        tileSpeed[i] = 40;
      } else {
        tileSpeed[i] = 50;
      }

      tileOneWay[i] = 0;
      tileDirMask[i] = connectionMask(wfcTile.connections);
      tilePedOnly[i] = 0;
      tileScooterRestrict[i] = 0;
      tileNoiseBarrier[i] = 0;
    } else {
      tileLanes[i] = 0;
      tileSidewalk[i] = 0;
      tileSpeed[i] = 0;
      tileOneWay[i] = 0;
      tileDirMask[i] = 0;
      tilePedOnly[i] = 0;
      tileScooterRestrict[i] = 0;
      tileNoiseBarrier[i] = 0;
      tileIndicesByType[wfcTile.type]?.push(i);
    }
  }

  console.log('WFC generated tiles by type:', typeCounts);
  console.log('tileIndicesByType counts:', Object.entries(tileIndicesByType).map(([k, v]) => `${k}: ${v.length}`).join(', '));
}

function rebuildTileIndex() {
  resetTileIndex();
  for (let i = 0; i < TILE_COUNT; i++) {
    if (tileType[i] >= 2) {
      tileIndicesByType[tileType[i]]?.push(i);
    }
  }
}

function rebuildRoadSegmentsFromTiles() {
  roadClass.fill(0);
  for (let i = 0; i < TILE_COUNT; i++) {
    if (tileType[i] === 1 && (tileLanes[i] >= 2 || tileSpeed[i] >= 40)) {
      roadClass[i] = 1;
    }
  }
  roadSegments = [];
  tileRoadSegment.fill(-1);
  const visitedEdges = new Set<string>();

  function isRoad(idx: number) {
    return tileType[idx] === 1;
  }

  function roadNeighbors(idx: number) {
    return neighbors(idx).filter((n) => isRoad(n));
  }

  function roadDegree(idx: number) {
    return roadNeighbors(idx).length;
  }

  function edgeKey(a: number, b: number) {
    return `${a}-${b}`;
  }

  for (let i = 0; i < TILE_COUNT; i++) {
    if (!isRoad(i)) continue;
    for (const neighbor of roadNeighbors(i)) {
      const key = edgeKey(i, neighbor);
      if (visitedEdges.has(key)) continue;
      const tiles: number[] = [i];
      let prev = i;
      let current = neighbor;
      visitedEdges.add(key);
      visitedEdges.add(edgeKey(neighbor, i));
      while (true) {
        tiles.push(current);
        const deg = roadDegree(current);
        if (deg !== 2) break;
        const nextOptions = roadNeighbors(current).filter((n) => n !== prev);
        if (nextOptions.length === 0) break;
        const next = nextOptions[0];
        if (visitedEdges.has(edgeKey(current, next))) break;
        visitedEdges.add(edgeKey(current, next));
        visitedEdges.add(edgeKey(next, current));
        prev = current;
        current = next;
        if (current === i) break;
      }
      const id = roadSegments.length;
      const points = tiles.map((tile) => tileCenter(tile));
      const isArterial = tiles.some((tile) => roadClass[tile] === 1);
      const lanes = Math.max(1, tileLanes[i] || 1);
      const sidewalk = tileSidewalk[i] || 0.04;
      const speed = tileSpeed[i] || 30;
      roadSegments.push({
        id,
        tiles,
        points,
        lanes,
        sidewalk,
        speed,
        isArterial,
        hasCrosswalk: false,
        hasSignal: false,
        oneWay: tileOneWay[i] || 0
      });
      tiles.forEach((tile) => {
        tileRoadSegment[tile] = id;
      });
    }
  }

  deriveRoadMaskFromNeighbors();
  updateTrafficControls();
  buildRoadRenderInstances();
}

function assignOneWayDirections() {
  tileOneWay.fill(0);
  const visited = new Set<number>();

  function orientationFor(index: number) {
    const x = index % GRID_WIDTH;
    const y = Math.floor(index / GRID_WIDTH);
    const left = x > 0 && tileType[indexFor(x - 1, y)] === 1;
    const right = x < GRID_WIDTH - 1 && tileType[indexFor(x + 1, y)] === 1;
    const up = y > 0 && tileType[indexFor(x, y - 1)] === 1;
    const down = y < GRID_HEIGHT - 1 && tileType[indexFor(x, y + 1)] === 1;
    const horizontal = left || right;
    const vertical = up || down;
    if (horizontal && !vertical) return "horizontal";
    if (vertical && !horizontal) return "vertical";
    return "intersection";
  }

  function walkSegment(start: number, orientation: "horizontal" | "vertical") {
    const stack = [start];
    const segment: number[] = [];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      if (tileType[current] !== 1) continue;
      if (orientationFor(current) !== orientation) continue;
      segment.push(current);
      const x = current % GRID_WIDTH;
      const y = Math.floor(current / GRID_WIDTH);
      if (orientation === "horizontal") {
        if (x > 0) stack.push(indexFor(x - 1, y));
        if (x < GRID_WIDTH - 1) stack.push(indexFor(x + 1, y));
      } else {
        if (y > 0) stack.push(indexFor(x, y - 1));
        if (y < GRID_HEIGHT - 1) stack.push(indexFor(x, y + 1));
      }
    }
    return segment;
  }

  for (let i = 0; i < TILE_COUNT; i++) {
    if (tileType[i] !== 1 || visited.has(i)) continue;
    const orientation = orientationFor(i);
    if (orientation === "intersection") continue;
    const segment = walkSegment(i, orientation);
    if (segment.length < 3) continue;
    const shouldBeOneWay = Math.random() > 0.55;
    if (!shouldBeOneWay) continue;
    const direction = orientation === "horizontal" ? (Math.random() > 0.5 ? 2 : 4) : Math.random() > 0.5 ? 3 : 1;
    segment.forEach((idx) => {
      tileOneWay[idx] = direction;
    });
  }

  roadSegments.forEach((segment) => {
    segment.oneWay = 0;
  });
  for (let i = 0; i < TILE_COUNT; i++) {
    if (tileType[i] !== 1) continue;
    const segId = tileRoadSegment[i];
    if (segId < 0) continue;
    if (tileOneWay[i] > 0 && roadSegments[segId].oneWay === 0) {
      roadSegments[segId].oneWay = tileOneWay[i];
    }
  }
}

function placeMallClusters() {
  const clusters: number[] = [];
  for (let y = 0; y < GRID_HEIGHT - 1; y++) {
    for (let x = 0; x < GRID_WIDTH - 1; x++) {
      const idx = indexFor(x, y);
      const block = [idx, indexFor(x + 1, y), indexFor(x, y + 1), indexFor(x + 1, y + 1)];
      if (block.some((i) => tileType[i] === 1 || tileType[i] === 0)) continue;
      const commercialCount = block.filter((i) => tileType[i] === 3 || tileType[i] === 4).length;
      if (commercialCount < 3) continue;
      clusters.push(idx);
    }
  }

  const desired = Math.min(6, Math.floor(clusters.length * 0.15));
  for (let i = 0; i < desired; i++) {
    if (clusters.length === 0) break;
    const pickIndex = Math.floor(Math.random() * clusters.length);
    const start = clusters.splice(pickIndex, 1)[0];
    const x = start % GRID_WIDTH;
    const y = Math.floor(start / GRID_WIDTH);
    const block = [start, indexFor(x + 1, y), indexFor(x, y + 1), indexFor(x + 1, y + 1)];
    block.forEach((idx) => {
      tileType[idx] = 9;
    });
  }
  rebuildTileIndex();
}

generateCityFromSplines();
assignOneWayDirections();
buildRoadRenderInstances();

function buildBuildingInstances() {
  const instances: number[] = [];
  for (let i = 0; i < TILE_COUNT; i++) {
    if (tileType[i] <= 1) continue;
    const x = i % GRID_WIDTH;
    const y = Math.floor(i / GRID_WIDTH);
    const height =
      tileType[i] === 2
        ? 1.4
        : tileType[i] === 3
          ? 2.0
          : tileType[i] === 4
            ? 1.6
            : tileType[i] === 5
              ? 0.3
              : tileType[i] === 6
                ? 1.0
                : tileType[i] === 7
                  ? 0.6
                  : tileType[i] === 8
                    ? 1.1
                    : tileType[i] === 9
                      ? 2.2
                      : 0.8;
    instances.push(x + 0.5, y + 0.5, height + (Math.sin(i) * 0.2 + 0.2), tileType[i]);
  }
  buildingInstances = new Float32Array(instances);
  buildingInstanceCount = buildingInstances.length / 4;
  gl.bindBuffer(gl.ARRAY_BUFFER, buildingInstanceBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, buildingInstances, gl.DYNAMIC_DRAW);
}

function addBuildingAccessSplines() {
  // Add thin aesthetic splines from buildings to adjacent roads
  for (let i = 0; i < TILE_COUNT; i++) {
    const type = tileType[i];
    if (type <= 1 || type === 5) continue; // Skip non-buildings and parks

    const buildingPos = tileCenter(i);
    const bx = i % GRID_WIDTH;
    const bz = Math.floor(i / GRID_WIDTH);

    // Check adjacent tiles for roads
    const directions = [
      { dx: 1, dz: 0 },
      { dx: -1, dz: 0 },
      { dx: 0, dz: 1 },
      { dx: 0, dz: -1 }
    ];

    for (const dir of directions) {
      const nx = bx + dir.dx;
      const nz = bz + dir.dz;
      if (nx < 0 || nx >= GRID_WIDTH || nz < 0 || nz >= GRID_HEIGHT) continue;

      const neighborIdx = nz * GRID_WIDTH + nx;
      if (tileType[neighborIdx] === 1) {
        // Adjacent to a road, create a thin access spline
        const roadPos = tileCenter(neighborIdx);
        const midX = (buildingPos.x + roadPos.x) / 2;
        const midZ = (buildingPos.z + roadPos.z) / 2;

        // Create a short curved path
        const points: RoadPoint[] = [
          { x: buildingPos.x + dir.dx * 0.2, z: buildingPos.z + dir.dz * 0.2 },
          { x: midX, z: midZ },
          { x: roadPos.x - dir.dx * 0.1, z: roadPos.z - dir.dz * 0.1 }
        ];

        roadPolylines.push({
          points,
          isArterial: false,
          roadWidth: "narrow"
        });
      }
    }
  }

  // Rebuild road segments to include the new access splines
  const newAccessSegments = roadPolylines.slice(roadSegments.length).map((spline, idx) => {
    const id = roadSegments.length + idx;
    return {
      id,
      tiles: [],
      points: spline.points,
      lanes: 1,
      sidewalk: 0.15,
      speed: 10,
      isArterial: false,
      hasCrosswalk: false,
      hasSignal: false,
      oneWay: 0,
      roadWidth: "narrow" as RoadWidth
    };
  });

  roadSegments.push(...newAccessSegments);
}

function buildRoadRenderInstances() {
  const instances: number[] = [];

  // First, render intersection boxes
  for (const intersection of intersections) {
    const size = intersection.size;
    const halfSize = size / 2;
    const pos = intersection.position;
    const signal = intersection.hasSignal ? 1 : 0;
    const offsetSeed = Math.abs(Math.sin(pos.x * 12.9898 + pos.z * 78.233) * 43758.5453);
    const signalOffset = offsetSeed - Math.floor(offsetSeed);

    // Create 4 edges of the intersection box
    const corners = [
      { x: pos.x - halfSize, z: pos.z - halfSize },
      { x: pos.x + halfSize, z: pos.z - halfSize },
      { x: pos.x + halfSize, z: pos.z + halfSize },
      { x: pos.x - halfSize, z: pos.z + halfSize }
    ];

    for (let i = 0; i < 4; i++) {
      const start = corners[i];
      const end = corners[(i + 1) % 4];
      instances.push(
        start.x,
        start.z,
        end.x,
        end.z,
        size,
        0.05,
        2,
        0,
        signal,
        signalOffset,
        1,
        0.01
      );
    }
  }

  // Render road segments, trimming near intersections
  roadSegments.forEach((segment) => {
    const points = segment.points;
    const laneCount = segment.lanes >= 2 ? 2 : 1;
    const width = 0.35 + laneCount * 0.16 + segment.sidewalk * 2;
    const signal = segment.hasSignal ? 1 : 0;
    const crosswalk = segment.hasCrosswalk ? 1 : 0;
    const offsetSeed = Math.abs(Math.sin(segment.id * 12.9898) * 43758.5453);
    const signalOffset = offsetSeed - Math.floor(offsetSeed);

    for (let i = 0; i < points.length - 1; i++) {
      let start = points[i];
      let end = points[i + 1];
      if (Math.hypot(end.x - start.x, end.z - start.z) < 0.01) continue;

      // Check if this segment is near an intersection and trim if necessary
      let shouldSkip = false;
      for (const intersection of intersections) {
        if (intersection.connectedSegments.includes(segment.id)) {
          const distToStart = Math.hypot(start.x - intersection.position.x, start.z - intersection.position.z);
          const distToEnd = Math.hypot(end.x - intersection.position.x, end.z - intersection.position.z);
          const threshold = intersection.size * 0.6;

          if (distToStart < threshold && distToEnd < threshold) {
            shouldSkip = true;
            break;
          }

          // Trim segment ends near intersection
          if (distToStart < threshold) {
            const dir = { x: end.x - start.x, z: end.z - start.z };
            const len = Math.hypot(dir.x, dir.z);
            const t = threshold / len;
            start = { x: start.x + dir.x * t, z: start.z + dir.z * t };
          }
          if (distToEnd < threshold) {
            const dir = { x: start.x - end.x, z: start.z - end.z };
            const len = Math.hypot(dir.x, dir.z);
            const t = threshold / len;
            end = { x: end.x + dir.x * t, z: end.z + dir.z * t };
          }
        }
      }

      if (shouldSkip) continue;

      const elevation = segment.isArterial ? 0.008 : 0.004;
      instances.push(
        start.x,
        start.z,
        end.x,
        end.z,
        width,
        segment.sidewalk,
        laneCount,
        segment.oneWay,
        signal,
        signalOffset,
        crosswalk,
        elevation
      );
    }
  });

  roadInstances = new Float32Array(instances);
  roadInstanceCount = roadInstances.length / 12;
  gl.bindBuffer(gl.ARRAY_BUFFER, roadInstanceBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, roadInstances, gl.DYNAMIC_DRAW);
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
addBuildingAccessSplines();
buildRoadRenderInstances();
spawnAgents();

function buildBuffers() {
  gl.bindVertexArray(groundVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  gl.bindVertexArray(roadVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, roadPositionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, roadQuad, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, roadInstanceBuffer);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 48, 0);
  gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 48, 16);
  gl.vertexAttribDivisor(2, 1);
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 48, 32);
  gl.vertexAttribDivisor(3, 1);
  gl.bindVertexArray(null);

  gl.bindVertexArray(postVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
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

    metrics2Texels[i * 4] = tileDirMask[i];
    metrics2Texels[i * 4 + 1] = tileCrosswalk[i];
    metrics2Texels[i * 4 + 2] = tileSignal[i];
    metrics2Texels[i * 4 + 3] = tileSignalOffset[i];
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

  gl.bindTexture(gl.TEXTURE_2D, metrics2Tex);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA32F,
    GRID_WIDTH,
    GRID_HEIGHT,
    0,
    gl.RGBA,
    gl.FLOAT,
    metrics2Texels
  );
}

function calculateFocusDistance() {
  const centerX = clamp(GRID_WIDTH * 0.5 + cameraPanX, 5, GRID_WIDTH - 5);
  const centerZ = clamp(GRID_HEIGHT * 0.5 + cameraPanZ, 5, GRID_HEIGHT - 5);
  const horizontalDist = cameraDistance * Math.cos(cameraTilt);
  const eyeX = centerX + Math.sin(cameraAngle) * horizontalDist;
  const eyeY = cameraDistance * Math.sin(cameraTilt);
  const eyeZ = centerZ + Math.cos(cameraAngle) * horizontalDist;

  const targetX = centerX;
  const targetY = 0;
  const targetZ = centerZ;

  const dirX = targetX - eyeX;
  const dirY = targetY - eyeY;
  const dirZ = targetZ - eyeZ;
  const dirLen = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
  const rayDirX = dirX / dirLen;
  const rayDirY = dirY / dirLen;
  const rayDirZ = dirZ / dirLen;

  let minDist = cameraDistance;

  for (let t = 0; t < 100; t += 0.5) {
    const px = eyeX + rayDirX * t;
    const py = eyeY + rayDirY * t;
    const pz = eyeZ + rayDirZ * t;

    if (py <= 0.5) {
      const dist = Math.sqrt((px - eyeX) ** 2 + (py - eyeY) ** 2 + (pz - eyeZ) ** 2);
      minDist = Math.min(minDist, dist);
      break;
    }

    const tileX = Math.floor(px);
    const tileZ = Math.floor(pz);
    if (tileX >= 0 && tileX < GRID_WIDTH && tileZ >= 0 && tileZ < GRID_HEIGHT) {
      const idx = tileZ * GRID_WIDTH + tileX;
      const type = tileType[idx];

      if (type === 3 || type === 4) {
        const height = type === 3 ? 2 + Math.random() * 2 : 4 + Math.random() * 4;
        if (py <= height) {
          const dist = Math.sqrt((px - eyeX) ** 2 + (py - eyeY) ** 2 + (pz - eyeZ) ** 2);
          minDist = Math.min(minDist, dist);
          break;
        }
      }
    }

    for (const agent of agents) {
      const dx = px - agent.position.x;
      const dz = pz - agent.position.z;
      const agentDist = Math.sqrt(dx * dx + dz * dz);
      if (agentDist < 0.3 && py <= 1.0) {
        const dist = Math.sqrt((px - eyeX) ** 2 + (py - eyeY) ** 2 + (pz - eyeZ) ** 2);
        minDist = Math.min(minDist, dist);
        break;
      }
    }
  }

  return Math.max(5, Math.min(60, minDist));
}

function render() {
  resizeCanvas();
  updateCamera();
  const focusDistance = calculateFocusDistance();
  gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFbo);
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0.07, 0.09, 0.13, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.useProgram(groundProgram);
  gl.uniform2f(uGrid, GRID_WIDTH, GRID_HEIGHT);
  gl.uniform1f(uTime, state.time);
  gl.uniform1i(uViewMode, viewMode);
  gl.uniformMatrix4fv(uViewProj, false, viewProj);
  gl.uniform1i(uHideRoadTiles, 1);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tileDataTex);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, metrics0Tex);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, metrics1Tex);
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, metrics2Tex);

  const uTileData = gl.getUniformLocation(groundProgram, "u_tileData");
  const uMetrics0 = gl.getUniformLocation(groundProgram, "u_metrics0");
  const uMetrics1 = gl.getUniformLocation(groundProgram, "u_metrics1");
  const uMetrics2 = gl.getUniformLocation(groundProgram, "u_metrics2");
  gl.uniform1i(uTileData, 0);
  gl.uniform1i(uMetrics0, 1);
  gl.uniform1i(uMetrics1, 2);
  gl.uniform1i(uMetrics2, 3);

  gl.bindVertexArray(groundVao);
  gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, TILE_COUNT);
  gl.bindVertexArray(null);

  gl.useProgram(roadProgram);
  gl.uniformMatrix4fv(uRoadViewProj, false, viewProj);
  gl.uniform1f(uRoadTime, state.time);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.bindVertexArray(roadVao);
  gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, roadInstanceCount);
  gl.bindVertexArray(null);
  gl.disable(gl.BLEND);

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

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.disable(gl.DEPTH_TEST);
  gl.useProgram(postProgram);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sceneColorTex);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, sceneDepthTex);
  gl.uniform1i(uPostScene, 0);
  gl.uniform1i(uPostDepth, 1);
  gl.uniform2f(uPostResolution, canvas.width, canvas.height);
  gl.uniform1f(uPostFocus, focusDistance);
  gl.bindVertexArray(postVao);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
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
    btn.addEventListener("mouseenter", () => audioEngine.playUIHover());
    btn.addEventListener("click", () => {
      audioEngine.playUIClick();
      viewMode = Number((btn as HTMLButtonElement).dataset.view);
      updateBottomBar();
    });
  });

  bottomBar.querySelectorAll("button[data-speed]").forEach((btn) => {
    btn.addEventListener("mouseenter", () => audioEngine.playUIHover());
    btn.addEventListener("click", () => {
      audioEngine.playUIClick();
      simSpeed = Number((btn as HTMLButtonElement).dataset.speed);
      updateBottomBar();
    });
  });

  const saveBtn = bottomBar.querySelector("button[data-save]");
  const loadBtn = bottomBar.querySelector("button[data-load]");
  if (saveBtn) {
    saveBtn.addEventListener("mouseenter", () => audioEngine.playUIHover());
    saveBtn.addEventListener("click", () => {
      audioEngine.playUIClick();
      saveGame();
    });
  }
  if (loadBtn) {
    loadBtn.addEventListener("mouseenter", () => audioEngine.playUIHover());
    loadBtn.addEventListener("click", () => {
      audioEngine.playUIClick();
      loadGame();
    });
  }
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
    button.addEventListener("mouseenter", () => audioEngine.playUIHover());
    button.addEventListener("click", () => {
      audioEngine.playUIClick();
      handleAction(button.dataset.action ?? "");
    });
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
    button.addEventListener("mouseenter", () => audioEngine.playUIHover());
    button.addEventListener("click", () => {
      audioEngine.playUIClick();
      handlePolicy(button.dataset.policy ?? "");
    });
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
  if (selectedRoadSegment !== null) {
    const segment = roadSegments[selectedRoadSegment];
    if (segment) {
      const length = segment.tiles.length;
      const avgSidewalk = segment.sidewalk * 100;
      rightPanel.innerHTML = `
        <h2>Road Segment</h2>
        <div class="card">
          <div><strong>${segment.isArterial ? "Arterial" : "Local"} Segment</strong></div>
          <div class="small">Tiles: ${length}</div>
          <div class="small">Lanes: ${segment.lanes} · Speed ${segment.speed}</div>
          <div class="small">Sidewalk ${(avgSidewalk).toFixed(0)}%</div>
          <div class="small">Signals: ${segment.hasSignal ? "Yes" : "No"} · Crosswalks: ${segment.hasCrosswalk ? "Yes" : "No"}</div>
        </div>
      `;
      return;
    }
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
  const dirMask = Math.round(tileDirMask[selectedIndex] || 0);
  const allowedDirs = type === 1 ? directionMaskName(dirMask) : "";
  rightPanel.innerHTML = `
    <h2>Selection</h2>
    <div class="card">
      <div><strong>${name}</strong></div>
      <div class="small">Traffic ${(traffic[selectedIndex] * 100).toFixed(0)} · Noise ${(noise[selectedIndex] * 100).toFixed(0)}</div>
      <div class="small">Ped ${(ped[selectedIndex] * 100).toFixed(0)} · Income ${(income[selectedIndex] * 100).toFixed(0)}</div>
      <div class="small">Speed ${tileSpeed[selectedIndex] || 0} · Sidewalk ${(tileSidewalk[selectedIndex] * 100).toFixed(0)}%</div>
    </div>
    ${type === 1 ? `<div class="card small">Allowed: ${allowedDirs}</div>` : ""}
    ${type === 1 ? `<div class="card small">One-way: ${tileOneWay[selectedIndex] ? directionName(tileOneWay[selectedIndex]) : "Two-way"}</div>` : ""}
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
    case 8:
      return "Temple";
    case 9:
      return "Shopping Mall";
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

function directionMaskName(mask: number) {
  if (!mask) return "None";
  const dirs: string[] = [];
  if (mask & 1) dirs.push("North");
  if (mask & 2) dirs.push("East");
  if (mask & 4) dirs.push("South");
  if (mask & 8) dirs.push("West");
  return dirs.join(" / ");
}

function formatMoney(value: number) {
  const sign = value < 0 ? "-" : "";
  const amount = Math.abs(value).toFixed(0);
  return `${sign}$${Number(amount).toLocaleString()}`;
}

function selectedRoadTiles() {
  if (selectedRoadSegment !== null) {
    return roadSegments[selectedRoadSegment]?.tiles ?? [];
  }
  if (selectedIndex !== null && tileType[selectedIndex] === 1) {
    return [selectedIndex];
  }
  return [];
}

function handleAction(action: string) {
  const tiles = selectedRoadTiles();
  if (tiles.length === 0) {
    audioEngine.playUIError();
    showToast("Select a road segment first.");
    return;
  }

  let cost = 3000;
  let ppCost = 6;
  if (action === "sidewalk" && policyList.find((p) => p.id === "sidewalks")?.active) {
    cost = 1500;
  }
  if (state.cash < cost || state.politicalPoints < ppCost) {
    audioEngine.playUIError();
    showToast("Not enough cash or political points.");
    return;
  }

  const segment = selectedRoadSegment !== null ? roadSegments[selectedRoadSegment] : null;

  if (action === "toggle-oneway") {
    tiles.forEach((tile) => {
      tileOneWay[tile] = (tileOneWay[tile] + 1) % 5;
    });
    if (segment) {
      segment.oneWay = tileOneWay[tiles[0]];
    }
  }
  if (action === "speed") {
    const current = tileSpeed[tiles[0]] || SPEED_OPTIONS[0];
    const nextIndex = (SPEED_OPTIONS.indexOf(current) + 1) % SPEED_OPTIONS.length;
    const newSpeed = SPEED_OPTIONS[nextIndex];
    tiles.forEach((tile) => {
      tileSpeed[tile] = newSpeed;
    });
    if (segment) segment.speed = newSpeed;
  }
  if (action === "sidewalk") {
    const newSidewalk = Math.min(0.28, (segment?.sidewalk ?? tileSidewalk[tiles[0]]) + 0.08);
    tiles.forEach((tile) => {
      tileSidewalk[tile] = newSidewalk;
    });
    if (segment) segment.sidewalk = newSidewalk;
  }
  if (action === "ped") {
    tiles.forEach((tile) => {
      tilePedOnly[tile] = tilePedOnly[tile] > 0 ? 0 : 1;
    });
  }
  if (action === "scooter") {
    tiles.forEach((tile) => {
      tileScooterRestrict[tile] = tileScooterRestrict[tile] > 0 ? 0 : 1;
    });
    state.recentDiscontent += 3;
  }
  if (action === "barrier") {
    tiles.forEach((tile) => {
      tileNoiseBarrier[tile] = tileNoiseBarrier[tile] > 0 ? 0 : 1;
    });
  }

  state.cash -= cost;
  state.politicalPoints -= ppCost;
  audioEngine.playActionThump();
  audioEngine.playUISuccess();
  updateRightPanel();
  updateLeftPanel();
  buildRoadRenderInstances();
  showToast("Action applied.");
}

function handlePolicy(id: string) {
  const policy = policyList.find((p) => p.id === id);
  if (!policy) return;

  if (!policy.active) {
    if (state.politicalPoints < policy.pp || state.cash < policy.cost) {
      audioEngine.playUIError();
      showToast("Not enough resources to enact policy.");
      return;
    }
    state.politicalPoints -= policy.pp;
    state.cash -= policy.cost;
    policy.active = true;
    state.recentDiscontent += 4;
    audioEngine.playPolicyToggle();
    audioEngine.playUISuccess();
    showToast(`${policy.name} enacted.`);
  } else {
    policy.active = false;
    state.recentDiscontent += 2;
    audioEngine.playPolicyToggle();
    audioEngine.playUIClick();
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
    tileDirMask: Array.from(tileDirMask),
    tilePedOnly: Array.from(tilePedOnly),
    tileScooterRestrict: Array.from(tileScooterRestrict),
    tileNoiseBarrier: Array.from(tileNoiseBarrier),
    policies: policyList.map((p) => ({ id: p.id, active: p.active }))
  };
  localStorage.setItem("sidewalk-save", JSON.stringify(save));
  audioEngine.playUISuccess();
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
  if (save.tileDirMask) {
    tileDirMask.set(save.tileDirMask);
  }
  tilePedOnly.set(save.tilePedOnly);
  tileScooterRestrict.set(save.tileScooterRestrict);
  tileNoiseBarrier.set(save.tileNoiseBarrier);
  save.policies.forEach((p: { id: string; active: boolean }) => {
    const policy = policyList.find((item) => item.id === p.id);
    if (policy) policy.active = p.active;
  });
  rebuildTileIndex();
  rebuildRoadSegmentsFromTiles();
  buildBuildingInstances();
  selectedIndex = null;
  selectedRoadSegment = null;
  selection.fill(0);
  audioEngine.playSelectionPing();
  showToast("Save loaded.");
  updateLeftPanel();
  updateRightPanel();
}

function passable(index: number, type: AgentType) {
  if (tileType[index] !== 1) return false;
  if (type === "pedestrian") return true;
  if (tilePedOnly[index] === 1) return false;
  if (type === "scooter" && tileScooterRestrict[index] === 1) return false;
  return true;
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

function movementDir(from: number, to: number) {
  const fx = from % GRID_WIDTH;
  const fy = Math.floor(from / GRID_WIDTH);
  const tx = to % GRID_WIDTH;
  const ty = Math.floor(to / GRID_WIDTH);
  if (ty < fy) return 1;
  if (tx > fx) return 2;
  if (ty > fy) return 3;
  if (tx < fx) return 4;
  return 0;
}

function signalAllowsMove(tileIndex: number, dir: number, type: AgentType) {
  if (type === "pedestrian") return true;
  if (tileSignal[tileIndex] < 0.5) return true;
  const phase = (state.time / 6 + tileSignalOffset[tileIndex]) % 1;
  const northSouthGreen = phase < 0.5;
  const crossingActive = tileCrosswalk[tileIndex] > 0.5 && phase > 0.45 && phase < 0.65;
  if (crossingActive) return false;
  if (dir === 1 || dir === 3) return northSouthGreen;
  if (dir === 2 || dir === 4) return !northSouthGreen;
  return true;
}

function applySplineLaneOffset(position: { x: number; z: number }, segmentId: number, progress: number, agent: Agent) {
  if (segmentId < 0 || segmentId >= roadSegments.length) return position;

  const segment = roadSegments[segmentId];
  const points = segment.points;
  if (points.length < 2) return position;

  const totalLength = points.length - 1;
  const t = Math.max(0, Math.min(1, progress));
  const index = Math.min(Math.floor(t * totalLength), totalLength - 1);

  const p0 = points[index];
  const p1 = points[Math.min(index + 1, points.length - 1)];

  const dx = p1.x - p0.x;
  const dz = p1.z - p0.z;
  const length = Math.hypot(dx, dz) || 1;
  const forward = { x: dx / length, z: dz / length };
  const normal = { x: -forward.z, z: forward.x };

  const lanes = segment.lanes;
  const sidewalkWidth = segment.sidewalk;
  let offset = 0;

  if (agent.type === "pedestrian") {
    const curb = 0.32 + sidewalkWidth * 2;
    offset = curb * (agent.laneBias >= 0 ? 1 : -1);
  } else if (agent.type === "scooter") {
    const scooterOffset = 0.18 + sidewalkWidth;
    offset = scooterOffset * (agent.splineDirection >= 0 ? -1 : 1);
  } else {
    if (lanes === 2) {
      offset = 0.12 * (agent.splineDirection >= 0 ? -1 : 1);
    } else {
      offset = 0;
    }
  }

  return {
    x: position.x + normal.x * offset,
    z: position.z + normal.z * offset
  };
}

function applyLaneOffset(position: { x: number; z: number }, from: number, to: number, agent: Agent) {
  const dx = (to % GRID_WIDTH) - (from % GRID_WIDTH);
  const dz = Math.floor(to / GRID_WIDTH) - Math.floor(from / GRID_WIDTH);
  const length = Math.hypot(dx, dz) || 1;
  const forward = { x: dx / length, z: dz / length };
  const normal = { x: -forward.z, z: forward.x };
  const lanes = tileLanes[from] >= 2 ? 2 : 1;
  const sidewalkWidth = tileSidewalk[from] || 0;
  let offset = 0;
  if (agent.type === "pedestrian") {
    const curb = 0.32 + sidewalkWidth * 2;
    offset = curb * (agent.laneBias >= 0 ? 1 : -1);
  } else if (agent.type === "scooter") {
    offset = (0.18 + sidewalkWidth) * (agent.laneBias >= 0 ? 1 : -1);
  } else {
    if (lanes === 2) {
      offset = 0.12 * (agent.laneBias >= 0 ? 1 : -1);
    } else {
      offset = 0;
    }
  }
  return {
    x: position.x + normal.x * offset,
    z: position.z + normal.z * offset
  };
}

function aStar(start: number, goal: number, type: AgentType) {
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
      return path.reverse();
    }
    for (const next of neighbors(current)) {
      if (!passable(next, type)) continue;
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
    const startRoad = findNearestRoad(start, "car");
    const endRoad = findNearestRoad(end, "car");
    if (startRoad === null || endRoad === null) continue;
    const path = aStar(startRoad, endRoad, "car");
    if (!path) continue;
    for (const step of path) {
      traffic[step] += 0.01;
    }
  }
}

function findNearestSplineSegment(pos: { x: number; z: number }, type: AgentType) {
  let nearestSegment = -1;
  let minDist = Infinity;

  for (let i = 0; i < roadSegments.length; i++) {
    const segment = roadSegments[i];
    if (segment.roadWidth === "narrow" && (type === "car" || type === "truck")) continue;

    for (let p = 0; p < segment.points.length - 1; p++) {
      const { dist } = distanceToSegment(pos, segment.points[p], segment.points[p + 1]);
      if (dist < minDist) {
        minDist = dist;
        nearestSegment = i;
      }
    }
  }

  return nearestSegment;
}

function getSplinePosition(segmentId: number, progress: number) {
  if (segmentId < 0 || segmentId >= roadSegments.length) return { x: 0, z: 0 };
  const segment = roadSegments[segmentId];
  const points = segment.points;
  if (points.length === 0) return { x: 0, z: 0 };

  const totalLength = points.length - 1;
  const t = Math.max(0, Math.min(1, progress));
  const index = Math.min(Math.floor(t * totalLength), totalLength - 1);
  const localT = (t * totalLength) - index;

  const p0 = points[index];
  const p1 = points[Math.min(index + 1, points.length - 1)];

  return {
    x: p0.x + (p1.x - p0.x) * localT,
    z: p0.z + (p1.z - p0.z) * localT
  };
}

function spawnAgents() {
  agents.length = 0;
  const types: AgentType[] = ["pedestrian", "scooter", "car", "truck"];
  const typeWeights = [0.2, 0.4, 0.3, 0.1];
  for (let i = 0; i < 150; i++) {
    const rand = Math.random();
    let type: AgentType = "car";
    if (rand < typeWeights[0]) {
      type = "pedestrian";
    } else if (rand < typeWeights[0] + typeWeights[1]) {
      type = "scooter";
    } else if (rand < typeWeights[0] + typeWeights[1] + typeWeights[2]) {
      type = "car";
    } else {
      type = "truck";
    }
    const start = randomTile(2) ?? randomTile(3);
    const end = randomTile(3) ?? randomTile(2);
    if (start === null || end === null) continue;
    const startRoad = findNearestRoad(start, type);
    const endRoad = findNearestRoad(end, type);
    if (startRoad === null || endRoad === null) continue;
    const path = aStar(startRoad, endRoad, type);
    if (!path || path.length === 0) continue;
    const startPos = tileCenter(startRoad);
    const splineSegment = findNearestSplineSegment(startPos, type);
    agents.push({
      id: i,
      type,
      path,
      pathIndex: 0,
      progress: 0,
      position: { x: startPos.x, z: startPos.z },
      destination: endRoad,
      laneBias: Math.random() > 0.5 ? 1 : -1,
      splineSegment,
      splineProgress: 0,
      splineDirection: 1
    });
  }
  console.log(`Spawned ${agents.length} agents (all have valid paths)`);
}

function agentSpeed(type: AgentType, tileIndex: number) {
  const sidewalk = tileSidewalk[tileIndex] || 0;
  const speedLimit = tileSpeed[tileIndex] || 30;
  if (type === "pedestrian") {
    return 0.3 * (1 + sidewalk * 3);
  }
  const base = type === "scooter" ? 0.7 : type === "car" ? 0.5 : 0.4;
  const limitFactor = speedLimit / 40;
  const sidewalkPenalty = 1 - Math.min(0.5, sidewalk * 1.6);
  return base * limitFactor * sidewalkPenalty;
}

let updateAgentDebugCounter = 0;
function updateAgents(dt: number) {
  let movedCount = 0;
  for (const agent of agents) {
    if (agent.path.length === 0) continue;
    const currentIndex = agent.path[agent.pathIndex];
    const nextIndex = agent.path[Math.min(agent.pathIndex + 1, agent.path.length - 1)];
    const dir = movementDir(currentIndex, nextIndex);
    if (agent.type !== "pedestrian" && !signalAllowsMove(currentIndex, dir, agent.type)) {
      continue;
    }

    if (agent.splineSegment !== null && agent.splineSegment >= 0 && agent.splineSegment < roadSegments.length) {
      const segment = roadSegments[agent.splineSegment];
      const speed = agentSpeed(agent.type, currentIndex) * dt * 0.015;
      agent.splineProgress += speed * agent.splineDirection;

      if (agent.splineProgress > 1.0 || agent.splineProgress < 0.0) {
        agent.splineProgress = Math.max(0, Math.min(1, agent.splineProgress));
        const currentPos = tileCenter(currentIndex);
        agent.splineSegment = findNearestSplineSegment(currentPos, agent.type);
        agent.splineProgress = 0;
      }

      const basePos = getSplinePosition(agent.splineSegment, agent.splineProgress);
      const offsetPos = applySplineLaneOffset(basePos, agent.splineSegment, agent.splineProgress, agent);
      agent.position.x = offsetPos.x;
      agent.position.z = offsetPos.z;
    } else {
      const currentPos = applyLaneOffset(tileCenter(currentIndex), currentIndex, nextIndex, agent);
      const nextPos = applyLaneOffset(tileCenter(nextIndex), currentIndex, nextIndex, agent);
      const speed = agentSpeed(agent.type, currentIndex) * dt;
      agent.progress += speed;
      if (agent.progress > 0.01) movedCount++;
      const t = agent.progress;
      agent.position.x = currentPos.x + (nextPos.x - currentPos.x) * t;
      agent.position.z = currentPos.z + (nextPos.z - currentPos.z) * t;
    }

    agent.progress += agentSpeed(agent.type, currentIndex) * dt;
    if (agent.progress > 0.01) movedCount++;
    if (agent.progress >= 1) {
      agent.pathIndex = Math.min(agent.pathIndex + 1, agent.path.length - 1);
      agent.progress = 0;
      const reachedIndex = agent.path[agent.pathIndex];
      if (agent.pathIndex >= agent.path.length - 1) {
        const newEnd = randomTile(Math.random() > 0.6 ? 3 : 2);
        const newEndRoad = newEnd !== null ? findNearestRoad(newEnd, agent.type) : null;
        if (newEndRoad !== null) {
          agent.destination = newEndRoad;
          const newPath = aStar(reachedIndex, newEndRoad, agent.type);
          if (newPath) {
            agent.path = newPath;
            agent.pathIndex = 0;
            agent.progress = 0;
            const snap = tileCenter(reachedIndex);
            agent.position.x = snap.x;
            agent.position.z = snap.z;
            agent.splineSegment = findNearestSplineSegment(snap, agent.type);
            agent.splineProgress = 0;
          }
        }
      }
    }
  }
  if (updateAgentDebugCounter++ % 60 === 0) {
    console.log(`updateAgents called. Agents: ${agents.length}, Moving: ${movedCount}, dt: ${dt.toFixed(4)}`);
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

function findNearestRoad(index: number, type: AgentType) {
  const queue: number[] = [index];
  const visited = new Set<number>([index]);
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    if (passable(current, type)) return current;
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

  const tripCount = Math.floor(state.population / 800) * policyEffects.trafficFactor * policyEffects.transitFactor;
  runTrips(Math.max(40, tripCount));

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
    const sidewalkPenalty = 1 - Math.min(0.5, tileSidewalk[i] * 1.8);
    const capacity = Math.max(0.2, tileLanes[i]) * (speed / 30) * (tilePedOnly[i] ? 0.1 : 1) * sidewalkPenalty;
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

canvas.addEventListener("click", async (event) => {
  await audioEngine.init();
  audioEngine.playUIClick();

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
    selectedRoadSegment = null;
    selection.fill(0);
    audioEngine.playSelectionPing();
    updateRightPanel();
    return;
  }
  selectedAgent = null;
  const worldPos = screenToWorld(x, y, invViewProj);
  console.log(`Click screen: (${x.toFixed(0)}, ${y.toFixed(0)}) -> world: ${worldPos ? `(${worldPos.x.toFixed(2)}, ${worldPos.z.toFixed(2)})` : 'null'}`);
  if (worldPos) {
    const tileX = clamp(Math.floor(worldPos.x), 0, GRID_WIDTH - 1);
    const tileY = clamp(Math.floor(worldPos.z), 0, GRID_HEIGHT - 1);
    const idx = indexFor(tileX, tileY);
    console.log(`Selected tile (${tileX}, ${tileY}), idx=${idx}, type=${tileType[idx]}`);
    selectedIndex = idx;
    selection.fill(0);
    if (tileType[idx] === 1 && tileRoadSegment[idx] >= 0) {
      selectedRoadSegment = tileRoadSegment[idx];
      const segment = roadSegments[selectedRoadSegment];
      if (segment) {
        segment.tiles.forEach((tile) => {
          selection[tile] = 1;
        });
      } else {
        selection[idx] = 1;
      }
    } else {
      selectedRoadSegment = null;
      selection[idx] = 1;
    }
    audioEngine.playSelectionPing();
    updateRightPanel();
    updateTextures();
  }
});

canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

canvas.addEventListener("mousedown", (event) => {
  console.log(`Mouse down: button=${event.button}`);
  if (event.button === 1) {
    isDraggingPan = true;
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;
    event.preventDefault();
    console.log("Pan mode activated");
  } else if (event.button === 2) {
    isDraggingRotate = true;
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;
    console.log("Rotate mode activated");
  }
});

canvas.addEventListener("mousemove", (event) => {
  if (isDraggingPan) {
    const dx = event.clientX - lastMouseX;
    const dy = event.clientY - lastMouseY;
    const panSpeed = 0.1;
    const right = Math.cos(cameraAngle);
    const forward = -Math.sin(cameraAngle);
    cameraPanX += (right * dx - forward * dy) * panSpeed;
    cameraPanZ += (forward * dx + right * dy) * panSpeed;
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;
    console.log(`Pan: ${cameraPanX.toFixed(2)}, ${cameraPanZ.toFixed(2)}`);
  } else if (isDraggingRotate) {
    const dx = event.clientX - lastMouseX;
    const dy = event.clientY - lastMouseY;
    cameraAngle -= dx * 0.01;
    cameraTilt = clamp(cameraTilt + dy * 0.005, Math.PI / 8, Math.PI / 2.2);
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;
    console.log(`Rotate: angle=${cameraAngle.toFixed(2)}, tilt=${cameraTilt.toFixed(2)}`);
  }
});

canvas.addEventListener("mouseup", () => {
  isDraggingPan = false;
  isDraggingRotate = false;
});

canvas.addEventListener("mouseleave", () => {
  isDraggingPan = false;
  isDraggingRotate = false;
});

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  const zoomSpeed = 0.05;
  cameraDistance = clamp(cameraDistance + event.deltaY * zoomSpeed, 10, 50);
  console.log(`Zoom: ${cameraDistance.toFixed(2)}`);
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

  const modalCloseBtn = document.getElementById("modal-close");
  if (modalCloseBtn) {
    modalCloseBtn.addEventListener("click", async () => {
      await audioEngine.init();
      audioEngine.startAmbientTraffic();
      audioEngine.playUIClick();
    });
  }
}

initUI();
updateTextures();
updateAgentInstances();
loop();
