const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const memoryStorage = new Map();
global.localStorage = {
  getItem(key) {
    return memoryStorage.has(key) ? memoryStorage.get(key) : null;
  },
  setItem(key, value) {
    memoryStorage.set(key, String(value));
  },
  removeItem(key) {
    memoryStorage.delete(key);
  },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  return originalLoad(request, parent, isMain);
};

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const {
  BADGE_IDENTITY_MVP_BADGE_MAPPING,
  buildBadgeIdentityProfileModel,
} = require(path.join(root, 'lib', 'expedition', 'badgeExpeditionIdentityReadiness.ts'));
const {
  clearAllBadgesForTests,
  getUnlockedBadges,
  hasBadge,
  recordBadgeIdentitySafeSignal,
} = require(path.join(root, 'lib', 'expedition', 'expeditionBadgeStore.ts'));
const {
  getBadgeDefinition,
} = require(path.join(root, 'lib', 'expedition', 'expeditionBadgeRegistry.ts'));

const activeTripModeSource = read('lib/activeTripMode.ts');
const tripBuilderSource = read('app/explore-trip-builder.tsx');
const activeTripScreenSource = read('app/active-trip.tsx');
const packetScreenSource = read('app/offline-incident-packet.tsx');
const fleetProfileSource = read('components/fleet/FleetVehicleProfileModal.tsx');
const identitySurfaceSource = read('components/dashboard/ExpeditionIdentityProfileSurface.tsx');
const packetSource = read('app/offline-incident-packet.tsx');

const expectedMapping = {
  vehicle_profile_completed: 'profile-ready',
  trip_confidence_summary_generated: 'confidence-checked',
  active_trip_activated: 'trip-activated',
  active_trip_resumed_after_restart: 'resume-ready',
  offline_incident_packet_created: 'local-packet-ready',
  local_only_packet_viewed: 'packet-reviewed',
  terrain_risk_evaluated: 'terrain-aware',
  camp_viability_evaluated: 'basecamp-reviewed',
  clean_trip_stopped_or_completed: 'clean-stop',
  route_authority_recognized: 'route-authority-recognized',
  unavailable_state_handled: 'honest-unknown',
};

assert.deepStrictEqual(
  BADGE_IDENTITY_MVP_BADGE_MAPPING,
  expectedMapping,
  'MVP safe signals should map to the explicit Badge / Expedition Identity MVP badge ids.',
);

for (const badgeId of Object.values(expectedMapping)) {
  const definition = getBadgeDefinition(badgeId);
  assert(definition, `${badgeId} should be registered as an Expedition badge definition.`);
  assert.strictEqual(definition.evaluationType, 'safe_signal', `${badgeId} should only unlock through safe signal recording.`);
  assert.strictEqual(definition.isHidden, false, `${badgeId} should be visible only after earned, not hidden as a locked catalog item.`);
}

assert(
  activeTripModeSource.includes("recordBadgeIdentitySafeSignal({ signalId: 'active_trip_activated'") &&
    activeTripModeSource.includes("recordBadgeIdentitySafeSignal({ signalId: 'offline_incident_packet_created'") &&
    activeTripModeSource.includes("recordBadgeIdentitySafeSignal({ signalId: 'active_trip_resumed_after_restart'") &&
    activeTripModeSource.includes("recordBadgeIdentitySafeSignal({ signalId: 'clean_trip_stopped_or_completed'") &&
    activeTripModeSource.includes("recordBadgeIdentitySafeSignal({ signalId: 'route_authority_recognized'"),
  'Active Trip lifecycle should record safe identity unlock signals at activation, packet creation, resume, clean stop, and recognized route authority.',
);
assert(
  tripBuilderSource.includes("recordBadgeIdentitySafeSignal({ signalId: 'trip_confidence_summary_generated'"),
  'Trip Builder should record Trip Confidence Summary generation without waiting for Active Trip activation.',
);
assert(
  activeTripScreenSource.includes("recordBadgeIdentitySafeSignal({ signalId: 'terrain_risk_evaluated'") &&
    activeTripScreenSource.includes("recordBadgeIdentitySafeSignal({ signalId: 'camp_viability_evaluated'") &&
    activeTripScreenSource.includes("recordBadgeIdentitySafeSignal({ signalId: 'unavailable_state_handled'"),
  'Active Trip screen should record only deterministic terrain, camp, and honest unavailable-state evaluation signals.',
);
assert(
  packetScreenSource.includes("recordBadgeIdentitySafeSignal({ signalId: 'local_only_packet_viewed'"),
  'Offline Incident Packet view should record local-only packet review as a safe signal.',
);
assert(
  fleetProfileSource.includes("recordBadgeIdentitySafeSignal({ signalId: 'vehicle_profile_completed'"),
  'Fleet profile save should record the vehicle profile completed safe signal.',
);

assert(
  !packetSource.includes('ExpeditionIdentityProfileSurface') &&
    !packetSource.includes('BadgeUnlockSummary') &&
    !packetSource.includes('Badge unlocked'),
  'Offline Incident Packet must not render badge/profile noise or unlock notification copy.',
);

(async () => {
  await clearAllBadgesForTests();

  for (const [signalId, badgeId] of Object.entries(expectedMapping)) {
    const unlocked = await recordBadgeIdentitySafeSignal({
      signalId,
      source: 'test',
      occurredAt: '2026-06-09T08:00:00.000Z',
    });
    assert.strictEqual(unlocked.length, 1, `${signalId} should unlock exactly one badge the first time.`);
    assert.strictEqual(unlocked[0].id, badgeId, `${signalId} should unlock ${badgeId}.`);
    assert.strictEqual(await hasBadge(badgeId), true, `${badgeId} should persist in the badge store.`);
  }

  const duplicate = await recordBadgeIdentitySafeSignal({
    signalId: 'active_trip_activated',
    source: 'test',
    occurredAt: '2026-06-09T08:05:00.000Z',
  });
  assert.deepStrictEqual(duplicate, [], 'Duplicate safe signal events should be idempotent.');
  const activeTripUnlocks = (await getUnlockedBadges()).filter((badge) => badge.id === 'trip-activated');
  assert.strictEqual(activeTripUnlocks.length, 1, 'Duplicate events must not duplicate persisted badges.');

  const unsafe = await recordBadgeIdentitySafeSignal({
    signalId: 'unverified_mopeka_live',
    source: 'test',
    occurredAt: '2026-06-09T08:10:00.000Z',
  });
  assert.deepStrictEqual(unsafe, [], 'Unsafe hardware/provider signals must not unlock badges.');

  const mock = await recordBadgeIdentitySafeSignal({
    signalId: 'route_authority_recognized',
    source: 'test',
    sourceQuality: 'mock',
    occurredAt: '2026-06-09T08:15:00.000Z',
  });
  assert.deepStrictEqual(mock, [], 'Mock/demo fixture events must not unlock badges.');

  const unlockedBadges = await getUnlockedBadges();
  const profile = buildBadgeIdentityProfileModel({ badges: unlockedBadges });
  assert.strictEqual(profile.earnedBadgeCount, Object.keys(expectedMapping).length, 'Profile should count real earned MVP badges.');
  assert(profile.latestEarnedBadge, 'Profile should expose the latest earned badge.');
  assert.strictEqual(profile.latestEarnedBadge.id, 'profile-ready', 'Newest badge should follow the latest persisted unlock timestamp order.');
  assert(profile.nextMilestone, 'Profile should expose a compact next milestone.');
  assert(!profile.nextMilestone.label.toLowerCase().includes('certified'), 'Next milestone copy must not imply credentials.');

  const missingProfile = buildBadgeIdentityProfileModel();
  assert.strictEqual(missingProfile.title, 'Trail Scout', 'Missing badge state should retain the safe fallback title.');
  assert.strictEqual(missingProfile.earnedBadgeCount, 0, 'Missing badge state must not fabricate badge progress.');
  assert.strictEqual(missingProfile.latestEarnedBadge, null, 'Missing badge state should not expose a latest badge.');

  assert(
    identitySurfaceSource.includes('Latest Badge') &&
      identitySurfaceSource.includes('Next Milestone') &&
      identitySurfaceSource.includes('model.latestEarnedBadge') &&
      identitySurfaceSource.includes('model.nextMilestone'),
    'Profile surface should render latest earned badge and safe next milestone copy.',
  );

  console.log('Badge / Expedition Identity MVP checks passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
