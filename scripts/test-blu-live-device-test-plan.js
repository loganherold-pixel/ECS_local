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

const doc = read('docs/blu-live-device-test-plan.md');
const docLower = doc.toLowerCase();
const packageJson = JSON.parse(read('package.json'));
const scripts = packageJson.scripts ?? {};

for (const phrase of [
  'VeePeak OBD2',
  'known-good live reference path',
  'Discovered',
  'Classified',
  'Connected',
  'ELM initialized',
  'Live telemetry streaming',
  'Stale detection',
  'Disconnect',
  'Reconnect',
  'EcoFlow Glacier',
  'handshake phase',
  'first telemetry phase',
  'timeout phase',
  'cloud fallback',
  'EcoFlow Power Station',
  'cloud listed or not listed',
  'local BLE supported or unsupported',
  'unauthorized handling',
  'stale handling',
  'Bluetti',
  'Goal Zero',
  'Anker / Anker Solix',
  'Multi-Device Checklist',
  'VeePeak + EcoFlow',
  'VeePeak + power station',
  'multiple power devices',
  'app background/foreground',
  'Run Notes Template',
]) {
  assert(docLower.includes(phrase.toLowerCase()), `BLU live device test plan must include: ${phrase}`);
}

for (const prefix of [
  '[BLU_SCAN]',
  '[BLU_CLASSIFY]',
  '[BLU_CONNECT]',
  '[BLU_HANDSHAKE]',
  '[BLU_STREAM]',
  '[BLU_TELEMETRY]',
  '[BLU_TIMEOUT]',
  '[BLU_RECONNECT]',
  '[BLU_DISCONNECT]',
  '[BLU_ECOFLOW]',
  '[BLU_BLUETTI]',
  '[BLU_ANKER]',
  '[BLU_GOALZERO]',
  '[BLU_OBD2]',
]) {
  assert(doc.includes(prefix), `BLU live device test plan must document log prefix ${prefix}`);
}

for (const command of [
  'npx tsc --noEmit --pretty false',
  'npm run lint',
  'npm run test:blu-live-device-test-plan',
  'npm run test:obd2-live-pipeline',
  'npm run test:ecoflow-cloud-connection',
  'npm run test:blu-multi-device-manager',
  'npm run test:blu-stream-lifecycle',
  'npm run test:blu-disconnect-cleanup-reconnect',
  'npm run test:blu-performance-battery-safe-scanning',
]) {
  assert(doc.includes(command), `BLU live device test plan must include command: ${command}`);
}

assert(!Object.prototype.hasOwnProperty.call(scripts, 'typecheck'), 'Package unexpectedly has typecheck script; update the BLU test plan regression command notes.');
assert(!Object.prototype.hasOwnProperty.call(scripts, 'test'), 'Package unexpectedly has top-level test script; update the BLU test plan regression command notes.');

assert(
  scripts['test:blu-live-device-test-plan'] === 'node ./scripts/test-blu-live-device-test-plan.js',
  'package.json must expose test:blu-live-device-test-plan',
);

console.log('BLU live device test plan coverage checks passed.');
