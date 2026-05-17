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

const {
  buildGarminInreachVisibilityModel,
} = loadTypeScriptModule('lib/garmin/garminInreachVisibilityModel.ts');
const {
  resolveGarminInreachConfigFromEnv,
} = loadTypeScriptModule('lib/garmin/garminInreachConfig.ts');

function config(mode = 'mapshare') {
  return resolveGarminInreachConfigFromEnv({
    GARMIN_INREACH_ENABLED: mode === 'off' ? 'false' : 'true',
    GARMIN_INREACH_MODE: mode,
    GARMIN_INREACH_IPC_BASE_URL: 'https://ipc.example.test',
    GARMIN_INREACH_IPC_API_KEY: 'secret',
    GARMIN_INREACH_MAPSHARE_STALE_AFTER_MS: String(2 * 60 * 60 * 1000),
  });
}

const now = new Date('2026-04-28T22:00:00Z');

const disabled = buildGarminInreachVisibilityModel({
  config: config('off'),
  snapshot: {
    deviceLabel: 'Lead inReach',
    lastPosition: { latitude: 38.78, longitude: -121.2, sourceTimestamp: '2026-04-28T21:45:00Z' },
  },
  now,
});
assert.strictEqual(disabled, null, 'Panel model should be hidden when Garmin is disabled.');

const readonly = buildGarminInreachVisibilityModel({
  config: config('mapshare'),
  snapshot: {
    deviceLabel: 'Lead inReach',
    memberLabel: 'Lead Vehicle',
    feedName: 'Lead MapShare',
    lastSuccessfulPollAt: '2026-04-28T21:58:00Z',
    lastPosition: { latitude: 38.7807, longitude: -121.2076, sourceTimestamp: '2026-04-28T21:45:00Z' },
    trackingStatus: 'tracking',
    batteryPercent: 84,
    lastInboundMessage: { text: 'Camp reached', occurredAt: '2026-04-28T21:40:00Z' },
  },
  now,
});
assert.ok(readonly);
assert.strictEqual(readonly.sourceMode, 'MapShare');
assert.strictEqual(readonly.readOnlyStatusLabel, 'Read-only');
assert.strictEqual(readonly.feedNameLabel, 'Lead MapShare');
assert.strictEqual(readonly.lastSuccessfulPollLabel, '2 min ago');
assert.strictEqual(readonly.demoSynthetic, false);
assert.strictEqual(readonly.deviceLabel, 'Lead inReach');
assert.strictEqual(readonly.memberLabel, 'Lead Vehicle');
assert.strictEqual(readonly.lastPositionLabel, '38.78070, -121.20760');
assert.strictEqual(readonly.positionAgeLabel, '15 min ago');
assert.strictEqual(readonly.stale, false);
assert.strictEqual(readonly.trackingStatusLabel, 'Tracking');
assert.strictEqual(readonly.batteryLabel, '84%');
assert.strictEqual(readonly.lowBattery, false);
assert.strictEqual(readonly.lastInboundMessageLabel, 'Camp reached');
assert.strictEqual(readonly.canShowCommandControls, false);
assert.deepStrictEqual(readonly.commandControls, []);

const demoReadonly = buildGarminInreachVisibilityModel({
  config: config('mapshare'),
  snapshot: {
    feedName: 'Demo Garmin MapShare Feed',
    demoSynthetic: true,
  },
  now,
});
assert.strictEqual(demoReadonly.demoSynthetic, true);
assert.strictEqual(demoReadonly.canShowCommandControls, false);

const staleLowBattery = buildGarminInreachVisibilityModel({
  config: config('ipc_readonly'),
  snapshot: {
    lastPosition: { latitude: 38.7807, longitude: -121.2076, sourceTimestamp: '2026-04-28T18:00:00Z' },
    batteryPercent: 12,
  },
  now,
});
assert.ok(staleLowBattery.stale);
assert.ok(staleLowBattery.lowBattery);
assert.strictEqual(staleLowBattery.sourceMode, 'IPC read-only');
assert.strictEqual(staleLowBattery.canShowCommandControls, false);

const commandMode = buildGarminInreachVisibilityModel({
  config: config('ipc_command'),
  snapshot: {
    deviceLabel: 'Sweep inReach',
    trackingStatus: 'stopped',
    lastOutboundCommandRequest: {
      type: 'request_location',
      status: 'failed',
      requestedAt: '2026-04-28T21:50:00Z',
    },
  },
  now,
});
assert.strictEqual(commandMode.sourceMode, 'IPC command');
assert.strictEqual(commandMode.canShowCommandControls, true);
assert.strictEqual(commandMode.commandHelperText, 'May take up to 20 minutes.');
assert.strictEqual(commandMode.chargeWarning, 'Charges may apply.');
assert.strictEqual(commandMode.commandControls.length, 3);
assert.ok(commandMode.commandControls.some((control) => control.type === 'request_location'));
assert.ok(commandMode.commandControls.some((control) => control.type === 'start_tracking'));
assert.ok(commandMode.commandControls.every((control) => control.enabled));

const pending = buildGarminInreachVisibilityModel({
  config: config('ipc_command'),
  snapshot: {
    commandPending: true,
    trackingStatus: 'tracking',
    lastOutboundCommandRequest: {
      type: 'send_message',
      status: 'queued',
    },
  },
  now,
});
assert.strictEqual(pending.commandPending, true);
assert.ok(pending.commandControls.every((control) => !control.enabled), 'Pending command should disable additional command controls.');
assert.ok(pending.commandControls.some((control) => control.type === 'stop_tracking'));
assert.strictEqual(pending.lastOutboundCommandLabel, 'Send message: Queued');

const sosCancel = buildGarminInreachVisibilityModel({
  config: config('ipc_readonly'),
  snapshot: {
    sosSignal: {
      status: 'cancel_requested',
      humanReviewRequired: true,
    },
  },
  now,
});
assert.ok(sosCancel.sosBanner);
assert.strictEqual(sosCancel.sosBanner.humanReviewRequired, true);
assert.ok(sosCancel.sosBanner.message.includes('review-only'));

const panelSource = fs.readFileSync(path.join(process.cwd(), 'components/garmin/GarminInreachVisibilityPanel.tsx'), 'utf8');
assert.ok(panelSource.includes('if (!model) return null'), 'Panel should hide when disabled.');
assert.ok(panelSource.includes('testID="garmin-readonly-state"'), 'Read-only state should be rendered without command controls.');
assert.ok(panelSource.includes('testID="garmin-command-controls"'), 'Command controls should be isolated in command mode.');
assert.ok(panelSource.includes('testID="garmin-command-confirm"'), 'Command requests should require a confirmation modal.');
assert.ok(panelSource.includes('May take up to 20 minutes. Charges may apply.'), 'Command helper copy should warn about timing and charges.');
assert.ok(panelSource.includes('DEMO / SYNTHETIC'), 'Demo MapShare state should be visibly labeled.');
assert.ok(panelSource.includes('testID="garmin-sos-review-banner"'), 'SOS signals should render a visible review state.');

const expeditionSource = fs.readFileSync(path.join(process.cwd(), 'components/dashboard/ExpeditionTab.tsx'), 'utf8');
assert.ok(expeditionSource.includes('GarminInreachVisibilityPanel'), 'Expedition tab should include the Garmin visibility panel.');

console.log('Garmin/inReach UI visibility tests passed.');
