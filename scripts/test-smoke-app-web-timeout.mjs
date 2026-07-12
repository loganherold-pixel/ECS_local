import assert from 'node:assert/strict';
import test from 'node:test';

import * as smokeApp from './smoke-app.mjs';

test('web bundle smoke export gets a longer timeout than native exports', () => {
  assert.equal(
    typeof smokeApp.bundleTimeoutForPlatform,
    'function',
    'smoke runner should expose platform-specific bundle timeout selection',
  );

  assert.equal(smokeApp.bundleTimeoutForPlatform('android'), 180_000);
  assert.equal(smokeApp.bundleTimeoutForPlatform('ios'), 180_000);
  assert.equal(smokeApp.bundleTimeoutForPlatform('web'), 360_000);
  assert.ok(
    smokeApp.bundleTimeoutForPlatform('web') > smokeApp.bundleTimeoutForPlatform('android'),
    'web export should have extra headroom for Expo web bundling cold starts',
  );
});

test('required smoke stages fail closed when execution is skipped', () => {
  assert.equal(smokeApp.smokeStagePasses({ name: 'lint', status: 'skipped' }), false);
  assert.equal(smokeApp.smokeStagePasses({ name: 'typecheck', status: 'skipped' }), false);
  assert.equal(smokeApp.smokeStagePasses({ name: 'lint', status: 'failed' }), false);
  assert.equal(smokeApp.smokeStagePasses({ name: 'lint', status: 'passed' }), true);
});

test('only an unrequested bundle export may be skipped', () => {
  const stage = { name: 'expo-export', status: 'skipped' };
  assert.equal(smokeApp.smokeStagePasses(stage, { bundleRequested: false }), true);
  assert.equal(smokeApp.smokeStagePasses(stage, { bundleRequested: true }), false);
});
