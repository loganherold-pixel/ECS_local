const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function compileTs(module, filename) {
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
}

require.extensions['.ts'] = compileTs;

function loadTs(relPath) {
  const fullPath = path.join(root, relPath);
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  compileTs(mod, fullPath);
  return mod.exports;
}

const builder = loadTs('lib/recovery/recoveryPacketBuilder.ts');

const {
  RECOVERY_PACKET_SECTION_ORDER,
  RECOVERY_PACKET_SAFETY_LABELS,
  buildRecoveryPacketDraft,
  buildRecoveryPacketExport,
  canExportRecoveryPacket,
  canFinalizeRecoveryPacket,
  confirmRecoveryPacketLocation,
  formatRecoveryPacketCoordinates,
  isRecoveryPacketBuilderFeatureEnabled,
  validateRecoveryPacketCoordinates,
} = builder;

const baseTime = '2026-06-13T18:00:00.000Z';
const baseCoordinates = {
  latitude: 38.57312,
  longitude: -109.54984,
  altitudeMeters: 1284,
  accuracyMeters: 8,
};

function source(sourceKind, freshness, extras = {}) {
  return {
    sourceKind,
    sourceName: extras.sourceName ?? sourceKind,
    freshness,
    observedAt: extras.observedAt,
    generatedAt: extras.generatedAt,
    updatedAt: extras.updatedAt,
    notes: extras.notes,
  };
}

function buildInput(overrides = {}) {
  return {
    packetId: 'packet-1',
    createdAt: baseTime,
    updatedAt: baseTime,
    incidentType: 'stuck',
    incidentNotes: 'User-entered note about a stuck vehicle.',
    confirmedLocation: {
      confirmed: false,
      coordinates: baseCoordinates,
      selectedFormat: 'decimal_degrees',
      source: source('user_entered', 'user_entered'),
    },
    activeRoute: {
      value: 'Fins and Things / north spur',
      freshness: 'stale',
      source: source('navigate', 'stale', { observedAt: '2026-06-13T15:30:00.000Z' }),
    },
    vehicleProfile: {
      value: '2008 Toyota 4Runner / 33s / trail loadout',
      freshness: 'current',
      source: source('fleet', 'current', { updatedAt: '2026-06-13T17:45:00.000Z' }),
    },
    recoveryGear: {
      value: ['kinetic rope', 'soft shackles', 'traction boards'],
      freshness: 'current',
      source: source('field_utilities', 'current'),
    },
    teamRoster: {
      value: ['Lead / driver', 'Sweep / radio'],
      freshness: 'stale',
      source: source('dispatch_recovery', 'stale', { observedAt: '2026-06-13T16:15:00.000Z' }),
    },
    lastKnownCommsStatus: {
      value: 'Radio contact intermittent',
      freshness: 'stale',
      source: source('dispatch_recovery', 'stale'),
    },
    offlineAvailability: {
      value: 'Route tiles cached; weather packet stale',
      freshness: 'stale',
      source: source('offline_honesty', 'stale'),
    },
    weatherFreshness: {
      value: 'Weather cache older than route policy',
      freshness: 'stale',
      source: source('offline_cached', 'stale'),
    },
    nearbyBailoutCandidates: {
      value: ['Sand Flats Road pullout', 'Moab north services'],
      freshness: 'stale',
      source: source('navigate', 'stale'),
    },
    garminInreachReviewSignals: [
      {
        label: 'Garmin/inReach review signal available for human review',
        source: source('garmin_inreach_review_context', 'current'),
      },
    ],
    networkShareAvailable: false,
    ...overrides,
  };
}

function fieldById(draft, fieldId) {
  for (const section of draft.sections) {
    const field = section.fields.find((candidate) => candidate.fieldId === fieldId);
    if (field) return field;
  }
  return null;
}

assert.strictEqual(isRecoveryPacketBuilderFeatureEnabled(), false, 'Recovery Packet Builder must fail closed by default.');
assert.strictEqual(isRecoveryPacketBuilderFeatureEnabled({ recoveryPacketBuilder: true }), true);
assert.strictEqual(isRecoveryPacketBuilderFeatureEnabled({ recoveryPacketBuilder: false }), false);

const missingIncidentType = buildRecoveryPacketDraft(buildInput({ incidentType: undefined }));
assert.strictEqual(missingIncidentType.state, 'blocked_missing_incident_type');
assert.deepStrictEqual(canFinalizeRecoveryPacket(missingIncidentType), {
  canFinalize: false,
  reasons: ['manual incident type is required'],
});
assert.strictEqual(canExportRecoveryPacket(missingIncidentType).canExport, false);

const unconfirmed = buildRecoveryPacketDraft(buildInput());
assert.strictEqual(unconfirmed.state, 'blocked_missing_confirmed_location');
assert.strictEqual(canExportRecoveryPacket(unconfirmed).canExport, false);
assert.ok(canExportRecoveryPacket(unconfirmed).reasons.some((reason) => reason.includes('coordinates must be user-confirmed')));

const confirmedLocation = confirmRecoveryPacketLocation({
  location: unconfirmed.confirmedLocation,
  coordinates: baseCoordinates,
  selectedFormat: 'degrees_minutes_seconds',
  confirmedAt: '2026-06-13T18:05:00.000Z',
  confirmingUserId: 'user-1',
  confirmingUserDisplayName: 'Logan',
  source: source('user_entered', 'user_entered'),
});
const readyDraft = buildRecoveryPacketDraft(buildInput({ confirmedLocation }));
assert.strictEqual(readyDraft.state, 'ready_to_finalize');
assert.strictEqual(canFinalizeRecoveryPacket(readyDraft).canFinalize, true);
assert.strictEqual(canExportRecoveryPacket(readyDraft).canExport, true);

const exported = buildRecoveryPacketExport(readyDraft, {
  exportedAt: '2026-06-13T18:06:00.000Z',
  exportedByUserId: 'user-1',
});
assert.strictEqual(exported.packetId, 'packet-1');
assert.strictEqual(exported.coordinateConfirmedAt, '2026-06-13T18:05:00.000Z');
assert.strictEqual(exported.incidentType, 'stuck');
assert.deepStrictEqual(exported.safetyLabels, RECOVERY_PACKET_SAFETY_LABELS);
assert.deepStrictEqual(exported.sections.map((section) => section.sectionId), RECOVERY_PACKET_SECTION_ORDER);
assert.deepStrictEqual(
  exported.sections.flatMap((section) => section.fields.map((field) => field.fieldId)),
  readyDraft.sections.flatMap((section) => section.fields.map((field) => field.fieldId)),
  'Export should include exactly the visible packet fields.',
);

for (const badCoordinates of [
  { latitude: 91, longitude: -109 },
  { latitude: -91, longitude: -109 },
  { latitude: 38, longitude: 181 },
  { latitude: 38, longitude: -181 },
  { latitude: Number.NaN, longitude: -109 },
  { latitude: 38, longitude: Number.POSITIVE_INFINITY },
]) {
  assert.strictEqual(validateRecoveryPacketCoordinates(badCoordinates).valid, false);
  assert.throws(() => confirmRecoveryPacketLocation({
    location: unconfirmed.confirmedLocation,
    coordinates: badCoordinates,
    selectedFormat: 'decimal_degrees',
    confirmedAt: '2026-06-13T18:05:00.000Z',
    confirmingUserId: 'user-1',
    source: source('user_entered', 'user_entered'),
  }), /Invalid recovery packet coordinates/);
}

assert.strictEqual(formatRecoveryPacketCoordinates(baseCoordinates, 'decimal_degrees'), '38.57312, -109.54984');
assert.strictEqual(formatRecoveryPacketCoordinates(baseCoordinates, 'degrees_minutes_seconds'), '38°34\'23.2"N, 109°32\'59.4"W');
assert.strictEqual(formatRecoveryPacketCoordinates(baseCoordinates, 'utm'), 'UTM unavailable in this build');

assert.deepStrictEqual(
  readyDraft.sections.map((section) => section.title),
  [
    'Location',
    'Incident',
    'Vehicle and Loadout',
    'Recovery Gear',
    'Team Status',
    'Route/Bailout Context',
    'Comms Status',
    'Data Freshness',
    'Share/Export',
  ],
);

const missingDataDraft = buildRecoveryPacketDraft(buildInput({
  activeRoute: undefined,
  vehicleProfile: undefined,
  recoveryGear: undefined,
  teamRoster: undefined,
  lastKnownCommsStatus: undefined,
  offlineAvailability: undefined,
  weatherFreshness: undefined,
  nearbyBailoutCandidates: undefined,
  garminInreachReviewSignals: [],
}));
for (const fieldId of [
  'vehicle_profile',
  'recovery_gear',
  'team_roster',
  'active_route',
  'nearby_bailout_candidates',
  'comms_status',
  'offline_availability',
  'weather_freshness',
]) {
  const field = fieldById(missingDataDraft, fieldId);
  assert.ok(field, `${fieldId} should render as an unavailable visible field.`);
  assert.strictEqual(field.freshness, 'unavailable', `${fieldId} should be unavailable.`);
}

assert.strictEqual(fieldById(readyDraft, 'incident_notes').freshness, 'user_entered');
assert.strictEqual(fieldById(readyDraft, 'weather_freshness').freshness, 'stale');
assert.strictEqual(fieldById(readyDraft, 'comms_status').freshness, 'stale');
assert.strictEqual(fieldById(readyDraft, 'active_route').freshness, 'stale');
assert.strictEqual(fieldById(readyDraft, 'offline_availability').freshness, 'stale');

const serializedDraft = JSON.stringify(readyDraft).toLowerCase();
const serializedExport = JSON.stringify(exported).toLowerCase();
for (const forbidden of [
  'emergency dispatch',
  'sos sent',
  'emergency services contacted',
  'help is on the way',
  'live location',
  'real-time tracking',
  'distress inferred',
  'automatic emergency',
  'recommended bailout',
  'abandon route',
  'go here now',
]) {
  assert.ok(!serializedDraft.includes(forbidden), `Draft must not contain forbidden phrase: ${forbidden}`);
  assert.ok(!serializedExport.includes(forbidden), `Export must not contain forbidden phrase: ${forbidden}`);
}
assert.ok(serializedDraft.includes('garmin/inreach review signal available for human review'));
assert.ok(serializedDraft.includes('bailout candidates are informational context only'));
assert.ok(readyDraft.warnings.some((warning) => warning.includes('Data may include stale or cached fields')));
assert.ok(readyDraft.shareActions.every((action) => action.enabled === true || action.reason));
assert.strictEqual(readyDraft.shareActions.find((action) => action.action === 'approved_share').enabled, false);
assert.ok(readyDraft.shareActions.find((action) => action.action === 'approved_share').reason.includes('Approved share unavailable in this build'));

assert.throws(() => buildRecoveryPacketExport(unconfirmed, {
  exportedAt: '2026-06-13T18:06:00.000Z',
  exportedByUserId: 'user-1',
}), /coordinates must be user-confirmed/);

const panelSource = fs.readFileSync(path.join(root, 'components', 'dashboard', 'IncidentRecoveryPanel.tsx'), 'utf8');
const modalSource = fs.readFileSync(path.join(root, 'components', 'dashboard', 'RecoveryPacketBuilderModal.tsx'), 'utf8');
assert.ok(panelSource.includes('isRecoveryPacketBuilderFeatureEnabled'), 'Incident & Recovery panel should gate the entry point.');
assert.ok(panelSource.includes('Build Recovery Packet'), 'Incident & Recovery panel should include the beta entry point.');
assert.ok(panelSource.includes('recoveryPacketModalVisible'), 'Incident & Recovery panel should own packet builder modal state.');
assert.ok(modalSource.includes('Current user-facing/internal beta'), 'Recovery packet UI should show beta maturity copy.');
assert.ok(modalSource.includes('Confirm Coordinates'), 'Recovery packet UI should require explicit coordinate confirmation.');
assert.ok(modalSource.includes('Copy Packet'), 'Recovery packet UI should expose gated copy.');
assert.ok(modalSource.includes('Download Text'), 'Recovery packet UI should expose gated download.');
assert.ok(modalSource.includes('Approved share unavailable in this build'), 'Share should be honest when unavailable.');

const uiCombined = `${panelSource}\n${modalSource}`.toLowerCase();
for (const forbidden of [
  'emergency dispatch',
  'sos sent',
  'emergency services contacted',
  'help is on the way',
  'live location',
  'real-time tracking',
  'distress inferred',
  'recommended bailout',
  'abandon route',
]) {
  assert.ok(!uiCombined.includes(forbidden), `Recovery Packet UI must not contain forbidden phrase: ${forbidden}`);
}

console.log('Recovery Packet Builder checks passed.');
