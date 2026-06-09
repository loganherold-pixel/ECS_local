const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(transpiled.outputText, filename);
};

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

const fixturePath = path.join(root, 'lib', 'convoy', 'convoyParticipantQaFixtures.ts');
const {
  CONVOY_PARTICIPANT_QA_FIXTURE_SCENARIO_IDS,
  getConvoyParticipantQaFixtures,
  getConvoyParticipantQaMapVehicles,
  getConvoyParticipantQaParticipants,
  isConvoyParticipantQaHarnessEnabled,
} = require(fixturePath);

const expectedScenarioIds = [
  'live_leader',
  'stale_tail',
  'disconnected_member',
  'unknown_scout',
  'missing_coordinates_recovery',
  'demo_medic',
  'mock_member',
];

assert.deepStrictEqual(
  CONVOY_PARTICIPANT_QA_FIXTURE_SCENARIO_IDS,
  expectedScenarioIds,
  'Convoy participant QA fixtures must cover native status and role scenarios in stable order.',
);

assert.strictEqual(
  isConvoyParticipantQaHarnessEnabled({ dev: false, nodeEnv: 'production' }),
  false,
  'Convoy participant fixture harness must be disabled in production.',
);
assert.strictEqual(
  isConvoyParticipantQaHarnessEnabled({ dev: true, nodeEnv: 'production' }),
  true,
  'Convoy participant fixture harness should be available in native dev builds.',
);
assert.strictEqual(
  isConvoyParticipantQaHarnessEnabled({ dev: false, nodeEnv: 'test' }),
  true,
  'Convoy participant fixture harness should be available in tests.',
);
assert.deepStrictEqual(
  getConvoyParticipantQaFixtures({ dev: false, nodeEnv: 'production' }),
  [],
  'Production guard must return no convoy participant fixtures.',
);

const fixtures = getConvoyParticipantQaFixtures({ dev: false, nodeEnv: 'test' });
assert.deepStrictEqual(
  fixtures.map((fixture) => fixture.id),
  expectedScenarioIds,
  'Test guard should expose deterministic convoy participant fixtures.',
);

const participants = getConvoyParticipantQaParticipants({ dev: false, nodeEnv: 'test' });
const byId = new Map(participants.map((participant) => [participant.participantId, participant]));

assert.strictEqual(byId.get('qa-live-leader').status, 'live');
assert.strictEqual(byId.get('qa-live-leader').roleLabel, 'Leader');
assert.strictEqual(byId.get('qa-live-leader').isProductionLive, false);
assert.strictEqual(byId.get('qa-live-leader').shouldRenderMarker, true);
assert.ok(/fixture|not production live/i.test(byId.get('qa-live-leader').statusCopy));
assert.strictEqual(byId.get('qa-live-leader').badgeIdentity.title, 'Field Commander');
assert.strictEqual(byId.get('qa-live-leader').badgeIdentity.source, 'qa_fixture');
assert.strictEqual(byId.get('qa-live-leader').badgeIdentity.isCredential, false);

assert.strictEqual(byId.get('qa-stale-tail').status, 'stale');
assert.strictEqual(byId.get('qa-stale-tail').roleLabel, 'Tail');
assert.strictEqual(byId.get('qa-stale-tail').isProductionLive, false);
assert.strictEqual(byId.get('qa-stale-tail').badgeIdentity.title, null);

assert.strictEqual(byId.get('qa-disconnected-member').status, 'disconnected');
assert.strictEqual(byId.get('qa-disconnected-member').roleLabel, 'Member');
assert.strictEqual(byId.get('qa-disconnected-member').shouldRenderMarker, false);
assert.strictEqual(byId.get('qa-disconnected-member').badgeIdentity.title, null);

const unknownScout = participants.find((participant) => participant.displayName === 'Unknown scout');
assert.ok(unknownScout, 'Unknown scout fixture should still render a safe display row.');
assert.strictEqual(unknownScout.status, 'unknown');
assert.strictEqual(unknownScout.roleLabel, 'Scout');
assert.strictEqual(unknownScout.badgeIdentity.title, null);
assert.strictEqual(unknownScout.badgeIdentity.source, 'untrusted');

assert.strictEqual(byId.get('qa-missing-coordinates-recovery').roleLabel, 'Recovery');
assert.strictEqual(byId.get('qa-missing-coordinates-recovery').shouldRenderMarker, false);
assert.strictEqual(byId.get('qa-missing-coordinates-recovery').badgeIdentity.title, null);

assert.strictEqual(byId.get('qa-demo-medic').status, 'demo');
assert.strictEqual(byId.get('qa-demo-medic').roleLabel, 'Medic');
assert.strictEqual(byId.get('qa-demo-medic').isProductionLive, false);
assert.strictEqual(byId.get('qa-demo-medic').badgeIdentity.title, null);
assert.strictEqual(byId.get('qa-demo-medic').badgeIdentity.source, 'untrusted');

assert.strictEqual(byId.get('qa-mock-member').status, 'demo');
assert.strictEqual(byId.get('qa-mock-member').source, 'mock');
assert.strictEqual(byId.get('qa-mock-member').isProductionLive, false);
assert.strictEqual(byId.get('qa-mock-member').badgeIdentity.title, null);
assert.strictEqual(byId.get('qa-mock-member').badgeIdentity.source, 'untrusted');

for (const participant of participants) {
  assert.strictEqual(participant.convoyId, 'convoy-participant-qa-dev-only');
  assert.strictEqual(participant.privacyScope, 'active_convoy_members_only');
  assert.strictEqual(participant.isFixtureOnly, true);
  assert.strictEqual(participant.isProductionLive, false);
  assert.strictEqual(participant.badgeIdentity.status, 'deferred');
  assert.strictEqual(participant.badgeIdentity.isCredential, false);
  assert.ok(
    !Object.prototype.hasOwnProperty.call(participant, 'expeditionBadgeTitle'),
    'Canonical fixture participants should expose title display only through badgeIdentity.',
  );
}

const mapVehicles = getConvoyParticipantQaMapVehicles({ dev: false, nodeEnv: 'test' });
assert.strictEqual(mapVehicles.length, expectedScenarioIds.length);
assert.ok(
  mapVehicles.some((member) => member.participantSource === 'demo') &&
    mapVehicles.some((member) => member.participantSource === 'mock'),
  'Map fixtures should carry explicit per-member mock/demo source labels.',
);
assert.ok(
  mapVehicles.every((member) => member.participantFixtureOnly === true),
  'Every map fixture member should be marked fixture-only.',
);
assert.ok(
  mapVehicles.filter((member) => Number.isFinite(member.latitude) && Number.isFinite(member.longitude)).length <
    mapVehicles.length,
  'Fixture set should include a missing-coordinate member for marker eligibility QA.',
);

const routeSource = read('app/dev/convoy-participant-qa.tsx');
const fixtureSource = read('lib/convoy/convoyParticipantQaFixtures.ts');
const screenSource = read('components/convoy/ConvoyParticipantFixtureQaScreen.tsx');
const mapSource = read('components/convoy/ConvoyCommandMap.tsx');
const participantSource = read('lib/convoy/convoyParticipantModel.ts');
const packageJson = JSON.parse(read('package.json'));
const sourceBundle = `${routeSource}\n${fixtureSource}\n${screenSource}`;

assert.ok(
  routeSource.includes('Redirect') && routeSource.includes('isConvoyParticipantQaHarnessEnabled'),
  'QA route must redirect when the fixture harness is disabled.',
);
assert.ok(
  fixtureSource.includes('typeof __DEV__') && fixtureSource.includes("nodeEnv === 'test'"),
  'Fixture harness must use the existing __DEV__/test guard pattern.',
);
assert.ok(
  screenSource.includes('DEV ONLY') &&
    screenSource.includes('NON-LIVE CONVOY FIXTURE') &&
    screenSource.includes('ConvoyCommandMap') &&
    screenSource.includes('Badge titles') &&
    screenSource.includes('Read-only display') &&
    screenSource.includes('Read-only title') &&
    screenSource.includes('not shown'),
  'QA screen must visibly disclose dev-only non-live fixture data and read-only badge title behavior.',
);
assert.ok(
  mapSource.includes('participantSource') && participantSource.includes('participantSource'),
  'Convoy map participant conversion should honor per-member fixture source without changing production connection source behavior.',
);

for (const forbidden of [
  'convoyMembershipService',
  'startConvoyLocationSharing',
  'stopConvoyLocationSharing',
  'subscribeToConvoyLocations',
  'supabase',
  'recordBadgeIdentitySafeSignal',
  'unlockBadge',
  'activeTripStore',
  'offlineIncidentPacket',
  'AsyncStorage',
  'localStorage',
  'sessionStorage',
  'Mopeka',
  'Bluestack',
]) {
  assert.ok(
    !sourceBundle.includes(forbidden),
    `Convoy participant QA fixture must not import or mutate production state: ${forbidden}`,
  );
}

assert.ok(
  packageJson.scripts['test:convoy-participant-fixture-qa'],
  'package.json should expose convoy participant fixture QA checks.',
);

console.log('Convoy participant fixture QA checks passed.');
