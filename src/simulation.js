import { FLOOR } from './model.js';

const SPAWNS = {
  workers: [[8, 13], [20, 13], [37, 22], [53, 22], [10, 29], [41, 13], [24, 22]],
  vehicles: [[8, 17.5], [28.5, 12], [47.5, 23], [53, 17.5]],
};

const MARGINS = { workers: 1, vehicles: 2 };

/** Create the demo position source for the current set of app records. */
export function createSimulator(state) {
  const simulator = {
    elapsed: 0,
    entities: { workers: Object.create(null), vehicles: Object.create(null) },
  };
  syncRecords(simulator, state);
  return simulator;
}

/**
 * Advance simulated positions by dt seconds. New records get a deterministic
 * spawn and movement vector; deleted records disappear from this snapshot.
 * App records are read-only and are never created or removed here.
 */
export function stepSimulator(simulator, state, dt) {
  if (!simulator?.entities) throw new TypeError('Use createSimulator(state) first.');
  const elapsed = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.1)) : 0;
  simulator.elapsed += elapsed;
  syncRecords(simulator, state);

  for (const kind of ['workers', 'vehicles']) {
    for (const entity of Object.values(simulator.entities[kind])) {
      bounce(entity, elapsed, MARGINS[kind]);
    }
  }

  return {
    workers: (state.workers || []).map(({ id }) => {
      const { x, y } = simulator.entities.workers[id];
      return { id, x, y };
    }),
    vehicles: getVehicles(state).map(({ id }) => {
      const { x, y, heading } = simulator.entities.vehicles[id];
      return { id, x, y, heading };
    }),
  };
}

function getVehicles(state) {
  return state.vehicles || state.equipment || [];
}

function syncRecords(simulator, state) {
  const collections = [
    ['workers', state.workers || []],
    ['vehicles', getVehicles(state)],
  ];
  for (const [kind, records] of collections) {
    const ids = new Set(records.map((record) => String(record.id)));
    for (const id of Object.keys(simulator.entities[kind])) {
      if (!ids.has(id)) delete simulator.entities[kind][id];
    }
    records.forEach((record, index) => {
      const id = String(record.id);
      if (!simulator.entities[kind][id]) {
        simulator.entities[kind][id] = createMovingEntity(id, kind, index);
      }
    });
  }
}

function createMovingEntity(id, kind, index) {
  const points = SPAWNS[kind];
  const spawn = points[index % points.length];
  const seed = hashId(id);
  const margin = MARGINS[kind];
  const x = Math.max(margin, Math.min(FLOOR.width - margin, spawn[0]));
  const y = Math.max(margin, Math.min(FLOOR.height - margin, spawn[1]));
  // Vehicles use a lane-following horizontal path. Workers move more slowly in
  // varied directions. Both bounce at the floor edge and remain in bounds.
  const angle = kind === 'vehicles'
    ? (index % 2 === 0 ? 0 : Math.PI)
    : seed * Math.PI * 2;
  const speed = kind === 'vehicles' ? 2.1 + seed * 0.9 : 0.65 + seed * 0.55;
  return { x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, heading: angle };
}

function bounce(entity, dt, margin) {
  let x = entity.x + entity.vx * dt;
  let y = entity.y + entity.vy * dt;
  if (x < margin || x > FLOOR.width - margin) entity.vx *= -1;
  if (y < margin || y > FLOOR.height - margin) entity.vy *= -1;
  entity.x = Math.max(margin, Math.min(FLOOR.width - margin, x));
  entity.y = Math.max(margin, Math.min(FLOOR.height - margin, y));
  entity.heading = Math.atan2(entity.vy, entity.vx);
}

function hashId(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}
