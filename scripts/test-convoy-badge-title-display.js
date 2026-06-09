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
  buildConvoyParticipant,
  buildConvoyParticipantsFromMapVehicles,
} = require(path.join(root, 'lib', 'convoy', 'convoyParticipantModel.ts'));
const {
  getConvoyParticipantQaParticipants,
} = require(path.join(root, 'lib', 'convoy', 'convoyParticipantQaFixtures.ts'));

const nowMs = Date.parse('2026-06-09T12:00:00.000Z');

const trusted = buildConvoyParticipant({
  convoyId: 'convoy-1',
  participantId: 'member-1',
  activeParticipant: true,
  displayName: 'Logan',
  role: 'lead',
  coordinates: { latitude: 38.1, longitude: -121.2 },
  lastUpdated: '2026-06-09T11:58:00.000Z',
  movementStatus: 'moving',
  source: 'live',
  expeditionBadgeTitle: 'Field Commander',
  nowMs,
});
assert.strictEqual(trusted.badgeIdentity.title, 'Field Commander', 'Trusted scoped participant should expose the read-only identity title.');
assert.strictEqual(trusted.badgeIdentity.isCredential, false, 'Badge title display must not imply credentials.');
assert.strictEqual(trusted.badgeIdentity.source, 'scoped_convoy_snapshot', 'Trusted title should come from a scoped convoy snapshot.');

const missingTitle = buildConvoyParticipant({
  convoyId: 'convoy-1',
  participantId: 'member-2',
  activeParticipant: true,
  displayName: 'No title',
  role: 'member',
  source: 'live',
  nowMs,
});
assert.strictEqual(missingTitle.badgeIdentity.title, null, 'Missing title should not fabricate a fallback title.');
assert.strictEqual(missingTitle.badgeIdentity.source, 'unavailable');

const unknownParticipant = buildConvoyParticipant({
  convoyId: 'convoy-1',
  participantId: null,
  activeParticipant: null,
  displayName: 'Unknown scout',
  role: 'scout',
  source: 'unknown',
  expeditionBadgeTitle: 'Route Analyst',
  nowMs,
});
assert.strictEqual(unknownParticipant.badgeIdentity.title, null, 'Unknown participant identity should not display a badge title.');
assert.strictEqual(unknownParticipant.badgeIdentity.source, 'untrusted');

const outOfScope = buildConvoyParticipant({
  convoyId: null,
  participantId: 'global-user',
  activeParticipant: true,
  displayName: 'Global user',
  role: 'member',
  source: 'live',
  expeditionBadgeTitle: 'Route Analyst',
  nowMs,
});
assert.strictEqual(outOfScope.badgeIdentity.title, null, 'Participant outside active convoy scope should not display a badge title.');
assert.strictEqual(outOfScope.badgeIdentity.source, 'untrusted');

const demo = buildConvoyParticipant({
  convoyId: 'convoy-1',
  participantId: 'demo-member',
  activeParticipant: true,
  displayName: 'Demo',
  role: 'member',
  source: 'demo',
  expeditionBadgeTitle: 'Field Commander',
  nowMs,
});
assert.strictEqual(demo.badgeIdentity.title, null, 'Demo participant should not display a trusted production badge title.');
assert.strictEqual(demo.badgeIdentity.source, 'untrusted');

const mock = buildConvoyParticipant({
  convoyId: 'convoy-1',
  participantId: 'mock-member',
  activeParticipant: true,
  displayName: 'Mock',
  role: 'member',
  source: 'mock',
  expeditionBadgeTitle: 'Field Commander',
  nowMs,
});
assert.strictEqual(mock.badgeIdentity.title, null, 'Mock participant should not display a trusted production badge title.');
assert.strictEqual(mock.badgeIdentity.source, 'untrusted');

const arbitraryTitle = buildConvoyParticipant({
  convoyId: 'convoy-1',
  participantId: 'member-3',
  activeParticipant: true,
  displayName: 'Unsupported',
  role: 'member',
  source: 'live',
  expeditionBadgeTitle: 'Certified Trail Medic',
  nowMs,
});
assert.strictEqual(arbitraryTitle.badgeIdentity.title, null, 'Unsupported title text should not bypass the Badge Identity title derivation allow-list.');

const fromMapVehicles = buildConvoyParticipantsFromMapVehicles([
  {
    memberId: 'lead-member',
    callsign: 'Lead',
    displayName: 'Logan',
    expeditionBadgeTitle: 'Route Analyst',
    role: 'lead',
    latitude: 38.1,
    longitude: -121.2,
    accuracyMeters: null,
    headingDegrees: null,
    speedMps: null,
    movementStatus: 'moving',
    capturedAt: '2026-06-09T11:58:00.000Z',
    updatedAt: '2026-06-09T11:58:00.000Z',
    isStale: false,
    staleness: 'fresh',
    staleReason: null,
  },
], { convoyId: 'convoy-1', source: 'live', nowMs });
assert.strictEqual(fromMapVehicles[0].badgeIdentity.title, 'Route Analyst', 'Map vehicles should flow scoped title snapshots into canonical participants.');

const qaParticipants = getConvoyParticipantQaParticipants({ dev: false, nodeEnv: 'test' }, nowMs);
const qaLead = qaParticipants.find((participant) => participant.participantId === 'qa-live-leader');
const qaTail = qaParticipants.find((participant) => participant.participantId === 'qa-stale-tail');
const qaUnknown = qaParticipants.find((participant) => participant.displayName === 'Unknown scout');
const qaDemo = qaParticipants.find((participant) => participant.participantId === 'qa-demo-medic');
const qaMock = qaParticipants.find((participant) => participant.participantId === 'qa-mock-member');
assert.strictEqual(qaLead?.badgeIdentity.title, 'Field Commander', 'Fixture should include one valid title for native QA.');
assert.strictEqual(qaTail?.badgeIdentity.title, null, 'Fixture should include a participant without a title.');
assert.strictEqual(qaUnknown?.badgeIdentity.title, null, 'Unknown fixture participant should not display a title.');
assert.strictEqual(qaDemo?.badgeIdentity.title, null, 'Demo fixture participant should not display a trusted title.');
assert.strictEqual(qaMock?.badgeIdentity.title, null, 'Mock fixture participant should not display a trusted title.');

const mapSource = read('components/convoy/ConvoyCommandMap.tsx');
const fallbackSource = read('components/convoy/ConvoyMapFallback.tsx');
const fixtureScreenSource = read('components/convoy/ConvoyParticipantFixtureQaScreen.tsx');
const participantModelSource = read('lib/convoy/convoyParticipantModel.ts');
const badgeStoreSource = read('lib/expedition/expeditionBadgeStore.ts');
const convoyScreenSource = read('app/convoy-command.tsx');
const packageJson = JSON.parse(read('package.json'));

assert.ok(
  participantModelSource.includes('BADGE_IDENTITY_TITLE_TIERS') &&
    participantModelSource.includes('scoped_convoy_snapshot') &&
    participantModelSource.includes('isCredential: false'),
  'Participant model should validate title snapshots against the existing Badge Identity title derivation.',
);
assert.ok(
  badgeStoreSource.includes('getCurrentExpeditionIdentityTitle') &&
    badgeStoreSource.includes('buildBadgeIdentityProfileModel'),
  'Badge store should expose the existing Expedition Identity title derivation without unlocking badges.',
);
assert.ok(
  convoyScreenSource.includes('getCurrentExpeditionIdentityTitle') &&
    convoyScreenSource.includes('leaderExpeditionBadgeTitle: expeditionIdentityTitle') &&
    convoyScreenSource.includes('expeditionBadgeTitle: expeditionIdentityTitle'),
  'Convoy create/join should attach the read-only derived title snapshot when available.',
);
assert.ok(
  mapSource.includes('selectedParticipant.badgeIdentity.title') &&
    mapSource.includes('detailIdentityTitle') &&
    mapSource.indexOf('selectedParticipant.displayName') < mapSource.indexOf('selectedParticipant.badgeIdentity.title') &&
    mapSource.indexOf('selectedParticipant.badgeIdentity.title') < mapSource.indexOf('selectedParticipant.roleLabel'),
  'Convoy detail card should render title below name and separate from role/status.',
);
assert.ok(
  fallbackSource.includes('participant.badgeIdentity.title'),
  'Fallback participant rows should include trusted title text when available.',
);
assert.ok(
  fixtureScreenSource.includes('participant.badgeIdentity.title') &&
    fixtureScreenSource.includes('Read-only title') &&
    !fixtureScreenSource.includes('Badge titles: Not rendered'),
  'Fixture screen should visually verify title display without retaining the old not-rendered copy.',
);

const convoyRuntimeSources = [
  mapSource,
  fallbackSource,
  fixtureScreenSource,
  convoyScreenSource,
  read('components/dispatch/DispatchConvoyCommandPanel.tsx'),
  read('lib/convoy/convoyMembershipService.ts'),
  read('lib/convoy/convoyRealtimeService.ts'),
].join('\n');
assert.ok(!convoyRuntimeSources.includes('recordBadgeIdentitySafeSignal'), 'Convoy title display must not unlock badges.');
assert.ok(!convoyRuntimeSources.includes('unlockBadge'), 'Convoy title display must not use badge unlock APIs.');
assert.ok(!mapSource.includes('badgeTitleForRole'), 'Convoy must not synthesize identity titles from convoy roles.');
assert.ok(!mapSource.includes('expeditionBadgeTitleFor'), 'Convoy must not synthesize identity titles from participant status.');
assert.ok(packageJson.scripts['test:convoy-badge-title-display'], 'package.json should expose convoy badge title display checks.');

console.log('Convoy badge title display checks passed.');
