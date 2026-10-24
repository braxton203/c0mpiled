import { ASSET_STORAGE_KEY, createInitialState, FLOOR, ZONE_STORAGE_KEY } from './model.js';
import { createSimulator, stepSimulator } from './simulation.js';
import { SAFETY_CONFIG, evaluateSafety } from './safety.js';
import { renderFactory } from './renderer.js';

const canvas = document.querySelector('#factory-map');
const alerts = document.querySelector('#alerts');
const stateLabel = document.querySelector('#sim-status');
const pauseButton = document.querySelector('#pause-button');
let state = loadFloorState();
let simulator = createSimulator(state);
let positions = stepSimulator(simulator, state, 0);
let running = true;
let lastFrame = performance.now();

function draw() {
  const events = evaluateSafety(state, positions, SAFETY_CONFIG);
  renderFactory(canvas, state, positions, events);
  document.querySelector('#worker-count').textContent = state.workers.length;
  document.querySelector('#vehicle-count').textContent = state.vehicles.length;
  document.querySelector('#event-count').textContent = events.length;
  alerts.innerHTML = events.length
    ? events.map((event) => `<article class="alert-item ${event.severity}"><header><i class="alert-icon"></i>${escapeHtml(event.title)}</header><p>${escapeHtml(event.detail)}</p></article>`).join('')
    : '<p class="empty-state">No active safety events.</p>';
}

function frame(now) {
  const dt = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;
  if (running) positions = stepSimulator(simulator, state, dt);
  draw();
  requestAnimationFrame(frame);
}

pauseButton.addEventListener('click', () => {
  running = !running;
  pauseButton.textContent = running ? 'Pause simulation' : 'Resume simulation';
  stateLabel.textContent = running ? 'RUNNING' : 'PAUSED';
});

document.querySelector('#reset-button').addEventListener('click', () => {
  state = loadFloorState();
  simulator = createSimulator(state);
  positions = stepSimulator(simulator, state, 0);
  running = true;
  pauseButton.textContent = 'Pause simulation';
  stateLabel.textContent = 'RUNNING';
});

window.addEventListener('resize', draw);
window.addEventListener('storage', (event) => {
  if (event.key !== null && event.key !== ASSET_STORAGE_KEY && event.key !== ZONE_STORAGE_KEY) return;
  state = loadFloorState();
  simulator = createSimulator(state);
  positions = stepSimulator(simulator, state, 0);
  draw();
});
requestAnimationFrame(frame);

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function loadFloorState() {
  const state = createInitialState();
  try {
    const records = JSON.parse(localStorage.getItem(ASSET_STORAGE_KEY));
    if (Array.isArray(records)) {
      state.workers = records
        .filter((record) => record?.type === 'worker' && typeof record.id === 'string' && typeof record.name === 'string')
        .map(({ id, name }) => ({ id, name }));
      state.vehicles = records
        .filter((record) => record?.type === 'equipment' && typeof record.id === 'string' && typeof record.name === 'string')
        .map(({ id, name, kind }) => ({ id, name, kind: kind || 'Mobile equipment' }));
    }
    const storedZones = JSON.parse(localStorage.getItem(ZONE_STORAGE_KEY));
    if (Array.isArray(storedZones)) {
      state.zones = storedZones.filter((zone) => zone && typeof zone.id === 'string' && typeof zone.name === 'string' &&
        Number.isFinite(zone.x) && Number.isFinite(zone.y) && Number.isFinite(zone.width) && Number.isFinite(zone.height) &&
        zone.x >= 0 && zone.y >= 0 && zone.width > 0 && zone.height > 0 &&
        zone.x + zone.width <= FLOOR.width && zone.y + zone.height <= FLOOR.height);
    }
  } catch {
    // Fall back to the built-in sample floor if browser storage is unavailable.
  }
  return state;
}
