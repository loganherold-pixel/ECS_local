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

const fallbackSource = read('components/convoy/ConvoyMapFallback.tsx');
assert(
  !fallbackSource.includes('live members listed'),
  'Convoy fallback accessibility copy must not call stale/offline/unknown participants live.',
);
assert(
  fallbackSource.includes('members listed') || fallbackSource.includes('participants listed'),
  'Convoy fallback accessibility copy should use neutral participant/member copy.',
);
assert(
  fallbackSource.includes('Location status unknown') &&
    !fallbackSource.includes("return identity.status === 'unknown' ? 'Location received'"),
  'Convoy fallback should not describe unknown marker status as a received location.',
);

const readinessPath = path.join(root, 'lib', 'convoy', 'convoyCommandV15Readiness.ts');
const {
  CONVOY_COMMAND_V15_BADGE_IDENTITY_STATUS,
  CONVOY_COMMAND_V15_DEFERRED_ITEMS,
  CONVOY_COMMAND_V15_PRIVACY_SCOPE,
  CONVOY_COMMAND_V15_SOURCE_OF_TRUTH_CONTRACT,
  buildConvoyV15ParticipantContract,
  isProductionConvoyInviteAuthority,
  normalizeConvoyV15ParticipantStatus,
  normalizeConvoyV15Role,
  roleSemanticsForConvoyV15Role,
} = require(readinessPath);

const nowMs = Date.parse('2026-06-09T12:00:00.000Z');

assert.strictEqual(CONVOY_COMMAND_V15_BADGE_IDENTITY_STATUS, 'deferred');
assert.strictEqual(CONVOY_COMMAND_V15_PRIVACY_SCOPE.scope, 'active_convoy_members_only');
assert.ok(
  CONVOY_COMMAND_V15_PRIVACY_SCOPE.locationPrecision.includes('precise') &&
    CONVOY_COMMAND_V15_PRIVACY_SCOPE.locationPrecision.includes('convoy'),
  'Privacy contract should explicitly scope precise locations to active convoy context.',
);
assert.ok(
  CONVOY_COMMAND_V15_DEFERRED_ITEMS.includes('badge_identity_title_display') &&
    CONVOY_COMMAND_V15_DEFERRED_ITEMS.includes('convoy_badge_unlocks'),
  'Badge identity display and convoy badge unlocks should remain deferred.',
);

const requiredContractFields = [
  'convoy',
  'participant',
  'display',
  'vehicle',
  'role',
  'location',
  'motion',
  'freshness',
  'status',
  'emergency',
  'privacyScope',
  'inviteAuthority',
  'sourceKind',
  'badgeIdentity',
];
for (const field of requiredContractFields) {
  assert.ok(CONVOY_COMMAND_V15_SOURCE_OF_TRUTH_CONTRACT[field], `Contract should document ${field}.`);
}
assert.strictEqual(CONVOY_COMMAND_V15_SOURCE_OF_TRUTH_CONTRACT.badgeIdentity.status, 'deferred');
assert.strictEqual(CONVOY_COMMAND_V15_SOURCE_OF_TRUTH_CONTRACT.badgeIdentity.convoyDisplayField, null);

const roleExpectations = new Map([
  ['lead', 'leader'],
  ['leader', 'leader'],
  ['sweep', 'tail'],
  ['tail', 'tail'],
  ['member', 'member'],
  ['scout', 'scout'],
  ['recovery', 'recovery'],
  ['medic', 'medic'],
  ['', 'member'],
  [null, 'member'],
  ['incident commander', 'member'],
]);
for (const [input, expected] of roleExpectations) {
  assert.strictEqual(normalizeConvoyV15Role(input), expected, `${input} should normalize to ${expected}.`);
}

for (const role of ['medic', 'recovery']) {
  const semantics = roleSemanticsForConvoyV15Role(role);
  assert.ok(semantics.copy.toLowerCase().includes('functional'), `${role} copy should say role is functional.`);
  assert.ok(
    semantics.copy.toLowerCase().includes('not') && semantics.copy.toLowerCase().includes('certification'),
    `${role} copy must not imply verified professional capability.`,
  );
}

const live = normalizeConvoyV15ParticipantStatus({
  participantId: 'member-live',
  activeParticipant: true,
  sourceKind: 'live',
  location: { latitude: 38.1, longitude: -121.2 },
  updatedAt: '2026-06-09T11:58:00.000Z',
  movementStatus: 'moving',
  nowMs,
});
assert.strictEqual(live.status, 'live');
assert.strictEqual(live.isProductionLive, true);

const stale = normalizeConvoyV15ParticipantStatus({
  participantId: 'member-stale',
  activeParticipant: true,
  sourceKind: 'live',
  location: { latitude: 38.1, longitude: -121.2 },
  updatedAt: '2026-06-09T11:50:00.000Z',
  movementStatus: 'moving',
  nowMs,
});
assert.strictEqual(stale.status, 'stale');
assert.strictEqual(stale.isProductionLive, false);
assert.ok(stale.reason.includes('last known'));

const disconnected = normalizeConvoyV15ParticipantStatus({
  participantId: 'member-offline',
  activeParticipant: true,
  sourceKind: 'live',
  location: null,
  updatedAt: null,
  movementStatus: 'offline',
  nowMs,
});
assert.strictEqual(disconnected.status, 'disconnected');
assert.strictEqual(disconnected.isProductionLive, false);

const unknown = normalizeConvoyV15ParticipantStatus({
  participantId: null,
  activeParticipant: null,
  sourceKind: 'unknown',
  location: { latitude: Number.NaN, longitude: -121.2 },
  updatedAt: null,
  movementStatus: null,
  nowMs,
});
assert.strictEqual(unknown.status, 'unknown');
assert.strictEqual(unknown.isProductionLive, false);

const demo = normalizeConvoyV15ParticipantStatus({
  participantId: 'demo-member',
  activeParticipant: true,
  sourceKind: 'ecs_demo_fixture',
  location: { latitude: 38.1, longitude: -121.2 },
  updatedAt: '2026-06-09T11:59:00.000Z',
  movementStatus: 'moving',
  nowMs,
});
assert.strictEqual(demo.status, 'mock_demo');
assert.strictEqual(demo.isProductionLive, false);
assert.ok(demo.reason.toLowerCase().includes('demo'));

const participant = buildConvoyV15ParticipantContract({
  convoyId: 'convoy-1',
  convoySource: 'supabase',
  participantId: 'member-1',
  activeParticipant: true,
  displayName: 'V2',
  vehicleLabel: 'Tacoma',
  role: 'sweep',
  location: { latitude: 38.1, longitude: -121.2 },
  headingDegrees: 270,
  speedMps: 4,
  updatedAt: '2026-06-09T11:58:00.000Z',
  movementStatus: 'needs_assistance',
  sourceKind: 'live',
  nowMs,
});
assert.strictEqual(participant.role, 'tail');
assert.strictEqual(participant.status.status, 'live');
assert.strictEqual(participant.emergency.needsAssistance, true);
assert.strictEqual(participant.privacyScope, 'active_convoy_members_only');
assert.strictEqual(participant.badgeIdentity.status, 'deferred');
assert.strictEqual(participant.badgeIdentity.title, null);
assert.ok(!Object.prototype.hasOwnProperty.call(participant, 'expeditionBadgeTitle'));
assert.ok(!Object.prototype.hasOwnProperty.call(participant, 'badgeTitle'));

assert.strictEqual(
  isProductionConvoyInviteAuthority({
    sourceKind: 'demo',
    inviteId: 'demo-expedition-invite',
    convoyId: 'demo-convoy',
    inviteLinkBaseUrl: 'https://ecs.local',
    revokedAt: null,
    expiresAt: '2026-06-09T13:00:00.000Z',
    nowMs,
  }),
  false,
  'Demo/local invite authority must not be production.',
);
assert.strictEqual(
  isProductionConvoyInviteAuthority({
    sourceKind: 'supabase',
    inviteId: 'invite-1',
    convoyId: 'convoy-1',
    inviteLinkBaseUrl: 'https://ecs.example',
    revokedAt: null,
    expiresAt: '2026-06-09T13:00:00.000Z',
    nowMs,
  }),
  true,
  'Unrevoked, unexpired Supabase invite authority should be production-capable.',
);
assert.strictEqual(
  isProductionConvoyInviteAuthority({
    sourceKind: 'supabase',
    inviteId: 'invite-expired',
    convoyId: 'convoy-1',
    inviteLinkBaseUrl: 'https://ecs.example',
    revokedAt: null,
    expiresAt: '2026-06-09T11:00:00.000Z',
    nowMs,
  }),
  false,
  'Expired invite authority should not be production-capable.',
);

const convoySources = [
  read('app/convoy-command.tsx'),
  read('components/dispatch/DispatchConvoyCommandPanel.tsx'),
  read('components/convoy/ConvoyCommandMap.tsx'),
  read('lib/convoy/convoyMembershipService.ts'),
  read('lib/convoy/convoyRealtimeService.ts'),
  read('supabase/functions/convoy-membership/index.ts'),
].join('\n');
assert(
  !convoySources.includes('recordBadgeIdentitySafeSignal'),
  'Convoy runtime must not unlock Badge / Expedition Identity from convoy behavior.',
);
assert(
  convoySources.includes('Live location is shared only with active convoy members') ||
    convoySources.includes('active convoy members'),
  'Convoy UI/services should keep active-convoy-members-only privacy language visible.',
);

const dispatchInviteDomain = read('lib/dispatchInviteDomain.ts');
assert(
  dispatchInviteDomain.includes('https://ecs.local') &&
    dispatchInviteDomain.includes('DEMO_EXPEDITION_INVITE'),
  'Dispatch invite demo fixtures should remain visibly demo/local.',
);

const packageJson = JSON.parse(read('package.json'));
assert.ok(
  packageJson.scripts['test:convoy-command-v1-5-readiness'],
  'package.json should expose Convoy Command v1.5 readiness guard tests.',
);

console.log('Convoy Command v1.5 readiness contract checks passed.');
