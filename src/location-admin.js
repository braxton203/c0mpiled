import { ASSET_STORAGE_KEY, DEFAULT_ZONES, FLOOR, ZONE_STORAGE_KEY } from './model.js';
import { createSimulator, stepSimulator } from './simulation.js';
import { evaluateSafety } from './safety.js';
import { renderFactory } from './renderer.js';

const THRESHOLD_KEY = "floorwatch-admin-proximity-thresholds-v1";
const ROLE_KEY = "floorwatch-admin-demo-role";
const LIVE_WINDOW_MS = 5_000;
const STALE_WINDOW_MS = 15_000;
let zones = loadZones();

const workspace = document.querySelector("#admin-workspace");
const gate = document.querySelector("#access-gate");
const canvas = document.querySelector("#admin-map");
const trackerForm = document.querySelector("#tracker-form");
const trackerKind = document.querySelector("#tracker-kind");
const trackerName = document.querySelector("#tracker-name");
const trackerId = document.querySelector("#tracker-id");
const inventory = document.querySelector("#inventory-list");
const feedUrl = document.querySelector("#feed-url");
const connectButton = document.querySelector("#connect-feed");
const disconnectButton = document.querySelector("#disconnect-feed");
const demoToggle = document.querySelector("#demo-toggle");
const workerThreshold = document.querySelector("#worker-threshold");
const equipmentThreshold = document.querySelector("#equipment-threshold");
const zoneForm = document.querySelector("#zone-form");
const zoneList = document.querySelector("#zone-list");

let assets = loadAssets();
let thresholds = loadThresholds();
let socket = null;
let connectionGeneration = 0;
let connectionStatus = "offline";
let demoMode = false;
let simulator = null;
let demoPositions = null;
let lastDemoFrame = 0;
let alertAnimationRunning = false;

function loadAssets() {
  try {
    const stored = JSON.parse(localStorage.getItem(ASSET_STORAGE_KEY));
    if (Array.isArray(stored)) {
      return stored
        .filter(
          (asset) =>
            (asset.type === "worker" || asset.type === "equipment") &&
            typeof asset.id === "string" &&
            typeof asset.name === "string" &&
            typeof asset.trackerId === "string",
        )
        .map((asset) => ({ ...asset, location: null }));
    }
  } catch {
    // Use an empty registry when browser storage is unavailable or invalid.
  }
  return [];
}

function loadThresholds() {
  try {
    const stored = JSON.parse(localStorage.getItem(THRESHOLD_KEY));
    return {
      workers: boundedNumber(stored?.workers, 3, 1, 20),
      equipment: boundedNumber(stored?.equipment, 5, 1, 30),
    };
  } catch {
    return { workers: 3, equipment: 5 };
  }
}

function loadZones() {
  try {
    const stored = JSON.parse(localStorage.getItem(ZONE_STORAGE_KEY));
    if (Array.isArray(stored)) return stored.filter(validZone);
  } catch {
    // Start with the built-in sample zones if storage is empty or invalid.
  }
  return DEFAULT_ZONES.map((zone) => ({ ...zone }));
}

function validZone(zone) {
  return zone && typeof zone.id === "string" && typeof zone.name === "string" && zone.name.trim().length > 0 &&
    Number.isFinite(zone.x) && Number.isFinite(zone.y) &&
    Number.isFinite(zone.width) && Number.isFinite(zone.height) &&
    zone.width > 0 && zone.height > 0 && zone.x >= 0 && zone.y >= 0 &&
    zone.x + zone.width <= FLOOR.width && zone.y + zone.height <= FLOOR.height;
}

function persistZones() {
  try {
    localStorage.setItem(ZONE_STORAGE_KEY, JSON.stringify(zones));
    return true;
  } catch {
    setFeedMessage("Browser storage is unavailable. Zone changes will not persist.", "error");
    return false;
  }
}

function boundedNumber(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(minimum, Math.min(maximum, number))
    : fallback;
}

function persistAssets() {
  try {
    localStorage.setItem(
      ASSET_STORAGE_KEY,
      JSON.stringify(assets.map(({ location, ...asset }) => asset)),
    );
    return true;
  } catch {
    setFeedMessage(
      "Browser storage is unavailable. Tracker registration will not persist.",
      "error",
    );
    return false;
  }
}

function persistThresholds() {
  try {
    localStorage.setItem(THRESHOLD_KEY, JSON.stringify(thresholds));
  } catch {
    setFeedMessage(
      "Browser storage is unavailable. Threshold changes will not persist.",
      "error",
    );
  }
}

function setFeedMessage(message, state = "") {
  const element = document.querySelector("#feed-message");
  element.textContent = message;
  element.classList.toggle("error", state === "error");
}

function setConnectionStatus(status, message) {
  connectionStatus = status;
  const label = document.querySelector("#connection-label");
  const dot = document.querySelector("#connection-dot");
  const badge = document.querySelector("#feed-state");
  const labels = {
    offline: "TRACKING OFFLINE",
    connecting: "CONNECTING",
    live: "TRACKING LIVE",
    demo: "DEMO SIMULATION",
    error: "CONNECTION ERROR",
  };

  label.textContent = labels[status];
  badge.textContent = status.toUpperCase();
  dot.className = `connection-dot ${status}`;
  badge.classList.toggle("connected", status === "live");
  badge.classList.toggle("demo", status === "demo");
  badge.classList.toggle("danger", status === "error");
  connectButton.disabled = status === "connecting" || status === "live";
  disconnectButton.disabled = status !== "connecting" && status !== "live";
  if (demoToggle) demoToggle.textContent = status === "demo" ? "Stop demo" : "Start demo";
  if (message) setFeedMessage(message, status === "error" ? "error" : "");
  render();
}

function liveAssets(now = Date.now()) {
  return assets.filter(
    (asset) =>
      asset.location && now - asset.location.timestamp <= LIVE_WINDOW_MS,
  );
}

function calculateAlerts(now = Date.now()) {
  if (connectionStatus !== "live" && connectionStatus !== "demo") return [];
  const currentAssets = liveAssets(now);
  const state = {
    workers: assets.filter((asset) => asset.type === "worker").map(({ id, name }) => ({ id, name })),
    vehicles: assets.filter((asset) => asset.type === "equipment").map(({ id, name, kind }) => ({ id, name, kind })),
    zones,
  };
  const fresh = new Set(currentAssets.map((asset) => asset.id));
  const positions = {
    workers: currentAssets.filter((asset) => asset.type === "worker").map(({ id, location }) => ({ id, x: location.x, y: location.y })),
    vehicles: currentAssets.filter((asset) => asset.type === "equipment").map(({ id, location }) => ({ id, x: location.x, y: location.y })),
  };
  // Keep records whose positions are stale out of the evaluation snapshot.
  state.workers = state.workers.filter((worker) => fresh.has(worker.id));
  state.vehicles = state.vehicles.filter((vehicle) => fresh.has(vehicle.id));
  return evaluateSafety(state, positions, {
    workerWarningMeters: thresholds.workers,
    equipmentWarningMeters: thresholds.equipment,
    criticalRatio: 0.5,
  });
}

function simulatorState() {
  return {
    workers: assets.filter((asset) => asset.type === "worker").map(({ id, name }) => ({ id, name })),
    vehicles: assets.filter((asset) => asset.type === "equipment").map(({ id, name }) => ({ id, name, kind: "Mobile equipment" })),
    zones,
  };
}

function seedDemoAssets() {
  if (assets.length) return;
  assets = [
    { id: "demo-worker-01", type: "worker", name: "Avery Chen", trackerId: "DEMO-W-01", location: null },
    { id: "demo-worker-02", type: "worker", name: "Morgan Diaz", trackerId: "DEMO-W-02", location: null },
    { id: "demo-worker-03", type: "worker", name: "Sam Patel", trackerId: "DEMO-W-03", location: null },
    { id: "demo-equipment-01", type: "equipment", name: "Forklift 01", trackerId: "DEMO-FL-01", location: null },
    { id: "demo-equipment-02", type: "equipment", name: "Tugger 02", trackerId: "DEMO-TG-02", location: null },
  ];
  persistAssets();
}

function applyDemoPositions(positions, timestamp = Date.now()) {
  const byId = new Map([
    ...(positions?.workers || []).map((position) => [position.id, position]),
    ...(positions?.vehicles || []).map((position) => [position.id, position]),
  ]);
  for (const asset of assets) {
    const position = byId.get(asset.id);
    asset.location = position
      ? { x: position.x, y: position.y, timestamp, source: "demo" }
      : null;
  }
}

function startDemo() {
  if (demoMode) return;
  connectionGeneration += 1;
  if (socket) {
    const activeSocket = socket;
    socket = null;
    activeSocket.close();
  }
  seedDemoAssets();
  demoMode = true;
  simulator = createSimulator(simulatorState());
  demoPositions = stepSimulator(simulator, simulatorState(), 0);
  applyDemoPositions(demoPositions);
  lastDemoFrame = 0;
  setConnectionStatus("demo", "Demo mode is generating simulated positions. No hardware is connected.");
  requestAnimationFrame(runDemoFrame);
}

function stopDemo() {
  if (!demoMode) return;
  demoMode = false;
  simulator = null;
  demoPositions = null;
  for (const asset of assets) {
    if (asset.location?.source === "demo") asset.location = null;
  }
  setConnectionStatus("offline", "Demo stopped. Connect a tracking feed to receive real positions.");
}

function runDemoFrame(now) {
  if (!demoMode) return;
  const dt = lastDemoFrame ? Math.min((now - lastDemoFrame) / 1000, 0.05) : 0;
  lastDemoFrame = now;
  const state = simulatorState();
  demoPositions = stepSimulator(simulator, state, dt);
  applyDemoPositions(demoPositions);
  render();
  requestAnimationFrame(runDemoFrame);
}

function formatAge(timestamp, now = Date.now()) {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  return seconds < 1 ? "just now" : `${seconds}s ago`;
}

function assetStatus(asset, now = Date.now()) {
  if (!asset.location) return "NO SIGNAL";
  return now - asset.location.timestamp <= LIVE_WINDOW_MS ? "LIVE" : "STALE";
}

function renderInventory(now = Date.now()) {
  const groups = [
    { type: "worker", title: "WORKERS" },
    { type: "equipment", title: "MOBILE EQUIPMENT" },
  ];
  document.querySelector("#roster-count").textContent =
    `${assets.length} ASSETS`;
  inventory.innerHTML = groups
    .map((group) => {
      const items = assets.filter((asset) => asset.type === group.type);
      const itemRows = items
        .map((asset) => {
          const status = assetStatus(asset, now);
          const meta = asset.location
            ? `${asset.location.x.toFixed(1)}, ${asset.location.y.toFixed(1)} m`
            : "Position unavailable";
          const accuracy = asset.location?.accuracyMeters;
          const extra = asset.location
            ? `${formatAge(asset.location.timestamp, now)}${accuracy === undefined ? "" : ` · ±${accuracy.toFixed(1)} m`}`
            : asset.trackerId;

          return `<article class="inventory-item">
        <i class="inventory-dot ${group.type}"></i>
        <span class="inventory-description"><strong class="inventory-name">${escapeHtml(asset.name)}</strong><small>${escapeHtml(asset.trackerId)} · ${escapeHtml(meta)}</small></span>
        <span class="asset-state ${status.toLowerCase().replace(" ", "-")}">${status}</span>
        <small class="inventory-age">${escapeHtml(extra)}</small>
        <button type="button" class="remove-asset" data-id="${escapeHtml(asset.id)}" aria-label="Remove ${escapeHtml(asset.name)}" title="Remove tracked asset">×</button>
      </article>`;
        })
        .join("");

      return `<div class="inventory-group-label">${group.title} · ${items.length}</div>${itemRows || '<p class="inventory-empty">No trackers registered.</p>'}`;
    })
    .join("");
}

function renderAlerts(events, now = Date.now()) {
  const alertList = document.querySelector("#admin-alerts");
  const review = document.querySelector("#review-state");
  const freshCount = liveAssets(now).length;
  const sourceAvailable = connectionStatus === "live" || connectionStatus === "demo";

  document.querySelector("#admin-alert-count").textContent = String(
    events.length,
  ).padStart(2, "0");
  if (!sourceAvailable) {
    review.textContent = connectionStatus === "error" ? "FEED ERROR" : "NO FEED";
  } else if (freshCount === 0) {
    review.textContent = "NO DATA";
  } else {
    review.textContent = connectionStatus === "demo"
      ? (events.length ? `${events.length} DEMO ALERT${events.length === 1 ? "" : "S"}` : "DEMO CLEAR")
      : (events.length ? `${events.length} REVIEW${events.length === 1 ? "" : "S"}` : "CLEAR");
  }
  review.classList.toggle(
    "warning",
    events.some((event) => event.severity === "warning"),
  );
  review.classList.toggle(
    "danger",
    events.some((event) => event.severity === "danger") ||
      connectionStatus === "error",
  );

  if (!sourceAvailable || freshCount === 0) {
    alertList.innerHTML =
      '<p class="alert-clear">No current positions are available. A clear floor cannot be confirmed.</p>';
  } else if (events.length) {
    alertList.innerHTML = events
      .map(
        (event) =>
          `<article class="alert-card ${event.severity}"><div class="alert-title">${escapeHtml(event.title)}</div><div class="alert-detail">${escapeHtml(event.detail)}</div></article>`,
      )
      .join("");
  } else {
    alertList.innerHTML =
      `<p class="alert-clear">No safety events in the current ${connectionStatus === "demo" ? "simulated" : "live"} positions.</p>`;
  }
}

function renderZones() {
  document.querySelector("#zone-count").textContent = `${zones.length} ZONES`;
  zoneList.innerHTML = zones.length
    ? zones.map((zone) => `<div class="zone-row"><span>${escapeHtml(zone.name)}</span><small>${zone.width} × ${zone.height} m</small><button type="button" data-zone-id="${escapeHtml(zone.id)}" aria-label="Remove zone ${escapeHtml(zone.name)}">×</button></div>`).join("")
    : '<p class="inventory-empty">No restricted zones configured.</p>';
}

function render(now = Date.now()) {
  const workers = assets.filter((asset) => asset.type === "worker");
  const equipment = assets.filter((asset) => asset.type === "equipment");
  const liveCount = liveAssets(now).length;
  const events = calculateAlerts(now);

  document.querySelector("#admin-worker-count").textContent = String(
    workers.length,
  ).padStart(2, "0");
  document.querySelector("#admin-equipment-count").textContent = String(
    equipment.length,
  ).padStart(2, "0");
  document.querySelector("#admin-live-count").textContent = String(
    liveCount,
  ).padStart(2, "0");
  document.querySelector("#coverage-note").textContent =
    `of ${assets.length} registered`;
  renderInventory(now);
  renderZones();
  renderAlerts(events, now);
  drawMap(now, events);
  if (connectionStatus === "live" && events.length && !alertAnimationRunning) {
    alertAnimationRunning = true;
    requestAnimationFrame(animateAlertMap);
  }
}

function animateAlertMap() {
  if (connectionStatus !== "live") {
    alertAnimationRunning = false;
    return;
  }
  const now = Date.now();
  const events = calculateAlerts(now);
  drawMap(now, events);
  if (events.length) requestAnimationFrame(animateAlertMap);
  else alertAnimationRunning = false;
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
}

function drawMap(now = Date.now(), events = []) {
  const state = {
    workers: assets.filter((asset) => asset.type === "worker").map(({ id, name }) => ({ id, name })),
    vehicles: assets.filter((asset) => asset.type === "equipment").map(({ id, name }) => ({ id, name })),
    zones,
  };
  const positions = {
    workers: assets.filter((asset) => asset.type === "worker" && asset.location).map(({ id, location }) => ({ id, x: location.x, y: location.y, stale: assetStatus({ location }, now) !== "LIVE" })),
    vehicles: assets.filter((asset) => asset.type === "equipment" && asset.location).map(({ id, location }) => ({ id, x: location.x, y: location.y, stale: assetStatus({ location }, now) !== "LIVE" })),
  };
  renderFactory(canvas, state, positions, events);
  document.querySelector("#map-empty").hidden = assets.some(
    (asset) => asset.location && assetStatus(asset, now) === "LIVE",
  );
}

function normalizeTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === "string") return Date.parse(value);
  return NaN;
}

function applyLocation(update) {
  if (!update || typeof update !== "object" || Array.isArray(update))
    return false;
  if (typeof update.trackerId !== "string" || !update.trackerId.trim())
    return false;
  if (!Number.isFinite(update.x) || !Number.isFinite(update.y)) return false;
  if (
    update.x < 0 ||
    update.x > FLOOR.width ||
    update.y < 0 ||
    update.y > FLOOR.height
  )
    return false;

  const timestamp = normalizeTimestamp(update.timestamp);
  const now = Date.now();
  if (
    !Number.isFinite(timestamp) ||
    timestamp > now + 30_000 ||
    now - timestamp > STALE_WINDOW_MS
  )
    return false;

  const asset = assets.find((item) => item.trackerId === update.trackerId);
  if (!asset) return false;
  if (asset.location && timestamp < asset.location.timestamp) return false;

  const accuracyMeters = Number(update.accuracyMeters);
  asset.location = {
    x: update.x,
    y: update.y,
    timestamp,
    source: "feed",
    ...(Number.isFinite(accuracyMeters) && accuracyMeters >= 0
      ? { accuracyMeters }
      : {}),
  };
  return true;
}

function handleTelemetryMessage(rawMessage) {
  let message;
  try {
    message = JSON.parse(rawMessage);
  } catch {
    return;
  }

  const updates =
    message?.type === "snapshot" && Array.isArray(message.locations)
      ? message.locations
      : [message];
  let acceptedCount = 0;
  for (const update of updates) {
    if (applyLocation(update)) acceptedCount += 1;
  }

  if (acceptedCount) {
    setFeedMessage(
      `Receiving locations · last update ${new Date().toLocaleTimeString()}`,
    );
    render();
  }
}

function connectFeed() {
  if (demoMode) stopDemo();
  let endpoint;
  try {
    endpoint = new URL(feedUrl.value.trim());
  } catch {
    setConnectionStatus(
      "error",
      "Enter a valid WebSocket URL supplied by your tracking gateway.",
    );
    return;
  }
  if (
    !["ws:", "wss:"].includes(endpoint.protocol) ||
    endpoint.username ||
    endpoint.password
  ) {
    setConnectionStatus(
      "error",
      "Use a ws:// or wss:// URL without embedded credentials.",
    );
    return;
  }

  if (socket) socket.close();
  const generation = ++connectionGeneration;
  setConnectionStatus("connecting", "Connecting to the tracking gateway...");
  try {
    socket = new WebSocket(endpoint.href);
  } catch {
    setConnectionStatus(
      "error",
      "Could not create the WebSocket connection. Check the URL and gateway.",
    );
    return;
  }

  socket.addEventListener("open", () => {
    if (generation !== connectionGeneration) return;
    setConnectionStatus(
      "live",
      "Connected. Waiting for registered tracker locations...",
    );
  });
  socket.addEventListener("message", (event) => {
    if (generation === connectionGeneration && typeof event.data === "string")
      handleTelemetryMessage(event.data);
  });
  socket.addEventListener("error", () => {
    if (generation === connectionGeneration)
      setConnectionStatus(
        "error",
        "Tracking feed error. Verify gateway availability and browser network access.",
      );
  });
  socket.addEventListener("close", () => {
    if (generation === connectionGeneration) {
      socket = null;
      setConnectionStatus(
        "offline",
        "Tracking feed disconnected. Current positions will age out.",
      );
    }
  });
}

function disconnectFeed() {
  connectionGeneration += 1;
  const activeSocket = socket;
  socket = null;
  if (activeSocket) activeSocket.close();
  setConnectionStatus(
    "offline",
    "Tracking feed disconnected. Current positions will age out.",
  );
}

trackerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = trackerName.value.trim();
  const id = trackerId.value.trim();
  if (!name || !id) return;
  if (!/^[A-Za-z0-9._:-]+$/.test(id)) {
    trackerId.setCustomValidity(
      "Use letters, numbers, dots, underscores, colons, or hyphens.",
    );
    trackerId.reportValidity();
    trackerId.setCustomValidity("");
    return;
  }
  if (
    assets.some((asset) => asset.trackerId.toLowerCase() === id.toLowerCase())
  ) {
    trackerId.setCustomValidity("That tracker ID is already registered.");
    trackerId.reportValidity();
    trackerId.setCustomValidity("");
    return;
  }

  assets.push({
    id: crypto.randomUUID(),
    type: trackerKind.value,
    name,
    trackerId: id,
    location: null,
  });
  persistAssets();
  trackerName.value = "";
  trackerId.value = "";
  render();
});

demoToggle.addEventListener("click", () => {
  if (demoMode) stopDemo();
  else startDemo();
});

zoneForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = document.querySelector("#zone-name").value.trim();
  const zone = {
    id: `ZONE-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    x: Number(document.querySelector("#zone-x").value),
    y: Number(document.querySelector("#zone-y").value),
    width: Number(document.querySelector("#zone-width").value),
    height: Number(document.querySelector("#zone-height").value),
  };
  if (!validZone(zone)) {
    setFeedMessage("Zone must have a name, positive size, and fit inside the 60 × 36 m floor.", "error");
    return;
  }
  zones.push(zone);
  persistZones();
  zoneForm.reset();
  document.querySelector("#zone-x").value = "10";
  document.querySelector("#zone-y").value = "10";
  document.querySelector("#zone-width").value = "8";
  document.querySelector("#zone-height").value = "6";
  setFeedMessage(`Restricted zone “${zone.name}” added.`);
  render();
});

zoneList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-zone-id]");
  if (!button) return;
  zones = zones.filter((zone) => zone.id !== button.dataset.zoneId);
  persistZones();
  render();
});

inventory.addEventListener("click", (event) => {
  const button = event.target.closest(".remove-asset");
  if (!button) return;
  assets = assets.filter((asset) => asset.id !== button.dataset.id);
  persistAssets();
  render();
});

connectButton.addEventListener("click", connectFeed);
disconnectButton.addEventListener("click", disconnectFeed);
feedUrl.addEventListener("change", () => {
  try {
    localStorage.setItem(
      "floorwatch-tracking-feed-url-v1",
      feedUrl.value.trim(),
    );
  } catch {
    // The address remains usable for the current page even when storage is unavailable.
  }
});

workerThreshold.value = thresholds.workers;
equipmentThreshold.value = thresholds.equipment;
workerThreshold.addEventListener("change", () => {
  thresholds.workers = boundedNumber(workerThreshold.value, 3, 1, 20);
  workerThreshold.value = thresholds.workers;
  persistThresholds();
  render();
});
equipmentThreshold.addEventListener("change", () => {
  thresholds.equipment = boundedNumber(equipmentThreshold.value, 5, 1, 30);
  equipmentThreshold.value = thresholds.equipment;
  persistThresholds();
  render();
});

try {
  feedUrl.value = localStorage.getItem("floorwatch-tracking-feed-url-v1") || "";
} catch {
  feedUrl.value = "";
}

document.querySelector("#enter-admin").addEventListener("click", () => {
  sessionStorage.setItem(ROLE_KEY, "admin");
  gate.hidden = true;
  workspace.hidden = false;
  render();
});

if (sessionStorage.getItem(ROLE_KEY) === "admin") {
  gate.hidden = true;
  workspace.hidden = false;
}

render();
window.setInterval(() => render(), 1_000);
window.addEventListener("resize", () => drawMap());
window.addEventListener("pagehide", () => {
  connectionGeneration += 1;
  if (socket) socket.close();
});
