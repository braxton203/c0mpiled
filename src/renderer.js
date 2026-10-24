import { FLOOR } from './model.js';

const COLORS = { floor: '#1a2724', grid: '#2b3a35', worker: '#64d9a0', vehicle: '#f4a94d', zone: 'rgba(208, 88, 79, .22)', zoneLine: '#df766d', warning: '#f3b34f', danger: '#e76d65', text: '#c4d0c9' };

export function renderFactory(canvas, state, events = []) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) { canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr); }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = rect.width, h = rect.height, scale = Math.min(w / FLOOR.width, h / FLOOR.height);
  const ox = (w - FLOOR.width * scale) / 2, oy = (h - FLOOR.height * scale) / 2;
  const px = (x) => ox + x * scale, py = (y) => oy + y * scale;
  ctx.fillStyle = COLORS.floor; ctx.fillRect(0, 0, w, h);
  ctx.save(); ctx.beginPath(); ctx.rect(ox, oy, FLOOR.width * scale, FLOOR.height * scale); ctx.clip();
  ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1;
  for (let x = 0; x <= FLOOR.width; x += 2) { ctx.beginPath(); ctx.moveTo(px(x), oy); ctx.lineTo(px(x), oy + FLOOR.height * scale); ctx.stroke(); }
  for (let y = 0; y <= FLOOR.height; y += 2) { ctx.beginPath(); ctx.moveTo(ox, py(y)); ctx.lineTo(ox + FLOOR.width * scale, py(y)); ctx.stroke(); }
  // Fixed floor fixtures
  ctx.fillStyle = '#22312d'; ctx.strokeStyle = '#3b4a43'; ctx.lineWidth = 1;
  [[15, 5, 8, 4, 'Parts'], [17, 25, 8, 5, 'Assembly'], [31, 5, 7, 4, 'Storage'], [32, 25, 9, 5, 'Packing']].forEach(([x,y,bw,bh,label]) => { ctx.fillRect(px(x),py(y),bw*scale,bh*scale); ctx.strokeRect(px(x),py(y),bw*scale,bh*scale); ctx.fillStyle=COLORS.text; ctx.font='10px sans-serif'; ctx.fillText(label,px(x)+5,py(y)+14); ctx.fillStyle='#22312d'; });
  for (const zone of state.zones) { ctx.fillStyle=COLORS.zone; ctx.fillRect(px(zone.x),py(zone.y),zone.width*scale,zone.height*scale); ctx.strokeStyle=COLORS.zoneLine; ctx.setLineDash([5,4]); ctx.strokeRect(px(zone.x),py(zone.y),zone.width*scale,zone.height*scale); ctx.setLineDash([]); ctx.fillStyle='#efaaa2'; ctx.font='10px sans-serif'; ctx.fillText(`RESTRICTED · ${zone.name}`,px(zone.x)+6,py(zone.y)+14); }
  const activeWorkers = new Set(events.filter((e) => e.type === 'proximity').map((e) => e.id.split(':')[1]));
  for (const vehicle of state.vehicles) { const x=px(vehicle.x),y=py(vehicle.y),r=SAFETY_RADIUS(scale); ctx.fillStyle='rgba(244,169,77,.10)'; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); ctx.save(); ctx.translate(x,y); ctx.rotate(vehicle.heading || 0); ctx.fillStyle=COLORS.vehicle; ctx.fillRect(-scale*1.1,-scale*.65,scale*2.2,scale*1.3); ctx.fillStyle='#573a19'; ctx.fillRect(0,-scale*.42,scale*.8,scale*.84); ctx.restore(); ctx.fillStyle=COLORS.text; ctx.font='10px sans-serif'; ctx.fillText(vehicle.id,x+8,y-10); }
  for (const worker of state.workers) { const x=px(worker.x),y=py(worker.y); ctx.fillStyle=activeWorkers.has(worker.id)?COLORS.warning:COLORS.worker; ctx.beginPath(); ctx.arc(x,y,scale*.42,0,Math.PI*2); ctx.fill(); ctx.strokeStyle='#102019'; ctx.lineWidth=2; ctx.stroke(); ctx.fillStyle=COLORS.text; ctx.font='10px sans-serif'; ctx.fillText(worker.id,x+7,y+4); }
  ctx.restore();
}

function SAFETY_RADIUS(scale) { return scale * 7; }
