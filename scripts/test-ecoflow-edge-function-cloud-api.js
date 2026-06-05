const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function has(content, needle, label) {
  assert(content.includes(needle), `${label} must include ${needle}`);
}

function lacks(content, needle, label) {
  assert(!content.includes(needle), `${label} must not include ${needle}`);
}

const edge = read('supabase/functions/ecoflow/index.ts');
const provider = read('src/power/cloud/providers/EcoFlowCloudProvider.ts');
const cloudConnection = read('lib/ecoflowCloudConnection.ts');
const diagnostics = read('lib/ecoflowConnectionDiagnostics.ts');
const scannerDiscovery = read('lib/ecoflowUnifiedScannerDiscovery.ts');
const unified = read('lib/useUnifiedDeviceConnections.ts');
const unauthorizedHelper = read('lib/ecoflowUnauthorizedDevice.ts');
const liveDeviceTestPlan = read('docs/blu-live-device-test-plan.md');

for (const fragment of [
  '| "bleAuthPayload"',
  'source: "ecoflow-cloud"',
  'phase,',
  'error,',
  'authRequired',
  'deviceUnauthorized',
  'retryable',
  'MISSING_ECOFLOW_CREDENTIALS',
  'ECOFLOW_AUTH_REQUIRED',
  'ECOFLOW_DEVICE_UNAUTHORIZED',
  'ECOFLOW_DEVICE_OFFLINE',
  'ECOFLOW_CLOUD_UNAVAILABLE',
  'ECOFLOW_NORMALIZE_ERROR',
  'ECOFLOW_API_BASE_URL',
  'ECOFLOW_API_HOST',
  '/iot-open/sign/device/list',
  '/iot-open/sign/device/quota/all',
  '/iot-open/sign/certification',
  "action === \"mqttCertification\"",
  "action === \"mqttTelemetry\"",
  "action === \"bleAuthPayload\"",
  'ECOFLOW_BLE_ACCOUNT_USER_ID',
  'ECOFLOW_BLE_AUTH_USER_ID_MISSING',
  'ECOFLOW_BLE_AUTH_DEVICE_NOT_FOUND',
  'authPayloadFingerprint',
  'handling: "session_only_do_not_log_raw_payload"',
  "ecoflow_mqtt_telemetry_latest",
  'certificateAccountFingerprint',
  'passwordPresent',
  'accessKey, timestamp, nonce, sign',
  'safeSnippet(bodyText, secrets)',
]) {
  has(edge, fragment, 'EcoFlow edge function safe cloud response contract');
}

for (const forbidden of [
  'console.log',
  'console.error',
  'ECOFLOW_ACCESS_KEY=',
  'ECOFLOW_SECRET_KEY=',
  'certificatePassword:',
  'JSON.stringify(json?.data',
  '[ecoflow telemetry] sample',
]) {
  lacks(edge, forbidden, 'EcoFlow edge function secret/log hygiene');
}

for (const state of [
  '"authRequired"',
  '"deviceUnauthorized"',
  '"publicApiAuthorizationPending"',
  '"cloudUnavailable"',
  '"deviceOffline"',
  '"cloudPolling"',
  '"cloudStale"',
]) {
  has(provider + cloudConnection + diagnostics + unified, state, 'EcoFlow cloud client state mapping');
}

for (const fragment of [
  'isEcoFlowPublicApiAuthorizationBlockedError',
  'describeEcoFlowPublicApiAuthorizationBlock',
  'lastCloudFailure',
  'checkMqttCertification',
  'EcoFlowMqttCertificationStatus',
  'pollMqttTelemetryFallback',
  "action: 'mqttTelemetry'",
  'failureState',
  'classifyEcoFlowCloudFailureState',
  'normalizeEdgeError',
  'throw new Error(errorMessage)',
  'function readTelemetryEntryKey',
  'function readTelemetryEntryValue',
  'if (Array.isArray(value))',
  'target.set(normalizeEcoFlowTelemetryKey(key), entryValue)',
  '"bmsMaster.inputWatts"',
  '"bmsMaster.outputWatts"',
  'mqtt certification probe',
  'credentialExposure: "server_side_only"',
]) {
  has(provider, fragment, 'EcoFlow provider should preserve edge failure state');
}

for (const fragment of [
  'publicApiAuthorizationPending',
  'cloudState: EcoFlowCloudClientState | null',
  'classifyEcoFlowCloudClientState',
  'isEcoFlowCloudAuthState',
  'const cloudState = provider.lastCloudFailure',
  'requiresCloudAuth: authFailure',
]) {
  has(cloudConnection, fragment, 'EcoFlow cloud connection should map failures into BLU state');
}

for (const fragment of [
  'cloudState?: EcoFlowCloudClientState | null',
  'cloudState: input.cloudState ?? null',
]) {
  has(diagnostics, fragment, 'EcoFlow diagnostics should retain normalized cloud state');
}

has(scannerDiscovery, 'keys not configured', 'EcoFlow scanner discovery should classify missing credentials as auth-required');
has(scannerDiscovery, 'isEcoFlowPublicApiAuthorizationBlockedError', 'EcoFlow scanner discovery should classify EcoFlow code 1006 as cloud auth');
has(unified, "cloudState === 'authRequired'", 'Device Connections model should surface auth-required cloud state');
has(unified, "cloudState === 'publicApiAuthorizationPending'", 'Device Connections model should surface EcoFlow public API authorization pending state');
has(unified, "cloudState === 'cloudStale'", 'Device Connections model should surface stale cloud state');

for (const fragment of [
  '1006',
  'public_api_authorization_pending',
  'DELTA 3 1500',
  'DELTA Mini',
  'Alternator Charger',
  'current EcoFlow developer app',
]) {
  has(edge + provider + cloudConnection + diagnostics + scannerDiscovery + unified + unauthorizedHelper, fragment, 'EcoFlow 1006 diagnostics contract');
}

for (const fragment of [
  'EcoFlow code 1006',
  'DELTA 3 1500',
  'DELTA Mini',
  'Alternator Charger',
  'server-side',
]) {
  has(liveDeviceTestPlan, fragment, 'EcoFlow public API authorization troubleshooting documentation');
}

console.log('EcoFlow edge function/cloud API checks passed.');
