const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const source = read('lib/vehicleSessionState.ts');
const vehicleStoreSource = read('lib/vehicleStore.ts');
const vehicleCompanionManagerSource = read('lib/vehicleCompanionManager.ts');
const releaseAudit = read('docs/release-logging-hygiene-audit.md');

assert(
  source.includes("import { ecsLog } from './ecsLogger';"),
  'VehicleSessionState should use the centralized ECS logger.',
);

assert(
  source.includes('function logVehicleSessionDebug') &&
    source.includes("ecsLog.dev('SYSTEM'") &&
    source.includes("debugFlag: 'ECS_DEBUG_VEHICLE_SESSION'"),
  'VehicleSessionState lifecycle success logs should be dev-gated through ecsLog.dev.',
);

assert(
  !source.includes('console.log('),
  'VehicleSessionState should not emit production console.log lifecycle spam.',
);

[
  'mode_changed',
  'expedition_started',
  'route_activated',
  'waypoint_added',
  'companion_connected',
  'session_state_reset',
].forEach((eventName) => {
  assert(
    source.includes(`logVehicleSessionDebug('${eventName}'`),
    `VehicleSessionState should preserve debug visibility for ${eventName}.`,
  );
});

assert(
  releaseAudit.includes('lib/vehicleSessionState.ts`) success lifecycle breadcrumbs now use `ecsLog.dev') ||
    releaseAudit.includes('lib/vehicleSessionState.ts`: success lifecycle breadcrumbs now use `ecsLog.dev'),
  'Release logging audit should document the VehicleSessionState follow-up closure.',
);

assert(
  vehicleStoreSource.includes('function logVehicleStoreDebug') &&
    vehicleStoreSource.includes("ecsLog.dev('CONFIG'") &&
    vehicleStoreSource.includes("debugFlag: 'ECS_DEBUG_VEHICLE_STORE'"),
  'VehicleStore success-path breadcrumbs should remain dev-gated through ecsLog.dev.',
);

assert(
  vehicleStoreSource.includes('function logVehicleStoreWarn') &&
    vehicleStoreSource.includes("ecsLog.warn('CONFIG'") &&
    vehicleStoreSource.includes('function logVehicleStoreError') &&
    vehicleStoreSource.includes("ecsLog.error('CONFIG'"),
  'VehicleStore warnings and errors should route through ecsLog.',
);

assert(
  !vehicleStoreSource.includes('console.log(') &&
    !vehicleStoreSource.includes('console.warn(') &&
    !vehicleStoreSource.includes('console.error('),
  'VehicleStore should not emit direct production console output.',
);

assert(
  releaseAudit.includes('lib/vehicleStore.ts`) vehicle CRUD/cache success breadcrumbs now use `ecsLog.dev') ||
    releaseAudit.includes('lib/vehicleStore.ts`: vehicle CRUD/cache success breadcrumbs now use `ecsLog.dev'),
  'Release logging audit should document the VehicleStore follow-up closure.',
);

assert(
  vehicleCompanionManagerSource.includes("import { ecsLog } from './ecsLogger';"),
  'VehicleCompanionManager should use the centralized ECS logger.',
);

assert(
  vehicleCompanionManagerSource.includes('function logCompanionDebug') &&
    vehicleCompanionManagerSource.includes("ecsLog.dev('SYSTEM'") &&
    vehicleCompanionManagerSource.includes("debugFlag: 'ECS_DEBUG_VEHICLE_COMPANION'"),
  'VehicleCompanionManager success breadcrumbs should be dev-gated through ecsLog.dev.',
);

assert(
  vehicleCompanionManagerSource.includes('function logCompanionWarn') &&
    vehicleCompanionManagerSource.includes("ecsLog.warn('SYSTEM'"),
  'VehicleCompanionManager warnings should route through ecsLog.warn.',
);

assert(
  !vehicleCompanionManagerSource.includes('console.log(') &&
    !vehicleCompanionManagerSource.includes('console.warn(') &&
    !vehicleCompanionManagerSource.includes('console.error('),
  'VehicleCompanionManager should not emit direct production console output.',
);

[
  'manager_started',
  'manager_stopped',
  'vehicle_action_received',
  'restore_companion_state',
  'return_to_start_activated',
  'manager_reset',
].forEach((eventName) => {
  assert(
    vehicleCompanionManagerSource.includes(`logCompanionDebug('${eventName}'`),
    `VehicleCompanionManager should preserve debug visibility for ${eventName}.`,
  );
});

assert(
  releaseAudit.includes('lib/vehicleCompanionManager.ts`) success breadcrumbs now use `ecsLog.dev') ||
    releaseAudit.includes('lib/vehicleCompanionManager.ts`: success breadcrumbs now use `ecsLog.dev'),
  'Release logging audit should document the VehicleCompanionManager follow-up closure.',
);

console.log('Vehicle logging hygiene checks passed.');
