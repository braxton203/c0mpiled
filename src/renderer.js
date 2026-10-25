import { FLOOR } from './model.js';
import { SAFETY_CONFIG } from './safety.js';

const COLORS = {
  background: '#17231f', floor: '#1b2924', grid: '#2b3b34', aisle: '#25372f', aisleLine: '#3c5147',
  fixture: '#293a33', fixtureEdge: '#506157', worker: '#67d9a0', vehicle: '#f1a94e',
  zone: 'rgba(207, 83, 77, .22)', zoneEdge: '#e3756d', text: '#d1ddd5', muted: '#96a79d',
  warning: '#f3bd54', danger: '#ec7069',
};

const WORK_AREAS = [
  { x: 14, y: 4, width: 11, height: 7, title: 'PARTS & KITTING', code: 'A1' },
  { x: 15, y: 25, width: 12, height: 7, title: 'ASSEMBLY', code: 'A2' },
  { x: 31, y: 4, width: 11, height: 7, title: 'STORAGE', code: 'B1' },
  { x: 34, y: 25, width: 10, height: 7, title: 'PACK & SHIP', code: 'B2' },
];

/** Draw the supplied floor records, simulated/sensor positions, and safety events. */
export function renderFactory(canvas, state, positions, events = []) {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = window.devicePixelRatio || 1;
  const width = Math.round(rect.width * dpr), height = Math.round(rect.height * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  const scale = Math.min(rect.width / FLOOR.width, rect.height / FLOOR.height);
  const ox = (rect.width - FLOOR.width * scale) / 2, oy = (rect.height - FLOOR.height * scale) / 2;
  const px = (x) => ox + x * scale, py = (y) => oy + y * scale;

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, rect.width, rect.height);
  ctx.save();
  ctx.beginPath(); ctx.rect(ox, oy, FLOOR.width * scale, FLOOR.height * scale); ctx.clip();
  drawGrid(ctx, scale, ox, oy, px, py);
  drawAisles(ctx, scale, px, py);
  drawWorkAreas(ctx, scale, px, py);
  drawLoadingDocks(ctx, scale, px, py);
  drawZones(ctx, state.zones || [], scale, px, py);
  const active = activeEntityAlerts(events);
  drawVehicles(ctx, state.vehicles || state.equipment || [], positions?.vehicles || positions?.equipment || [], active, scale, px, py);
  drawWorkers(ctx, state.workers || [], positions?.workers || [], active, scale, px, py);
  ctx.restore();
}

function drawGrid(ctx, scale, ox, oy, px, py) {
  ctx.fillStyle = COLORS.floor;
  ctx.fillRect(ox, oy, FLOOR.width * scale, FLOOR.height * scale);
  ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1;
  for (let x = 0; x <= FLOOR.width; x += 2) {
    ctx.beginPath(); ctx.moveTo(px(x), oy); ctx.lineTo(px(x), oy + FLOOR.height * scale); ctx.stroke();
  }
  for (let y = 0; y <= FLOOR.height; y += 2) {
    ctx.beginPath(); ctx.moveTo(ox, py(y)); ctx.lineTo(ox + FLOOR.width * scale, py(y)); ctx.stroke();
  }
}

function drawAisles(ctx, scale, px, py) {
  ctx.fillStyle = COLORS.aisle;
  ctx.fillRect(px(0), py(15), FLOOR.width * scale, 5 * scale);
  ctx.fillRect(px(27), py(0), 3 * scale, FLOOR.height * scale);
  ctx.fillRect(px(46), py(0), 3 * scale, FLOOR.height * scale);
  ctx.strokeStyle = COLORS.aisleLine; ctx.setLineDash([5, 5]);
  ctx.beginPath(); ctx.moveTo(px(0), py(17.5)); ctx.lineTo(px(FLOOR.width), py(17.5)); ctx.stroke();
  for (const x of [28.5, 47.5]) { ctx.beginPath(); ctx.moveTo(px(x), py(0)); ctx.lineTo(px(x), py(FLOOR.height)); ctx.stroke(); }
  ctx.setLineDash([]);
  drawArrow(ctx, px(8), py(17.5), 1, 0, scale);
  drawArrow(ctx, px(52), py(17.5), -1, 0, scale);
  drawArrow(ctx, px(28.5), py(30), 0, -1, scale);
  drawArrow(ctx, px(47.5), py(6), 0, 1, scale);
  label(ctx, 'MAIN FORKLIFT AISLE', px(1), py(16.4), scale, COLORS.muted);
}

function drawArrow(ctx, x, y, dx, dy, scale) {
  const size = Math.max(3, scale * 0.42);
  ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(dy, dx));
  ctx.fillStyle = COLORS.muted; ctx.beginPath();
  ctx.moveTo(size, 0); ctx.lineTo(-size, -size * 0.6); ctx.lineTo(-size, size * 0.6); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawWorkAreas(ctx, scale, px, py) {
  for (const area of WORK_AREAS) {
    const x = px(area.x), y = py(area.y), width = area.width * scale, height = area.height * scale;
    ctx.fillStyle = COLORS.fixture; ctx.strokeStyle = COLORS.fixtureEdge;
    roundedRect(ctx, x, y, width, height, 4); ctx.fill(); ctx.stroke();
    label(ctx, area.title, x + 7, y + 14, scale, COLORS.text);
    label(ctx, area.code, x + 7, y + 26, scale, COLORS.muted);
    ctx.fillStyle = '#3a4e43';
    for (let row = 0; row < 3; row += 1) ctx.fillRect(x + 7, y + height - 7 - row * 4, width * 0.48, 1.5);
  }
  for (let i = 0; i < 5; i += 1) {
    const x = px(32 + i * 1.8), y = py(8.2);
    ctx.fillStyle = '#43594e'; ctx.fillRect(x, y, 1.25 * scale, 1.8 * scale);
    ctx.strokeStyle = '#64786c'; ctx.strokeRect(x, y, 1.25 * scale, 1.8 * scale);
  }
}

function drawZones(ctx, zones, scale, px, py) {
  for (const zone of zones) {
    if (![zone.x, zone.y, zone.width, zone.height].every(Number.isFinite)) continue;
    const x = px(zone.x), y = py(zone.y), width = zone.width * scale, height = zone.height * scale;
    ctx.fillStyle = COLORS.zone; ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = COLORS.zoneEdge; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]);
    ctx.strokeRect(x, y, width, height); ctx.setLineDash([]);
    label(ctx, `RESTRICTED · ${zone.name || zone.id}`, x + 5, y + 13, scale, '#ffc0b9');
  }
}

function drawVehicles(ctx, records, snapshots, active, scale, px, py) {
  const byId = new Map(snapshots.map((position) => [position.id, position]));
  for (const record of records) {
    const position = byId.get(record.id);
    if (!validPosition(position)) continue;
    const x = px(position.x), y = py(position.y), heading = Number.isFinite(position.heading) ? position.heading : 0;
    const thresholdRadius = SAFETY_CONFIG.equipmentWarningMeters * scale;
    ctx.save();
    ctx.globalAlpha = position.stale ? 0.18 : 0.42;
    ctx.fillStyle = 'rgba(241, 169, 78, 0.12)';
    ctx.strokeStyle = COLORS.vehicle;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(x, y, thresholdRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = position.stale ? 0.35 : 1;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(heading);
    ctx.fillStyle = active.has(record.id) ? COLORS.danger : COLORS.vehicle;
    roundedRect(ctx, -1.25 * scale, -0.72 * scale, 2.5 * scale, 1.44 * scale, Math.max(2, scale * 0.12)); ctx.fill();
    ctx.fillStyle = '#573a19'; ctx.fillRect(-0.1 * scale, -0.52 * scale, 0.78 * scale, 1.04 * scale);
    ctx.fillStyle = '#101714';
    for (const wheelX of [-0.82, 0.65]) for (const wheelY of [-0.82, 0.58]) ctx.fillRect(wheelX * scale, wheelY * scale, 0.3 * scale, 0.24 * scale);
    ctx.restore();
    label(ctx, record.name || record.id, x + 8, y - 8, scale, COLORS.text);
    ctx.restore();
  }
}

function drawWorkers(ctx, records, snapshots, active, scale, px, py) {
  const byId = new Map(snapshots.map((position) => [position.id, position]));
  for (const record of records) {
    const position = byId.get(record.id);
    if (!validPosition(position)) continue;
    const x = px(position.x), y = py(position.y);
    const alertSeverity = active.get(record.id);
    if (alertSeverity) drawAlertPulses(ctx, x, y, scale, alertSeverity);
    ctx.save();
    ctx.globalAlpha = position.stale ? 0.35 : 1;
    ctx.fillStyle = alertSeverity ? (alertSeverity === 'danger' ? COLORS.danger : COLORS.warning) : COLORS.worker;
    ctx.beginPath(); ctx.arc(x, y, Math.max(4, scale * 0.43), 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#102019'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#15201b'; ctx.beginPath(); ctx.arc(x, y - scale * 0.12, scale * 0.12, 0, Math.PI * 2); ctx.fill();
    label(ctx, record.name || record.id, x + 7, y + 4, scale, COLORS.text);
    ctx.restore();
  }
}

function drawLoadingDocks(ctx, scale, px, py) {
  label(ctx, 'LOADING / RECEIVING', px(3), py(2.3), scale, COLORS.muted);
  for (let i = 0; i < 3; i += 1) {
    const x = px(4 + i * 2.6), y = py(0.6), width = scale * 2, height = scale * 1.1;
    ctx.fillStyle = '#34473e'; ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = '#62746a'; ctx.strokeRect(x, y, width, height);
  }
}

function activeEntityAlerts(events) {
  const ids = new Map();
  for (const event of events || []) {
    const affected = [...(event.entityIds || []), event.workerId, event.vehicleId, event.otherWorkerId].filter(Boolean);
    for (const id of affected) {
      if (event.severity === 'danger' || !ids.has(id)) ids.set(id, event.severity || 'warning');
    }
  }
  return ids;
}

function drawAlertPulses(ctx, x, y, scale, severity) {
  const phase = (performance.now() % 1200) / 1200;
  const color = severity === 'danger' ? COLORS.danger : COLORS.warning;
  ctx.save();
  for (let ring = 0; ring < 3; ring += 1) {
    const progress = (phase + ring / 3) % 1;
    const radius = scale * (0.6 + progress * 1.8);
    ctx.globalAlpha = (1 - progress) * 0.62;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, scale * 0.12);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function validPosition(value) {
  return value && Number.isFinite(value.x) && Number.isFinite(value.y);
}

function label(ctx, text, x, y, scale, color) {
  ctx.fillStyle = color;
  ctx.font = `${Math.max(8, Math.min(11, scale * 0.55))}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.fillText(String(text), x, y);
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r); ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r); ctx.closePath();
}
