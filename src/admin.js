const FLOOR = { width: 60, height: 36 };
const STORAGE_KEY = 'floorwatch-admin-config-v1';
const ROLE_KEY = 'floorwatch-admin-demo-role';
const defaults = {
  workers: [
    { id: 'W-01', name: 'Avery Chen', x: 10, y: 12 },
    { id: 'W-02', name: 'Morgan Diaz', x: 21, y: 19 },
    { id: 'W-03', name: 'Sam Patel', x: 47, y: 27 },
  ],
  equipment: [
    { id: 'EQ-01', name: 'Forklift 01', kind: 'Forklift', x: 34, y: 12, routeX: 48, routeY: 12 },
    { id: 'EQ-02', name: 'Tugger 02', kind: 'Tugger', x: 35, y: 26, routeX: 17, routeY: 26 },
  ],
  zones: [
    { id: 'Z-01', name: 'Robot cell', x: 45, y: 3, width: 11, height: 9 },
    { id: 'Z-02', name: 'Loading bay', x: 3, y: 3, width: 10, height: 7 },
  ],
  thresholds: { workers: 3, equipment: 5 },
};

const workspace = document.querySelector('#admin-workspace');
const gate = document.querySelector('#access-gate');
const canvas = document.querySelector('#admin-map');
const context = canvas.getContext('2d');
const form = document.querySelector('#item-form');
const kindInput = document.querySelector('#item-kind');
const nameInput = document.querySelector('#item-name');
const xInput = document.querySelector('#item-x');
const yInput = document.querySelector('#item-y');
const routeXInput = document.querySelector('#route-x');
const routeYInput = document.querySelector('#route-y');
const zoneWidthInput = document.querySelector('#zone-width');
const zoneHeightInput = document.querySelector('#zone-height');
const routeFields = document.querySelector('#route-fields');
const zoneFields = document.querySelector('#zone-fields');
const saveButton = document.querySelector('#save-item');
const deleteButton = document.querySelector('#delete-item');
const inventory = document.querySelector('#inventory-list');
const toolHint = document.querySelector('#tool-hint');
const workerThreshold = document.querySelector('#worker-threshold');
const equipmentThreshold = document.querySelector('#equipment-threshold');

let state = loadState();
let selected = null;
let tool = 'select';
let dragging = false;
let transform = { scale: 1, ox: 0, oy: 0 };

function copyDefaults() {
  return structuredClone(defaults);
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.workers) && Array.isArray(saved.equipment) && Array.isArray(saved.zones)) {
      return {
        workers: saved.workers,
        equipment: saved.equipment,
        zones: saved.zones,
        thresholds: { ...defaults.thresholds, ...saved.thresholds },
      };
    }
  } catch {
    // Invalid or unavailable local storage falls back to the sample plan.
  }
  return copyDefaults();
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const label = document.querySelector('#save-state');
    label.textContent = 'Saved in this browser';
    label.previousElementSibling.style.background = '#76ac48';
  } catch {
    const label = document.querySelector('#save-state');
    label.textContent = 'Browser storage unavailable';
    label.previousElementSibling.style.background = '#d49b3f';
  }
}

function scheduleSave() {
  const label = document.querySelector('#save-state');
  label.textContent = 'Saving changes...';
  render();
  saveState();
}

function getSelectedItem() {
  if (!selected) return null;
  const list = selected.type === 'worker' ? state.workers : selected.type === 'equipment' ? state.equipment : state.zones;
  return list.find((item) => item.id === selected.id) || null;
}

function setSelected(type, id) {
  selected = { type, id };
  const item = getSelectedItem();
  if (!item) return;
  kindInput.value = type === 'worker' ? 'worker' : type === 'zone' ? 'zone' : item.kind;
  kindInput.disabled = true;
  nameInput.value = item.name;
  xInput.value = item.x;
  yInput.value = item.y;
  routeXInput.value = item.routeX ?? Math.min(FLOOR.width, item.x + 10);
  routeYInput.value = item.routeY ?? item.y;
  zoneWidthInput.value = item.width ?? 8;
  zoneHeightInput.value = item.height ?? 6;
  saveButton.innerHTML = '<span aria-hidden="true">✓</span> Save item changes';
  deleteButton.hidden = false;
  updateFieldVisibility();
  render();
}

function clearSelection() {
  selected = null;
  kindInput.disabled = false;
  saveButton.innerHTML = '<span aria-hidden="true">+</span> Add to floor plan';
  deleteButton.hidden = true;
  render();
}

function setTool(nextTool) {
  tool = nextTool;
  document.querySelectorAll('.tool-button').forEach((button) => {
    const active = button.dataset.tool === tool;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const hints = {
    select: 'Select an item on the plan to edit it, or drag it to a new position.',
    worker: 'Click the plan to place a worker, or enter a position below.',
    equipment: 'Click the plan to place mobile equipment, or enter a position below.',
    zone: 'Click the plan to place a restricted area, or enter a position below.',
  };
  toolHint.textContent = hints[tool];
  if (tool !== 'select') {
    kindInput.value = tool === 'zone' ? 'zone' : tool === 'worker' ? 'worker' : 'Forklift';
    clearSelection();
  }
  updateFieldVisibility();
}

function updateFieldVisibility() {
  routeFields.hidden = kindInput.value === 'worker' || kindInput.value === 'zone';
  zoneFields.hidden = kindInput.value !== 'zone';
}

function numberValue(input, fallback = 0) {
  const value = Number(input.value);
  return Number.isFinite(value) ? value : fallback;
}

function clampPosition(x, y, width = 0, height = 0) {
  return {
    x: Math.max(0, Math.min(FLOOR.width - width, x)),
    y: Math.max(0, Math.min(FLOOR.height - height, y)),
  };
}

function nextId(type) {
  const list = type === 'worker' ? state.workers : type === 'equipment' ? state.equipment : state.zones;
  const prefix = type === 'worker' ? 'W-' : type === 'equipment' ? 'EQ-' : 'Z-';
  let index = 1;
  while (list.some((item) => item.id === `${prefix}${String(index).padStart(2, '0')}`)) index += 1;
  return `${prefix}${String(index).padStart(2, '0')}`;
}

function createItem(kind, x, y) {
  const name = nameInput.value.trim();
  if (!name) {
    nameInput.focus();
    nameInput.setCustomValidity('Add a name or label first.');
    nameInput.reportValidity();
    nameInput.setCustomValidity('');
    return;
  }
  const type = kind === 'worker' ? 'worker' : kind === 'zone' ? 'zone' : 'equipment';
  const width = type === 'zone' ? Math.max(1, numberValue(zoneWidthInput, 8)) : 0;
  const height = type === 'zone' ? Math.max(1, numberValue(zoneHeightInput, 6)) : 0;
  const position = clampPosition(x, y, width, height);
  let item;
  if (type === 'worker') {
    item = { id: nextId(type), name, ...position };
    state.workers.push(item);
  } else if (type === 'equipment') {
    const route = clampPosition(numberValue(routeXInput, 40), numberValue(routeYInput, y));
    item = { id: nextId(type), name, kind, ...position, routeX: route.x, routeY: route.y };
    state.equipment.push(item);
  } else {
    item = { id: nextId(type), name, ...position, width, height };
    state.zones.push(item);
  }
  setSelected(type, item.id);
  nameInput.value = '';
  scheduleSave();
}

function updateSelectedFromForm() {
  const item = getSelectedItem();
  if (!item) return;
  item.name = nameInput.value.trim() || item.name;
  const width = selected.type === 'zone' ? Math.max(1, numberValue(zoneWidthInput, item.width)) : 0;
  const height = selected.type === 'zone' ? Math.max(1, numberValue(zoneHeightInput, item.height)) : 0;
  const position = clampPosition(numberValue(xInput, item.x), numberValue(yInput, item.y), width, height);
  Object.assign(item, position);
  if (selected.type === 'zone') {
    item.width = Math.min(FLOOR.width, width);
    item.height = Math.min(FLOOR.height, height);
    Object.assign(item, clampPosition(item.x, item.y, item.width, item.height));
  }
  if (selected.type === 'equipment') {
    const route = clampPosition(numberValue(routeXInput, item.routeX), numberValue(routeYInput, item.routeY));
    item.routeX = route.x;
    item.routeY = route.y;
  }
  scheduleSave();
}

function removeSelected() {
  if (!selected) return;
  const type = selected.type;
  const list = type === 'worker' ? state.workers : type === 'equipment' ? state.equipment : state.zones;
  const index = list.findIndex((item) => item.id === selected.id);
  if (index >= 0) list.splice(index, 1);
  selected = null;
  kindInput.disabled = false;
  saveButton.innerHTML = '<span aria-hidden="true">+</span> Add to floor plan';
  deleteButton.hidden = true;
  scheduleSave();
}

function calculateAlerts() {
  const events = [];
  const workerLimit = Number(state.thresholds.workers) || defaults.thresholds.workers;
  const equipmentLimit = Number(state.thresholds.equipment) || defaults.thresholds.equipment;
  for (let first = 0; first < state.workers.length; first += 1) {
    const worker = state.workers[first];
    for (let second = first + 1; second < state.workers.length; second += 1) {
      const other = state.workers[second];
      const distance = Math.hypot(worker.x - other.x, worker.y - other.y);
      if (distance <= workerLimit) events.push({ severity: distance <= workerLimit * 0.5 ? 'danger' : 'warning', title: 'Worker proximity', workerId: worker.id, otherWorkerId: other.id, detail: `${worker.name} and ${other.name} are ${distance.toFixed(1)} m apart.` });
    }
    for (const equipment of state.equipment) {
      const distance = Math.hypot(worker.x - equipment.x, worker.y - equipment.y);
      if (distance <= equipmentLimit) events.push({ severity: distance <= equipmentLimit * 0.5 ? 'danger' : 'warning', title: 'Equipment proximity', workerId: worker.id, equipmentId: equipment.id, detail: `${equipment.name} is ${distance.toFixed(1)} m from ${worker.name}.` });
    }
    for (const zone of state.zones) {
      if (worker.x >= zone.x && worker.x <= zone.x + zone.width && worker.y >= zone.y && worker.y <= zone.y + zone.height) events.push({ severity: 'danger', title: 'Restricted area overlap', detail: `${worker.name} is placed inside ${zone.name}.` });
    }
  }
  return events;
}

function renderInventory() {
  const groups = [
    { type: 'worker', title: 'WORKERS', items: state.workers },
    { type: 'equipment', title: 'MOBILE EQUIPMENT', items: state.equipment },
    { type: 'zone', title: 'RESTRICTED AREAS', items: state.zones },
  ];
  const itemCount = groups.reduce((count, group) => count + group.items.length, 0);
  document.querySelector('#roster-count').textContent = `${itemCount} ITEMS`;
  inventory.innerHTML = groups.map((group) => `<div class="inventory-group-label">${group.title} · ${group.items.length}</div>${group.items.length ? group.items.map((item) => {
    const isSelected = selected?.type === group.type && selected.id === item.id;
    const meta = group.type === 'zone' ? `${item.width} × ${item.height} m` : `${item.x.toFixed(1)}, ${item.y.toFixed(1)} m`;
    return `<button type="button" class="inventory-item${isSelected ? ' selected' : ''}" data-type="${group.type}" data-id="${item.id}"><i class="inventory-dot ${group.type}"></i><span class="inventory-name">${escapeHtml(item.name)}</span><span class="inventory-meta">${meta}</span></button>`;
  }).join('') : '<p class="inventory-empty">Nothing added yet.</p>'}`).join('');
}

function renderAlerts(events) {
  const alertList = document.querySelector('#admin-alerts');
  const review = document.querySelector('#review-state');
  const badge = document.querySelector('#admin-alert-count');
  badge.textContent = String(events.length).padStart(2, '0');
  review.textContent = events.length ? `${events.length} REVIEW${events.length === 1 ? '' : 'S'}` : 'CLEAR';
  review.classList.toggle('warning', events.some((event) => event.severity === 'warning'));
  review.classList.toggle('danger', events.some((event) => event.severity === 'danger'));
  alertList.innerHTML = events.length ? events.map((event) => `<article class="alert-card ${event.severity}"><div class="alert-title">${event.title}</div><div class="alert-detail">${escapeHtml(event.detail)}</div></article>`).join('') : '<p class="alert-clear">No proximity conflicts in this configuration.</p>';
}

function render() {
  document.querySelector('#admin-worker-count').textContent = String(state.workers.length).padStart(2, '0');
  document.querySelector('#admin-equipment-count').textContent = String(state.equipment.length).padStart(2, '0');
  document.querySelector('#admin-zone-count').textContent = String(state.zones.length).padStart(2, '0');
  renderInventory();
  renderAlerts(calculateAlerts());
  drawMap();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function drawMap() {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = window.devicePixelRatio || 1;
  const pixelWidth = Math.round(rect.width * dpr);
  const pixelHeight = Math.round(rect.height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  const width = rect.width;
  const height = rect.height;
  const padding = 23;
  const scale = Math.min((width - padding * 2) / FLOOR.width, (height - padding * 2) / FLOOR.height);
  const mapWidth = FLOOR.width * scale;
  const mapHeight = FLOOR.height * scale;
  const ox = (width - mapWidth) / 2;
  const oy = (height - mapHeight) / 2;
  transform = { scale, ox, oy };
  const px = (x) => ox + x * scale;
  const py = (y) => oy + y * scale;

  context.clearRect(0, 0, width, height);
  context.fillStyle = '#202d28';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#27362f';
  context.fillRect(ox, oy, mapWidth, mapHeight);
  context.save();
  context.beginPath();
  context.rect(ox, oy, mapWidth, mapHeight);
  context.clip();
  context.strokeStyle = 'rgba(199,220,202,.10)';
  context.lineWidth = 1;
  for (let x = 0; x <= FLOOR.width; x += 2) {
    context.beginPath(); context.moveTo(px(x), oy); context.lineTo(px(x), oy + mapHeight); context.stroke();
  }
  for (let y = 0; y <= FLOOR.height; y += 2) {
    context.beginPath(); context.moveTo(ox, py(y)); context.lineTo(ox + mapWidth, py(y)); context.stroke();
  }

  drawFixture(px, py, scale, 15, 5, 8, 4, 'PARTS');
  drawFixture(px, py, scale, 17, 25, 8, 5, 'ASSEMBLY');
  drawFixture(px, py, scale, 31, 5, 7, 4, 'STORAGE');
  drawFixture(px, py, scale, 32, 25, 9, 5, 'PACKING');

  for (const zone of state.zones) {
    const active = selected?.type === 'zone' && selected.id === zone.id;
    context.fillStyle = active ? 'rgba(231,111,91,.32)' : 'rgba(231,111,91,.21)';
    context.fillRect(px(zone.x), py(zone.y), zone.width * scale, zone.height * scale);
    context.strokeStyle = active ? '#f1d37f' : '#e58670';
    context.lineWidth = active ? 2 : 1;
    context.setLineDash([5, 4]);
    context.strokeRect(px(zone.x), py(zone.y), zone.width * scale, zone.height * scale);
    context.setLineDash([]);
    context.fillStyle = '#f3b3a1';
    context.font = '9px "IBM Plex Mono", monospace';
    context.fillText(zone.name.toUpperCase(), px(zone.x) + 5, py(zone.y) + 12);
  }

  const alerts = calculateAlerts();
  const alertWorkers = new Set();
  const alertEquipment = new Set();
  for (const event of alerts) {
    if (event.workerId) alertWorkers.add(event.workerId);
    if (event.otherWorkerId) alertWorkers.add(event.otherWorkerId);
    if (event.equipmentId) alertEquipment.add(event.equipmentId);
  }

  for (const equipment of state.equipment) {
    const x = px(equipment.x);
    const y = py(equipment.y);
    context.strokeStyle = '#e9ba61';
    context.lineWidth = 1.5;
    context.setLineDash([4, 4]);
    context.beginPath(); context.moveTo(x, y); context.lineTo(px(equipment.routeX), py(equipment.routeY)); context.stroke();
    context.setLineDash([]);
    context.fillStyle = '#f3ce74';
    context.beginPath(); context.arc(px(equipment.routeX), py(equipment.routeY), Math.max(2, scale * .22), 0, Math.PI * 2); context.fill();
    if (alertEquipment.has(equipment.id)) drawProximityRing(x, y, scale, Number(state.thresholds.equipment));
    const active = selected?.type === 'equipment' && selected.id === equipment.id;
    context.save();
    context.translate(x, y);
    if (active) { context.strokeStyle = '#f3e383'; context.lineWidth = 2; context.strokeRect(-scale * .9 - 4, -scale * .55 - 4, scale * 1.8 + 8, scale * 1.1 + 8); }
    context.fillStyle = '#edb54e';
    context.fillRect(-scale * .9, -scale * .55, scale * 1.8, scale * 1.1);
    context.fillStyle = '#614d2b';
    context.fillRect(-scale * .12, -scale * .36, scale * .72, scale * .72);
    context.restore();
    drawLabel(equipment.name, x + 8, y - 7);
  }

  for (const worker of state.workers) {
    const x = px(worker.x);
    const y = py(worker.y);
    if (alertWorkers.has(worker.id)) drawProximityRing(x, y, scale, Number(state.thresholds.workers));
    const active = selected?.type === 'worker' && selected.id === worker.id;
    context.fillStyle = alertWorkers.has(worker.id) ? '#f2bf5d' : '#76dba6';
    context.beginPath(); context.arc(x, y, Math.max(4, scale * .34), 0, Math.PI * 2); context.fill();
    if (active) { context.strokeStyle = '#f3e383'; context.lineWidth = 2; context.beginPath(); context.arc(x, y, Math.max(6, scale * .34 + 4), 0, Math.PI * 2); context.stroke(); }
    context.strokeStyle = '#192820'; context.lineWidth = 1.5; context.beginPath(); context.arc(x, y, Math.max(4, scale * .34), 0, Math.PI * 2); context.stroke();
    drawLabel(worker.name, x + 8, y + 4);
  }
  context.restore();
  context.strokeStyle = '#61746a';
  context.lineWidth = 1;
  context.strokeRect(ox, oy, mapWidth, mapHeight);
}

function drawFixture(px, py, scale, x, y, width, height, label) {
  context.fillStyle = '#34453b';
  context.strokeStyle = '#4b5c4f';
  context.lineWidth = 1;
  context.fillRect(px(x), py(y), width * scale, height * scale);
  context.strokeRect(px(x), py(y), width * scale, height * scale);
  context.fillStyle = '#a8b8a8';
  context.font = '8px "IBM Plex Mono", monospace';
  context.fillText(label, px(x) + 5, py(y) + 12);
}

function drawLabel(text, x, y) {
  context.font = '9px "IBM Plex Mono", monospace';
  context.fillStyle = '#e4ede2';
  context.fillText(text, x, y);
}

function drawProximityRing(x, y, scale, threshold) {
  context.fillStyle = 'rgba(229,174,75,.12)';
  context.strokeStyle = 'rgba(237,186,94,.7)';
  context.lineWidth = 1;
  context.beginPath();
  context.arc(x, y, Math.max(7, scale * threshold), 0, Math.PI * 2);
  context.fill();
  context.stroke();
}

function mapPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left - transform.ox) / transform.scale,
    y: (event.clientY - rect.top - transform.oy) / transform.scale,
  };
}

function hitTest(point) {
  for (const zone of [...state.zones].reverse()) {
    if (point.x >= zone.x && point.x <= zone.x + zone.width && point.y >= zone.y && point.y <= zone.y + zone.height) return { type: 'zone', id: zone.id };
  }
  const radius = Math.max(1.25, 10 / transform.scale);
  for (const equipment of [...state.equipment].reverse()) {
    if (Math.hypot(point.x - equipment.x, point.y - equipment.y) <= radius) return { type: 'equipment', id: equipment.id };
  }
  for (const worker of [...state.workers].reverse()) {
    if (Math.hypot(point.x - worker.x, point.y - worker.y) <= radius) return { type: 'worker', id: worker.id };
  }
  return null;
}

function handleMapDown(event) {
  const point = mapPoint(event);
  if (tool !== 'select') {
    const x = Math.max(0, Math.min(FLOOR.width, point.x));
    const y = Math.max(0, Math.min(FLOOR.height, point.y));
    createItem(kindInput.value, x, y);
    setTool('select');
    return;
  }
  const hit = hitTest(point);
  if (!hit) {
    clearSelection();
    return;
  }
  setSelected(hit.type, hit.id);
  dragging = true;
  canvas.setPointerCapture(event.pointerId);
}

function handleMapMove(event) {
  if (!dragging) return;
  const item = getSelectedItem();
  if (!item) return;
  const point = mapPoint(event);
  const width = selected.type === 'zone' ? item.width : 0;
  const height = selected.type === 'zone' ? item.height : 0;
  Object.assign(item, clampPosition(point.x, point.y, width, height));
  xInput.value = item.x.toFixed(1);
  yInput.value = item.y.toFixed(1);
  render();
}

function handleMapUp() {
  if (!dragging) return;
  dragging = false;
  scheduleSave();
}

document.querySelector('#enter-admin').addEventListener('click', () => {
  sessionStorage.setItem(ROLE_KEY, 'admin');
  gate.hidden = true;
  workspace.hidden = false;
  render();
});

if (sessionStorage.getItem(ROLE_KEY) === 'admin') {
  gate.hidden = true;
  workspace.hidden = false;
}

document.querySelectorAll('.tool-button').forEach((button) => button.addEventListener('click', () => setTool(button.dataset.tool)));
kindInput.addEventListener('change', updateFieldVisibility);
form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (selected) {
    updateSelectedFromForm();
    return;
  }
  createItem(kindInput.value, numberValue(xInput), numberValue(yInput));
});
deleteButton.addEventListener('click', removeSelected);
inventory.addEventListener('click', (event) => {
  const button = event.target.closest('.inventory-item');
  if (button) setSelected(button.dataset.type, button.dataset.id);
});
for (const input of [nameInput, xInput, yInput, routeXInput, routeYInput, zoneWidthInput, zoneHeightInput]) {
  input.addEventListener('change', updateSelectedFromForm);
}

workerThreshold.value = state.thresholds.workers;
equipmentThreshold.value = state.thresholds.equipment;
workerThreshold.addEventListener('change', () => {
  state.thresholds.workers = Math.max(1, Math.min(20, Number(workerThreshold.value) || defaults.thresholds.workers));
  workerThreshold.value = state.thresholds.workers;
  scheduleSave();
});
equipmentThreshold.addEventListener('change', () => {
  state.thresholds.equipment = Math.max(1, Math.min(30, Number(equipmentThreshold.value) || defaults.thresholds.equipment));
  equipmentThreshold.value = state.thresholds.equipment;
  scheduleSave();
});

document.querySelector('#reset-layout').addEventListener('click', () => {
  if (!window.confirm('Restore the sample floor plan? This replaces the admin configuration saved in this browser.')) return;
  state = copyDefaults();
  selected = null;
  kindInput.disabled = false;
  workerThreshold.value = state.thresholds.workers;
  equipmentThreshold.value = state.thresholds.equipment;
  saveButton.innerHTML = '<span aria-hidden="true">+</span> Add to floor plan';
  deleteButton.hidden = true;
  saveState();
  render();
});

canvas.addEventListener('pointerdown', handleMapDown);
canvas.addEventListener('pointermove', handleMapMove);
canvas.addEventListener('pointerup', handleMapUp);
canvas.addEventListener('pointercancel', handleMapUp);
window.addEventListener('resize', drawMap);
updateFieldVisibility();
render();