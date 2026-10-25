// Sends each tracked person's alert level to the relay, which buzzes their phone.
// Relay address: ?relay=ws://host:port on the dashboard URL, else ws://<this host>:8787.
const RANK = { clear: 0, warning: 1, zone: 2, danger: 3 };

export function createPhoneLink(url = defaultRelayUrl()) {
  let socket = null;
  let lastRoster = '';
  let lastLevels = '';

  const send = (message) => socket?.readyState === WebSocket.OPEN && socket.send(JSON.stringify(message));

  function connect() {
    socket = new WebSocket(url);
    socket.addEventListener('open', () => {
      send({ type: 'hello', role: 'dashboard' });
      // Resend everything after a (re)connect.
      if (lastRoster) send({ type: 'roster', assets: JSON.parse(lastRoster) });
      if (lastLevels) send({ type: 'levels', levels: JSON.parse(lastLevels) });
    });
    // The dashboard keeps working without phones; just keep retrying quietly.
    socket.addEventListener('close', () => setTimeout(connect, 2000));
  }
  connect();

  return {
    /** state: {workers, vehicles} as passed to evaluateSafety; events: its result. */
    update(state, events) {
      const assets = [
        ...state.workers.map(({ id, name }) => ({ id, name, kind: 'worker' })),
        ...state.vehicles.map(({ id, name }) => ({ id, name, kind: 'equipment' })),
      ];
      const roster = JSON.stringify(assets);
      if (roster !== lastRoster) {
        lastRoster = roster;
        send({ type: 'roster', assets });
      }
      const levels = JSON.stringify(levelsByAsset(assets, events));
      if (levels !== lastLevels) {
        lastLevels = levels;
        send({ type: 'levels', levels: JSON.parse(levels) });
      }
    },
  };
}

/** Worst signal per person. Workers feel equipment proximity and zone entry; drivers feel workers near their equipment. */
export function levelsByAsset(assets, events) {
  const levels = {};
  const raise = (assetId, signal) => {
    if (RANK[signal] > RANK[levels[assetId]?.signal || 'clear']) levels[assetId] = { signal };
  };
  for (const event of events) {
    if (event.type === 'equipment-proximity') {
      raise(event.workerId, event.severity);
      raise(event.vehicleId, event.severity);
    } else if (event.type === 'geofence') {
      raise(event.workerId, 'zone');
    }
  }
  return Object.fromEntries(assets.map(({ id }) => {
    const signal = levels[id]?.signal || 'clear';
    return [id, signal === 'zone' ? { level: 'danger', reason: 'zone' } : { level: signal, reason: signal === 'clear' ? null : 'proximity' }];
  }));
}

function defaultRelayUrl() {
  const fromQuery = new URLSearchParams(location.search).get('relay');
  return fromQuery || `ws://${location.hostname || 'localhost'}:8787`;
}
