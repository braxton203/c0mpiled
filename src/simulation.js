import { FLOOR, createInitialState } from './model.js';

// Pure-ish motion update: input state is not mutated. dt is seconds.
export function createSimulation() { return createInitialState(); }

export function stepSimulation(state, dt) {
  const advance = (entity, margin = 1.5) => {
    let x = entity.x + entity.vx * dt;
    let y = entity.y + entity.vy * dt;
    let vx = entity.vx;
    let vy = entity.vy;
    if (x < margin || x > FLOOR.width - margin) vx *= -1;
    if (y < margin || y > FLOOR.height - margin) vy *= -1;
    x = Math.max(margin, Math.min(FLOOR.width - margin, x));
    y = Math.max(margin, Math.min(FLOOR.height - margin, y));
    return { ...entity, x, y, vx, vy, ...(entity.heading === undefined ? {} : { heading: Math.atan2(vy, vx) }) };
  };
  return { ...state, tick: state.tick + 1, workers: state.workers.map((worker) => advance(worker)), vehicles: state.vehicles.map((vehicle) => advance(vehicle, 3)) };
}

export function resetSimulation() { return createSimulation(); }
