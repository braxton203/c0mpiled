# Floorwatch — factory safety simulator

A browser-only hackathon demo for a future proximity and geofencing safety system. It currently simulates a small factory floor, workers, a forklift, proximity events, and restricted areas. It does **not** connect to real sensors or phones and must not be used for operational safety decisions.

## Run it

Serve this folder with any static HTTP server (for example `python3 -m http.server 8000`) and open `http://localhost:8000`. ES modules need an HTTP origin in many browsers, so opening the file directly may not work.

## Admin floor configuration

Open `http://localhost:8000/admin.html` or use **Admin console** from the safety overview. Register workers and mobile equipment by display name and tracker/tag ID; do not enter or drag asset locations. Their markers and live proximity checks are driven by timestamped messages from the configured WebSocket tracking gateway. Restricted zones remain site floor-plan configuration. Tracker registrations and proximity thresholds are stored in this browser's local storage and remain separate from the simulation.

The browser expects a WebSocket message for each position update in this shape:

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

Coordinates are meters from the floor's top-left. A snapshot can use `{"type":"snapshot","locations":[...]}`. Updates for unknown tracker IDs, invalid coordinates, out-of-floor positions, or timestamps older than 15 seconds are ignored. Locations older than 5 seconds are marked stale and excluded from proximity checks. The admin console does not include a tracking gateway or generate location data; connect a compatible positioning system before expecting asset markers or alerts.

The admin access screen is only a demo role gate. It does not authenticate users or protect data, and this page does not notify workers. Use validated positioning and notification systems, server-side authorization, and site-specific safety engineering before operational use.

## Stable data contract

All positions and zone dimensions use meters from the floor's top-left corner. The shape lives in `src/model.js`:

- `state.workers`: `{ id, x, y, vx, vy }[]`
- `state.vehicles`: `{ id, x, y, vx, vy, heading }[]`
- `state.zones`: `{ id, name, x, y, width, height }[]`
- `evaluateSafety(state)`: returns `{ id, type, severity, title, detail, ... }[]`
- `stepSimulation(state, dt)`: returns the next state without mutating its input

Treat these fields as the integration contract. Coordinate any changes to them before editing so parallel work stays compatible.

## Teammate work plan

The plan below assumes **you plus three teammates**. Each teammate owns the listed files. You own integration and the shared contract. Do not edit another person's owned files without coordinating first. This keeps most work in separate files and makes merging straightforward.

### Teammate 1 — Add and move people and equipment

**Own:** `src/simulation.js`

**Build:**

1. Add exported functions to add a worker and add a vehicle/equipment item to the simulation state. Give each a unique ID and an initial position inside the floor.
2. Let new workers and equipment move using the existing `stepSimulation(state, dt)` function.
3. Add a way to remove an entity by ID if time allows.
4. Keep `stepSimulation` immutable: return a new state instead of changing the input state.

**Coordinate first:** If adding an entity requires a new field in the shared model, tell the integrator what field and type you need before changing `src/model.js`.

**Done when:** The integrator can call your add function and see the new person or vehicle appear and move in the simulation.

### Teammate 2 — Add and edit geofences

**Own:** `src/safety.js`

**Build:**

1. Add exported functions to create a rectangular geofence and remove one by ID.
2. Validate that each zone has an ID, name, and positive width and height, and that its bounds fit inside the floor.
3. Keep `evaluateSafety(state)` checking every worker against every geofence and returning the existing event shape.
4. If time allows, add a warning state when a worker approaches a geofence, while retaining the current danger event for entry.

**Coordinate first:** Agree on the zone shape with the integrator before adding fields. The current shape is `{ id, name, x, y, width, height }`, measured in meters from the top-left of the floor.

**Done when:** Adding a zone through your function causes an entry event when a worker enters it, and removing the zone stops that event.

### Teammate 3 — Build the dashboard controls

**Own:** `index.html` and `styles.css`

**Build:**

1. Add a control panel for adding a worker, adding a forklift/equipment item, and adding a geofence.
2. Include form fields for the new item's name or type and its position. For a geofence, include width and height.
3. Add a visible list of current workers, equipment, and geofences, with remove buttons if time allows.
4. Give the new controls stable element IDs and tell the integrator those IDs. Do not put simulation or safety logic in HTML.

**Done when:** The controls are visible, usable on a narrow screen, and their fields have stable IDs for `src/main.js` to connect.

### You — Integrate and own the shared contract

**Own:** `src/main.js`, `src/model.js`, and `README.md`

**Build:**

1. Keep `src/model.js` as the source of truth for worker, vehicle, and geofence data shapes. Tell everyone before changing these shapes.
2. Wire the dashboard controls to Teammate 1's entity functions and Teammate 2's geofence functions.
3. Refresh the entity lists, map, counts, and safety events after each add/remove action.
4. Resolve integration issues and review each teammate's changes before combining them.

**Done when:** A user can add a worker, equipment item, or geofence from the dashboard and see the simulation and safety events update.

### Shared workflow

1. Everyone pulls the starter commit before working and keeps the same shared data shapes.
2. Work only in your owned files. If a task needs edits to another person's files or a shared model change, agree on the change first and have the integrator make it.
3. Commit small, complete changes with descriptive messages, then push your branch. The integrator merges the branches and handles any overlap.
4. Avoid having two people edit `src/main.js` or `src/model.js` at the same time; those are the integration bottlenecks.

If your team has only three people total, assign the integration responsibilities to one teammate and combine them with that person's other role. Keep the file ownership boundaries above wherever possible.

## Real-world integration seam

When hardware is available, replace the simulated state producer behind `src/simulation.js` with an adapter that emits the same normalized entities and timestamps. Keep safety evaluation separate from transport so sensor input, phone display, and simulated demos can share the same rules. Production use would also require validated hardware, latency and failure handling, privacy review, and site-specific safety engineering; the current prototype is only a demo.
