# Floorwatch — factory safety demo

Floorwatch demonstrates worker/equipment proximity alerts and restricted-zone monitoring on a simulated factory floor. It can also accept normalized positions from an external WebSocket tracking feed. The browser demo does not connect to actual sensors or notify workers and is not for operational safety decisions.

## Run

From this directory, run `python3 -m http.server 8000`, then open `http://localhost:8000`.

- `index.html` is the animated factory overview.
- `admin.html` is the admin workspace. Register assets, add restricted zones, and choose **Start demo with simulator** to see the registered assets move without hardware. If the asset list is empty, Demo mode adds a small sample roster.
- The admin workspace can instead connect to a compatible external WebSocket feed.

## How the pieces fit

The admin workspace owns asset records (names, IDs, tracker IDs, and zones). The simulator reads worker/equipment records and produces fake positions for them. A future tracking adapter can provide positions instead. Both simulated and feed positions go to the same safety evaluator, which returns events for the dashboard.

Coordinates and zone dimensions are meters from the floor's top-left. The shared record and position shapes are:

```js
state = {
  workers: [{ id, name }],
  vehicles: [{ id, name, kind }],
  zones: [{ id, name, x, y, width, height }]
}

positions = {
  workers: [{ id, x, y }],
  vehicles: [{ id, x, y, heading }]
}
```

`src/simulation.js` exports `createSimulator(state)` and `stepSimulator(simulator, state, dt)`. It only produces positions; it does not add or remove app records. `src/safety.js` exports `evaluateSafety(state, positions, thresholds)`. It does not depend on where positions came from. `src/renderer.js` draws the shared floor state and position snapshot.

## WebSocket input

Register each tracked person's or vehicle's tracker ID in Admin, then connect a `ws://` or `wss://` endpoint. A location message looks like:

```json
{
  "type": "location",
  "trackerId": "TAG-1042",
  "x": 18.4,
  "y": 12.7,
  "timestamp": "2026-10-24T16:20:00Z",
  "accuracyMeters": 0.8
}
```

A snapshot can wrap messages in `{"type":"snapshot","locations":[...]}`. Unknown tracker IDs, invalid/out-of-floor positions, stale messages, and out-of-order updates are ignored. Positions older than five seconds are excluded from alert evaluation. The repository does not include a WebSocket server or real positioning hardware; use Demo mode for the hackathon presentation.

## Current implementation

- Worker and mobile equipment registration/removal in Admin, saved to this browser's `localStorage`. The overview reads those records when it loads and responds to changes from another open tab.
- Add/remove rectangular restricted zones in Admin, also saved in `localStorage`.
- Demo mode seeds sample assets if the registry is empty, animates registered records, and updates the map and alerts.
- Workers with active alerts show animated ripple rings on the map as a visual stand-in for a phone/device vibration.
- WebSocket location feed option with basic message validation and stale-position handling.
- Shared proximity and geofence evaluator used by both the simulator overview and the Admin workspace.
- Proximity thresholds can be changed in Admin; the default geofence zones are editable through the zone form.

## File map

- `src/model.js`: floor dimensions, default zones, and initial demo records.
- `src/simulation.js`: deterministic simulated positions and movement.
- `src/safety.js`: proximity/geofence event calculation, independent of the position source.
- `src/renderer.js`: canvas floor, aisles, work areas, entities, and restricted-zone drawing.
- `src/main.js`: simulator overview animation loop.
- `src/location-admin.js`: admin UI logic, local browser storage, simulator mode, and WebSocket adapter.
- `admin.html`, `admin.css`: admin workspace markup and styling.
- `index.html`, `styles.css`: simulator overview markup and styling.

`src/admin.js` is an older, unused admin editor; `admin.html` currently loads `src/location-admin.js`. Avoid developing features in `src/admin.js` unless the team intentionally switches the active admin page to it.

## Three-person task split

1. **Simulator and map:** own `src/simulation.js` and `src/renderer.js`. Improve worker/equipment movement and factory-floor visuals. Keep record creation and safety decisions out of these modules.
2. **Shared data and safety:** own `src/model.js` and `src/safety.js`. Keep entity/position shapes stable and add safety rules using the normalized `positions` input.
3. **Admin and integration:** own `admin.html`, `admin.css`, `src/location-admin.js`, and `src/main.js`. Maintain asset/zone controls, connect the selected position source to the shared safety and rendering modules, and present events clearly.

Keep these file boundaries when working in parallel. If an interface needs to change, update the shared shape and its call sites in one coordinated commit.

## Limits

Admin data is stored only in the current browser; there is no database or server-side account system. The admin entry screen is a demo role gate, not authentication. There is no worker phone UI or push notification path. Sensor accuracy, latency, device failure, privacy, and site-specific safety requirements are outside this prototype.
