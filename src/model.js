// Shared simulation contract. Coordinates are meters from the top-left of the floor.
export const FLOOR = { width: 60, height: 36 };

export const INITIAL_STATE = {
  running: true,
  tick: 0,
  workers: [
    { id: 'W-01', x: 18, y: 12, vx: 0.65, vy: 0.35 },
    { id: 'W-02', x: 39, y: 26, vx: -0.5, vy: -0.25 },
    { id: 'W-03', x: 9, y: 27, vx: 0.35, vy: -0.4 },
  ],
  vehicles: [{ id: 'FL-01', x: 31, y: 17, vx: -0.7, vy: 0.2, heading: 0 }],
  zones: [
    { id: 'ZONE-A', name: 'Robot cell', x: 43, y: 4, width: 12, height: 10 },
    { id: 'ZONE-B', name: 'Loading bay', x: 4, y: 4, width: 9, height: 7 },
  ],
};

export function createInitialState() {
  return structuredClone(INITIAL_STATE);
}
