const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
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
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  });
  mod._compile(output.outputText, filename);
}

function loadTypeScriptModule(relativePath) {
  const fullPath = path.join(root, relativePath);
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  compileTypeScriptModule(mod, fullPath);
  return mod.exports;
}

require.extensions['.ts'] = compileTypeScriptModule;

const runtime = loadTypeScriptModule('src/features/attitude/attitudeInclinationRive.ts');
const webWidget = read('src/features/attitude/components/AttitudeInclinationRiveWidget.tsx');
const nativeWidget = read('src/features/attitude/components/AttitudeInclinationRiveWidget.native.tsx');
const stage = read('src/features/attitude/components/VehicleAttitudeStage.tsx');
const packageJson = JSON.parse(read('package.json'));

const nativeAsset = path.join(root, 'assets/attitude/inclination_widget.riv');
const publicAsset = path.join(root, 'public/rive/inclination_widget.riv');

assert.strictEqual(runtime.ATTITUDE_INCLINATION_RIVE_ARTBOARD, 'Artboard');
assert.strictEqual(runtime.ATTITUDE_INCLINATION_RIVE_STATE_MACHINE, 'State Machine 1');
assert.strictEqual(runtime.ATTITUDE_INCLINATION_NUMBER_INPUT, 'slider');
assert.ok(fs.existsSync(nativeAsset) && fs.statSync(nativeAsset).size > 0, 'Native inclination_widget.riv asset should exist.');
assert.ok(fs.existsSync(publicAsset) && fs.statSync(publicAsset).size > 0, 'Public inclination_widget.riv asset should exist.');

assert.ok(
  nativeWidget.includes("require('../../../../assets/attitude/inclination_widget.riv')"),
  'Native attitude Rive widget should statically require the bundled .riv asset.',
);
assert.ok(
  nativeWidget.includes('setNumberInputValue?.(') &&
    nativeWidget.includes('ATTITUDE_INCLINATION_NUMBER_INPUT') &&
    nativeWidget.includes('runtime.inputValue'),
  'Native attitude Rive widget should write the real state-machine number input.',
);
assert.ok(
  nativeWidget.includes('pointerEvents="none"') &&
    webWidget.includes("pointerEvents: 'none'"),
  'Native and web attitude Rive surfaces should be non-interactive.',
);
assert.ok(
  webWidget.includes("const RIVE_SRC = '/rive/inclination_widget.riv'") &&
    webWidget.includes('useStateMachineInput') &&
    webWidget.includes('ATTITUDE_INCLINATION_NUMBER_INPUT'),
  'Web attitude Rive widget should load the public Rive asset and bind the number input.',
);
assert.ok(
  stage.includes("import AttitudeInclinationRiveWidget from './AttitudeInclinationRiveWidget'") &&
    stage.includes('<AttitudeInclinationRiveWidget') &&
    stage.includes('testID={`vehicle-attitude-${axis}-rive-meter`}') &&
    !stage.includes("import AttitudeGauge from '../../../components/attitudeCommand/AttitudeGauge'") &&
    !stage.includes('<AttitudeGauge'),
  'VehicleAttitudeStage should render the Rive ring widget instead of the old AttitudeGauge.',
);
assert.strictEqual(
  packageJson.scripts['test:attitude-rive-ring'],
  'node ./scripts/test-attitude-rive-ring.js',
  'package.json should expose the attitude Rive ring regression script.',
);

console.log('[attitude-rive-ring] transparent Rive ring integration contract passed');
