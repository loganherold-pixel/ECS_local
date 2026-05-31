const fs = require('fs');
const path = require('path');
const nodeAssert = require('assert');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const bridge = read('scripts/ecoflow-mqtt-bridge.js');
const probe = read('scripts/probe-ecoflow-mqtt.js');
const edge = read('supabase/functions/ecoflow/index.ts');
const provider = read('src/power/cloud/providers/EcoFlowCloudProvider.ts');
const migration = read('supabase/migrations/025_ecoflow_mqtt_telemetry_latest.sql');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

for (const fragment of [
  "require('../lib/ecoflowMqttQuotaTelemetry.ts')",
  "normalizeEcoFlowMqttQuotaTelemetry",
  "ECS_SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  ".env.local",
  "sb_secret_ API key",
  "describeSupabaseKey",
  "assertSupabaseServiceAccess",
  "project mismatch",
  "DEFAULT_POWER_QUOTAS",
  "'pd.pv1InputWatts'",
  "'pd.pv2InputWatts'",
  "'pd.pvHInputWatts'",
  "'pd.pvLInputWatts'",
  "'pd.powGetPvH'",
  "'pd.powGetPvL'",
  "'mppt.carState'",
  "'mppt.cfgDcChgCurrent'",
  "activeRequested",
  "passiveRequested",
  "--active-get",
  "getForwardedArgv",
  "publishGetRequests",
  "published get requests",
  "quietMs",
  "quotaParamState",
  "mergeEcoFlowMqttQuotaPayload",
  "mergedPayload",
  "hasCorePowerTelemetry",
  "ignored weak telemetry frame",
  "SOLAR=${solar.watts ?? '?'}W",
  "ecoflow_mqtt_telemetry_latest",
  ".upsert(row, { onConflict: 'provider_id,device_id' })",
  "source: 'mqtt_quota'",
  "tls.connect",
]) {
  assert(bridge.includes(fragment), `EcoFlow MQTT bridge must include ${fragment}`);
}

for (const forbidden of [
  'certificatePassword:',
  'console.log(password',
  'console.log(cert',
  'console.log(msg.payload',
]) {
  assert(!bridge.includes(forbidden), `EcoFlow MQTT bridge must not expose ${forbidden}`);
}

for (const fragment of [
  "'mppt.carState'",
  "'mppt.cfgDcChgCurrent'",
  "carState",
  "cfgDcChgCurrent",
]) {
  assert(probe.includes(fragment), `EcoFlow MQTT probe must include ${fragment}`);
}

for (const fragment of [
  'create table if not exists public.ecoflow_mqtt_telemetry_latest',
  'telemetry jsonb not null',
  'alter table public.ecoflow_mqtt_telemetry_latest enable row level security',
  'revoke all on table public.ecoflow_mqtt_telemetry_latest from anon, authenticated',
  'grant select, insert, update, delete on table public.ecoflow_mqtt_telemetry_latest to service_role',
  'primary key (provider_id, device_id)',
]) {
  assert(migration.includes(fragment), `EcoFlow MQTT telemetry migration must include ${fragment}`);
}

for (const fragment of [
  '"mqttTelemetry"',
  'handleMqttTelemetry',
  'ECOFLOW_MQTT_BRIDGE_UNAVAILABLE',
  'ECOFLOW_MQTT_TELEMETRY_UNAVAILABLE',
  'SUPABASE_SERVICE_ROLE_KEY',
  'safeSnippet(text, [service.serviceKey])',
]) {
  assert(edge.includes(fragment), `EcoFlow edge function MQTT telemetry read must include ${fragment}`);
}

assert(
  edge.indexOf('if (action === "mqttTelemetry")') < edge.indexOf('const accessKey = getEnvOrNull("ECOFLOW_ACCESS_KEY")'),
  'MQTT telemetry reads should not require EcoFlow HTTP credentials in the mobile request path.',
);

for (const fragment of [
  'pollMqttTelemetryFallback',
  "action: 'mqttTelemetry'",
  'using MQTT bridge telemetry fallback',
  'if (mqttFallback) return mqttFallback',
  'hasDecodedPowerValues',
]) {
  assert(provider.includes(fragment), `EcoFlow provider MQTT fallback must include ${fragment}`);
}

nodeAssert.strictEqual(
  pkg.scripts['bridge:ecoflow-mqtt'],
  'node ./scripts/ecoflow-mqtt-bridge.js',
  'package.json should expose the EcoFlow MQTT bridge runner.',
);

console.log('EcoFlow MQTT bridge checks passed.');
