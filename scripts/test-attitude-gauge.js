/* global __dirname */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');

function compileTypeScriptModule(mod, filename) {
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
  mod._compile(output.outputText, filename);
}

function loadTypeScriptModule(relPath) {
  const fullPath = path.join(root, relPath);
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  compileTypeScriptModule(mod, fullPath);
  return mod.exports;
}

require.extensions['.ts'] = compileTypeScriptModule;
require.extensions['.tsx'] = compileTypeScriptModule;

const {
  clampAngle,
  mapAngleToNeedleRotation,
  DEFAULT_ATTITUDE_GAUGE_MAX_VISUAL_ROTATION_DEG,
} = loadTypeScriptModule('src/components/attitudeCommand/attitudeGaugeUtils.ts');

assert.strictEqual(clampAngle(0), 0, '0 degrees should remain centered.');
assert.strictEqual(clampAngle(15), 15, '+15 degrees should remain a moderate in-range angle.');
assert.strictEqual(clampAngle(-15), -15, '-15 degrees should remain a moderate in-range angle.');
assert.strictEqual(clampAngle(30), 30, '+30 degrees should sit at the positive visual limit.');
assert.strictEqual(clampAngle(-30), -30, '-30 degrees should sit at the negative visual limit.');
assert.strictEqual(clampAngle(20, -15, 15), 15, '20 degrees should clamp to +15 degrees.');
assert.strictEqual(clampAngle(-20, -15, 15), -15, '-20 degrees should clamp to -15 degrees.');
assert.strictEqual(clampAngle(6.4, -15, 15), 6.4, '6.4 degrees should remain in range.');
assert.strictEqual(clampAngle(100), 30, 'High telemetry should clamp to +30 degrees by default.');
assert.strictEqual(clampAngle(-100), -30, 'Low telemetry should clamp to -30 degrees by default.');
assert.strictEqual(clampAngle(Number.NaN), 0, 'NaN telemetry should normalize to center.');
assert.strictEqual(clampAngle(Number.POSITIVE_INFINITY), 0, 'Infinite telemetry should normalize to center.');

assert.strictEqual(mapAngleToNeedleRotation(0), 0, '0 degrees should point straight up.');
assert.strictEqual(
  mapAngleToNeedleRotation(15),
  DEFAULT_ATTITUDE_GAUGE_MAX_VISUAL_ROTATION_DEG / 2,
  '+15 degrees should read as moderate, not max visual rotation.',
);
assert.strictEqual(
  mapAngleToNeedleRotation(-15),
  -DEFAULT_ATTITUDE_GAUGE_MAX_VISUAL_ROTATION_DEG / 2,
  '-15 degrees should read as moderate, not max visual rotation.',
);
assert.strictEqual(
  mapAngleToNeedleRotation(30),
  DEFAULT_ATTITUDE_GAUGE_MAX_VISUAL_ROTATION_DEG,
  '+30 degrees should lean right to the max visual rotation.',
);
assert.strictEqual(
  mapAngleToNeedleRotation(-30),
  -DEFAULT_ATTITUDE_GAUGE_MAX_VISUAL_ROTATION_DEG,
  '-30 degrees should lean left to the max visual rotation.',
);
assert.strictEqual(
  mapAngleToNeedleRotation(100),
  DEFAULT_ATTITUDE_GAUGE_MAX_VISUAL_ROTATION_DEG,
  'High telemetry should visually clamp right.',
);
assert.strictEqual(
  mapAngleToNeedleRotation(-100),
  -DEFAULT_ATTITUDE_GAUGE_MAX_VISUAL_ROTATION_DEG,
  'Low telemetry should visually clamp left.',
);
assert.strictEqual(mapAngleToNeedleRotation(7.5), 17.5, 'Quarter-range telemetry should rotate proportionally.');
assert.strictEqual(mapAngleToNeedleRotation(-7.5), -17.5, 'Negative quarter-range telemetry should rotate proportionally left.');

const componentSource = fs.readFileSync(
  path.join(root, 'src', 'components', 'attitudeCommand', 'AttitudeGauge.tsx'),
  'utf8',
);
assert.ok(componentSource.includes('React.memo(AttitudeGauge)'), 'AttitudeGauge should be memoized.');
assert.ok(componentSource.includes('GAUGE_TICKS_SRC'), 'AttitudeGauge should render the static tick layer.');
assert.ok(!componentSource.includes('GAUGE_NUMBERS_SRC'), 'AttitudeGauge should not render numeric tick labels.');
assert.ok(componentSource.includes('GAUGE_INDICATOR_SRC'), 'AttitudeGauge should render the static indicator layer.');
assert.ok(componentSource.includes('transform: [{ rotate: `${rotationDeg}deg` }]'), 'Needle should rotate directly from props.');
assert.ok(!componentSource.includes('Animated.'), 'AttitudeGauge should not smooth or delay needle movement.');
assert.ok(!componentSource.includes('transition'), 'AttitudeGauge should not apply CSS transitions.');

console.log('AttitudeGauge utility checks passed.');
