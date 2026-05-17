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
  createGarminInreachCommandClient,
  createGarminInreachConfirmation,
  createSafeGarminInreachCommandLogPayload,
  isGarminInreachCommandClientEnabled,
  validateGarminInreachCommandMessage,
} = loadTypeScriptModule('lib/garmin/garminInreachCommandClient.ts');
const { resolveGarminInreachConfigFromEnv } = loadTypeScriptModule('lib/garmin/garminInreachConfig.ts');

function config(mode = 'ipc_command') {
  return resolveGarminInreachConfigFromEnv({
    GARMIN_INREACH_ENABLED: mode === 'off' ? 'false' : 'true',
    GARMIN_INREACH_MODE: mode,
    GARMIN_INREACH_IPC_BASE_URL: 'https://ipc.example.test',
    GARMIN_INREACH_IPC_API_KEY: 'super-secret-api-key',
  });
}

function response(status) {
  return new Response(JSON.stringify({ ok: status >= 200 && status < 300 }), {
    status,
    headers: status === 429 ? { 'retry-after': '45' } : {},
  });
}

const baseCommand = {
  context: {
    expeditionId: 'expedition-1',
    deviceIdentifier: '300434123456789',
    operatorUserId: 'operator-1',
  },
  message: 'Check in when stopped.',
};
const confirmation = createGarminInreachConfirmation({
  operatorUserId: 'operator-1',
  confirmationToken: 'confirmed-token',
  confirmedAt: '2026-04-28T21:00:00Z',
});

assert.strictEqual(isGarminInreachCommandClientEnabled(config('off')), false);
assert.strictEqual(isGarminInreachCommandClientEnabled(config('mapshare')), false);
assert.strictEqual(isGarminInreachCommandClientEnabled(config('ipc_readonly')), false);
assert.strictEqual(isGarminInreachCommandClientEnabled(config('ipc_command')), true);

assert.strictEqual(validateGarminInreachCommandMessage('short message').ok, true);
const longMessage = 'x'.repeat(161);
const validation = validateGarminInreachCommandMessage(longMessage);
assert.strictEqual(validation.ok, false);
assert.ok(validation.suggestion.includes('Shorten'));

(async () => {
  for (const mode of ['off', 'mapshare', 'ipc_readonly']) {
    let called = false;
    const client = createGarminInreachCommandClient({
      config: config(mode),
      fetchImpl: async () => {
        called = true;
        return response(200);
      },
      now: () => new Date('2026-04-28T21:00:00Z'),
    });
    const result = await client.sendShortTextMessage({ ...baseCommand, confirmation });
    assert.strictEqual(result.ok, false, `${mode} should reject commands`);
    assert.strictEqual(result.status, 'rejected');
    assert.strictEqual(called, false, `${mode} should not call fetch`);
  }

  let called = false;
  let auditRecords = [];
  let client = createGarminInreachCommandClient({
    config: config('ipc_command'),
    fetchImpl: async () => {
      called = true;
      return response(200);
    },
    auditSink: { record: (record) => auditRecords.push(record) },
    now: () => new Date('2026-04-28T21:00:00Z'),
  });
  let result = await client.sendShortTextMessage(baseCommand);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, 'rejected');
  assert.ok(result.userMessage.includes('explicit operator confirmation'));
  assert.strictEqual(called, false, 'Missing confirmation must not call fetch');
  assert.strictEqual(auditRecords.length, 1);

  result = await client.sendShortTextMessage({
    ...baseCommand,
    confirmation,
    context: {
      ...baseCommand.context,
      messageDraftedBy: 'ai_agent',
    },
  });
  assert.strictEqual(result.ok, false);
  assert.ok(result.userMessage.includes('AI may draft text'));
  assert.strictEqual(called, false, 'AI-drafted message without human ownership must not send');

  result = await client.sendShortTextMessage({
    ...baseCommand,
    confirmation,
    message: longMessage,
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, 'validation_error');
  assert.ok(result.validationSuggestion.includes('Shorten'));

  let lastInit = null;
  client = createGarminInreachCommandClient({
    config: config('ipc_command'),
    fetchImpl: async (url, init) => {
      lastInit = { url, init };
      return response(200);
    },
    auditSink: { record: (record) => auditRecords.push(record) },
    now: () => new Date('2026-04-28T21:01:00Z'),
  });
  result = await client.sendShortTextMessage({ ...baseCommand, confirmation });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.status, 'queued_requested');
  assert.strictEqual(result.queued, true);
  assert.strictEqual(result.delivered, false);
  assert.ok(result.warning.includes('may incur Garmin/Iridium plan charges'));
  assert.ok(lastInit.url.includes('/commands/send-text-message'));
  assert.ok(!JSON.stringify(result).includes('300434123456789'), 'Result must not expose full IMEI');
  assert.ok(!JSON.stringify(auditRecords).includes('super-secret-api-key'), 'Audit must not include IPC API key');
  assert.ok(!JSON.stringify(auditRecords).includes('300434123456789'), 'Audit must not include full IMEI');

  client = createGarminInreachCommandClient({
    config: config('ipc_command'),
    fetchImpl: async () => response(422),
    now: () => new Date('2026-04-28T21:02:00Z'),
  });
  result = await client.sendReferencePoint({
    context: baseCommand.context,
    confirmation,
    latitude: 38.78,
    longitude: -121.2,
    label: 'Regroup',
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, 'validation_error');
  assert.strictEqual(result.httpStatus, 422);
  assert.ok(result.validationSuggestion.includes('Review'));

  client = createGarminInreachCommandClient({
    config: config('ipc_command'),
    fetchImpl: async () => response(429),
    now: () => new Date('2026-04-28T21:03:00Z'),
  });
  result = await client.requestCurrentLocation({
    context: baseCommand.context,
    confirmation,
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, 'rate_limited');
  assert.strictEqual(result.retryAfterSeconds, 45);
  assert.ok(result.userMessage.includes('Wait 45 seconds'));

  client = createGarminInreachCommandClient({
    config: config('ipc_command'),
    fetchImpl: async () => response(200),
    now: () => new Date('2026-04-28T21:04:00Z'),
  });
  result = await client.startTracking({ context: baseCommand.context, confirmation });
  assert.strictEqual(result.ok, true);
  result = await client.stopTracking({ context: baseCommand.context, confirmation });
  assert.strictEqual(result.ok, true);
  result = await client.changeTrackingInterval({
    context: baseCommand.context,
    confirmation,
    trackingIntervalMinutes: 15,
  });
  assert.strictEqual(result.ok, true);
  result = await client.queryLastKnownLocation({ context: baseCommand.context });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.safeRequest.method, 'GET');

  const safe = JSON.stringify(createSafeGarminInreachCommandLogPayload({
    ipcApiKey: 'super-secret-api-key',
    authorization: 'Bearer secret',
    deviceIdentifier: '300434123456789',
  }));
  assert.ok(!safe.includes('super-secret-api-key'));
  assert.ok(!safe.includes('Bearer secret'));
  assert.ok(!safe.includes('300434123456789'));
  assert.ok(safe.includes('inReach ***6789'));

  console.log('Garmin/inReach command client tests passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
