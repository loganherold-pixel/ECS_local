const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

function compileTypeScript(mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  mod._compile(output.outputText, filename);
}

require.extensions['.ts'] = compileTypeScript;

function loadTypeScriptModule(relPath) {
  const fullPath = path.join(process.cwd(), relPath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: fullPath,
  });
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  mod._compile(output.outputText, fullPath);
  return mod.exports;
}

const { normalizeDispatchEvent } = loadTypeScriptModule('lib/dispatchLiveEvents.ts');
const {
  createDispatchEventDetailPresentation,
  formatDispatchCoordinates,
  normalizeDispatchEventCoordinates,
} = loadTypeScriptModule('lib/dispatchEventDetailPresentation.ts');

const event = normalizeDispatchEvent({
  id: 'dispatch-recovery-assist-test',
  timestamp: '2026-04-25T18:30:00Z',
  updatedAt: '2026-04-25T18:34:00Z',
  type: 'recovery',
  category: 'recovery_assist',
  hazardType: 'recovery',
  severity: 'critical',
  priority: 'critical',
  status: 'active',
  title: 'Recovery Assist',
  message: 'Recovery assist requested.',
  explanation: 'Vehicle is immobilized at the current GPS fix. Stage recovery boards and confirm safe approach.',
  source: 'team_member',
  coordinates: {
    lat: 39.123456,
    lng: -120.654321,
    accuracyMeters: 8.4,
    altitude: 1920,
    heading: 134,
    timestamp: '2026-04-25T18:29:58Z',
    source: 'current_gps',
  },
  teamId: 'team-alpha',
  sessionId: 'expedition-session-alpha',
  channelId: 'dispatch-channel-alpha',
  cadId: 'CAD-RA-42',
  recoveryNotes: [
    'Winch-compatible anchor requested.',
    'Coordinate with trail lead before approach.',
  ],
});

assert.ok(event, 'Recovery Assist event with nested coordinates should normalize.');
assert.deepStrictEqual(event.location, {
  latitude: 39.123456,
  longitude: -120.654321,
  accuracyMeters: 8.4,
  altitude: 1920,
  heading: 134,
  timestamp: '2026-04-25T18:29:58.000Z',
  source: 'current_gps',
});
assert.strictEqual(event.category, 'recovery_assist');
assert.strictEqual(event.hazardType, 'recovery');
assert.strictEqual(event.teamId, 'team-alpha');
assert.strictEqual(event.sessionId, 'expedition-session-alpha');
assert.strictEqual(event.channelId, 'dispatch-channel-alpha');
assert.strictEqual(event.details, 'Vehicle is immobilized at the current GPS fix. Stage recovery boards and confirm safe approach.');
assert.strictEqual(event.cadReferenceId, 'CAD-RA-42');

const detail = createDispatchEventDetailPresentation(event, 'queued');
assert.strictEqual(detail.title, 'Recovery Assist');
assert.strictEqual(detail.typeLabel, 'Recovery');
assert.strictEqual(detail.priorityLabel, 'critical');
assert.strictEqual(detail.statusLabel, 'active');
assert.strictEqual(detail.body, 'Vehicle is immobilized at the current GPS fix. Stage recovery boards and confirm safe approach.');
assert.strictEqual(detail.coordinatesText, '39.12346, -120.65432');
assert.strictEqual(detail.referenceId, 'CAD-RA-42');
assert.deepStrictEqual(detail.recoveryNotes, [
  'Winch-compatible anchor requested.',
  'Coordinate with trail lead before approach.',
]);
assert.ok(detail.updatedTimeText, 'Updated time should be available when supplied.');

assert.deepStrictEqual(
  normalizeDispatchEventCoordinates({ gpsFix: { latitude: 40.1, longitude: -111.2 } }),
  { latitude: 40.1, longitude: -111.2 },
  'Nested GPS fix coordinates should normalize for the detail popup.',
);
assert.strictEqual(
  formatDispatchCoordinates({ latitude: 40.123456, longitude: -111.234567 }),
  '40.12346, -111.23457',
  'Coordinates should use a readable fixed precision.',
);

const commandCenterSource = fs.readFileSync(path.join(process.cwd(), 'components/dispatch/DispatchCadCommandCenter.tsx'), 'utf8');
assert.ok(
  commandCenterSource.includes('setMoreVisible(false);') &&
    !commandCenterSource.includes('setSelectedEventId(storedEvent.id);'),
  'Recovery Assist should close the More panel after creation and return to Dispatch Center.',
);
assert.ok(
  commandCenterSource.includes('createDispatchEventDetailPresentation') &&
    commandCenterSource.includes('Recovery Assist Notes') &&
    commandCenterSource.includes('Coordinates') &&
    commandCenterSource.includes('CAD / Ref'),
  'Event detail modal should render structured full event fields.',
);
assert.ok(
  !commandCenterSource.includes('<Text style={styles.modalDetails}>{event.message}</Text>'),
  'Event detail modal should not render only the message field without normalized detail support.',
);

console.log('Dispatch event detail presentation checks passed.');
