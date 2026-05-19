const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const dial = read('src/features/attitude/components/AttitudeDial.tsx');
const monitor = read('src/features/attitude/components/AttitudeMonitor.tsx');
const stage = read('src/features/attitude/components/VehicleAttitudeStage.tsx');
const commandWidget = read('src/components/attitudeCommand/AttitudeCommandWidget.tsx');
const packageJson = JSON.parse(read('package.json'));

assert.ok(
  dial.includes("from 'react-native-svg'") &&
    dial.includes('Circle') &&
    dial.includes('Line') &&
    dial.includes('Path'),
  'AttitudeDial should use react-native-svg for the dial, ticks, glow trail, and indicators.',
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
assert.strictEqual(
  packageJson.scripts['test:attitude-rive-ring'],
  'node ./scripts/test-attitude-rive-ring.js',
  'The existing attitude regression command should remain available.',
);

console.log('[attitude-dial] native attitude dial integration contract passed');
