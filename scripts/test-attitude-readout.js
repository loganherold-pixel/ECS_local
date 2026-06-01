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

const { formatSignedDegrees } = loadTypeScriptModule('src/components/attitudeCommand/attitudeReadoutUtils.ts');

assert.strictEqual(formatSignedDegrees(6.432), '+6.4°', 'Positive values should include a plus sign and round to one decimal.');
assert.strictEqual(formatSignedDegrees(-3.21), '-3.2°', 'Negative values should include a minus sign and round to one decimal.');
assert.strictEqual(formatSignedDegrees(0), '+0.0°', 'Zero should follow the ECS signed positive readout convention.');
assert.strictEqual(formatSignedDegrees(Number.NaN), '+0.0°', 'NaN should normalize to zero.');
assert.strictEqual(formatSignedDegrees(Number.POSITIVE_INFINITY), '+0.0°', 'Infinite values should normalize to zero.');
assert.strictEqual(formatSignedDegrees(6.432, 2), '+6.43°', 'Precision should be configurable.');
assert.strictEqual(formatSignedDegrees(6.432, -1), '+6°', 'Precision should clamp to a readable lower bound.');
assert.strictEqual(formatSignedDegrees(6.432, 8), '+6.4320°', 'Precision should clamp to a readable upper bound.');

const readoutSource = fs.readFileSync(
  path.join(root, 'src', 'components', 'attitudeCommand', 'AttitudeReadout.tsx'),
  'utf8',
);
assert.ok(readoutSource.includes('React.memo(AttitudeReadout)'), 'AttitudeReadout should be memoized.');
assert.ok(readoutSource.includes('formatSignedDegrees(valueDeg, precision)'), 'AttitudeReadout should use the shared formatter.');
assert.ok(readoutSource.includes("formattedValue.replace('°', ' degrees')"), 'AttitudeReadout should expose degree values clearly to screen readers.');
assert.ok(readoutSource.includes('testID={`${testIdBase}-label`}'), 'AttitudeReadout should render a label test target.');
assert.ok(readoutSource.includes('testID={testIdBase}'), 'AttitudeReadout should render a value test target.');
assert.ok(readoutSource.includes('bracketTopLeft'), 'AttitudeReadout should use native bracket styling.');
assert.ok(!readoutSource.includes('<Image'), 'AttitudeReadout should not use generated or image-backed readout boxes.');

const stageSource = fs.readFileSync(
  path.join(root, 'src', 'features', 'attitude', 'components', 'VehicleAttitudeStage.tsx'),
  'utf8',
);
assert.ok(stageSource.includes("import AttitudeReadout from '../../../components/attitudeCommand/AttitudeReadout'"));
assert.ok(stageSource.includes('<AttitudeReadout'), 'VehicleAttitudeStage should use the reusable AttitudeReadout component.');
assert.ok(!stageSource.includes('styles.degreeValue'), 'VehicleAttitudeStage should not keep a duplicate private degree value style.');

console.log('AttitudeReadout utility checks passed.');
