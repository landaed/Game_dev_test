import vertSource from "./shaders/city.vert?raw";
import fragSource from "./shaders/city.frag?raw";
import "./styles.css";

type TileType = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

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

const program = createProgram(vertSource, fragSource);
const positionBuffer = gl.createBuffer();
const vao = gl.createVertexArray();
if (!vao || !positionBuffer) {
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

const uGrid = gl.getUniformLocation(program, "u_grid");
const uTime = gl.getUniformLocation(program, "u_time");
const uViewMode = gl.getUniformLocation(program, "u_viewMode");

const tileDataTex = gl.createTexture();
const metrics0Tex = gl.createTexture();
const metrics1Tex = gl.createTexture();

if (!tileDataTex || !metrics0Tex || !metrics1Tex) {
  throw new Error("Texture creation failed");
}

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

function indexFor(x: number, y: number) {
  return y * GRID_WIDTH + x;
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

function buildBuffers() {
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
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
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(program);
  gl.uniform2f(uGrid, GRID_WIDTH, GRID_HEIGHT);
  gl.uniform1f(uTime, state.time);
  gl.uniform1i(uViewMode, viewMode);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tileDataTex);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, metrics0Tex);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, metrics1Tex);

  const uTileData = gl.getUniformLocation(program, "u_tileData");
  const uMetrics0 = gl.getUniformLocation(program, "u_metrics0");
  const uMetrics1 = gl.getUniformLocation(program, "u_metrics1");
  gl.uniform1i(uTileData, 0);
  gl.uniform1i(uMetrics0, 1);
  gl.uniform1i(uMetrics1, 2);

  gl.bindVertexArray(vao);
  gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, TILE_COUNT);
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

function tick(dt: number) {
  if (state.lost || state.won) return;
  state.time += dt;
  state.electionTimer -= dt;
  evaluateSimulation(dt);
  updateTextures();
  updateHud();
  updateRightPanel();
}

function loop() {
  const step = 1 / 2;
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
  const tileX = clamp(Math.floor((x / rect.width) * GRID_WIDTH), 0, GRID_WIDTH - 1);
  const tileY = clamp(Math.floor(((rect.height - y) / rect.height) * GRID_HEIGHT), 0, GRID_HEIGHT - 1);
  const idx = indexFor(tileX, tileY);
  selectedIndex = idx;
  selection.fill(0);
  selection[idx] = 1;
  updateRightPanel();
  updateTextures();
});

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
loop();
