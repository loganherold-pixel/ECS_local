const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
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
  CONVOY_PARTICIPANT_LIVE_MAX_AGE_MS,
  buildConvoyParticipant,
  buildConvoyParticipantsFromMapVehicles,
  formatConvoyParticipantLastUpdated,
} = require(path.join(root, 'lib/convoy/convoyParticipantModel.ts'));

const nowMs = Date.parse('2026-06-09T12:00:00.000Z');
assert.strictEqual(CONVOY_PARTICIPANT_LIVE_MAX_AGE_MS, 5 * 60 * 1000);

const live = buildConvoyParticipant({
  convoyId: 'convoy-1',
  participantId: 'lead-1',
  activeParticipant: true,
  displayName: 'LEAD',
  vehicleSummary: 'Tacoma',
  role: 'lead',
  coordinates: { latitude: 38.1, longitude: -121.2 },
  headingDegrees: 45,
  speedMps: 6,
  lastUpdated: '2026-06-09T11:58:00.000Z',
  movementStatus: 'moving',
  source: 'live',
  nowMs,
});
assert.strictEqual(live.status, 'live');
assert.strictEqual(live.statusLabel, 'Live');
assert.strictEqual(live.source, 'live');
assert.strictEqual(live.isProductionLive, true);
assert.strictEqual(live.role, 'leader');
assert.strictEqual(live.roleLabel, 'Leader');
assert.strictEqual(live.vehicleSummary, 'Tacoma');
assert.deepStrictEqual(live.coordinates, { latitude: 38.1, longitude: -121.2 });
assert.strictEqual(live.shouldRenderMarker, true);
assert.strictEqual(live.privacyScope, 'active_convoy_members_only');
assert.strictEqual(live.badgeIdentity.status, 'deferred');
assert.strictEqual(live.badgeIdentity.title, null);
assert.ok(!Object.prototype.hasOwnProperty.call(live, 'expeditionBadgeTitle'));

const stale = buildConvoyParticipant({
  convoyId: 'convoy-1',
  participantId: 'tail-1',
  activeParticipant: true,
  displayName: 'TAIL',
  role: 'sweep',
  coordinates: { latitude: 38.2, longitude: -121.3 },
  lastUpdated: '2026-06-09T11:40:00.000Z',
  movementStatus: 'moving',
  source: 'live',
  nowMs,
});
assert.strictEqual(stale.status, 'stale');
assert.strictEqual(stale.statusLabel, 'Stale');
assert.strictEqual(stale.isProductionLive, false);
assert.strictEqual(stale.role, 'tail');
assert.ok(stale.statusCopy.toLowerCase().includes('last known'));

const disconnected = buildConvoyParticipant({
  convoyId: 'convoy-1',
  participantId: 'member-2',
  activeParticipant: true,
  displayName: 'V2',
  role: 'member',
  coordinates: null,
  lastUpdated: null,
  movementStatus: 'offline',
  source: 'live',
  nowMs,
});
assert.strictEqual(disconnected.status, 'disconnected');
assert.strictEqual(disconnected.statusLabel, 'Disconnected');
assert.strictEqual(disconnected.shouldRenderMarker, false);
assert.strictEqual(disconnected.coordinates, null);

const unknown = buildConvoyParticipant({
  convoyId: null,
  participantId: null,
  activeParticipant: null,
  displayName: '',
  role: null,
  coordinates: { latitude: Number.NaN, longitude: -121.2 },
  lastUpdated: null,
  movementStatus: null,
  source: 'unknown',
  nowMs,
});
assert.strictEqual(unknown.status, 'unknown');
assert.strictEqual(unknown.source, 'unknown');
assert.strictEqual(unknown.displayName, 'Convoy member');
assert.strictEqual(unknown.role, 'member');
assert.strictEqual(unknown.shouldRenderMarker, false);

const demo = buildConvoyParticipant({
  convoyId: 'demo-convoy',
  participantId: 'demo-member',
  activeParticipant: true,
  displayName: 'DEMO',
  role: 'scout',
  coordinates: { latitude: 38.3, longitude: -121.4 },
  lastUpdated: '2026-06-09T11:59:00.000Z',
  movementStatus: 'moving',
  source: 'ecs_demo_fixture',
  nowMs,
});
assert.strictEqual(demo.status, 'demo');
assert.strictEqual(demo.source, 'demo');
assert.strictEqual(demo.isProductionLive, false);
assert.strictEqual(demo.shouldRenderMarker, true);
assert.ok(demo.statusCopy.toLowerCase().includes('demo'));

const medic = buildConvoyParticipant({
  convoyId: 'convoy-1',
  participantId: 'med-1',
  displayName: 'MED',
  role: 'medic',
  source: 'cached',
  nowMs,
});
assert.strictEqual(medic.roleLabel, 'Medic');
assert.ok(medic.roleCopy.toLowerCase().includes('functional'));
assert.ok(medic.roleCopy.toLowerCase().includes('not') && medic.roleCopy.toLowerCase().includes('certification'));

const fromVehicles = buildConvoyParticipantsFromMapVehicles([
  {
    memberId: 'lead-vehicle',
    callsign: 'Lead Vehicle',
    displayName: 'Leader',
    expeditionBadgeTitle: 'Should not render',
    role: 'lead',
    latitude: 38.4,
    longitude: -121.5,
    accuracyMeters: null,
    headingDegrees: 12,
    speedMps: 2,
    movementStatus: 'moving',
    capturedAt: '2026-06-09T11:58:00.000Z',
    updatedAt: '2026-06-09T11:58:00.000Z',
    isStale: false,
    staleness: 'fresh',
    staleReason: null,
  },
  {
    memberId: 'bad-location',
    callsign: 'Bad',
    role: 'member',
    latitude: Number.NaN,
    longitude: -121.5,
    accuracyMeters: null,
    headingDegrees: null,
    speedMps: null,
    movementStatus: 'unknown',
    capturedAt: 'bad-date',
    updatedAt: null,
    isStale: true,
    staleness: 'stale',
    staleReason: null,
  },
], { convoyId: 'convoy-1', source: 'live', nowMs });
assert.strictEqual(fromVehicles.length, 2);
assert.strictEqual(fromVehicles[0].displayName, 'Lead Vehicle');
assert.strictEqual(fromVehicles[0].roleLabel, 'Leader');
assert.strictEqual(fromVehicles[0].shouldRenderMarker, true);
assert.strictEqual(fromVehicles[1].shouldRenderMarker, false);
assert.strictEqual(fromVehicles[1].status, 'disconnected');
assert.ok(!Object.prototype.hasOwnProperty.call(fromVehicles[0], 'expeditionBadgeTitle'));

assert.strictEqual(formatConvoyParticipantLastUpdated(live, nowMs), '2m ago');
assert.strictEqual(formatConvoyParticipantLastUpdated(disconnected, nowMs), 'No update');

const mapSource = read('components/convoy/ConvoyCommandMap.tsx');
const fallbackSource = read('components/convoy/ConvoyMapFallback.tsx');
const markerSource = read('components/convoy/ConvoyMemberMarker.tsx');
const dispatchPanelSource = read('components/dispatch/DispatchConvoyCommandPanel.tsx');
const convoyCredentialsSource = read('app/convoy-command.tsx');
const convoyRuntimeSources = [
  mapSource,
  fallbackSource,
  markerSource,
  dispatchPanelSource,
  convoyCredentialsSource,
].join('\n');

assert(mapSource.includes('buildConvoyParticipantsFromMapVehicles'), 'Convoy map should consume canonical participants.');
assert(mapSource.includes('participantRoleLabel'), 'Convoy map should expose safe role labels.');
assert(mapSource.includes('participantStatusLabel'), 'Convoy map should expose participant status labels.');
assert(mapSource.includes('participantLastUpdated'), 'Convoy map should expose last-updated copy.');
assert(!mapSource.includes('badgeTitleForRole'), 'Convoy map must not use badge-title role fallback.');
assert(!mapSource.includes('expeditionBadgeTitleFor'), 'Convoy map must not render expedition badge title text.');
assert(!mapSource.includes("textField: ['get', 'expeditionBadgeTitle']"), 'Convoy map must not render badge title under participant name.');
assert(!mapSource.includes('convoy-members-identity-badge'), 'Convoy map should not keep a badge-title layer.');

assert(fallbackSource.includes('buildConvoyParticipantsFromMapVehicles'), 'Fallback card should consume canonical participants.');
assert(fallbackSource.includes('participant.roleLabel'), 'Fallback card should show safe role labels.');
assert(fallbackSource.includes('participant.statusLabel'), 'Fallback card should show safe status labels.');

assert(!dispatchPanelSource.includes('expeditionBadgeTitleFromRole'), 'Dispatch panel should not synthesize expedition badge titles for convoy participants.');
assert(!dispatchPanelSource.includes('activeContext?.expeditionBadgeTitle'), 'Dispatch panel should not display active badge title in Convoy.');
assert(!convoyCredentialsSource.includes('getCurrentExpeditionBadgeTitle'), 'Convoy credentials flow should not import Badge Identity title yet.');
assert(!convoyCredentialsSource.includes('leaderExpeditionBadgeTitle: expeditionBadgeTitle'), 'Convoy creation should not attach badge title yet.');
assert(!convoyCredentialsSource.includes('expeditionBadgeTitle,'), 'Convoy join should not attach badge title yet.');
assert(!convoyRuntimeSources.includes('recordBadgeIdentitySafeSignal'), 'Convoy behavior must not unlock badges.');

const packageJson = JSON.parse(read('package.json'));
assert.ok(packageJson.scripts['test:convoy-command-v1-5-foundation']);

console.log('Convoy Command v1.5 foundation checks passed.');
