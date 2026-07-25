const path = require('path');
const fs = require('fs');
const Module = require('module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
require.extensions['.ts'] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const {
  createRuntimeFeatureVisibilityContext,
  getECSFeatureDefinition,
  resolveECSFeatureVisibility,
  validateECSFeatureRegistry,
} = require(path.join(root, 'lib/features/featureVisibilityRegistry.ts'));

const feature = getECSFeatureDefinition('terrain_intelligence_command');
const decision = resolveECSFeatureVisibility(
  'terrain_intelligence_command',
  createRuntimeFeatureVisibilityContext({
    environment: 'production',
    env: {},
    productionEvidence: new Set(),
  }),
);
const passed = Boolean(
  feature &&
  validateECSFeatureRegistry().length === 0 &&
  feature.defaultEnabled === false &&
  feature.environment.enableFlagRequired === true &&
  decision.visible === false &&
  decision.productionApproved === false &&
  feature.productionEvidence.requirements.length > 0,
);

console.log(`Terrain Intelligence Command readiness: ${passed ? 'RESTRICTED AS REQUIRED' : 'INVALID'}`);
console.log(`Feature ID: ${feature?.id ?? 'missing'}`);
console.log(`Production visibility: ${decision.visible ? 'visible' : 'disabled'}`);
console.log(`Production approval: ${decision.productionApproved ? 'granted' : 'not granted'}`);
console.log(`Evidence requirements: ${feature?.productionEvidence.requirements.join(', ') ?? 'missing'}`);
console.log('Implementation and automated checks do not accept native/device evidence or grant production approval.');
process.exitCode = passed ? 0 : 1;
