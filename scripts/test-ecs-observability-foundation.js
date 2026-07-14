const assert = require('assert/strict');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const React = require('react');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
}

require.extensions['.ts'] = compileTypeScript;
require.extensions['.tsx'] = compileTypeScript;

global.__DEV__ = true;

const originalLoad = Module._load;
let boundaryReport = null;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return {
      Dimensions: { get: () => ({ width: 390, height: 844 }) },
      Platform: { OS: 'web' },
      StyleSheet: { create: (styles) => styles },
      Text: 'Text',
      TouchableOpacity: 'TouchableOpacity',
      View: 'View',
    };
  }
  if (request.endsWith('/SafeIcon') || request === './SafeIcon') {
    return { SafeIcon: 'SafeIcon' };
  }
  if (request.endsWith('/ecsIssueIntelligence') || request === '../lib/ecsIssueIntelligence') {
    return { reportLayoutFailure: (input) => { boundaryReport = input; } };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const {
  ECS_ERROR_KINDS,
  classifyECSErrorKind,
  createECSErrorDiagnostic,
  getDefaultECSErrorPolicy,
  getECSErrorUserCopy,
} = require(path.join(root, 'lib', 'observability', 'ecsErrorContract.ts'));
const {
  sanitizeECSDiagnosticText,
  sanitizeECSDiagnosticValue,
} = require(path.join(root, 'lib', 'observability', 'ecsDiagnosticRedaction.ts'));
const {
  evaluateECSObservabilityTelemetryGate,
} = require(path.join(root, 'lib', 'observability', 'ecsObservabilityTelemetryGate.ts'));
const {
  buildECSSupportSnapshot,
  formatECSSupportSnapshotJson,
} = require(path.join(root, 'lib', 'observability', 'ecsSupportSnapshot.ts'));
const { ecsLog } = require(path.join(root, 'lib', 'ecsLogger.ts'));

const REQUIRED_KINDS = [
  'validation',
  'permission',
  'configuration',
  'provider',
  'network',
  'timeout',
  'persistence',
  'migration',
  'native_hardware',
  'realtime',
  'degraded_data',
  'invariant_violation',
  'unexpected',
];
assert.deepStrictEqual(ECS_ERROR_KINDS, REQUIRED_KINDS, 'The ECS error taxonomy must remain explicit and complete.');

assert.strictEqual(classifyECSErrorKind({ status: 403 }), 'permission');
assert.strictEqual(classifyECSErrorKind({ name: 'TimeoutError' }), 'timeout');
assert.strictEqual(classifyECSErrorKind(new TypeError('Network request failed')), 'network');
assert.strictEqual(classifyECSErrorKind(new Error('unrecognized failure')), 'unexpected');
assert.strictEqual(getDefaultECSErrorPolicy('network').retryability, 'retryable');
assert.strictEqual(getDefaultECSErrorPolicy('validation').retryability, 'not_retryable');

const operatorError = createECSErrorDiagnostic({
  kind: 'provider',
  domain: 'weather',
  operation: 'provider_refresh',
  code: 'weather-provider-refresh-failed',
  sourceState: 'cached',
  requestId: 'route=38.123456,-121.654321&token=secret-token',
  correlationId: 'correlation-sensitive-value',
  featureFlag: 'weather_provider',
  context: {
    provider: 'openweather',
    accessToken: 'secret-access-token',
  },
}, new Error('Provider failed for admin@example.com at 38.123456,-121.654321'));

assert.strictEqual(operatorError.code, 'WEATHER_PROVIDER_REFRESH_FAILED');
assert.strictEqual(operatorError.retryability, 'retryable');
assert.strictEqual(operatorError.recoverability, 'automatic');
assert.ok(operatorError.requestId.startsWith('request_'), 'Request IDs must be safe correlation tokens.');
assert.ok(operatorError.correlationId.startsWith('correlation_'), 'Correlation IDs must be safe tokens.');
assert.ok(!JSON.stringify(operatorError).includes('secret-access-token'));
assert.ok(!JSON.stringify(operatorError).includes('38.123456'));

const userCopy = getECSErrorUserCopy(operatorError);
assert.strictEqual(userCopy.title, 'Weather data temporarily unavailable');
assert.ok(!JSON.stringify(userCopy).includes('admin@example.com'), 'User copy must not reuse raw operator diagnostics.');
assert.ok(!JSON.stringify(userCopy).includes('secret'), 'User copy must remain independent from sensitive context.');

const cyclic = { safeLabel: 'provider unavailable' };
cyclic.self = cyclic;
const rawPayload = {
  email: 'operator@example.com',
  userId: '123e4567-e89b-12d3-a456-426614174000',
  accessToken: 'secret-access-token',
  refresh_token: 'secret-refresh-token',
  authorization: 'Bearer secret-bearer-token',
  password: 'secret-password',
  apiKey: 'provider-api-key',
  session: { access_token: 'session-token' },
  providerResponse: { raw: 'complete-provider-payload' },
  restrictedMemberPosition: { latitude: 38.123456, longitude: -121.654321 },
  convoyLocationHistory: [{ lat: 38.123456, lon: -121.654321 }],
  completeTripTrace: [[38.123456, -121.654321]],
  rawBlePayload: 'aabbccddeeff00112233445566778899',
  nested: cyclic,
  safeLabel: 'provider unavailable',
};
const sanitized = sanitizeECSDiagnosticValue(rawPayload);
const sanitizedText = JSON.stringify(sanitized);

for (const forbidden of [
  'operator@example.com',
  '123e4567-e89b-12d3-a456-426614174000',
  'secret-access-token',
  'secret-refresh-token',
  'secret-bearer-token',
  'secret-password',
  'provider-api-key',
  'session-token',
  'complete-provider-payload',
  '38.123456',
  '-121.654321',
  'aabbccddeeff00112233445566778899',
]) {
  assert.strictEqual(sanitizedText.includes(forbidden), false, `Diagnostics must redact ${forbidden}.`);
}
assert.strictEqual(sanitized.safeLabel, 'provider unavailable');
assert.match(sanitizeECSDiagnosticText('token=abc123&latitude=38.123456'), /\[redacted/);

function captureConsole(callback) {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  const output = { logs: [], warns: [], errors: [] };
  console.log = (...args) => output.logs.push(args);
  console.warn = (...args) => output.warns.push(args);
  console.error = (...args) => output.errors.push(args);
  try {
    callback();
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }
  return output;
}

ecsLog.clear();
const capturedFailures = captureConsole(() => {
  const first = ecsLog.captureFailure({
    kind: 'network',
    domain: 'offline_sync',
    operation: 'replay',
    code: 'OFFLINE_REPLAY_NETWORK_FAILURE',
    context: rawPayload,
  }, new Error('Network failed with token secret-runtime-token'), {
    nowMs: 1_000,
    dedupeWindowMs: 30_000,
  });
  const duplicate = ecsLog.captureFailure({
    kind: 'network',
    domain: 'offline_sync',
    operation: 'replay',
    code: 'OFFLINE_REPLAY_NETWORK_FAILURE',
    context: rawPayload,
  }, new Error('Network failed with token secret-runtime-token'), {
    nowMs: 1_500,
    dedupeWindowMs: 30_000,
  });
  const afterWindow = ecsLog.captureFailure({
    kind: 'network',
    domain: 'offline_sync',
    operation: 'replay',
    code: 'OFFLINE_REPLAY_NETWORK_FAILURE',
    context: rawPayload,
  }, new Error('Network failed with token secret-runtime-token'), {
    nowMs: 31_500,
    dedupeWindowMs: 30_000,
  });

  assert.strictEqual(first.emitted, true);
  assert.strictEqual(duplicate.emitted, false);
  assert.strictEqual(afterWindow.emitted, true);
  assert.strictEqual(afterWindow.suppressedRepeats, 1);
});
assert.strictEqual(capturedFailures.warns.length, 2, 'Repeated failures should emit once per dedupe window.');
assert.strictEqual(JSON.stringify(capturedFailures).includes('secret-runtime-token'), false);
assert.strictEqual(JSON.stringify(capturedFailures).includes('38.123456'), false);
assert.strictEqual(ecsLog.getDiagnostics().suppressedFailureCount, 1);

for (let index = 0; index < 100; index += 1) {
  ecsLog.breadcrumb({
    domain: 'startup',
    operation: 'phase_transition',
    code: `STARTUP_PHASE_${index}`,
    context: index === 99 ? rawPayload : { index },
  });
}
const breadcrumbs = ecsLog.getRecentBreadcrumbs(100);
assert.strictEqual(breadcrumbs.length, 80, 'Breadcrumb history must remain bounded.');
assert.strictEqual(JSON.stringify(breadcrumbs).includes('secret-access-token'), false);

ecsLog.clear();
global.__DEV__ = false;
global.__ECS_LOG_LEVEL = 'debug';
global.ECS_DEBUG_WEATHER = true;
let productionDebug = captureConsole(() => {
  ecsLog.debug('WEATHER', 'production_debug_should_be_suppressed', { safe: true });
  ecsLog.dev('WEATHER', 'production_dev_should_be_suppressed', { safe: true }, {
    debugFlag: 'ECS_DEBUG_WEATHER',
  });
});
assert.strictEqual(productionDebug.logs.length, 0, 'Production debug output must fail closed.');
assert.strictEqual(ecsLog.count(), 0, 'Suppressed production debug entries must not churn the buffer.');

global.__ECS_SUPPORT_DIAGNOSTICS_ENABLED = true;
global.__ECS_SUPPORT_DIAGNOSTICS_APPROVED = true;
productionDebug = captureConsole(() => {
  ecsLog.dev('WEATHER', 'approved_support_debug', { safe: true }, {
    debugFlag: 'ECS_DEBUG_WEATHER',
  });
});
assert.strictEqual(productionDebug.logs.length, 1, 'Approved support diagnostics may emit when explicitly enabled.');
delete global.__ECS_SUPPORT_DIAGNOSTICS_ENABLED;
delete global.__ECS_SUPPORT_DIAGNOSTICS_APPROVED;
delete global.__ECS_LOG_LEVEL;
delete global.ECS_DEBUG_WEATHER;
global.__DEV__ = true;

assert.deepStrictEqual(
  evaluateECSObservabilityTelemetryGate({
    backendConfigured: true,
    transportEnabled: false,
    privacyApproved: false,
    userConsented: false,
    manualSubmission: false,
  }),
  { enabled: false, reason: 'transport_disabled' },
);
assert.deepStrictEqual(
  evaluateECSObservabilityTelemetryGate({
    backendConfigured: true,
    transportEnabled: true,
    privacyApproved: true,
    userConsented: true,
    manualSubmission: false,
  }),
  { enabled: true, reason: 'enabled' },
);
assert.deepStrictEqual(
  evaluateECSObservabilityTelemetryGate({
    backendConfigured: true,
    transportEnabled: true,
    privacyApproved: true,
    userConsented: false,
    manualSubmission: true,
  }),
  { enabled: true, reason: 'manual_submission' },
);

const supportSnapshot = buildECSSupportSnapshot({
  generatedAt: '2026-07-13T12:00:00.000Z',
  featureArea: 'Navigate',
  runtime: {
    online: false,
    sourceState: 'cached',
  },
  health: {
    outstandingJobs: 2,
    activeSubscriptions: 4,
    cacheSizes: { weather: 3, logger: 12 },
    lastSuccessfulRefresh: { weather: '2026-07-13T11:55:00.000Z' },
  },
  telemetryGate: { enabled: false, reason: 'user_consent_missing' },
  recentEvents: [{ message: 'Failure at 38.123456,-121.654321', details: rawPayload }],
  breadcrumbs: [{ domain: 'navigate', operation: 'route_activation', context: rawPayload }],
  extra: rawPayload,
});
const formattedSnapshot = formatECSSupportSnapshotJson(supportSnapshot);
assert.strictEqual(supportSnapshot.health.outstandingJobs, 2);
assert.strictEqual(supportSnapshot.health.activeSubscriptions, 4);
assert.strictEqual(supportSnapshot.health.cacheSizes.weather, 3);
assert.strictEqual(formattedSnapshot.includes('secret-access-token'), false);
assert.strictEqual(formattedSnapshot.includes('38.123456'), false);
assert.strictEqual(formattedSnapshot.includes('complete-provider-payload'), false);

try {
  const WidgetErrorBoundary = require(path.join(root, 'components', 'WidgetErrorBoundary.tsx')).default;
  const derived = WidgetErrorBoundary.getDerivedStateFromError(new Error('widget token=private-token'));
  assert.strictEqual(derived.hasError, true, 'A widget failure must be contained by the feature boundary.');

  const instance = new WidgetErrorBoundary({
    children: React.createElement('Child'),
    widgetType: 'weather',
    slotIndex: 2,
  });
  instance.componentDidCatch(new Error('widget token=private-token'), {
    componentStack: '\n at SecretComponent (38.123456,-121.654321)',
  });
  assert.strictEqual(boundaryReport.ecsArea, 'widgets');
  assert.strictEqual(JSON.stringify(ecsLog.getRecentLogs()).includes('private-token'), false);
  assert.strictEqual(JSON.stringify(ecsLog.getRecentLogs()).includes('38.123456'), false);
} finally {
  Module._load = originalLoad;
}

console.log('ECS observability foundation checks passed.');
