// Sensor abstraction seam: replace positions() with real sensor/phone observations later.
export const SAFETY_CONFIG = { proximityMeters: 7, criticalMeters: 3 };

export function evaluateSafety(state) {
  const events = [];
  for (const worker of state.workers) {
    for (const vehicle of state.vehicles) {
      const distance = Math.hypot(worker.x - vehicle.x, worker.y - vehicle.y);
      if (distance <= SAFETY_CONFIG.proximityMeters) events.push({
        id: `near:${worker.id}:${vehicle.id}`, type: 'proximity', severity: distance <= SAFETY_CONFIG.criticalMeters ? 'danger' : 'warning',
        title: distance <= SAFETY_CONFIG.criticalMeters ? 'Critical proximity' : 'Vehicle nearby',
        detail: `${vehicle.id} is ${distance.toFixed(1)} m from ${worker.id}.`, distance,
      });
    }
    for (const zone of state.zones) {
      if (worker.x >= zone.x && worker.x <= zone.x + zone.width && worker.y >= zone.y && worker.y <= zone.y + zone.height) events.push({
        id: `zone:${worker.id}:${zone.id}`, type: 'geofence', severity: 'danger', title: 'Restricted zone entry', detail: `${worker.id} entered ${zone.name}.`,
      });
    }
  }
  return events;
}
