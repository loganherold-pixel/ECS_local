const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

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

const contractPath = path.join(root, 'lib', 'expedition', 'badgeExpeditionIdentityReadiness.ts');
const contractSource = read('lib/expedition/badgeExpeditionIdentityReadiness.ts');
const identitySurfaceSource = read('components/dashboard/ExpeditionIdentityProfileSurface.tsx');
const docsSource = read('docs/badge-expedition-identity-readiness.md');
const registrySource = read('lib/expedition/expeditionBadgeRegistry.ts');
const storeSource = read('lib/expedition/expeditionBadgeStore.ts');
const tripStoreSource = read('lib/expedition/expeditionTripRecordStore.ts');
const hubSource = read('components/dashboard/ExpeditionTab.tsx');
const catalogViewSource = read('components/dashboard/ExpeditionBadgeCatalogView.tsx');
const activeTripSource = read('app/active-trip.tsx');
const packetSource = read('app/offline-incident-packet.tsx');
const convoyMigrationSource = read('supabase/migrations/030_convoy_member_identity_titles.sql');
const indexSource = read('lib/expedition/index.ts');

const {
  BADGE_IDENTITY_CATEGORIES,
  BADGE_IDENTITY_DEFERRED_SIGNALS,
  BADGE_IDENTITY_PRODUCTION_GUARDS,
  BADGE_IDENTITY_SAFE_SIGNALS,
  BADGE_IDENTITY_SOURCE_OF_TRUTH,
  BADGE_IDENTITY_TITLE_TIERS,
  BADGE_IDENTITY_UI_SURFACES,
  buildBadgeIdentityProfileModel,
  deriveExpeditionIdentityTitle,
  isBadgeIdentitySignalDeferred,
  isBadgeIdentitySignalSafe,
} = require(contractPath);

[
  'EXPEDITION_BADGE_DEFINITIONS',
  'getVisibleBadgeDefinitions',
].forEach((snippet) => {
  assert(registrySource.includes(snippet), `Badge definitions should remain centralized in registry: ${snippet}.`);
});

assert(
  storeSource.includes("createMigratingNonSecureStorage('ecs_expedition_badges'") &&
    storeSource.includes('evaluateBadgesForCompletedTrip') &&
    storeSource.includes('getUnlockedBadges'),
  'Earned badge state should remain centralized in the persisted Expedition badge store.',
);
assert(
  tripStoreSource.includes('queueCompletedTripPostProcessing') &&
    tripStoreSource.includes('evaluateBadgesForCompletedTrip(record.id)'),
  'Completed trip post-processing should remain the existing unlock evaluation path.',
);
assert(
  hubSource.includes('ExpeditionBadgeCatalogView') &&
    hubSource.includes('BadgeUnlockSummary') &&
    catalogViewSource.includes('BadgeMilestoneList') &&
    catalogViewSource.includes('ExpeditionIdentityProfileSurface'),
  'Dashboard Expedition Hub should remain the badge entry surface and retain identity and milestone presentation.',
);
assert(
  activeTripSource.includes('Camp Viability') &&
    activeTripSource.includes('Terrain Risk') &&
    packetSource.includes('local-only') &&
    packetSource.includes('Terrain Risk'),
  'Native-verified trip spine surfaces should stay available for future safe identity signals.',
);
assert(
  convoyMigrationSource.includes('expedition_badge_title') &&
    convoyMigrationSource.includes('Optional Expedition badge/title snapshot'),
  'Convoy title field should remain an optional future presentation snapshot.',
);

assert.strictEqual(
  BADGE_IDENTITY_SOURCE_OF_TRUTH.definitionRegistry,
  'lib/expedition/expeditionBadgeRegistry.ts',
  'Contract should name the badge definition source of truth.',
);
assert.strictEqual(
  BADGE_IDENTITY_SOURCE_OF_TRUTH.earnedStateStore,
  'lib/expedition/expeditionBadgeStore.ts',
  'Contract should name the earned-state source of truth.',
);
assert.strictEqual(
  BADGE_IDENTITY_SOURCE_OF_TRUTH.unlockEvaluator,
  'evaluateBadgesForCompletedTrip',
  'Contract should name the existing deterministic unlock evaluator.',
);
assert.ok(
  BADGE_IDENTITY_SOURCE_OF_TRUTH.displaySurfaces.includes('Dashboard Expedition Hub') &&
    BADGE_IDENTITY_SOURCE_OF_TRUTH.displaySurfaces.includes('Completed trip detail') &&
    BADGE_IDENTITY_SOURCE_OF_TRUTH.displaySurfaces.includes('Future Expedition/Profile identity surface'),
  'Contract should keep display surfaces explicit and bounded.',
);
assert.ok(
  BADGE_IDENTITY_SOURCE_OF_TRUTH.surfacesToAvoid.includes('Offline Incident Packet'),
  'Offline Incident Packet should not receive gamified badge noise.',
);

const requiredSafeSignals = [
  'vehicle_profile_completed',
  'trip_confidence_summary_generated',
  'active_trip_activated',
  'offline_incident_packet_created',
  'active_trip_resumed_after_restart',
  'terrain_risk_evaluated',
  'camp_viability_evaluated',
  'route_authority_recognized',
  'clean_trip_stopped_or_completed',
  'local_only_packet_viewed',
  'unavailable_state_handled',
];

for (const signalId of requiredSafeSignals) {
  assert(
    BADGE_IDENTITY_SAFE_SIGNALS.some((signal) => signal.id === signalId),
    `Safe signal map should include ${signalId}.`,
  );
  assert.strictEqual(isBadgeIdentitySignalSafe(signalId), true, `${signalId} should be allowed as a future deterministic signal.`);
  assert.strictEqual(isBadgeIdentitySignalDeferred(signalId), false, `${signalId} should not be marked deferred.`);
}

const requiredDeferredSignals = [
  'unverified_ble_telemetry_live',
  'unverified_ecoflow_live',
  'unverified_mopeka_live',
  'convoy_role_or_presence',
  'community_route_published',
  'cloud_shared_packet',
  'mock_or_demo_fixture',
  'hardware_connection_detected',
];

for (const signalId of requiredDeferredSignals) {
  assert(
    BADGE_IDENTITY_DEFERRED_SIGNALS.some((signal) => signal.id === signalId),
    `Deferred signal map should include ${signalId}.`,
  );
  assert.strictEqual(isBadgeIdentitySignalSafe(signalId), false, `${signalId} must not be allowed for production unlocks yet.`);
  assert.strictEqual(isBadgeIdentitySignalDeferred(signalId), true, `${signalId} should be explicitly deferred.`);
}

[
  'firsts',
  'route_readiness',
  'vehicle_readiness',
  'field_planning',
  'terrain_awareness',
  'camp_readiness',
  'recovery_readiness',
  'expedition_history',
  'hidden',
].forEach((categoryId) => {
  assert(BADGE_IDENTITY_CATEGORIES.some((category) => category.id === categoryId), `Recommended categories should include ${categoryId}.`);
});

const requiredTitles = [
  'Trail Scout',
  'Route Analyst',
  'Field Planner',
  'Terrain Watch',
  'Basecamp Ready',
  'Expedition Lead',
  'Recovery Minded',
  'Field Commander',
];
for (const title of requiredTitles) {
  assert(BADGE_IDENTITY_TITLE_TIERS.some((tier) => tier.title === title), `Title tier should include ${title}.`);
}

const forbiddenTitleTerms = /\b(certified|official|law enforcement|police|sheriff|ranger|rescue|medical|medic|doctor|emt|paramedic)\b/i;
for (const tier of BADGE_IDENTITY_TITLE_TIERS) {
  assert(!forbiddenTitleTerms.test(tier.title), `${tier.title} should not imply official credentials or emergency authority.`);
  assert(!forbiddenTitleTerms.test(tier.description), `${tier.title} description should avoid official credential claims.`);
}

assert.deepStrictEqual(
  deriveExpeditionIdentityTitle().title,
  'Trail Scout',
  'Missing user state should safely derive the default title.',
);
assert.strictEqual(
  deriveExpeditionIdentityTitle({ earnedBadgeIds: ['route-adjusted', 'miles-100'] }).title,
  'Route Analyst',
  'Route and distance badges should derive Route Analyst without UI state.',
);
assert.strictEqual(
  deriveExpeditionIdentityTitle({ earnedBadgeIds: ['camp-scout'] }).title,
  'Basecamp Ready',
  'Camp-oriented earned badges should derive Basecamp Ready.',
);
assert.strictEqual(
  deriveExpeditionIdentityTitle({ earnedBadgeIds: ['terrain-watch'] }).title,
  'Terrain Watch',
  'Terrain earned badges should derive Terrain Watch.',
);
assert.strictEqual(
  deriveExpeditionIdentityTitle({ earnedBadgeIds: ['recovery-ready'] }).title,
  'Recovery Minded',
  'Recovery earned badges should derive Recovery Minded.',
);
assert.strictEqual(
  deriveExpeditionIdentityTitle({ earnedBadgeIds: ['trail-veteran'] }).title,
  'Expedition Lead',
  'Expedition history badges should derive Expedition Lead.',
);
assert.strictEqual(
  deriveExpeditionIdentityTitle({ earnedBadgeCount: 25 }).title,
  'Field Commander',
  'High earned badge thresholds should derive Field Commander.',
);
const missingProfile = buildBadgeIdentityProfileModel();
assert.strictEqual(missingProfile.title, 'Trail Scout', 'Missing badge state should still render a safe default title.');
assert.strictEqual(missingProfile.earnedBadgeCount, 0, 'Missing badge state should not fabricate earned badges.');
assert.strictEqual(missingProfile.hasEarnedState, false, 'Missing badge state should be explicitly unearned.');

const demoProfile = buildBadgeIdentityProfileModel({
  badges: [
    {
      id: 'miles-100',
      title: '100 Miles Explored',
      category: 'distance',
      unlockedAt: '2026-06-01T00:00:00.000Z',
      sourceQuality: 'mock',
    },
    {
      id: 'terrain-watch',
      title: 'Terrain Watch',
      category: 'terrain',
      unlockedAt: '2026-06-01T00:00:00.000Z',
      sourceLabel: 'ecs_demo_fixture',
    },
  ],
});
assert.strictEqual(demoProfile.earnedBadgeCount, 0, 'Demo/mock badge state should not appear earned.');
assert.strictEqual(demoProfile.excludedBadgeCount, 2, 'Demo/mock badge state should be explicitly excluded.');

const earnedProfile = buildBadgeIdentityProfileModel({
  badges: [
    {
      id: 'route-adjusted',
      title: 'Route Adjusted',
      category: 'route_behavior',
      unlockedAt: '2026-06-01T00:00:00.000Z',
    },
    {
      id: 'miles-100',
      title: '100 Miles Explored',
      category: 'distance',
      unlockedAt: '2026-06-01T00:00:00.000Z',
    },
  ],
});
assert.strictEqual(earnedProfile.title, 'Route Analyst', 'Current title should display when earned badge state exists.');
assert.deepStrictEqual(earnedProfile.earnedBadgeIds.sort(), ['miles-100', 'route-adjusted']);

assert.ok(
  BADGE_IDENTITY_UI_SURFACES.some((surface) => surface.id === 'dashboard_expedition_hub' && surface.status === 'safe_now'),
  'Dashboard Expedition Hub should be a safe current display surface.',
);
assert.ok(
  BADGE_IDENTITY_UI_SURFACES.some((surface) => surface.id === 'offline_incident_packet' && surface.status === 'avoid_badge_noise'),
  'Offline Incident Packet should stay local/safety-focused, not badge-focused.',
);
assert.ok(
  BADGE_IDENTITY_UI_SURFACES.some((surface) => surface.id === 'convoy_command' && surface.status === 'defer_until_convoy_qa'),
  'Convoy title display should be deferred until convoy QA.',
);

[
  'demoMockNeverUnlocks',
  'hiddenLockedBadgesStayHidden',
  'deterministicUnlocksOnly',
  'missingStateNoCrash',
  'identityPersistenceSeparate',
  'titlesDoNotImplyCredentials',
].forEach((guardKey) => {
  assert.strictEqual(BADGE_IDENTITY_PRODUCTION_GUARDS[guardKey], true, `Production guard ${guardKey} should be enabled.`);
});

for (const forbiddenImport of [
  'vehicleStore',
  'activeTripModeStore',
  'offlineIncidentPacketStore',
  "from '../Blu",
  "from '../Mopeka",
  "from '../EcoFlow",
  'telemetryStore',
]) {
  assert(
    !contractSource.includes(forbiddenImport),
    `Readiness contract should not import or mutate runtime provider state: ${forbiddenImport}.`,
  );
  assert(
    !identitySurfaceSource.includes(forbiddenImport),
    `Identity surface should not import or mutate runtime provider state: ${forbiddenImport}.`,
  );
}

[
  'export function ExpeditionIdentityProfileSurface',
  'testID="expedition-badge-profile-surface"',
  'Current Title',
  'No earned badge state yet',
  'Demo/mock badge state ignored',
  'buildBadgeIdentityProfileModel',
].forEach((snippet) => {
  assert(identitySurfaceSource.includes(snippet), `Identity surface should render safe profile copy: ${snippet}.`);
});
assert(
  identitySurfaceSource.includes('badges?: ExpeditionBadge[] | null') &&
    identitySurfaceSource.includes('earnedBadgeCount') &&
    identitySurfaceSource.includes('titleDescription'),
  'Identity surface should render from optional badge state without requiring persisted user data.',
);
assert(
  !identitySurfaceSource.includes('saveProfile') &&
    !identitySurfaceSource.includes('.save(') &&
    !identitySurfaceSource.includes('.set(') &&
    !identitySurfaceSource.includes('.clear'),
  'Identity surface must remain read-only and avoid mutating app state.',
);

assert(
  docsSource.includes('Badge / Expedition Identity Source-of-Truth Contract') &&
    docsSource.includes('Do not unlock from unverified hardware, BLE, EcoFlow, Mopeka, Convoy, cloud sharing, or community publishing') &&
    docsSource.includes('Offline Incident Packet'),
  'Readiness docs should capture the source-of-truth and safety boundaries.',
);
assert(
  indexSource.includes('badgeExpeditionIdentityReadiness'),
  'Expedition barrel should export the readiness contract for future consumers.',
);

console.log('Badge / Expedition Identity readiness checks passed.');
