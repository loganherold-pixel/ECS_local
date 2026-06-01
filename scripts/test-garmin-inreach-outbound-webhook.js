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
  createMemoryGarminInreachOutboundWebhookStore,
  createSafeGarminIpcLogPayload,
  getGarminIpcMessageType,
  handleGarminInreachOutboundWebhook,
  parseGarminIpcOutboundPayload,
} = loadTypeScriptModule('lib/garmin/garminInreachOutboundWebhook.ts');
const { resolveGarminInreachConfigFromEnv } = loadTypeScriptModule('lib/garmin/garminInreachConfig.ts');

function config(mode = 'ipc_readonly') {
  return resolveGarminInreachConfigFromEnv({
    GARMIN_INREACH_ENABLED: 'true',
    GARMIN_INREACH_MODE: mode,
    GARMIN_INREACH_WEBHOOK_STATIC_TOKEN: 'test-token',
  });
}

function request(body, headers = {}) {
  return new Request('https://ecs.test/integrations/garmin/inreach/outbound', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-garmin-inreach-token': 'test-token',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

async function json(response) {
  return response.json();
}

assert.strictEqual(getGarminIpcMessageType(0), 'position_report');
assert.strictEqual(getGarminIpcMessageType(2), 'locate_response');
assert.strictEqual(getGarminIpcMessageType(3), 'free_text_message');
assert.strictEqual(getGarminIpcMessageType(4), 'sos_declared_incident_signal');
assert.strictEqual(getGarminIpcMessageType(6), 'sos_confirmed_signal');
assert.strictEqual(getGarminIpcMessageType(7), 'sos_cancel_signal_review');
assert.strictEqual(getGarminIpcMessageType(8), 'reference_point');
assert.strictEqual(getGarminIpcMessageType(10), 'tracking_started');
assert.strictEqual(getGarminIpcMessageType(11), 'tracking_interval_changed');
assert.strictEqual(getGarminIpcMessageType(12), 'tracking_stopped');
assert.strictEqual(getGarminIpcMessageType(14), 'puck_check_in_message');
assert.strictEqual(getGarminIpcMessageType(15), 'puck_check_in_message');
assert.strictEqual(getGarminIpcMessageType(16), 'puck_check_in_message');
assert.strictEqual(getGarminIpcMessageType(17), 'mapshare_message');
assert.strictEqual(getGarminIpcMessageType(20), 'mail_check');
assert.strictEqual(getGarminIpcMessageType(21), 'alive_check');
assert.strictEqual(getGarminIpcMessageType(24), 'predefined_message');
assert.strictEqual(getGarminIpcMessageType(63), 'predefined_message');
assert.strictEqual(getGarminIpcMessageType(64), 'binary_media_payload');
assert.strictEqual(getGarminIpcMessageType(65), 'pingback_response');
assert.strictEqual(getGarminIpcMessageType(66), 'binary_media_payload');
assert.strictEqual(getGarminIpcMessageType(67), 'binary_media_payload');
assert.strictEqual(getGarminIpcMessageType(999), 'garmin_unknown_event');

const v2Payload = {
  Version: '2.0',
  Events: [
    {
      EventId: 'v2-position-1',
      IMEI: '300434123456789',
      MessageCode: 0,
      Latitude: 38.7807,
      Longitude: -121.2076,
      Timestamp: '2026-04-28T18:00:00Z',
      BatteryPercent: 88,
      UnknownFutureField: { shouldNotFail: true },
    },
    {
      EventId: 'v2-low-battery-1',
      IMEI: '300434123456789',
      MessageCode: 21,
      Timestamp: '2026-04-28T18:01:00Z',
      BatteryPercent: 12,
    },
  ],
};

const v4Payload = {
  Version: '4.0',
  Events: [
    {
      ID: 'v4-message-1',
      imei: '300434987654321',
      messageCode: 3,
      text: 'Holding at waypoint. No reply required.',
      latitude: 39.1,
      longitude: -120.9,
      timestamp: '2026-04-28T19:00:00Z',
      nested: { unknown: 'ok' },
    },
    {
      ID: 'v4-sos-1',
      imei: '300434987654321',
      messageCode: 4,
      timestamp: '2026-04-28T19:05:00Z',
      latitude: 39.2,
      longitude: -120.8,
    },
  ],
};

let parsed = parseGarminIpcOutboundPayload(v2Payload, new Date('2026-04-28T18:02:00Z'));
assert.strictEqual(parsed.ok, true);
assert.strictEqual(parsed.events.length, 2);
assert.strictEqual(parsed.events[0].normalizedType, 'position_report');
assert.strictEqual(parsed.events[0].dispatch.liveEvent.type, 'team_ping');
assert.strictEqual(parsed.events[1].normalizedType, 'alive_check');
assert.strictEqual(parsed.events[1].lowBattery, true);
assert.strictEqual(parsed.events[1].dispatch.liveEvent.type, 'system');
assert.strictEqual(parsed.events[1].dispatch.liveEvent.severity, 'watch');

parsed = parseGarminIpcOutboundPayload(v4Payload, new Date('2026-04-28T19:06:00Z'));
assert.strictEqual(parsed.ok, true);
assert.strictEqual(parsed.events[0].normalizedType, 'free_text_message');
assert.strictEqual(parsed.events[0].dispatch.liveEvent.type, 'team_ping');
assert.strictEqual(parsed.events[1].normalizedType, 'sos_declared_incident_signal');
assert.strictEqual(parsed.events[1].requiresHumanReview, true);
assert.strictEqual(parsed.events[1].dispatch.liveEvent.type, 'assistance');
assert.strictEqual(parsed.events[1].dispatch.liveEvent.severity, 'critical');
assert.strictEqual(parsed.events[1].dispatch.cadEvent.metadata.sosAutomationBlocked, true);

const safeLog = JSON.stringify(createSafeGarminIpcLogPayload(v4Payload));
assert.ok(!safeLog.includes('300434987654321'), 'Safe logs should mask raw IMEI.');
assert.ok(safeLog.includes('inReach ***4321'), 'Safe logs should include masked IMEI.');

(async () => {
  const disabledStore = createMemoryGarminInreachOutboundWebhookStore();
  let response = await handleGarminInreachOutboundWebhook(request(v2Payload), {
    config: resolveGarminInreachConfigFromEnv({
      GARMIN_INREACH_ENABLED: 'false',
      GARMIN_INREACH_MODE: 'ipc_command',
      GARMIN_INREACH_WEBHOOK_STATIC_TOKEN: 'test-token',
    }),
    store: disabledStore,
  });
  assert.strictEqual(response.status, 200);
  let body = await json(response);
  assert.strictEqual(body.accepted, false);
  assert.strictEqual(body.disabled, true);
  assert.strictEqual(disabledStore.list().length, 0, 'Disabled endpoint must not enqueue.');

  response = await handleGarminInreachOutboundWebhook(request(v2Payload, { 'x-garmin-inreach-token': 'wrong' }), {
    config: config('ipc_readonly'),
    store: createMemoryGarminInreachOutboundWebhookStore(),
  });
  assert.strictEqual(response.status, 401);

  response = await handleGarminInreachOutboundWebhook(request({ Version: '2.0', Events: 'bad' }), {
    config: config('ipc_readonly'),
    store: createMemoryGarminInreachOutboundWebhookStore(),
  });
  assert.strictEqual(response.status, 400);

  const store = createMemoryGarminInreachOutboundWebhookStore();
  response = await handleGarminInreachOutboundWebhook(request(v2Payload), {
    config: config('ipc_readonly'),
    store,
    now: () => new Date('2026-04-28T18:02:00Z'),
  });
  assert.strictEqual(response.status, 200);
  body = await json(response);
  assert.strictEqual(body.enqueuedCount, 2);
  assert.strictEqual(body.duplicateCount, 0);
  assert.strictEqual(store.list().length, 2);

  response = await handleGarminInreachOutboundWebhook(request(v2Payload), {
    config: config('ipc_readonly'),
    store,
    now: () => new Date('2026-04-28T18:03:00Z'),
  });
  body = await json(response);
  assert.strictEqual(body.enqueuedCount, 0);
  assert.strictEqual(body.duplicateCount, 2);
  assert.strictEqual(store.list().length, 2, 'Duplicate retry must not create additional records.');

  const commandStore = createMemoryGarminInreachOutboundWebhookStore();
  response = await handleGarminInreachOutboundWebhook(request(v4Payload, {
    authorization: 'Bearer test-token',
    'x-garmin-inreach-token': '',
  }), {
    config: config('ipc_command'),
    store: commandStore,
    now: () => new Date('2026-04-28T19:06:00Z'),
  });
  body = await json(response);
  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.enqueuedCount, 2);
  assert.strictEqual(commandStore.list()[1].normalizedEvent.requiresHumanReview, true);

  console.log('Garmin/inReach outbound webhook tests passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
