const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

require.extensions['.ts'] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

function loadTypeScriptModule(relPath) {
  const fullPath = path.join(process.cwd(), relPath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: fullPath,
  });
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  mod._compile(output.outputText, fullPath);
  return mod.exports;
}

const root = path.join(__dirname, '..');
const typesSource = fs.readFileSync(path.join(root, 'lib', 'ai', 'ecsAITypes.ts'), 'utf8');
const orchestratorSource = fs.readFileSync(path.join(root, 'lib', 'ai', 'aiOrchestrator.ts'), 'utf8');
const dashboardSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'dashboard.tsx'), 'utf8');
const navigateRunSource = fs.readFileSync(path.join(root, 'app', 'navigate-run.tsx'), 'utf8');
const expeditionCardsSource = fs.readFileSync(
  path.join(root, 'components', 'ai', 'ExpeditionIntelligenceCards.tsx'),
  'utf8',
);
const navigateBriefSource = fs.readFileSync(path.join(root, 'lib', 'navigateMissionBriefContext.ts'), 'utf8');
const trailPacksSource = fs.readFileSync(path.join(root, 'lib', 'explore', 'trailPacks.ts'), 'utf8');
const campsiteRecommendationsReviewSource = fs.readFileSync(
  path.join(root, 'components', 'admin', 'CampsiteRecommendationsReview.tsx'),
  'utf8',
);
const communityCampsiteReviewSource = fs.readFileSync(
  path.join(root, 'components', 'admin', 'CommunityCampsiteReview.tsx'),
  'utf8',
);
const campsiteGroupSharingSource = fs.readFileSync(
  path.join(root, 'lib', 'campsites', 'campsiteGroupSharingService.ts'),
  'utf8',
);
const campsiteRecommendationServiceSource = fs.readFileSync(
  path.join(root, 'lib', 'campsites', 'campsiteRecommendationService.ts'),
  'utf8',
);
const packageSource = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

const { makeECSAIInput } = loadTypeScriptModule('lib/ai/ecsAITruth.ts');
const { sanitizeECSAICopy } = loadTypeScriptModule('lib/ai/ecsAICopy.ts');
const {
  applyECSAIAdvisorySuppression,
  ECS_AI_ADVISORY_SUPPRESSION_MS,
} = loadTypeScriptModule('lib/ai/ecsAISuppression.ts');
const { generateECSAIAdvisoriesFromContext } = loadTypeScriptModule('lib/ai/ecsAIAdvisories.ts');
const { runECSAIAdvisoryEngine } = loadTypeScriptModule('lib/ai/ecsAIEngine.ts');

assert(typesSource.includes('export type ECSAISourceTruth'), 'ECS AI source truth type should be centralized.');
assert(typesSource.includes('export type ECSAIAdvisory ='), 'ECS AI advisory contract should be centralized.');
assert(typesSource.includes('suppressKey: string'), 'ECS AI advisories should carry a stable suppressKey.');
assert(orchestratorSource.includes('advisories: ECSAIAdvisory[]'), 'ECS AI state should expose structured advisories.');
assert(
  orchestratorSource.includes('advisorySuppressionState'),
  'ECS AI orchestrator memory should retain suppression state across runs.',
);
assert(
  dashboardSource.includes('const structuredAdvisory = aiState?.advisories?.[0] ?? null;'),
  'Dashboard advisory lane should prefer the highest-priority structured ECS AI advisory.',
);
assert(
  dashboardSource.includes('structuredAdvisory?.suppressKey'),
  'Dashboard advisory lane should use stable structured suppress keys when available.',
);
assert(
  packageSource.includes('"test:ecs-ai-live-advisory-contract"'),
  'package.json should expose the focused ECS AI advisory contract regression.',
);
assert(
  !dashboardSource.includes('PROFILE FALLBACK'),
  'Dashboard should not present fallback profile context as an operational mode label.',
);
assert(
  !navigateBriefSource.includes('Mission brief fallback active.'),
  'Navigate mission brief should not surface fallback wording as live operational truth.',
);
assert(navigateBriefSource.includes('Mission brief limited.'), 'Navigate mission brief should use limited-state copy.');
assert(
  !navigateRunSource.includes('No risk factors identified'),
  'Navigate route analysis should not use absolute no-risk copy.',
);
assert(
  navigateRunSource.includes('Risk factors not flagged from available data'),
  'Navigate route analysis empty state should qualify risk copy by available data.',
);
assert(
  !expeditionCardsSource.includes('No risk factors are available.'),
  'Expedition intelligence cards should avoid absolute no-risk copy.',
);
assert(
  expeditionCardsSource.includes('Risk factors not flagged from available data.'),
  'Expedition intelligence cards should qualify risk copy by available data.',
);
assert(
  !trailPacksSource.includes('Clear route geometry is available for preview.'),
  'Explore Trail Pack copy should not imply the route is clear.',
);
assert(
  !campsiteRecommendationsReviewSource.includes('Approved campsite'),
  'Camp review UI should not present reviewed candidates as approved campsites.',
);
assert(
  !communityCampsiteReviewSource.includes('Approved campsite'),
  'Community campsite review UI should not present reviewed candidates as approved campsites.',
);
assert(
  !campsiteGroupSharingSource.includes('Members cannot share approved campsites'),
  'Campsite sharing errors should avoid approved-campsite live claims.',
);
assert(
  !campsiteRecommendationServiceSource.includes('Approved campsite record is invalid.'),
  'Campsite recommendation errors should avoid approved-campsite live claims.',
);

assert.strictEqual(ECS_AI_ADVISORY_SUPPRESSION_MS, 10 * 60 * 1000);

const truthInput = makeECSAIInput(42, 'manual', {
  confidence: 143,
  updatedAt: 1_714_000_000_000,
  sourceName: 'Manual profile',
});
assert.strictEqual(truthInput.truth, 'manual');
assert.strictEqual(truthInput.confidence, 100, 'Input confidence should be clamped.');
assert.strictEqual(truthInput.updatedAt, '2024-04-24T23:06:40.000Z');

const unsafeCopy = 'AI-Inferred: This campsite is legal, guaranteed safe, clear, and no risk.';
const safeCopy = sanitizeECSAICopy(unsafeCopy);
assert(safeCopy.includes('ECS-Inferred'), 'Generic AI labels should become ECS language.');
assert(!/\bAI-Inferred\b/.test(safeCopy), 'Generic AI-Inferred copy should not survive sanitization.');
assert(!/\bcampsite is legal\b/i.test(safeCopy), 'Legal certainty claims should be removed.');
assert(!/\bguaranteed\b/i.test(safeCopy), 'Guaranteed claims should be removed.');
assert(!/\bsafe\b/i.test(safeCopy), 'Safety certainty claims should be removed.');
assert(!/\bno risk\b/i.test(safeCopy), 'No-risk claims should be removed.');

const now = Date.parse('2026-05-01T16:00:00.000Z');
const duplicate = {
  id: 'weather-one',
  title: 'ECS Weather Intel',
  message: 'Using cached weather.',
  severity: 'low',
  confidence: 70,
  sourceTruth: ['cached'],
  sourceTypes: ['weather'],
  suppressKey: 'weather.cached.route',
  createdAt: new Date(now).toISOString(),
};
let suppression = applyECSAIAdvisorySuppression([duplicate], {}, undefined, now);
assert.strictEqual(suppression.active.length, 1, 'First advisory occurrence should remain visible.');

suppression = applyECSAIAdvisorySuppression(
  [{ ...duplicate, id: 'weather-two', createdAt: new Date(now + 60_000).toISOString() }],
  suppression.state,
  undefined,
  now + 60_000,
);
assert.strictEqual(suppression.active.length, 0, 'Duplicate advisory should be suppressed inside window.');
assert.strictEqual(suppression.suppressed.length, 1);

suppression = applyECSAIAdvisorySuppression(
  [{
    ...duplicate,
    id: 'weather-three',
    severity: 'moderate',
    createdAt: new Date(now + 120_000).toISOString(),
  }],
  suppression.state,
  undefined,
  now + 120_000,
);
assert.strictEqual(suppression.active.length, 1, 'Severity escalation should break suppression.');
assert.strictEqual(suppression.active[0].severity, 'moderate');

function input(value, truth, confidence = 70, sourceName = 'test') {
  return makeECSAIInput(value, truth, { confidence, sourceName, updatedAt: now });
}

const baseContext = {
  currentRoute: input({ id: 'route-1' }, 'live', 90, 'Navigate'),
  navigation: input('in_progress', 'live', 90, 'Navigate'),
  location: input({ lat: 38.79, lon: -121.24 }, 'live', 90, 'GPS'),
  weather: input(null, 'unavailable', 0, 'Weather'),
  vehicleProfile: input({ id: 'vehicle-1' }, 'estimated', 70, 'Fleet'),
  vehicleWeight: input(8732, 'estimated', 64, 'Fleet weight'),
  loadout: input({ items: 3 }, 'estimated', 70, 'Fleet loadout'),
  campCandidates: input([{ id: 'camp-1' }], 'estimated', 58, 'CampOps'),
  telemetry: input(null, 'unavailable', 0, 'Telemetry'),
  power: input({ runtimeHours: 4.2 }, 'manual', 55, 'Power'),
  offlineCache: input(null, 'unavailable', 0, 'Offline cache'),
  appSurface: 'dashboard',
};

const advisories = generateECSAIAdvisoriesFromContext(baseContext, now);
const byKey = new Map(advisories.map((item) => [item.suppressKey, item]));

assert(byKey.has('fleet.weight.estimated'), 'Estimated Fleet weight should produce a source-aware advisory.');
assert(
  byKey.get('fleet.weight.estimated').message.includes('Estimated vehicle weight is 8,732 lbs'),
  'Fleet weight copy should be estimate-labeled.',
);
assert(!byKey.get('fleet.weight.estimated').message.includes('Your vehicle weighs'));

assert(byKey.has('camp.legal.unverified'), 'CampOps inferred candidates should get confidence-aware copy.');
assert(byKey.get('camp.legal.unverified').title.includes('ECS-Inferred'));
assert(!/\blegal campsite\b/i.test(byKey.get('camp.legal.unverified').message));

assert(byKey.has('power.source.manual'), 'Manual power source should produce manual-source copy.');
assert(byKey.get('power.source.manual').message.includes('Manual power estimate active'));
assert(!byKey.get('power.source.manual').message.includes('/fallback'));
assert(!byKey.get('power.source.manual').message.includes('Live'));

assert(byKey.has('telemetry.obd_unavailable'), 'Unavailable telemetry during navigation should be explicit.');
assert(
  byKey.get('telemetry.obd_unavailable').message.includes('will not generate mechanical warnings from missing data'),
);

const engine = runECSAIAdvisoryEngine({
  context: {
    route: {
      activeRoute: { id: 'route-1', source_app: 'Navigate' },
      activeRun: null,
      routeStatus: 'in_progress',
      routeIntelligence: null,
      campIntel: [{ id: 'camp-1' }],
      campDecision: null,
    },
    environment: {
      gps: { lat: 38.79, lon: -121.24, status: 'active' },
      weather: { current: null, source: 'none', staleness: 'stale' },
    },
    resources: {
      vehicleIntelligence: {
        available: true,
        identityLabel: 'Test vehicle',
        weightSnapshot: {
          estimatedOperatingWeightLbs: 8732,
          confidenceLevel: 'ecs_estimate',
          confidenceLabel: 'medium',
        },
        loadoutSnapshot: { itemCount: 3 },
        confidence: { score: 64 },
      },
      telemetryReadout: null,
      powerAuthority: {
        available: true,
        freshness: 'manual',
        providerLabel: 'Manual power',
        lastUpdatedAt: now,
      },
      powerIntelligence: null,
    },
    storage: null,
    meta: {
      hasActiveRoute: true,
      hasActiveRun: false,
      builtAt: new Date(now).toISOString(),
    },
  },
  surface: 'dashboard',
  previousSuppressionState: {},
  now,
});
assert(engine.advisories.length > 0, 'ECS AI advisory engine should return active structured advisories.');
assert(engine.advisories.every((item) => item.suppressKey), 'Every active advisory needs a suppressKey.');
assert(engine.advisories.every((item) => Array.isArray(item.sourceTruth)), 'Every advisory needs source truth.');

console.log('ECS AI live advisory contract regression passed.');
