# Sidewalk Savior: Taiwan Edition

A single-player urban policy + city-tinkering prototype where you inherit a Taiwanese city with chaotic planning. Fix sidewalks, rein in scooters, and survive the next election.

## Run
```bash
npm install
npm run dev
```

## Controls
- **Click** a tile to select it.
- **Click** pedestrians/scooters/cars/trucks to inspect their routes.
- **Middle-click + Drag** to pan the camera around the city (screen-space panning).
- **Right-click + Drag** to rotate the camera (orbital rotation).
- **Scroll** with mouse wheel to zoom in and out.
- **Left panel**: apply road actions or enact/repeal policies.
- **Bottom bar**: switch heatmap view modes and simulation speed.
- **Save/Load** uses `localStorage`.

## Core Mechanics
- **Urban edits**: toggle one-way, change speed limits, add sidewalks, pedestrianize streets, apply scooter restrictions, or add noise barriers.
- **Policies**: 8 citywide policies with political point + cash costs. Active policies shift traffic, noise, and income.
- **Simulation**: traffic, noise, pedestrian friendliness, income, and happiness update in real time.
- **Agents**: pedestrians, scooters, cars, and trucks move through the city and can be clicked for metadata.
- **Elections**: approval is checked every election interval (defaults to 180s in quick mode). Fail with approval below 50.
- **Bankruptcy**: lose if cash deficit or debt exceeds limits.

## Tuning Constants
Inside `src/main.ts`:
- `ELECTION_INTERVAL = 600` seconds
- `QUICK_ELECTION_INTERVAL = 180` seconds
- `REQUIRED_APPROVAL = 50`
- `MAX_CASH_DEFICIT = 200000`
- `MAX_DEBT = 500000`
- `GRID_WIDTH = 40`, `GRID_HEIGHT = 30`

## Shader Pipeline Overview
- **Rendering approach**: 3D tile instancing over a 40x30 grid with a tilted camera, plus instanced cubes for buildings and moving agents.
- **Data textures**:
  - `u_tileData` packs `tileType`, `lanes`, `sidewalkWidth`, `speedLimit`.
  - `u_metrics0` packs `traffic`, `noise`, `ped`, `income`.
  - `u_metrics1` packs `happiness`, `selection`, `oneWay`, `pedOnly`.
- **Procedural materials**:
  - Roads: fBm asphalt grain, lane stripes, cracks, and chevron arrows for one-way hints.
  - Sidewalks: concrete slab grid, curb highlights, sidewalk width baked into UV.
  - Buildings: hashed per-tile roof color variation, window grids, and height-based shading.
- **Heatmaps**: blended in the fragment shader with smooth gradient + noise dithering to reduce banding.

## Policies
1. Congestion Pricing
2. Scooter Licensing Crackdown
3. Night Noise Curfew
4. Sidewalk Expansion Program
5. Public Transit Subsidy
6. Parking Enforcement
7. Street Vendor Permits
8. Vision Zero Campaign

## Win/Lose Conditions
- **Win**: survive 3 elections with approval above 60.
- **Lose**: approval below 50 at election time, cash deficit below -$200k, or debt above $500k.

## Notes
This prototype uses procedural shaders only—no external images or textures.
