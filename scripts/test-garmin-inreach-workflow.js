const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

function compileTypeScriptModule(mod, filename) {
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

function loadTypeScriptModule(relPath) {
  const fullPath = path.join(process.cwd(), relPath);
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  compileTypeScriptModule(mod, fullPath);
  return mod.exports;
}

require.extensions['.ts'] = compileTypeScriptModule;

const adapterSource = fs.readFileSync(path.join(process.cwd(), 'lib/garmin/garminInreachAdapter.ts'), 'utf8');
const configSource = fs.readFileSync(path.join(process.cwd(), 'lib/garmin/garminInreachConfig.ts'), 'utf8');
const {
  confirmGarminInreachCommandDraft,
  createGarminInreachCommandDraft,
  maskGarminDeviceIdentifier,
  normalizeGarminInreachEventToDispatch,
  stableHashGarminIdentifier,
} = loadTypeScriptModule('lib/garmin/garminInreachAdapter.ts');
const {
  createGarminInreachSafeConfigSnapshot,
  DEFAULT_GARMIN_INREACH_FEATURE_FLAGS,
  resolveGarminInreachConfig,
  resolveGarminInreachConfigFromEnv,
  shouldLogGarminPii,
  shouldRunGarminInreachIntegration,
  supportsGarminInboundData,
  supportsGarminMapShareKmlIngestion,
  supportsGarminOutboundCommands,
} = loadTypeScriptModule('lib/garmin/garminInreachConfig.ts');
const { GARMIN_INREACH_WORKFLOW_FIXTURES } = loadTypeScriptModule('lib/garmin/garminInreachFixtures.ts');

assert.ok(adapterSource.includes("source: 'team_member'"), 'Garmin live events should normalize into existing Dispatch sources.');
assert.ok(adapterSource.includes("source: 'system'"), 'Garmin CAD events should avoid adding Garmin source to core Dispatch types.');
assert.ok(configSource.includes('apiTokenEnvKey'), 'Garmin secrets should be represented as environment/config keys only.');

assert.deepStrictEqual(DEFAULT_GARMIN_INREACH_FEATURE_FLAGS, {
  garminInreachEnabled: false,
  garminInreachInboundEventsEnabled: false,
  garminInreachOutboundCommandsEnabled: false,
  garminInreachSosSignalsEnabled: false,
});
const defaultConfig = resolveGarminInreachConfig();
assert.strictEqual(defaultConfig.mode, 'off');
assert.strictEqual(defaultConfig.commandsRequireConfirmation, true);
assert.strictEqual(defaultConfig.requireExplicitOperatorConfirmation, true);
assert.strictEqual(defaultConfig.logPii, false);
assert.strictEqual(defaultConfig.demoKmlEnabled, false);
assert.deepStrictEqual(defaultConfig.kmlFeeds, []);
assert.strictEqual(shouldRunGarminInreachIntegration(defaultConfig), false);
assert.strictEqual(supportsGarminMapShareKmlIngestion(defaultConfig), false);
assert.strictEqual(supportsGarminInboundData(defaultConfig), false);
assert.strictEqual(supportsGarminOutboundCommands(defaultConfig), false);
assert.strictEqual(resolveGarminInreachConfig({ flags: { garminInreachEnabled: true } }).flags.garminInreachOutboundCommandsEnabled, false);

const disabledEnv = resolveGarminInreachConfigFromEnv({
  GARMIN_INREACH_ENABLED: 'false',
  GARMIN_INREACH_MODE: 'ipc_command',
  GARMIN_INREACH_COMMANDS_REQUIRE_CONFIRMATION: 'false',
  GARMIN_INREACH_IPC_API_KEY: 'secret-key',
});
assert.strictEqual(disabledEnv.mode, 'off', 'Disabled Garmin config must force mode off.');
assert.strictEqual(disabledEnv.commandsRequireConfirmation, true, 'Commands must require confirmation even if env attempts to disable it.');
assert.strictEqual(supportsGarminOutboundCommands(disabledEnv), false);

const mapshareEnv = resolveGarminInreachConfigFromEnv({
  GARMIN_INREACH_ENABLED: 'true',
  GARMIN_INREACH_MODE: 'mapshare',
  GARMIN_INREACH_KML_FEEDS: 'https://example.test/feed.kml, https://example.test/second.kml',
  GARMIN_INREACH_MAPSHARE_POLL_INTERVAL_SECONDS: '300',
  GARMIN_INREACH_MAPSHARE_STALE_AFTER_MINUTES: '30',
});
assert.strictEqual(shouldRunGarminInreachIntegration(mapshareEnv), true);
assert.strictEqual(supportsGarminMapShareKmlIngestion(mapshareEnv), true);
assert.strictEqual(supportsGarminInboundData(mapshareEnv), false, 'MapShare mode is KML read-only, not IPC inbound.');
assert.strictEqual(supportsGarminOutboundCommands(mapshareEnv), false, 'MapShare mode must not allow commands.');
assert.deepStrictEqual(mapshareEnv.kmlFeeds, ['https://example.test/feed.kml', 'https://example.test/second.kml']);
assert.strictEqual(mapshareEnv.mapSharePollIntervalMs, 300000);
assert.strictEqual(mapshareEnv.mapShareStaleAfterMs, 1800000);
assert.strictEqual(mapshareEnv.demoKmlEnabled, false);

const readonlyEnv = resolveGarminInreachConfigFromEnv({
  GARMIN_INREACH_ENABLED: '1',
  GARMIN_INREACH_MODE: 'ipc_readonly',
  GARMIN_INREACH_WEBHOOK_STATIC_TOKEN: 'webhook-secret',
  GARMIN_INREACH_IPC_BASE_URL: 'https://ipc.example.test',
});
assert.strictEqual(supportsGarminInboundData(readonlyEnv), true);
assert.strictEqual(supportsGarminOutboundCommands(readonlyEnv), false);

const commandEnv = resolveGarminInreachConfigFromEnv({
  GARMIN_INREACH_ENABLED: 'yes',
  GARMIN_INREACH_MODE: 'ipc_command',
  GARMIN_INREACH_WEBHOOK_STATIC_TOKEN: 'webhook-secret',
  GARMIN_INREACH_IPC_BASE_URL: 'https://ipc.example.test',
  GARMIN_INREACH_IPC_API_KEY: 'ipc-secret',
  GARMIN_INREACH_LOG_PII: 'true',
});
assert.strictEqual(supportsGarminInboundData(commandEnv), true);
assert.strictEqual(supportsGarminOutboundCommands(commandEnv), true);
assert.strictEqual(shouldLogGarminPii(commandEnv), true);
const safeSnapshot = createGarminInreachSafeConfigSnapshot(commandEnv);
const safeSnapshotJson = JSON.stringify(safeSnapshot);
assert.ok(!safeSnapshotJson.includes('webhook-secret'), 'Safe config snapshot must not log webhook secret.');
assert.ok(!safeSnapshotJson.includes('ipc-secret'), 'Safe config snapshot must not log IPC API key.');
assert.deepStrictEqual(safeSnapshot, {
  enabled: true,
  mode: 'ipc_command',
  commandsRequireConfirmation: true,
  hasWebhookStaticToken: true,
  hasIpcBaseUrl: true,
  hasIpcApiKey: true,
  kmlFeedCount: 0,
  mapSharePollIntervalMs: 5 * 60 * 1000,
  mapShareStaleAfterMs: 30 * 60 * 1000,
  demoKmlEnabled: false,
  logPii: true,
});

assert.strictEqual(maskGarminDeviceIdentifier('300434123456789'), 'inReach ***6789');
assert.notStrictEqual(stableHashGarminIdentifier('300434123456789'), '300434123456789');
assert.strictEqual(
  stableHashGarminIdentifier('300434123456789'),
  stableHashGarminIdentifier('300434123456789'),
  'Garmin identifier hash should be stable.',
);

for (const fixture of GARMIN_INREACH_WORKFLOW_FIXTURES) {
  const normalized = normalizeGarminInreachEventToDispatch(fixture.event);
  assert.strictEqual(normalized.liveEvent.type, fixture.expectedLiveType, `${fixture.name} live type`);
  assert.strictEqual(normalized.liveEvent.severity, fixture.expectedSeverity, `${fixture.name} severity`);
  assert.strictEqual(
    normalized.cadEvent.metadata.humanReviewRequired,
    fixture.expectsHumanReview,
    `${fixture.name} human review flag`,
  );
  const serialized = JSON.stringify(normalized);
  assert.ok(!serialized.includes('300434123456789'), `${fixture.name} should not leak raw IMEI.`);
  assert.ok(serialized.includes('inReach ***6789') || !fixture.event.device?.imei, `${fixture.name} should include masked identifier when available.`);
}

const sos = normalizeGarminInreachEventToDispatch(GARMIN_INREACH_WORKFLOW_FIXTURES[2].event);
assert.strictEqual(sos.liveEvent.type, 'assistance');
assert.strictEqual(sos.liveEvent.severity, 'critical');
assert.strictEqual(sos.cadEvent.type, 'assist');
assert.strictEqual(sos.cadEvent.priority, 'critical');
assert.strictEqual(sos.cadEvent.metadata.sosAutomationBlocked, true);
assert.ok(sos.liveEvent.message.includes('will not confirm or cancel SOS automatically'));

const draft = createGarminInreachCommandDraft({
  id: 'cmd-1',
  type: 'send_message',
  expeditionId: 'expedition-1',
  deviceIdentifier: '300434123456789',
  message: 'Check in when stopped.',
  reason: 'Operator reply to inbound satellite message.',
  createdAt: '2026-04-28T17:00:00.000Z',
});
assert.strictEqual(draft.status, 'awaiting_operator_confirmation');
assert.strictEqual(draft.chargeable, true);
assert.strictEqual(draft.requiresExplicitOperatorConfirmation, true);
assert.strictEqual(draft.emergencyAutomationAllowed, false);
assert.ok(!JSON.stringify(draft).includes('300434123456789'), 'Command draft should not expose raw device identifier.');

assert.throws(
  () => confirmGarminInreachCommandDraft(draft, {
    confirmed: false,
    operatorUserId: 'operator-1',
    confirmedAt: '2026-04-28T17:01:00.000Z',
  }),
  /Explicit operator confirmation/,
);

const queued = confirmGarminInreachCommandDraft(draft, {
  confirmed: true,
  operatorUserId: 'operator-1',
  confirmedAt: '2026-04-28T17:01:00.000Z',
});
assert.strictEqual(queued.status, 'queued');
assert.strictEqual(queued.operatorUserId, 'operator-1');

assert.throws(
  () => createGarminInreachCommandDraft({
    id: 'cmd-sos',
    type: 'sos_confirm',
    expeditionId: 'expedition-1',
    deviceIdentifier: '300434123456789',
  }),
  /SOS confirm\/cancel automation is blocked/,
);

console.log('Garmin/inReach workflow adapter tests passed.');
