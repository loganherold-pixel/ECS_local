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
} = require(ladderPath);

const now = '2026-06-13T16:00:00.000Z';
const policy = { delayedAfter: 10, staleAfter: 20, missingAfter: 40 };
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
    permissions: basePermissions,
    roster: [member('lead')],
    lastAcceptedCheckIns: [{ memberId: 'lead', acceptedAt: minutesAgo(5), source: 'dispatch' }],
    channelStates: [{ memberId: 'lead', state: 'connected', observedAt: minutesAgo(1) }],
    ...overrides,
  });
}

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
  permissions: basePermissions,
  roster: [member('lead')],
  lastAcceptedCheckIns: [{ memberId: 'lead', acceptedAt: minutesAgo(5), source: 'dispatch' }],
});
assert.strictEqual(rowById(noPolicy, 'lead').status, 'unknown_no_data');
assert.ok(rowById(noPolicy, 'lead').privacyNotes.some((note) => note.includes('missing expedition staleness policy')));

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
  'ConvoyStalenessLadderPanel',
  'Convoy Staleness Ladder',
  'Current user-facing/internal beta extension',
  'last shared coordinate',
  'check-in overdue',
  'pending replay',
].forEach((fragment) => {
  assert.ok(convoyCommand.includes(fragment), `Convoy Command should include ladder surface fragment: ${fragment}`);
});

console.log('Convoy staleness ladder checks passed.');
