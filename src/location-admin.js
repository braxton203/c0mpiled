const FLOOR = { width: 60, height: 36 };
const STORAGE_KEY = "floorwatch-admin-tracked-assets-v1";
const THRESHOLD_KEY = "floorwatch-admin-proximity-thresholds-v1";
const ROLE_KEY = "floorwatch-admin-demo-role";
const LIVE_WINDOW_MS = 5_000;
const STALE_WINDOW_MS = 15_000;
const zones = [
  { id: "Z-01", name: "Robot cell", x: 45, y: 3, width: 11, height: 9 },
  { id: "Z-02", name: "Loading bay", x: 3, y: 3, width: 10, height: 7 },
];

const workspace = document.querySelector("#admin-workspace");
const gate = document.querySelector("#access-gate");
const canvas = document.querySelector("#admin-map");
const context = canvas.getContext("2d");
const trackerForm = document.querySelector("#tracker-form");
const trackerKind = document.querySelector("#tracker-kind");
const trackerName = document.querySelector("#tracker-name");
const trackerId = document.querySelector("#tracker-id");
const inventory = document.querySelector("#inventory-list");
const feedUrl = document.querySelector("#feed-url");
const connectButton = document.querySelector("#connect-feed");
const disconnectButton = document.querySelector("#disconnect-feed");
const workerThreshold = document.querySelector("#worker-threshold");
const equipmentThreshold = document.querySelector("#equipment-threshold");

let assets = loadAssets();
let thresholds = loadThresholds();
let socket = null;
let connectionGeneration = 0;
let connectionStatus = "offline";

function loadAssets() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
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

function boundedNumber(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(minimum, Math.min(maximum, number))
    : fallback;
}

function persistAssets() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
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
    error: "CONNECTION ERROR",
  };

  label.textContent = labels[status];
  badge.textContent = status.toUpperCase();
  dot.className = `connection-dot ${status}`;
  badge.classList.toggle("connected", status === "live");
  badge.classList.toggle("danger", status === "error");
  connectButton.disabled = status === "connecting" || status === "live";
  disconnectButton.disabled = status !== "connecting" && status !== "live";
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
  const workers = assets.filter(
    (asset) =>
      asset.type === "worker" &&
      asset.location &&
      now - asset.location.timestamp <= LIVE_WINDOW_MS,
  );
  const equipment = assets.filter(
    (asset) =>
      asset.type === "equipment" &&
      asset.location &&
      now - asset.location.timestamp <= LIVE_WINDOW_MS,
  );
  const events = [];

  for (let first = 0; first < workers.length; first += 1) {
    for (let second = first + 1; second < workers.length; second += 1) {
      const worker = workers[first];
      const other = workers[second];
      const distance = distanceBetween(worker.location, other.location);
      if (distance <= thresholds.workers) {
        events.push({
          severity: distance <= thresholds.workers * 0.5 ? "danger" : "warning",
          title: "Worker proximity",
          detail: `${worker.name} and ${other.name} are ${distance.toFixed(1)} m apart.`,
        });
      }
    }

    const worker = workers[first];
    for (const vehicle of equipment) {
      const distance = distanceBetween(worker.location, vehicle.location);
      if (distance <= thresholds.equipment) {
        events.push({
          severity:
            distance <= thresholds.equipment * 0.5 ? "danger" : "warning",
          title: "Equipment proximity",
          detail: `${vehicle.name} is ${distance.toFixed(1)} m from ${worker.name}.`,
        });
      }
    }

    for (const zone of zones) {
      const location = worker.location;
      if (
        location.x >= zone.x &&
        location.x <= zone.x + zone.width &&
        location.y >= zone.y &&
        location.y <= zone.y + zone.height
      ) {
        events.push({
          severity: "danger",
          title: "Restricted area entry",
          detail: `${worker.name} is inside ${zone.name}.`,
        });
      }
    }
  }

  return events;
}

function distanceBetween(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y);
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

  document.querySelector("#admin-alert-count").textContent = String(
    events.length,
  ).padStart(2, "0");
  if (connectionStatus !== "live") {
    review.textContent = "NO FEED";
  } else if (freshCount === 0) {
    review.textContent = "NO DATA";
  } else {
    review.textContent = events.length
      ? `${events.length} REVIEW${events.length === 1 ? "" : "S"}`
      : "CLEAR";
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

  if (connectionStatus !== "live" || freshCount === 0) {
    alertList.innerHTML =
      '<p class="alert-clear">Live telemetry unavailable. A clear floor cannot be confirmed.</p>';
  } else if (events.length) {
    alertList.innerHTML = events
      .map(
        (event) =>
          `<article class="alert-card ${event.severity}"><div class="alert-title">${escapeHtml(event.title)}</div><div class="alert-detail">${escapeHtml(event.detail)}</div></article>`,
      )
      .join("");
  } else {
    alertList.innerHTML =
      '<p class="alert-clear">No proximity events in the current live positions.</p>';
  }
}

function render(now = Date.now()) {
  const workers = assets.filter((asset) => asset.type === "worker");
  const equipment = assets.filter((asset) => asset.type === "equipment");
  const liveCount = liveAssets(now).length;

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
  renderAlerts(calculateAlerts(now), now);
  drawMap(now);
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

function drawMap(now = Date.now()) {
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

  const padding = 23;
  const scale = Math.min(
    (rect.width - padding * 2) / FLOOR.width,
    (rect.height - padding * 2) / FLOOR.height,
  );
  const mapWidth = FLOOR.width * scale;
  const mapHeight = FLOOR.height * scale;
  const ox = (rect.width - mapWidth) / 2;
  const oy = (rect.height - mapHeight) / 2;
  const px = (x) => ox + x * scale;
  const py = (y) => oy + y * scale;

  context.clearRect(0, 0, rect.width, rect.height);
  context.fillStyle = "#202d28";
  context.fillRect(0, 0, rect.width, rect.height);
  context.fillStyle = "#27362f";
  context.fillRect(ox, oy, mapWidth, mapHeight);
  context.save();
  context.beginPath();
  context.rect(ox, oy, mapWidth, mapHeight);
  context.clip();
  drawGrid(px, py, ox, oy, mapWidth, mapHeight);
  drawFixtures(px, py, scale);
  drawZones(px, py, scale);

  for (const asset of assets) {
    if (!asset.location) continue;
    const isLive = assetStatus(asset, now) === "LIVE";
    drawAsset(asset, px(asset.location.x), py(asset.location.y), scale, isLive);
  }

  context.restore();
  context.strokeStyle = "#61746a";
  context.lineWidth = 1;
  context.strokeRect(ox, oy, mapWidth, mapHeight);
  document.querySelector("#map-empty").hidden = assets.some(
    (asset) => asset.location && assetStatus(asset, now) === "LIVE",
  );
}

function drawGrid(px, py, ox, oy, mapWidth, mapHeight) {
  context.strokeStyle = "rgba(199,220,202,.10)";
  context.lineWidth = 1;
  for (let x = 0; x <= FLOOR.width; x += 2) {
    context.beginPath();
    context.moveTo(px(x), oy);
    context.lineTo(px(x), oy + mapHeight);
    context.stroke();
  }
  for (let y = 0; y <= FLOOR.height; y += 2) {
    context.beginPath();
    context.moveTo(ox, py(y));
    context.lineTo(ox + mapWidth, py(y));
    context.stroke();
  }
}

function drawFixtures(px, py, scale) {
  drawFixture(px, py, scale, 15, 5, 8, 4, "PARTS");
  drawFixture(px, py, scale, 17, 25, 8, 5, "ASSEMBLY");
  drawFixture(px, py, scale, 31, 5, 7, 4, "STORAGE");
  drawFixture(px, py, scale, 32, 25, 9, 5, "PACKING");
}

function drawFixture(px, py, scale, x, y, width, height, label) {
  context.fillStyle = "#34453b";
  context.strokeStyle = "#4b5c4f";
  context.lineWidth = 1;
  context.fillRect(px(x), py(y), width * scale, height * scale);
  context.strokeRect(px(x), py(y), width * scale, height * scale);
  context.fillStyle = "#a8b8a8";
  context.font = '8px "IBM Plex Mono", monospace';
  context.fillText(label, px(x) + 5, py(y) + 12);
}

function drawZones(px, py, scale) {
  for (const zone of zones) {
    context.fillStyle = "rgba(231,111,91,.21)";
    context.fillRect(
      px(zone.x),
      py(zone.y),
      zone.width * scale,
      zone.height * scale,
    );
    context.strokeStyle = "#e58670";
    context.lineWidth = 1;
    context.setLineDash([5, 4]);
    context.strokeRect(
      px(zone.x),
      py(zone.y),
      zone.width * scale,
      zone.height * scale,
    );
    context.setLineDash([]);
    context.fillStyle = "#f3b3a1";
    context.font = '9px "IBM Plex Mono", monospace';
    context.fillText(zone.name.toUpperCase(), px(zone.x) + 5, py(zone.y) + 12);
  }
}

function drawAsset(asset, x, y, scale, isLive) {
  context.save();
  context.globalAlpha = isLive ? 1 : 0.35;
  if (asset.type === "equipment") {
    context.fillStyle = "#edb54e";
    context.fillRect(
      x - scale * 0.9,
      y - scale * 0.55,
      scale * 1.8,
      scale * 1.1,
    );
    context.fillStyle = "#614d2b";
    context.fillRect(
      x - scale * 0.12,
      y - scale * 0.36,
      scale * 0.72,
      scale * 0.72,
    );
  } else {
    context.fillStyle = "#76dba6";
    context.beginPath();
    context.arc(x, y, Math.max(4, scale * 0.34), 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#192820";
    context.lineWidth = 1.5;
    context.stroke();
  }
  context.fillStyle = "#e4ede2";
  context.font = '9px "IBM Plex Mono", monospace';
  context.fillText(asset.name, x + 8, y - 7);
  context.restore();
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
