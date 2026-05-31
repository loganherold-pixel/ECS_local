const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const types = read('lib/expedition/expeditionTripRecordTypes.ts');
const store = read('lib/expedition/expeditionTripRecordStore.ts');
const routeSessionStore = read('lib/navigateRouteSessionStore.ts');
const expeditionIndex = read('lib/expedition/index.ts');

[
  'id',
  'schemaVersion',
  'userId',
  'title',
  "status: ExpeditionTripStatus",
  'startedAt',
  'completedAt',
  'totalDistanceMiles',
  'totalDurationSeconds',
  'minElevationFt',
  'maxElevationFt',
  'totalElevationGainFt',
  'startCoordinate',
  'endCoordinate',
  'routeGeometry',
  'routeBounds',
  'weatherSnapshots',
  'terrainRiskSnapshots',
  'notableMoments',
  'deviations',
  'bailoutPointsUsed',
  'campCandidatesViewed',
  'resupplyStopsViewed',
  'recoveryPanelUsed',
  'badgesUnlocked',
  'generatedSummary',
  'recap',
  'createdAt',
  'updatedAt',
].forEach((field) => {
  assert(types.includes(field), `Expedition trip record type should include ${field}.`);
});

assert(
  types.includes("export type ExpeditionTripStatus = 'planned' | 'active' | 'completed' | 'cancelled' | 'archived'"),
  'Trip status should preserve planned/active/completed plus cancelled manual-end and archived lifecycle states.',
);
assert(
  types.includes("export type ExpeditionTripDataQuality = 'live' | 'cached' | 'stale' | 'manual' | 'mock' | 'missing' | 'estimated'"),
  'Trip source quality should make cached/stale/manual/mock/missing/estimated data explicit.',
);

[
  'createNewActiveTripRecord',
  'updateTripStatsDuringGuidance',
  'finalizeCompletedTrip',
  'safelyStoreNotableMoment',
  'safelyAppendBadgeIds',
  'ensureActiveTripRecordForGuidance',
  'cancelActiveTripRecordFromGuidanceEnd',
  'finalizeActiveTripRecordFromGuidanceEnd',
  'trackExpeditionTripFromGuidanceSnapshot',
  'normalizeTripRecord',
  'migrateTripRecord',
  'validateTripRecord',
  'getTripSchemaVersion',
  'upgradeTripSchemaIfNeeded',
].forEach((helper) => {
  assert(
    store.includes(`export function ${helper}`) || store.includes(`export async function ${helper}`),
    `${helper} should be exported from the store module.`,
  );
  assert(expeditionIndex.includes(helper), `${helper} should be available from the expedition barrel.`);
});

assert(
  expeditionIndex.includes('generateExpeditionRecap'),
  'Recap generation should be available from the expedition barrel.',
);

assert(
  store.includes("createMigratingNonSecureStorage('ecs_expedition_trip_records'"),
  'Trip records should reuse ECS non-secure local persistence instead of introducing a duplicate storage system.',
);
assert(
  store.includes("syncStatus: 'local'") && types.includes("syncStatus: 'local' | 'pending' | 'synced' | 'failed'"),
  'Trip records should be local-first and ready for later cloud sync state.',
);
assert(
  store.includes("snapshot.lifecycle === 'active'") && store.includes("snapshot.lifecycle === 'arrived'"),
  'Guidance tracking should create/update active trips and finalize arrived trips.',
);
assert(
  store.includes("snapshot.lifecycle === 'inactive'") && store.includes('cancelActiveTripRecordFromGuidanceEnd'),
  'Ending active guidance before arrival should cancel the active local trip record instead of completing it.',
);
assert(
  routeSessionStore.includes("import { trackExpeditionTripFromGuidanceSnapshot } from './expedition/expeditionTripRecordStore'") &&
    routeSessionStore.includes('void trackExpeditionTripFromGuidanceSnapshot(currentSnapshot);'),
  'Navigate route session updates should feed the Expedition Trip Record foundation.',
);

[
  'recap map',
  'evaluate badges',
  'learned insights',
  'printable/exportable recaps',
].forEach((todo) => {
  assert(store.toLowerCase().includes(todo), `Future hook TODO should mention ${todo}.`);
});

assert(!store.includes('RecoveryPanel'), 'Trip record foundation must not modify or import the recovery panel.');
assert(!store.toLowerCase().includes('checklist'), 'Trip record foundation must not add checklist behavior.');
assert(!store.includes('PDF') && !store.includes('exportPdf'), 'Trip record foundation must not add PDF/export behavior.');

console.log('Expedition trip record foundation checks passed.');
