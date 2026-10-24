// Hardware- and simulator-independent safety rules. All positions are meters.
export const SAFETY_CONFIG = Object.freeze({
  workerWarningMeters: 3,
  equipmentWarningMeters: 7,
  criticalRatio: 0.5,
});

/** Evaluate normalized app records against a normalized position snapshot. */
export function evaluateSafety(state, positions, thresholds = SAFETY_CONFIG) {
  const workers = state.workers || [];
  const vehicles = state.vehicles || state.equipment || [];
  const zones = state.zones || [];
  const workerPositions = new Map((positions?.workers || []).map((item) => [item.id, item]));
  const vehiclePositions = new Map((positions?.vehicles || positions?.equipment || []).map((item) => [item.id, item]));
  const events = [];
  const workerLimit = positiveNumber(thresholds.workerWarningMeters, 0);
  const equipmentLimit = positiveNumber(thresholds.equipmentWarningMeters, 7);
  const criticalRatio = Math.max(0, Math.min(1, positiveNumber(thresholds.criticalRatio, 0.5)));

  for (let index = 0; index < workers.length; index += 1) {
    const worker = workers[index];
    const workerPosition = workerPositions.get(worker.id);
    if (!validPosition(workerPosition)) continue;

    if (workerLimit > 0) {
      for (let otherIndex = index + 1; otherIndex < workers.length; otherIndex += 1) {
        const other = workers[otherIndex];
        const otherPosition = workerPositions.get(other.id);
        if (!validPosition(otherPosition)) continue;
        const distance = distanceBetween(workerPosition, otherPosition);
        if (distance <= workerLimit) {
          events.push(proximityEvent(
            `worker-near:${worker.id}:${other.id}`, 'worker-proximity', distance,
            workerLimit,
            `${other.name || other.id} is ${distance.toFixed(1)} m from ${worker.name || worker.id}.`,
            { workerId: worker.id, otherWorkerId: other.id }, criticalRatio,
          ));
        }
      }
    }

    for (const vehicle of vehicles) {
      const vehiclePosition = vehiclePositions.get(vehicle.id);
      if (!validPosition(vehiclePosition)) continue;
      const distance = distanceBetween(workerPosition, vehiclePosition);
      if (distance <= equipmentLimit) {
        const vehicleName = vehicle.name || vehicle.id;
        events.push(proximityEvent(
          `equipment-near:${worker.id}:${vehicle.id}`, 'equipment-proximity', distance,
          equipmentLimit,
          `${vehicleName} is ${distance.toFixed(1)} m from ${worker.name || worker.id}.`,
          { workerId: worker.id, vehicleId: vehicle.id }, criticalRatio,
        ));
      }
    }

    for (const zone of zones) {
      if (workerPosition.x >= zone.x && workerPosition.x <= zone.x + zone.width &&
          workerPosition.y >= zone.y && workerPosition.y <= zone.y + zone.height) {
        events.push({
          id: `zone-entry:${worker.id}:${zone.id}`,
          type: 'geofence', severity: 'danger', title: 'Restricted zone entry',
          detail: `${worker.name || worker.id} entered ${zone.name || zone.id}.`,
          workerId: worker.id, zoneId: zone.id,
        });
      }
    }
  }
  return events;
}

function proximityEvent(id, type, distance, limit, detail, entityIds, criticalRatio) {
  return {
    id, type, severity: distance <= limit * criticalRatio ? 'danger' : 'warning',
    title: type === 'worker-proximity' ? 'Worker proximity' : 'Equipment proximity',
    detail, distance, ...entityIds,
  };
}

function positiveNumber(value, fallback) {
  return Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : fallback;
}

function validPosition(position) {
  return position && Number.isFinite(position.x) && Number.isFinite(position.y);
}

function distanceBetween(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}
