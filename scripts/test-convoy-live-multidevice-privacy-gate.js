const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function readRequired(relativePath) {
  const fullPath = path.join(root, relativePath);
  assert.ok(fs.existsSync(fullPath), `${relativePath} should exist.`);
  return fs.readFileSync(fullPath, 'utf8').replace(/\r\n/g, '\n');
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

const {
  CONVOY_COMMAND_V15_DEFERRED_ITEMS,
  CONVOY_COMMAND_V15_LIVE_LOCATION_MAX_AGE_MS,
  CONVOY_COMMAND_V15_PRIVACY_SCOPE,
  CONVOY_COMMAND_V15_SOURCE_OF_TRUTH_CONTRACT,
  buildConvoyV15ParticipantContract,
  isProductionConvoyInviteAuthority,
  normalizeConvoyV15ParticipantStatus,
} = require(path.join(root, 'lib', 'convoy', 'convoyCommandV15Readiness.ts'));

const {
  buildConvoyParticipant,
} = require(path.join(root, 'lib', 'convoy', 'convoyParticipantModel.ts'));

const doc = readRequired('docs/qa/convoy-live-multidevice-privacy-gate.md');
const membershipSource = read('lib/convoy/convoyMembershipService.ts');
const realtimeSource = read('lib/convoy/convoyRealtimeService.ts');
const publisherSource = read('lib/convoy/convoyLocationPublisher.ts');
const trackingStoreSource = read('stores/convoyTrackingStore.ts');
const dispatchPanelSource = read('components/dispatch/DispatchConvoyCommandPanel.tsx');
const participantModelSource = read('lib/convoy/convoyParticipantModel.ts');
const fixtureSource = read('lib/convoy/convoyParticipantQaFixtures.ts');
const fixtureRouteSource = read('app/dev/convoy-participant-qa.tsx');
const badgeDisplaySource = read('scripts/test-convoy-badge-title-display.js');
const hardwareQualificationSource = read('src/telemetry/hardwareTelemetryQualification.ts');
const edgeFunctionSource = read('supabase/functions/convoy-membership/index.ts');
const convoyTrackingMigration = read('supabase/migrations/022_convoy_team_tracking.sql');
const identityMigration = read('supabase/migrations/030_convoy_member_identity_titles.sql');
const packageJson = JSON.parse(read('package.json'));

const nowMs = Date.parse('2026-06-10T12:00:00.000Z');
const freshTime = new Date(nowMs - 60_000).toISOString();
const staleTime = new Date(nowMs - (CONVOY_COMMAND_V15_LIVE_LOCATION_MAX_AGE_MS + 60_000)).toISOString();

assert.strictEqual(CONVOY_COMMAND_V15_LIVE_LOCATION_MAX_AGE_MS, 5 * 60 * 1000);
assert.strictEqual(CONVOY_COMMAND_V15_PRIVACY_SCOPE.scope, 'active_convoy_members_only');
assert.ok(CONVOY_COMMAND_V15_PRIVACY_SCOPE.locationPrecision.includes('active convoy'));
assert.ok(CONVOY_COMMAND_V15_PRIVACY_SCOPE.retention.includes('convoy-scoped'));
assert.ok(CONVOY_COMMAND_V15_SOURCE_OF_TRUTH_CONTRACT.participant.includes('not global user enumeration'));
assert.ok(CONVOY_COMMAND_V15_SOURCE_OF_TRUTH_CONTRACT.location.includes('fresh'));
assert.ok(CONVOY_COMMAND_V15_SOURCE_OF_TRUTH_CONTRACT.badgeIdentity.displayContract.includes('scoped'));
assert.ok(CONVOY_COMMAND_V15_DEFERRED_ITEMS.includes('convoy_badge_unlocks'));
assert.ok(CONVOY_COMMAND_V15_DEFERRED_ITEMS.includes('public_convoy_presence'));
assert.ok(CONVOY_COMMAND_V15_DEFERRED_ITEMS.includes('community_convoy_publishing'));

const live = normalizeConvoyV15ParticipantStatus({
  participantId: 'member-a',
  activeParticipant: true,
  sourceKind: 'supabase_realtime',
  location: { latitude: 38.1, longitude: -121.1 },
  updatedAt: freshTime,
  nowMs,
});
assert.strictEqual(live.status, 'live');
assert.strictEqual(live.isProductionLive, true);

const notLiveWithoutFreshSource = normalizeConvoyV15ParticipantStatus({
  participantId: 'member-a',
  activeParticipant: true,
  sourceKind: 'manual_checkin',
  location: { latitude: 38.1, longitude: -121.1 },
  updatedAt: freshTime,
  nowMs,
});
assert.strictEqual(notLiveWithoutFreshSource.status, 'stale');
assert.strictEqual(notLiveWithoutFreshSource.isProductionLive, false);

const stale = normalizeConvoyV15ParticipantStatus({
  participantId: 'member-a',
  activeParticipant: true,
  sourceKind: 'supabase_realtime',
  location: { latitude: 38.1, longitude: -121.1 },
  updatedAt: staleTime,
  nowMs,
});
assert.strictEqual(stale.status, 'stale');
assert.strictEqual(stale.isProductionLive, false);
assert.ok(stale.reason.includes('older than the live threshold'));

const disconnected = normalizeConvoyV15ParticipantStatus({
  participantId: 'member-a',
  activeParticipant: false,
  sourceKind: 'supabase_realtime',
  location: { latitude: 38.1, longitude: -121.1 },
  updatedAt: freshTime,
  nowMs,
});
assert.strictEqual(disconnected.status, 'disconnected');
assert.strictEqual(disconnected.isProductionLive, false);

const deniedLocation = normalizeConvoyV15ParticipantStatus({
  participantId: 'member-a',
  activeParticipant: true,
  sourceKind: 'supabase_realtime',
  location: null,
  updatedAt: freshTime,
  nowMs,
});
assert.strictEqual(deniedLocation.status, 'disconnected');
assert.strictEqual(deniedLocation.isProductionLive, false);

const unknown = normalizeConvoyV15ParticipantStatus({
  participantId: null,
  activeParticipant: null,
  sourceKind: 'unknown',
  location: null,
  updatedAt: null,
  nowMs,
});
assert.strictEqual(unknown.status, 'unknown');
assert.strictEqual(unknown.isProductionLive, false);

const demo = normalizeConvoyV15ParticipantStatus({
  participantId: 'demo-member',
  activeParticipant: true,
  sourceKind: 'ecs_demo_fixture',
  location: { latitude: 38.1, longitude: -121.1 },
  updatedAt: freshTime,
  nowMs,
});
assert.strictEqual(demo.status, 'mock_demo');
assert.strictEqual(demo.isProductionLive, false);

const scopedTitle = buildConvoyParticipant({
  convoyId: 'convoy-a',
  participantId: 'member-a',
  activeParticipant: true,
  displayName: 'Lead',
  source: 'live',
  coordinates: { latitude: 38.1, longitude: -121.1 },
  lastUpdated: freshTime,
  expeditionBadgeTitle: 'Field Commander',
  nowMs,
});
assert.strictEqual(scopedTitle.badgeIdentity.title, 'Field Commander');
assert.strictEqual(scopedTitle.badgeIdentity.source, 'scoped_convoy_snapshot');
assert.strictEqual(scopedTitle.badgeIdentity.isCredential, false);

const unscopedTitle = buildConvoyParticipant({
  convoyId: null,
  participantId: 'member-a',
  activeParticipant: true,
  displayName: 'Global user',
  source: 'live',
  expeditionBadgeTitle: 'Field Commander',
  nowMs,
});
assert.strictEqual(unscopedTitle.badgeIdentity.title, null);
assert.strictEqual(unscopedTitle.badgeIdentity.source, 'untrusted');

const mockTitle = buildConvoyParticipant({
  convoyId: 'convoy-a',
  participantId: 'mock-member',
  activeParticipant: true,
  displayName: 'Mock',
  source: 'mock',
  expeditionBadgeTitle: 'Field Commander',
  nowMs,
});
assert.strictEqual(mockTitle.status, 'demo');
assert.strictEqual(mockTitle.badgeIdentity.title, null);

const contract = buildConvoyV15ParticipantContract({
  convoyId: 'convoy-a',
  participantId: 'member-a',
  activeParticipant: true,
  sourceKind: 'live',
  location: { latitude: 38.1, longitude: -121.1 },
  updatedAt: freshTime,
  nowMs,
});
assert.strictEqual(contract.privacyScope, 'active_convoy_members_only');
assert.strictEqual(contract.inviteAuthority.contract, 'active_unexpired_unrevoked_non_demo_invite_required');
assert.strictEqual(contract.badgeIdentity.title, null);

assert.strictEqual(isProductionConvoyInviteAuthority({
  inviteId: 'invite-live',
  convoyId: 'convoy-live',
  sourceKind: 'supabase_edge_live',
  inviteLinkBaseUrl: 'https://ecs.example.com/convoy',
  expiresAt: new Date(nowMs + 60_000).toISOString(),
  nowMs,
}), true);
assert.strictEqual(isProductionConvoyInviteAuthority({
  inviteId: 'demo-invite',
  convoyId: 'convoy-live',
  sourceKind: 'demo',
  inviteLinkBaseUrl: 'https://ecs.example.com/convoy',
  expiresAt: new Date(nowMs + 60_000).toISOString(),
  nowMs,
}), false);
assert.strictEqual(isProductionConvoyInviteAuthority({
  inviteId: 'invite-live',
  convoyId: 'convoy-live',
  sourceKind: 'supabase_edge_live',
  inviteLinkBaseUrl: 'http://localhost:8081/convoy',
  expiresAt: new Date(nowMs + 60_000).toISOString(),
  nowMs,
}), false);

assert.ok(membershipSource.includes('listActiveMemberships(user.data.id)'), 'Membership list should be scoped to current user.');
assert.ok(membershipSource.includes(".eq('convoy_id', convoyId)"), 'Roster and invite lookups should be convoy scoped.');
assert.ok(membershipSource.includes('clearActiveContext(convoyId)'), 'Leave/end should clear the active convoy context for the same convoy.');
assert.ok(
  membershipSource.includes('clearStaleActiveContext') &&
    membershipSource.includes("stopConvoyLocationSharing('Convoy is no longer active. Live sharing stopped.')"),
  'Membership refresh should clear stale member-side active context when backend no longer has an active convoy after leader end.',
);
assert.ok(membershipSource.includes("stopConvoyLocationSharing('You left the convoy. Live sharing stopped.')"));
assert.ok(membershipSource.includes("stopConvoyLocationSharing('Convoy ended. Live sharing stopped.')"));
assert.ok(!membershipSource.includes('globalUsers'), 'Membership service must not expose global user discovery.');

assert.ok(realtimeSource.includes('filter: `convoy_id=eq.${convoyId}`'), 'Realtime channel must filter by convoy id.');
assert.ok(realtimeSource.includes(".eq('convoy_id', convoyId)"), 'Realtime initial fetches must be convoy scoped.');
assert.ok(realtimeSource.includes(".is('revoked_at', null)"), 'Realtime members must exclude revoked members.');
assert.ok(realtimeSource.includes('if (!row?.member_id || !memberById.has(row.member_id)) continue'), 'Realtime normalizer should skip locations outside active roster.');
assert.ok(realtimeSource.includes('if (!validCoordinate(row.latitude) || !validCoordinate(row.longitude)) continue'), 'Realtime normalizer should reject invalid coordinates.');

assert.ok(publisherSource.includes('ensureForegroundLocationPermission'), 'Publisher should use explicit foreground permission checks.');
assert.ok(publisherSource.includes('permission_denied'), 'Publisher should preserve denied permission state.');
assert.ok(publisherSource.includes('validateSharingAllowed'), 'Publisher should validate membership before publishing.');
assert.ok(publisherSource.includes('Active convoy membership was not found. Live sharing stopped.'));
assert.ok(publisherSource.includes('Convoy membership was revoked. Live sharing stopped.'));
assert.ok(publisherSource.includes('Convoy has ended. Live sharing stopped.'));
assert.ok(publisherSource.includes('Auth session ended. Live sharing stopped.'));
assert.ok(!publisherSource.includes('requestBackgroundPermissionsAsync'), 'This gate must not silently expand to background tracking.');
assert.ok(!publisherSource.includes('TaskManager'), 'This gate must not add background location tasks.');

assert.ok(trackingStoreSource.includes('stopConvoyLocationSubscription'), 'Tracking store should expose subscription stop/cleanup.');
assert.ok(trackingStoreSource.includes('currentMembers = []') && trackingStoreSource.includes('currentLocations = new Map()'), 'Tracking store cleanup should clear in-memory roster/location state.');
assert.ok(
  trackingStoreSource.includes('refreshStalenessForCurrentTime') &&
    trackingStoreSource.includes('refreshConvoyTrackingStaleness'),
  'Tracking store should expose a time-only stale recompute so mounted convoy views can age last-known rows without new realtime events.',
);
assert.ok(
  dispatchPanelSource.includes('CONVOY_TRACKING_STALENESS_REFRESH_MS') &&
    dispatchPanelSource.includes('refreshConvoyTrackingStaleness()'),
  'Dispatch convoy panel should periodically recompute stale rows while an active convoy is visible.',
);
assert.ok(
  dispatchPanelSource.includes("params.trackingConnectionStatus === 'connected' && reportingCount > 0"),
  'Dispatch convoy panel must only label telemetry live when at least one member is fresh/reporting.',
);

assert.ok(fixtureSource.includes('typeof __DEV__') && fixtureSource.includes("nodeEnv === 'test'"), 'Fixture harness must be dev/test guarded.');
assert.ok(fixtureRouteSource.includes('Redirect'), 'Fixture route must redirect when disabled.');
assert.ok(fixtureSource.includes('participantFixtureOnly'), 'Fixture participants must be marked fixture-only.');
assert.ok(fixtureSource.includes("participantSource: 'demo'") && fixtureSource.includes("participantSource: 'mock'"), 'Fixture source labels must remain explicit.');

assert.ok(badgeDisplaySource.includes('recordBadgeIdentitySafeSignal') && badgeDisplaySource.includes('must not unlock badges'), 'Badge display tests should guard unlock isolation.');
assert.ok(!participantModelSource.includes('unlockBadge'), 'Participant model must not unlock badges.');
assert.ok(!membershipSource.includes('unlockBadge'), 'Membership service must not unlock badges.');
assert.ok(!realtimeSource.includes('unlockBadge'), 'Realtime service must not unlock badges.');
assert.ok(!publisherSource.includes('unlockBadge'), 'Location publisher must not unlock badges.');

for (const forbidden of ['OBD2', 'VeePeak', 'EcoFlow', 'Mopeka', 'Bluestack', 'hardwareTelemetryQualification']) {
  assert.ok(!participantModelSource.includes(forbidden), `Participant status model must not depend on telemetry provider ${forbidden}.`);
  assert.ok(!publisherSource.includes(forbidden), `Location publisher must not depend on telemetry provider ${forbidden}.`);
  assert.ok(!realtimeSource.includes(forbidden), `Realtime service must not depend on telemetry provider ${forbidden}.`);
}
assert.ok(hardwareQualificationSource.includes('Connection presence is not live telemetry') || hardwareQualificationSource.includes('connection_present'), 'Hardware qualification should keep connection presence distinct from live telemetry.');

assert.ok(edgeFunctionSource.includes(".eq('user_id', user.id)"), 'Leave convoy must revoke only current user membership.');
assert.ok(edgeFunctionSource.includes(".from('convoy_member_locations')") && edgeFunctionSource.includes('.delete()'), 'Leave/end must delete scoped location rows.');
assert.ok(!edgeFunctionSource.includes('console.log'), 'Edge function must not log invite codes or precise location data.');
assert.ok(convoyTrackingMigration.includes('public.is_active_convoy_member(convoy_id)'), 'RLS should scope convoy location reads to active convoy members.');
assert.ok(convoyTrackingMigration.includes('public.is_own_active_convoy_member(member_id, convoy_id)'), 'RLS should scope location writes to own active member id.');
assert.ok(identityMigration.includes('Optional Expedition badge/title snapshot'), 'Identity title column should be documented as a display snapshot.');

for (const phrase of [
  'convoyId',
  'participant identity scope',
  'stale last-known',
  'no global user discovery',
  'demo invite',
  'badge title display',
  'hardware connection presence must not affect convoy live status',
  'Device A creates convoy',
  'Device B joins',
  'Device B Join After Supabase Visibility Fix',
  'stale local `active_convoy_present` / `convoy_baseline_not_clean`',
  '`SYNC DISPATCH` runs the same convoy lifecycle reconciliation when online',
  'Convoy Roster Refresh/Reconciliation Repair',
  'Convoy Command treats `convoyMembershipService.listMyActiveConvoys()` as the active-roster gate',
  'Roster refresh unavailable; showing last known roster.',
  'On Device A, open the Convoy Command Roster tab and confirm Device B appears as `MEMBER`',
  'location denied',
  'stop sharing',
  'stale threshold',
  'leave convoy',
  '.qa/convoy-live-multidevice-privacy-gate/',
]) {
  assert.ok(doc.includes(phrase), `Privacy gate doc should include "${phrase}".`);
}

assert.ok(packageJson.scripts['test:convoy-live-multidevice-privacy-gate'], 'package.json should expose convoy live multi-device privacy gate checks.');

console.log('Convoy live multi-device privacy gate checks passed.');
