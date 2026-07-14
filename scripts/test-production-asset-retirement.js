const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const retiredAssets = [
  'assets/attitude/vehicles/default/Attitude_Monitor_Image.png',
  'assets/ecs/nav/Attitude_Monitor_Image.png',
  'assets/images/favicon.png',
  'assets/power/blu_power_module.riv',
  'public/rive/blu_power_module.riv',
];

for (const asset of retiredAssets) {
  assert.strictEqual(fs.existsSync(path.join(root, asset)), false, `${asset} should remain retired.`);
}

const appJson = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
assert.strictEqual(
  appJson.expo?.web?.favicon,
  './assets/images/splash-icon.png',
  'Web should use the retained byte-identical splash artwork instead of a duplicate favicon file.',
);
assert.ok(
  fs.existsSync(path.join(root, 'assets', 'images', 'splash-icon.png')),
  'The canonical splash/favicon artwork should remain bundled.',
);

const attitudeManifest = fs.readFileSync(
  path.join(root, 'src', 'features', 'attitude', 'vehicleAttitudeAssetManifest.ts'),
  'utf8',
);
assert.ok(
  attitudeManifest.includes('VEHICLE_ATTITUDE_ASSET_MANIFEST') &&
    !attitudeManifest.includes('Attitude_Monitor_Image.png'),
  'Vehicle attitude rendering should remain owned by the active composite-image manifest.',
);

console.log('Production asset retirement checks passed.');
