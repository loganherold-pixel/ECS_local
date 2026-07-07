const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(relativePath) {
  const fullPath = path.join(root, relativePath);
  assert.ok(fs.existsSync(fullPath), `${relativePath} must exist`);
  return fs.readFileSync(fullPath, 'utf8').replace(/\r\n/g, '\n');
}

const scriptSource = read('scripts/seed-android-emulator-location.mjs');
const packageJson = JSON.parse(read('package.json'));

assert.ok(
  scriptSource.includes('com.expeditioncommand.planningofflinesync'),
  'Emulator location seed should default to the ECS Android package id.',
);
assert.ok(
  scriptSource.includes('android.permission.ACCESS_FINE_LOCATION') &&
    scriptSource.includes('android.permission.ACCESS_COARSE_LOCATION'),
  'Emulator location seed should grant foreground location permissions before Navigate QA.',
);
assert.ok(
  scriptSource.includes("'appops', 'set'") &&
    scriptSource.includes("['ACCESS_FINE_LOCATION', 'allow']") &&
    scriptSource.includes("['ACCESS_COARSE_LOCATION', 'allow']"),
  'Emulator location seed should align Android appops with granted location permissions.',
);
assert.ok(
  scriptSource.includes('emu geo fix') &&
    scriptSource.includes('waitForSeededLocation'),
  'Emulator location seed should push a geo fix and verify the device reports it back.',
);
assert.ok(
  scriptSource.includes('--serial') &&
    scriptSource.includes('--lat') &&
    scriptSource.includes('--lng') &&
    scriptSource.includes('--package'),
  'Emulator location seed should expose serial, coordinate, and package overrides.',
);
assert.ok(
  scriptSource.includes('ECS_ANDROID_SERIAL') &&
    scriptSource.includes('ECS_ANDROID_LAT') &&
    scriptSource.includes('ECS_ANDROID_LNG'),
  'Emulator location seed should support environment overrides for Windows/npm QA runs.',
);
assert.ok(
  scriptSource.includes('splitInlineArg') && scriptSource.includes("arg.indexOf('=')"),
  'Emulator location seed should support --lng=-109 style values for negative longitudes through npm scripts.',
);
assert.ok(
  scriptSource.includes('verificationMode') &&
    scriptSource.includes('coordinateVerified') &&
    scriptSource.includes("mode: 'provider_event'") &&
    scriptSource.includes("mode: 'emulator_command'"),
  'Emulator location seed should report whether validation came from exact coordinates, provider events, or command acceptance.',
);
assert.ok(
  scriptSource.includes('diagnosticsWarning'),
  'Emulator location seed should warn when Android accepts the geo fix but does not expose coordinate diagnostics.',
);
assert.ok(
  packageJson.scripts['qa:android:seed-location'] === 'node scripts/seed-android-emulator-location.mjs',
  'package.json should expose the Android emulator location seed helper.',
);
assert.ok(
  packageJson.scripts['test:android-emulator-location-seed'] === 'node ./scripts/test-android-emulator-location-seed.js',
  'package.json should expose the emulator location seed regression test.',
);

console.log('Android emulator location seed checks passed.');
