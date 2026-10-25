// Relay between the admin dashboard (the brain) and worker/driver phones (the buzzers).
//
// dashboard -> relay  {type:'hello', role:'dashboard'}
//                     {type:'roster', assets:[{id, name, kind:'worker'|'equipment'}]}
//                     {type:'levels', levels:{[assetId]: {level:'clear'|'warning'|'danger', reason:'proximity'|'zone'|null}}}
// phone     -> relay  {type:'hello', role:'phone'}, {type:'watch', assetId}
// relay     -> phone  {type:'roster', assets}, {type:'level', assetId, level, reason}, {type:'dashboard', online}
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT) || 8787;
const CLEAR = { level: 'clear', reason: null };

let roster = [];
let levels = {};
// socket -> {roster, levels, updatedAt}. A stray extra dashboard tab with nobody registered
// must not wipe the demo, so phones follow the most recently active dashboard that has people.
const dashboards = new Map();
const phones = new Map(); // socket -> watched assetId (or null)

const send = (socket, message) => { if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message)); };
const levelMessage = (assetId) => ({ type: 'level', assetId, ...(levels[assetId] || CLEAR) });
const broadcastPhones = (message) => { for (const socket of phones.keys()) send(socket, message); };

function activeDashboard() {
  const score = (state) => (state.roster.length > 0 ? 1e15 : 0) + state.updatedAt;
  let best = null;
  for (const state of dashboards.values()) if (!best || score(state) > score(best)) best = state;
  return best;
}

/** Recompute what phones see and send only the differences. */
function publish() {
  const active = activeDashboard();
  const nextRoster = active?.roster || [];
  const nextLevels = active?.levels || {};
  if (JSON.stringify(nextRoster) !== JSON.stringify(roster)) {
    roster = nextRoster;
    broadcastPhones({ type: 'roster', assets: roster });
  }
  const previous = levels;
  levels = nextLevels;
  for (const [socket, assetId] of phones) {
    if (assetId && JSON.stringify(previous[assetId] || CLEAR) !== JSON.stringify(levels[assetId] || CLEAR)) send(socket, levelMessage(assetId));
  }
}

function onDashboardMessage(socket, message) {
  const state = dashboards.get(socket);
  if (message.type === 'roster' && Array.isArray(message.assets)) state.roster = message.assets;
  else if (message.type === 'levels' && message.levels && typeof message.levels === 'object') state.levels = message.levels;
  else return;
  state.updatedAt = Date.now();
  publish();
}

function onPhoneMessage(socket, message) {
  if (message.type === 'watch' && typeof message.assetId === 'string') {
    phones.set(socket, message.assetId);
    send(socket, levelMessage(message.assetId));
    console.log(`phone watching ${message.assetId}`);
  }
}

const server = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/plain' });
  response.end(`Floorwatch relay · ${dashboards.size} dashboard(s) · ${phones.size} phone(s)\n`);
});
const wss = new WebSocketServer({ server });

wss.on('connection', (socket) => {
  let role = null;
  socket.on('message', (data) => {
    let message;
    try { message = JSON.parse(data); } catch { return; }
    if (!message || typeof message !== 'object') return;
    if (message.type === 'hello' && !role) {
      role = message.role === 'dashboard' ? 'dashboard' : 'phone';
      if (role === 'dashboard') {
        dashboards.set(socket, { roster: [], levels: {}, updatedAt: 0 });
        broadcastPhones({ type: 'dashboard', online: true });
      } else {
        phones.set(socket, null);
        send(socket, { type: 'roster', assets: roster });
        send(socket, { type: 'dashboard', online: dashboards.size > 0 });
      }
      console.log(`${role} connected (${dashboards.size} dashboard, ${phones.size} phone)`);
    } else if (role === 'dashboard') onDashboardMessage(socket, message);
    else if (role === 'phone') onPhoneMessage(socket, message);
  });
  socket.on('close', () => {
    if (role === 'dashboard') {
      dashboards.delete(socket);
      // With no brain left, publish() clears every level so repeating danger buzzes stop.
      if (!dashboards.size) broadcastPhones({ type: 'dashboard', online: false });
      publish();
    } else if (role === 'phone') phones.delete(socket);
  });
});

server.listen(PORT, () => console.log(`Floorwatch relay on http://localhost:${PORT} (WebSocket on the same port)`));
