const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const ladderPath = path.join(root, 'lib', 'convoy', 'convoyStalenessLadder.ts');
const convoyCommandPath = path.join(root, 'app', 'convoy-command.tsx');

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
  CONVOY_STALENESS_GROUP_ORDER,
  buildConvoyStalenessLadder,
  buildConvoyStalenessPolicyEvidenceFromConfig,
  validateConvoyStalenessPolicy,
} = require(ladderPath);

const now = '2026-06-13T16:00:00.000Z';
const policy = { delayedAfter: 10, staleAfter: 20, missingAfter: 40, unit: 'minutes' };
const policySource = {
  policyId: 'policy-convoy-1',
  source: 'expedition_config',
  sourceId: 'expedition-1',
  convoyId: 'convoy-1',
  updatedAt: '2026-06-13T15:55:00.000Z',
  schemaVersion: 'convoy-staleness-policy-v1',
};
const basePermissions = {
  canViewRoster: true,
  canViewStatus: true,
  canViewCheckInTimestamps: true,
  canViewSharedCoordinates: true,
  canViewOfflineReplayState: true,
};

function minutesAgo(minutes) {
  return new Date(Date.parse(now) - minutes * 60_000).toISOString();
}

function member(id, overrides = {}) {
  return {
    memberId: id,
    displayName: id.toUpperCase(),
    role: 'member',
    ...overrides,
  };
}

function rowById(ladder, id) {
  const row = ladder.rows.find((item) => item.memberId === id);
  assert.ok(row, `Expected row for ${id}`);
  return row;
}

function ladder(overrides = {}) {
  return buildConvoyStalenessLadder({
    now,
    policy,
    policySource,
    context: { convoyId: 'convoy-1', expeditionId: 'expedition-1' },
    permissions: basePermissions,
    roster: [member('lead')],
    lastAcceptedCheckIns: [{ memberId: 'lead', acceptedAt: minutesAgo(5), source: 'dispatch' }],
    channelStates: [{ memberId: 'lead', state: 'connected', observedAt: minutesAgo(1) }],
    ...overrides,
  });
}

const validPolicyEvidence = validateConvoyStalenessPolicy(policy, policySource, {
  now,
  context: { convoyId: 'convoy-1', expeditionId: 'expedition-1' },
});
assert.strictEqual(validPolicyEvidence.status, 'valid');
assert.deepStrictEqual(validPolicyEvidence.policy, policy);
assert.strictEqual(validPolicyEvidence.source.source, 'expedition_config');
assert.strictEqual(validPolicyEvidence.source.policyId, 'policy-convoy-1');
assert.strictEqual(validPolicyEvidence.source.schemaVersion, 'convoy-staleness-policy-v1');

const denied = ladder({
  permissions: {
    ...basePermissions,
    canViewStatus: false,
    canViewCheckInTimestamps: true,
    canViewSharedCoordinates: true,
  },
  sharedCoordinates: [{ memberId: 'lead', lat: 38.1, lng: -110.2, sharedAt: minutesAgo(5), explicitlyShared: true }],
});
assert.strictEqual(rowById(denied, 'lead').status, 'unknown_no_permission');
assert.strictEqual(rowById(denied, 'lead').lastCheckInAt, null);
assert.strictEqual(rowById(denied, 'lead').lastCheckInAgeMinutes, null);
assert.strictEqual(rowById(denied, 'lead').lastSharedCoordinate, null);
assert.ok(rowById(denied, 'lead').privacyNotes.some((note) => note.includes('no permission')));

const noPolicy = buildConvoyStalenessLadder({
  now,
  policy: null,
  policySource: { source: 'expedition_config', sourceId: 'expedition-1', convoyId: 'convoy-1' },
  context: { convoyId: 'convoy-1', expeditionId: 'expedition-1' },
  permissions: basePermissions,
  roster: [member('lead')],
  lastAcceptedCheckIns: [{ memberId: 'lead', acceptedAt: minutesAgo(5), source: 'dispatch' }],
});
assert.strictEqual(rowById(noPolicy, 'lead').status, 'unknown_no_data');
assert.strictEqual(noPolicy.policyEvidence.status, 'missing');
assert.strictEqual(noPolicy.policy, null);
assert.ok(noPolicy.warnings.some((warning) => warning.includes('Expedition staleness policy is missing')));
assert.ok(rowById(noPolicy, 'lead').sourceNotes.some((note) => note.includes('Expedition staleness policy is missing')));
assert.ok(!noPolicy.rows.some((row) => ['fresh', 'delayed', 'stale', 'missing_check_in'].includes(row.status)));

for (const [name, invalidPolicy] of [
  ['missing delayedAfter', { staleAfter: 20, missingAfter: 40, unit: 'minutes' }],
  ['stale before delayed', { delayedAfter: 10, staleAfter: 10, missingAfter: 40, unit: 'minutes' }],
  ['missing before stale', { delayedAfter: 10, staleAfter: 20, missingAfter: 20, unit: 'minutes' }],
  ['negative threshold', { delayedAfter: -1, staleAfter: 20, missingAfter: 40, unit: 'minutes' }],
  ['zero threshold', { delayedAfter: 0, staleAfter: 20, missingAfter: 40, unit: 'minutes' }],
  ['non-finite threshold', { delayedAfter: Number.POSITIVE_INFINITY, staleAfter: 20, missingAfter: 40, unit: 'minutes' }],
  ['unsupported unit', { delayedAfter: 10, staleAfter: 20, missingAfter: 40, unit: 'seconds' }],
]) {
  const invalid = buildConvoyStalenessLadder({
    now,
    policy: invalidPolicy,
    policySource,
    context: { convoyId: 'convoy-1', expeditionId: 'expedition-1' },
    permissions: basePermissions,
    roster: [member(`invalid-${name}`)],
    lastAcceptedCheckIns: [{ memberId: `invalid-${name}`, acceptedAt: minutesAgo(5), source: 'dispatch' }],
  });
  assert.strictEqual(invalid.policyEvidence.status, 'invalid', `${name} should invalidate policy evidence.`);
  assert.strictEqual(rowById(invalid, `invalid-${name}`).status, 'unknown_no_data');
  assert.ok(!invalid.rows.some((row) => ['fresh', 'delayed', 'stale', 'missing_check_in'].includes(row.status)));
  assert.ok(rowById(invalid, `invalid-${name}`).sourceNotes.some((note) => note.includes('Expedition staleness policy is invalid')));
}

const stalePolicy = buildConvoyStalenessLadder({
  now,
  policy,
  policySource: { ...policySource, staleAt: '2026-06-13T15:00:00.000Z' },
  context: { convoyId: 'convoy-1', expeditionId: 'expedition-1' },
  permissions: basePermissions,
  roster: [member('stale-policy')],
  lastAcceptedCheckIns: [{ memberId: 'stale-policy', acceptedAt: minutesAgo(5), source: 'dispatch' }],
});
assert.strictEqual(stalePolicy.policyEvidence.status, 'stale');
assert.strictEqual(rowById(stalePolicy, 'stale-policy').status, 'unknown_no_data');

const mismatchedPolicy = buildConvoyStalenessLadder({
  now,
  policy,
  policySource: { ...policySource, convoyId: 'convoy-a' },
  context: { convoyId: 'convoy-b', expeditionId: 'expedition-1' },
  permissions: basePermissions,
  roster: [member('mismatch')],
  lastAcceptedCheckIns: [{ memberId: 'mismatch', acceptedAt: minutesAgo(5), source: 'dispatch' }],
});
assert.strictEqual(mismatchedPolicy.policyEvidence.status, 'unavailable');
assert.strictEqual(rowById(mismatchedPolicy, 'mismatch').status, 'unknown_no_data');
assert.ok(mismatchedPolicy.warnings.some((warning) => warning.includes('identity mismatch')));

const configEvidence = buildConvoyStalenessPolicyEvidenceFromConfig({
  id: 'convoy-1',
  expedition_id: 'expedition-1',
  staleness_policy: policy,
  staleness_policy_source: 'dispatch_config',
  staleness_policy_id: 'dispatch-policy-1',
  staleness_policy_updated_at: '2026-06-13T15:55:00.000Z',
  staleness_policy_schema_version: 'dispatch-convoy-policy-v1',
}, {
  now,
  context: { convoyId: 'convoy-1', expeditionId: 'expedition-1' },
});
assert.strictEqual(configEvidence.status, 'valid');
assert.strictEqual(configEvidence.source.source, 'dispatch_config');
assert.strictEqual(configEvidence.source.sourceId, 'expedition-1');
assert.strictEqual(configEvidence.source.policyId, 'dispatch-policy-1');

const convoyBNoPolicy = buildConvoyStalenessLadder({
  now,
  policy: null,
  policySource: { source: 'convoy_config', convoyId: 'convoy-b', sourceId: 'convoy-b' },
  context: { convoyId: 'convoy-b' },
  permissions: basePermissions,
  roster: [member('convoy-b-member')],
  lastAcceptedCheckIns: [{ memberId: 'convoy-b-member', acceptedAt: minutesAgo(5), source: 'dispatch' }],
});
assert.strictEqual(rowById(convoyBNoPolicy, 'convoy-b-member').status, 'unknown_no_data');
assert.ok(!convoyBNoPolicy.rows.some((row) => ['fresh', 'delayed', 'stale', 'missing_check_in'].includes(row.status)), 'Old convoy policy must not be reused after selected convoy changes.');

const boundaries = ladder({
  roster: [member('fresh'), member('delayed'), member('stale'), member('missing')],
  lastAcceptedCheckIns: [
    { memberId: 'fresh', acceptedAt: minutesAgo(9), source: 'dispatch' },
    { memberId: 'delayed', acceptedAt: minutesAgo(10), source: 'dispatch' },
    { memberId: 'stale', acceptedAt: minutesAgo(20), source: 'dispatch' },
    { memberId: 'missing', acceptedAt: minutesAgo(40), source: 'dispatch' },
  ],
});
assert.strictEqual(rowById(boundaries, 'fresh').status, 'fresh');
assert.strictEqual(rowById(boundaries, 'delayed').status, 'delayed');
assert.strictEqual(rowById(boundaries, 'stale').status, 'stale');
assert.strictEqual(rowById(boundaries, 'missing').status, 'missing_check_in');
assert.ok(boundaries.rows.every((row) => row.policyStatus === 'valid'));
assert.strictEqual(boundaries.policyEvidence.status, 'valid');
assert.ok(boundaries.sourceNotes.some((note) => note.includes('expedition_config')));

const recoveryPrecedence = ladder({
  roster: [member('lead')],
  lastAcceptedCheckIns: [{ memberId: 'lead', acceptedAt: minutesAgo(80), source: 'dispatch' }],
  events: [
    { eventId: 'assist-1', memberId: 'lead', type: 'assist', active: true, summary: 'Needs a spotter', createdAt: minutesAgo(15) },
    { eventId: 'recovery-1', memberId: 'lead', type: 'recovery', active: true, summary: 'Winch recovery active', createdAt: minutesAgo(12) },
  ],
});
assert.strictEqual(rowById(recoveryPrecedence, 'lead').status, 'recovery_event_active');
assert.strictEqual(rowById(recoveryPrecedence, 'lead').activeEventSummary, 'Winch recovery active');
assert.strictEqual(rowById(recoveryPrecedence, 'lead').policyStatus, 'valid');

const assistancePrecedence = ladder({
  roster: [member('lead')],
  lastAcceptedCheckIns: [{ memberId: 'lead', acceptedAt: minutesAgo(80), source: 'dispatch' }],
  events: [
    { eventId: 'assist-1', memberId: 'lead', type: 'assist', active: true, summary: 'Needs a spotter', createdAt: minutesAgo(15) },
  ],
});
assert.strictEqual(rowById(assistancePrecedence, 'lead').status, 'assistance_requested');

const silenceOnly = ladder({
  roster: [member('lead')],
  lastAcceptedCheckIns: [{ memberId: 'lead', acceptedAt: minutesAgo(80), source: 'dispatch' }],
  events: [
    { eventId: 'ping-1', memberId: 'lead', type: 'ping', active: true, summary: 'Ping sent', createdAt: minutesAgo(8) },
    { eventId: 'rally-1', memberId: 'lead', type: 'rally', active: true, summary: 'Rally requested', createdAt: minutesAgo(7) },
  ],
});
assert.strictEqual(rowById(silenceOnly, 'lead').status, 'missing_check_in');
assert.notStrictEqual(rowById(silenceOnly, 'lead').status, 'assistance_requested');
assert.notStrictEqual(rowById(silenceOnly, 'lead').status, 'recovery_event_active');

const coordinateVisible = ladder({
  sharedCoordinates: [{ memberId: 'lead', lat: 38.1, lng: -110.2, sharedAt: minutesAgo(5), explicitlyShared: true, label: 'Trail junction' }],
});
assert.ok(rowById(coordinateVisible, 'lead').lastSharedCoordinate);
assert.ok(rowById(coordinateVisible, 'lead').sourceNotes.some((note) => note.includes('last shared coordinate')));

const coordinateRedacted = ladder({
  permissions: {
    ...basePermissions,
    canViewSharedCoordinates: false,
  },
  sharedCoordinates: [{ memberId: 'lead', lat: 38.1, lng: -110.2, sharedAt: minutesAgo(5), explicitlyShared: true }],
});
assert.strictEqual(rowById(coordinateRedacted, 'lead').lastSharedCoordinate, null);
assert.ok(rowById(coordinateRedacted, 'lead').privacyNotes.some((note) => note.includes('coordinate permission')));

const offlinePending = ladder({
  roster: [member('lead')],
  lastAcceptedCheckIns: [{ memberId: 'lead', acceptedAt: minutesAgo(25), source: 'dispatch' }],
  offlineReplay: [{ memberId: 'lead', state: 'pending', capturedAt: minutesAgo(2), visible: true }],
});
assert.strictEqual(rowById(offlinePending, 'lead').status, 'stale');
assert.ok(rowById(offlinePending, 'lead').sourceNotes.some((note) => note.includes('pending replay')));

const garminBlocked = ladder({
  roster: [member('lead')],
  lastAcceptedCheckIns: [],
  garminInReach: {
    enabled: true,
    connected: false,
    permitted: true,
    checkIns: [{ memberId: 'lead', acceptedAt: minutesAgo(2), source: 'garmin_inreach' }],
  },
});
assert.strictEqual(rowById(garminBlocked, 'lead').status, 'unknown_no_data');
assert.ok(rowById(garminBlocked, 'lead').privacyNotes.some((note) => note.includes('no accepted check-in source')));

const garminAccepted = ladder({
  roster: [member('lead')],
  lastAcceptedCheckIns: [],
  garminInReach: {
    enabled: true,
    connected: true,
    permitted: true,
    checkIns: [{ memberId: 'lead', acceptedAt: minutesAgo(2), source: 'garmin_inreach' }],
  },
});
assert.strictEqual(rowById(garminAccepted, 'lead').status, 'fresh');

assert.deepStrictEqual(CONVOY_STALENESS_GROUP_ORDER, [
  'recovery_event_active',
  'assistance_requested',
  'missing_check_in',
  'stale',
  'delayed',
  'fresh',
  'unknown',
]);
assert.deepStrictEqual(
  ladder({
    roster: [member('missing'), member('fresh'), member('assist')],
    lastAcceptedCheckIns: [
      { memberId: 'missing', acceptedAt: minutesAgo(41), source: 'dispatch' },
      { memberId: 'fresh', acceptedAt: minutesAgo(2), source: 'dispatch' },
      { memberId: 'assist', acceptedAt: minutesAgo(2), source: 'dispatch' },
    ],
    events: [{ eventId: 'assist-1', memberId: 'assist', type: 'assist', active: true, summary: 'Needs assist', createdAt: minutesAgo(1) }],
  }).groups.map((group) => group.group),
  ['assistance_requested', 'missing_check_in', 'fresh'],
);

const convoyCommand = fs.readFileSync(convoyCommandPath, 'utf8');
[
  'buildConvoyStalenessLadder',
  'buildConvoyStalenessPolicyEvidenceFromConfig',
  'ConvoyStalenessLadderPanel',
  'Convoy Staleness Ladder',
  'Current user-facing/internal beta extension',
  'last shared coordinate',
  'check-in overdue',
  'pending replay',
  'staleness policy needed',
  'policyEvidence.status',
  'Expedition staleness thresholds unavailable',
].forEach((fragment) => {
  assert.ok(convoyCommand.includes(fragment), `Convoy Command should include ladder surface fragment: ${fragment}`);
});

for (const forbidden of ['live location', 'real-time tracking', 'currently located at', 'distress inferred', 'emergency inferred', 'silent means distress']) {
  assert.ok(!convoyCommand.toLowerCase().includes(forbidden), `Convoy Command copy must not include forbidden phrase: ${forbidden}`);
}

console.log('Convoy staleness ladder checks passed.');
