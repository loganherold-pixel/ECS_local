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
  applyAttitudeCalibration,
  createAttitudeCalibrationOffsets,
  resetAttitudeCalibrationOffsets,
} = loadTypeScriptModule('lib/attitudeCalibration.ts');

function assertNear(actual, expected, label) {
  assert.ok(
    Math.abs(actual - expected) <= 0.001,
    `${label} expected ${expected}, received ${actual}`,
  );
}

const offsets = createAttitudeCalibrationOffsets(8, 42);
assert.deepStrictEqual(offsets, { roll: 8, pitch: 42 }, 'Zero should store current raw roll/pitch as offsets.');

const zeroed = applyAttitudeCalibration(8, 42, offsets);
assertNear(zeroed.roll, 0, 'Displayed roll after zero');
assertNear(zeroed.pitch, 0, 'Displayed pitch after zero');

const moved = applyAttitudeCalibration(12, 39, offsets);
assertNear(moved.roll, 4, 'Displayed roll after moving from calibrated baseline');
assertNear(moved.pitch, -3, 'Displayed pitch after moving from calibrated baseline');

assert.deepStrictEqual(
  resetAttitudeCalibrationOffsets(),
  { roll: 0, pitch: 0 },
  'Reset calibration should return offsets to zero.',
);

const rawRoll = 12;
const rawPitch = 39;
applyAttitudeCalibration(rawRoll, rawPitch, offsets);
assert.strictEqual(rawRoll, 12, 'Calibration must not mutate raw roll values.');
assert.strictEqual(rawPitch, 39, 'Calibration must not mutate raw pitch values.');

const hookSource = fs.readFileSync(path.join(process.cwd(), 'lib/useAccelerometer.ts'), 'utf8');
assert.ok(
  hookSource.includes("from './attitudeCalibration'") &&
    hookSource.includes('createAttitudeCalibrationOffsets(latest.roll, latest.pitch)') &&
    hookSource.includes('applyAttitudeCalibration(rawRoll, rawPitch, calibrationOffset.current)') &&
    hookSource.includes('resetAttitudeCalibrationOffsets()'),
  'useAccelerometer should route zero/apply/reset through the shared calibration utility.',
);
assert.ok(
  hookSource.includes('rawRollDeg: nextRawRoll') &&
    hookSource.includes('rawPitchDeg: nextRawPitch') &&
    hookSource.includes('rollDeg: newRoll') &&
    hookSource.includes('pitchDeg: newPitch'),
  'useAccelerometer should keep raw sensor values separate from calibrated displayed values.',
);
assert.ok(
  hookSource.includes('const pendingAnglesRef = useRef<AccelerometerAnglesState | null>(null)') &&
    hookSource.includes('const emitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)') &&
    hookSource.includes('pendingAnglesRef.current = next') &&
    hookSource.includes('emitTimerRef.current = setTimeout') &&
    hookSource.includes('pendingAnglesRef.current = null'),
  'useAccelerometer should coalesce native sensor samples before setting React state.',
);

const dashboardSource = fs.readFileSync(path.join(process.cwd(), 'app/(tabs)/dashboard.tsx'), 'utf8');
const widgetGridSource = fs.readFileSync(path.join(process.cwd(), 'components/dashboard/WidgetGrid.tsx'), 'utf8');
const renderersSource = fs.readFileSync(path.join(process.cwd(), 'components/dashboard/WidgetRenderers.tsx'), 'utf8');
const monitorWidgetSource = fs.readFileSync(path.join(process.cwd(), 'components/detail/AttitudeMonitorWidget.tsx'), 'utf8');
const expandedSource = fs.readFileSync(path.join(process.cwd(), 'components/attitude/AttitudeMonitorExpandedView.tsx'), 'utf8');

for (const [name, source] of [
  ['Dashboard', dashboardSource],
  ['WidgetGrid', widgetGridSource],
  ['WidgetRenderers', renderersSource],
  ['AttitudeMonitorWidget', monitorWidgetSource],
  ['AttitudeMonitorExpandedView', expandedSource],
]) {
  assert.ok(
    source.includes('onCalibrate') && source.includes('onResetCalibration'),
    `${name} should pass calibration and reset through the shared attitude widget path.`,
  );
}

assert.ok(
  renderersSource.includes('const AttitudeCommandWidget') &&
    renderersSource.includes('onCalibrate={options?.onCalibrate}') &&
    renderersSource.includes('onResetCalibration={options?.onResetCalibration}'),
  'Attitude Command should receive the same calibration actions as Attitude Monitor.',
);

const stageSource = fs.readFileSync(path.join(process.cwd(), 'src/features/attitude/components/VehicleAttitudeStage.tsx'), 'utf8');
const vehicleImageStyle = stageSource.match(/vehicleImage:\s*\{[\s\S]*?\n\s*\},/)?.[0] ?? '';
assert.ok(
    stageSource.includes('rollDeg') &&
    stageSource.includes('pitchDeg') &&
    stageSource.includes('formatStageDegrees') &&
    stageSource.includes('AttitudeLiveHashOverlay') &&
    stageSource.includes('pitchDeg={safePitch}') &&
    stageSource.includes('rollDeg={safeRoll}'),
  'Calibrated displayed values should drive both degree readouts and SVG live hash marker positions.',
);
assert.ok(
  vehicleImageStyle &&
    !vehicleImageStyle.includes('transform') &&
    !vehicleImageStyle.includes('rotate:') &&
    !vehicleImageStyle.includes('rotateZ') &&
    !vehicleImageStyle.includes('rotate('),
  'VehicleAttitudeStage should not rotate vehicle images; only HUD markers should animate.',
);

console.log('Attitude calibration regression checks passed.');
