const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

global.__DEV__ = true;
const root = path.resolve(__dirname, '..');

function loadTsModule(relativePath) {
  const filename = path.join(root, relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  });
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(outputText, filename);
  return mod.exports;
}

const motion = loadTsModule('lib/terrainIntelligenceMotion.ts');
const profileSource = fs.readFileSync(
  path.join(root, 'components/dashboard/TerrainRiskSideProfile.tsx'),
  'utf8',
);
const hudSource = fs.readFileSync(
  path.join(root, 'components/dashboard/TerrainIntelligenceCommand.tsx'),
  'utf8',
);
const rendererSource = fs.readFileSync(
  path.join(root, 'components/dashboard/WidgetRenderers.tsx'),
  'utf8',
);

motion.resetTerrainMotionDiagnostics();
assert.equal(motion.consumeTerrainProfileReveal('route-a:next_5_mi'), true);
assert.equal(
  motion.consumeTerrainProfileReveal('route-a:next_5_mi'),
  false,
  'profile reveal occurs only once for one fingerprint/range, including remounts',
);
assert.equal(
  motion.consumeTerrainProfileReveal('route-b:next_5_mi'),
  true,
  'route replacement receives a new profile reveal',
);

assert.equal(motion.consumeTerrainRiskPulse('route-a:risk-a'), true);
assert.equal(motion.consumeTerrainRiskPulse('route-a:risk-a'), false, 'risk pulse occurs once');
assert.equal(
  motion.shouldAnimateTerrainRiskPulse({
    profileKey: 'route-a',
    riskKey: 'risk-b',
    freshness: 'stale',
    state: 'stale',
    alreadyAnimatedKey: null,
    motionAllowed: true,
  }),
  false,
  'stale data must not pulse as live',
);
assert.equal(
  motion.shouldAnimateTerrainRiskPulse({
    profileKey: 'route-a',
    riskKey: 'risk-b',
    freshness: 'live',
    state: 'ready',
    alreadyAnimatedKey: null,
    motionAllowed: false,
  }),
  false,
  'reduced motion, moving mode, background, or unfocused lifecycle gate suppresses pulse',
);

let state = { acceptedDistanceMiles: 1, acceptedAtMs: 1000 };
let decision = motion.resolveTerrainVisualProgressUpdate(state, 1.01, 1100);
assert.equal(decision.accepted, false, 'progress faster than the 4–5 Hz visual cap is coalesced');
decision = motion.resolveTerrainVisualProgressUpdate(state, 1.02, 1220);
assert.equal(decision.accepted, true);
assert.equal(decision.acceptedDistanceMiles, 1.02);

assert(profileSource.includes("from 'react-native-gesture-handler'"), 'scrub uses gesture-handler');
assert(profileSource.includes("from 'react-native-reanimated'"), 'graph transitions use Reanimated');
assert(profileSource.includes("from 'react-native-svg'"), 'route data remains rendered by SVG');
assert(profileSource.includes("useMemo(() => {") && profileSource.includes(
  '}, [profile, totalDistanceMiles, unit]);',
), 'profile/path computation stays keyed to profile/range inputs rather than progress');
assert(profileSource.includes('profileAnimationKey={revealKey}') === false);
assert(hudSource.includes('profileAnimationKey={revealKey}'), 'HUD supplies a stable reveal identity');
assert(hudSource.includes("AppState.addEventListener('change', setAppState)"));
assert(hudSource.includes('isDashboardFocused'));
assert(hudSource.includes('systemReducedMotion'));
assert(hudSource.includes('ecsAnimationSettings.enabled'));
assert(hudSource.includes('policy.reducedMotion'));
assert(hudSource.includes('return () => subscription.remove()'), 'AppState listener is removed');
assert(hudSource.includes('ecsAnimationSettings.onChange'), 'ECS animation preference is observed');
assert(hudSource.includes("incrementTerrainMotionDiagnostic('expandedHudRenders')"));
assert(rendererSource.includes("incrementTerrainMotionDiagnostic('compactWidgetRenders')"));
assert(rendererSource.includes("React.lazy(() => import('./TerrainIntelligenceCommand'))"));

for (let index = 0; index < 100; index += 1) {
  motion.consumeTerrainProfileReveal(`bounded-${index}`);
  motion.consumeTerrainRiskPulse(`bounded-${index}`);
}
assert.equal(
  motion.consumeTerrainProfileReveal('bounded-99'),
  false,
  'bounded reveal cache retains recent expansion identity without one timer per marker',
);

console.log('[terrain-intelligence-motion] lifecycle, reveal, progress cap, pulse, gesture, and diagnostics checks passed');
