import { createSimulation, stepSimulation, resetSimulation } from './simulation.js';
import { evaluateSafety } from './safety.js';
import { renderFactory } from './renderer.js';

const canvas = document.querySelector('#factory-map');
const alerts = document.querySelector('#alerts');
const stateLabel = document.querySelector('#sim-status');
const pauseButton = document.querySelector('#pause-button');
let state = createSimulation();
let lastFrame = performance.now();

function draw() {
  const events = evaluateSafety(state);
  renderFactory(canvas, state, events);
  document.querySelector('#worker-count').textContent = state.workers.length;
  document.querySelector('#vehicle-count').textContent = state.vehicles.length;
  document.querySelector('#event-count').textContent = events.length;
  alerts.innerHTML = events.length ? events.map((event) => `<article class="alert-item ${event.severity}"><header><i class="alert-icon"></i>${event.title}</header><p>${event.detail}</p></article>`).join('') : '<p class="empty-state">No active safety events.</p>';
}

function frame(now) {
  const dt = Math.min((now - lastFrame) / 1000, 0.05); lastFrame = now;
  if (state.running) state = stepSimulation(state, dt);
  draw(); requestAnimationFrame(frame);
}

pauseButton.addEventListener('click', () => { state = { ...state, running: !state.running }; pauseButton.textContent = state.running ? 'Pause simulation' : 'Resume simulation'; stateLabel.textContent = state.running ? 'RUNNING' : 'PAUSED'; });
document.querySelector('#reset-button').addEventListener('click', () => { state = resetSimulation(); pauseButton.textContent = 'Pause simulation'; stateLabel.textContent = 'RUNNING'; });
window.addEventListener('resize', draw);
requestAnimationFrame(frame);
