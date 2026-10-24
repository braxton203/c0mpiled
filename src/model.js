// Shared domain shapes. Coordinates and dimensions are meters from floor origin.
export const FLOOR = Object.freeze({ width: 60, height: 36 });
export const ASSET_STORAGE_KEY = 'floorwatch-admin-tracked-assets-v1';
export const ZONE_STORAGE_KEY = 'floorwatch-admin-zones-v1';

export const DEFAULT_ZONES = Object.freeze([
  Object.freeze({ id: 'ZONE-A', name: 'Robot cell', x: 43, y: 4, width: 12, height: 10 }),
  Object.freeze({ id: 'ZONE-B', name: 'Loading bay', x: 4, y: 4, width: 9, height: 7 }),
]);

// Records have identity/configuration only. Their changing positions come from
// src/simulation.js or a real tracking adapter.
export const INITIAL_STATE = Object.freeze({
  workers: Object.freeze([
    Object.freeze({ id: 'W-01', name: 'Worker 01' }),
    Object.freeze({ id: 'W-02', name: 'Worker 02' }),
    Object.freeze({ id: 'W-03', name: 'Worker 03' }),
  ]),
  vehicles: Object.freeze([
    Object.freeze({ id: 'FL-01', name: 'Forklift 01', kind: 'Forklift' }),
  ]),
  zones: DEFAULT_ZONES,
});

export function createInitialState() {
  return {
    workers: INITIAL_STATE.workers.map((item) => ({ ...item })),
    vehicles: INITIAL_STATE.vehicles.map((item) => ({ ...item })),
    zones: DEFAULT_ZONES.map((zone) => ({ ...zone })),
  };
}
