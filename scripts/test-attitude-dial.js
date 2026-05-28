const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

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
  const fullPath = path.join(root, relPath);
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  compileTypeScriptModule(mod, fullPath);
  return mod.exports;
}

const dial = read('src/features/attitude/components/AttitudeDial.tsx');
const dialColor = read('src/features/attitude/attitudeDialColor.ts');
const monitor = read('src/features/attitude/components/AttitudeMonitor.tsx');
const stage = read('src/features/attitude/components/VehicleAttitudeStage.tsx');
const commandWidget = read('src/components/attitudeCommand/AttitudeCommandWidget.tsx');
const packageJson = JSON.parse(read('package.json'));
const {
  ATTITUDE_DIAL_SAFE_COLOR,
  ATTITUDE_DIAL_WARNING_COLOR,
  ATTITUDE_DIAL_CRITICAL_COLOR,
  getAttitudeDialMagnitudeColor,
} = loadTypeScriptModule('src/features/attitude/attitudeDialColor.ts');

assert.ok(
  dial.includes("from 'react-native-svg'") &&
    dial.includes('Circle') &&
    dial.includes('Line') &&
    dial.includes('Path'),
  'AttitudeDial should use react-native-svg for the dial, ticks, glow trail, and indicators.',
);
assert.ok(
  dial.includes("import { getAttitudeDialMagnitudeColor } from '../attitudeDialColor';") &&
    dial.includes('const activeColor = getAttitudeDialMagnitudeColor({') &&
    dial.includes('valueDeg: clampedValue') &&
    dial.includes('minDeg: min') &&
    dial.includes('maxDeg: max'),
  'AttitudeDial should color the gauge from clamped pitch/roll magnitude rather than a fixed amber default.',
);
assert.strictEqual(
  getAttitudeDialMagnitudeColor({ valueDeg: 0, minDeg: -45, maxDeg: 45, warningThresholdDeg: 10, criticalThresholdDeg: 20 }),
  ATTITUDE_DIAL_SAFE_COLOR,
  'Zero degrees should render the safe green gauge color.',
);
assert.strictEqual(
  getAttitudeDialMagnitudeColor({ valueDeg: 10, minDeg: -45, maxDeg: 45, warningThresholdDeg: 10, criticalThresholdDeg: 20 }),
  ATTITUDE_DIAL_WARNING_COLOR,
  'Warning-threshold attitude should render yellow.',
);
assert.strictEqual(
  getAttitudeDialMagnitudeColor({ valueDeg: -10, minDeg: -45, maxDeg: 45, warningThresholdDeg: 10, criticalThresholdDeg: 20 }),
  ATTITUDE_DIAL_WARNING_COLOR,
  'Negative warning-threshold attitude should use the same yellow as positive values.',
);
assert.strictEqual(
  getAttitudeDialMagnitudeColor({ valueDeg: 20, minDeg: -45, maxDeg: 45, warningThresholdDeg: 10, criticalThresholdDeg: 20 }),
  ATTITUDE_DIAL_CRITICAL_COLOR,
  'Critical-threshold attitude should render red.',
);
assert.strictEqual(
  getAttitudeDialMagnitudeColor({ valueDeg: -20, minDeg: -45, maxDeg: 45, warningThresholdDeg: 10, criticalThresholdDeg: 20 }),
  ATTITUDE_DIAL_CRITICAL_COLOR,
  'Negative critical-threshold attitude should use the same red as positive values.',
);
const blendedWarningToCritical = getAttitudeDialMagnitudeColor({
  valueDeg: 15,
  minDeg: -45,
  maxDeg: 45,
  warningThresholdDeg: 10,
  criticalThresholdDeg: 20,
});
assert.notStrictEqual(blendedWarningToCritical, ATTITUDE_DIAL_WARNING_COLOR, 'Moderate-to-severe values should blend away from yellow.');
assert.notStrictEqual(blendedWarningToCritical, ATTITUDE_DIAL_CRITICAL_COLOR, 'Moderate-to-severe values should blend toward red before reaching full red.');
assert.ok(
  dialColor.includes("export const ATTITUDE_DIAL_SAFE_COLOR = '#45d37f';") &&
    dialColor.includes("export const ATTITUDE_DIAL_WARNING_COLOR = '#f2c94c';") &&
    dialColor.includes("export const ATTITUDE_DIAL_CRITICAL_COLOR = '#ff5f4f';"),
  'Attitude dial color utility should define the green/yellow/red safety ramp.',
);
assert.ok(
  dial.includes("from 'react-native-reanimated'") &&
    dial.includes('useSharedValue') &&
    dial.includes('withTiming') &&
    dial.includes('useAnimatedStyle'),
  'AttitudeDial should use Reanimated for smooth indicator motion.',
);
assert.ok(
  dial.includes('indicatorAnimatedStyle') &&
    dial.includes('transform: [{ rotate: `${animatedAngle.value}deg` }]') &&
    !dial.includes('animatedProps={indicatorAnimatedProps}'),
  'AttitudeDial should animate indicators through a React Native transform array for Android native compatibility.',
);
assert.ok(
  dial.includes("label: AttitudeDialLabel") &&
    dial.includes("valueDeg: number") &&
    dial.includes("minDeg?: number") &&
    dial.includes("maxDeg?: number") &&
    dial.includes("size: number") &&
    dial.includes("ecsGold: string") &&
    dial.includes("warningThresholdDeg?: number") &&
    dial.includes("criticalThresholdDeg?: number"),
  'AttitudeDial should expose the required reusable meter props.',
);
assert.ok(
  dial.includes('for (let degree = min; degree <= max') &&
    dial.includes('TICK_STEP_DEG') &&
    dial.includes('degreeToDialAngle') &&
    dial.includes('polarPoint'),
  'AttitudeDial should generate tick geometry from math and props.',
);
assert.ok(
  dial.includes('vehicle-attitude') === false ||
    dial.includes('testID ? `${testID}-degree-readout`'),
  'AttitudeDial should render a crisp React Native text degree readout.',
);
assert.ok(
  !dial.toLowerCase().includes('rive') &&
    !dial.includes('.riv') &&
    !dial.includes('Image'),
  'AttitudeDial should not depend on Rive, images, or external animation files.',
);

assert.ok(
  monitor.includes("label=\"ROLL\"") &&
    monitor.includes("label=\"PITCH\"") &&
    monitor.indexOf("label=\"PITCH\"") < monitor.indexOf("label=\"ROLL\""),
  'AttitudeMonitor should render PITCH on the left side-profile position and ROLL on the right rear-profile position.',
);
assert.ok(
  monitor.includes('valueDeg={rollDeg}') &&
    monitor.includes('valueDeg={pitchDeg}') &&
    monitor.includes('vehicle-attitude-roll-dial-meter') &&
    monitor.includes('vehicle-attitude-pitch-dial-meter'),
  'AttitudeMonitor should wire live roll and pitch values into the dial meters.',
);

assert.ok(
  stage.includes("import AttitudeMonitor from './AttitudeMonitor'") &&
    stage.includes('<AttitudeMonitor') &&
    stage.includes('rollDeg={rollDeg}') &&
    stage.includes('pitchDeg={pitchDeg}') &&
    stage.includes('rollMinDeg={-maxRollDeg}') &&
    stage.includes('pitchMinDeg={-maxPitchDeg}'),
  'VehicleAttitudeStage should render the native attitude monitor with the existing live attitude values.',
);
assert.ok(
  !stage.includes("import AttitudeInclinationRiveWidget from './AttitudeInclinationRiveWidget'") &&
    !stage.includes('<AttitudeInclinationRiveWidget') &&
    !stage.includes('rive-meter') &&
    !stage.includes("import AttitudeGauge from '../../../components/attitudeCommand/AttitudeGauge'") &&
    !stage.includes('<AttitudeGauge'),
  'VehicleAttitudeStage should not render the Rive widget or the old gauge.',
);
assert.ok(
  commandWidget.includes("import AttitudeDial from '../../features/attitude/components/AttitudeDial'") &&
    commandWidget.includes('testID="attitude-command-pitch-dial-meter"') &&
    commandWidget.includes('testID="attitude-command-roll-dial-meter"') &&
    !commandWidget.includes('AttitudeInclinationRiveWidget') &&
    !commandWidget.includes('rive-meter'),
  'AttitudeCommandWidget should use the native dial instead of the Rive inclination widget.',
);
assert.ok(
  !fs.existsSync(path.join(root, 'src/features/attitude/components/AttitudeInclinationRiveWidget.tsx')) &&
    !fs.existsSync(path.join(root, 'src/features/attitude/components/AttitudeInclinationRiveWidget.native.tsx')) &&
    !fs.existsSync(path.join(root, 'src/features/attitude/attitudeInclinationRive.ts')) &&
    !fs.existsSync(path.join(root, 'assets/attitude/inclination_widget.riv')) &&
    !fs.existsSync(path.join(root, 'public/rive/inclination_widget.riv')),
  'Attitude should not keep the retired Rive widget, runtime helper, or .riv assets.',
);
assert.strictEqual(
  packageJson.scripts['test:attitude-dial'],
  'node ./scripts/test-attitude-dial.js',
  'The attitude dial regression command should remain available without Rive naming.',
);
assert.ok(
  !packageJson.scripts['test:attitude-rive-ring'],
  'package.json should not keep the retired attitude Rive regression script.',
);

console.log('[attitude-dial] native attitude dial integration contract passed');
