const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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
  }).outputText;
  mod._compile(output, filename);
}

function loadTsModule(relPath) {
  const filename = path.join(__dirname, '..', relPath);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  compileTypeScriptModule(mod, filename);
  return mod.exports;
}

require.extensions['.ts'] = compileTypeScriptModule;

const {
  deriveRouteConfidence,
  deriveExploreRouteConfidence,
  formatRouteConfidenceLine,
  getRouteConfidenceReasonChips,
} = loadTsModule('lib/routeConfidencePresentation.ts');

const highConfidence = {
  level: 'high',
  score: 92,
  label: 'High confidence',
  shortReason: 'current supporting route data',
  reasons: [],
  sourceSummary: { live: 1, manual: 0, inferred: 2, stale: 0, missing: 0 },
};

const mediumConfidence = {
  ...highConfidence,
  level: 'moderate',
  score: 68,
  label: 'Moderate confidence',
  shortReason: 'some supporting route data is aging',
};

const highTrust = {
  confidence: 'High',
  sourceBasis: 'Live',
  freshness: 'fresh',
  freshnessLabel: 'Fresh',
  mode: 'ECS Live',
  explanationSummary: null,
  asOfLabel: 'recently',
  decision: 'allow',
  suppressionReason: null,
};

const staleTrust = {
  ...highTrust,
  confidence: 'Medium',
  freshness: 'stale',
  freshnessLabel: 'Aging',
};

const curated = deriveExploreRouteConfidence({
  routeLabel: 'Known Route',
  recommendationConfidence: highConfidence,
  trust: highTrust,
  startLat: 38.1,
  startLng: -109.2,
  distanceMiles: 42,
  vehicleAware: false,
});

assert(curated.level === 'high', 'ECS-curated route with current supporting data should be High.');
assert(curated.reasons.includes('ECS-curated route'), 'Curated route should explain its source.');
assert(!JSON.stringify(curated).toLowerCase().includes('vehicle'), 'Route Confidence should not include Vehicle Fit language.');
assert(curated.reasons.length <= 3, 'Route Confidence reasons should be capped to 3.');
assert(getRouteConfidenceReasonChips(curated).includes('Recent support'), 'High confidence card chip should prefer recent support when freshness is available.');

const stale = deriveExploreRouteConfidence({
  routeLabel: 'Known Route',
  recommendationConfidence: mediumConfidence,
  trust: staleTrust,
  startLat: 38.1,
  startLng: -109.2,
  distanceMiles: 42,
  vehicleAware: false,
});

assert(stale.level === 'medium', 'Aging/stale route intel should cap confidence at Medium.');
assert(stale.concerns.some((concern) => concern.toLowerCase().includes('aging')), 'Stale route intel should produce an aging concern.');
assert(getRouteConfidenceReasonChips(stale).includes('Aging intel'), 'Medium confidence card chip should summarize aging route intel.');

const custom = deriveRouteConfidence({
  routeSource: 'custom',
  isCustomRoute: true,
  hasCompleteGeometry: true,
  vehicleAware: false,
});

assert(custom.level === 'low', 'Custom route with sparse ECS support should be Low.');
assert(custom.concerns.includes('Custom route - limited ECS field support'), 'Custom route should state limited ECS field support.');
assert(custom.concerns.includes('Access and recent passability may be unknown'), 'Custom route should warn about unknown access/passability.');
assert(getRouteConfidenceReasonChips(custom).includes('Sparse ECS intel'), 'Low confidence card chip should summarize sparse ECS support.');

const missing = deriveRouteConfidence({ vehicleAware: false });

assert(missing.level === 'unknown', 'Missing source/freshness data should be Unknown.');
assert(missing.reasons.includes('Not enough route evidence'), 'Missing data should explain that evidence is insufficient.');
assert(getRouteConfidenceReasonChips(missing).includes('Limited data'), 'Unknown confidence card chip should summarize limited data.');

const conflict = deriveRouteConfidence({
  routeSource: 'ECS-curated',
  recommendationConfidence: highConfidence,
  trust: highTrust,
  hasCompleteGeometry: true,
  vehicleAware: false,
  conflictingSignals: ['access mismatch', 'seasonal status mismatch'],
});

assert(conflict.level === 'medium', 'Conflicting access/status signals should lower confidence to Medium.');
assert(conflict.concerns.includes('Conflicting access/status signals'), 'Conflicting signals should be listed as a concern.');
assert(conflict.conflicts.length === 2, 'Existing conflict labels should be preserved.');

const line = formatRouteConfidenceLine(curated);
assert(line === 'Route Confidence: High - ECS-curated route', 'Formatted line should use user-facing Route Confidence without percentages.');

const routeConfidenceRow = fs.readFileSync(path.join(__dirname, '..', 'components', 'discover', 'RouteConfidenceSummaryRow.tsx'), 'utf8');
const enrichedCard = fs.readFileSync(path.join(__dirname, '..', 'components', 'discover', 'EnrichedRouteCard.tsx'), 'utf8');
const aiCard = fs.readFileSync(path.join(__dirname, '..', 'components', 'discover', 'AIRouteCard.tsx'), 'utf8');

assert(
  routeConfidenceRow.includes('Route Confidence: ${label}') &&
    routeConfidenceRow.includes('getRouteConfidenceReasonChips(result, 2)') &&
    routeConfidenceRow.includes('accessibilityLabel={`Route Confidence: ${label}'),
  'Route Confidence card row should render a compact accessible badge plus at most two reason chips.',
);

assert(
  enrichedCard.includes('<RouteConfidenceSummaryRow result={routeConfidence} />') &&
    aiCard.includes('<RouteConfidenceSummaryRow result={routeConfidence} />'),
  'Known and ECS-Inferred route cards should render the shared Route Confidence row.',
);

assert(
  enrichedCard.includes('<Text style={s.statUnit}>FIT</Text>') &&
    aiCard.includes('<Text style={s.statUnit}>FIT</Text>') &&
    !routeConfidenceRow.toLowerCase().includes('vehicle fit'),
  'Existing Vehicle Fit UI should remain separate from Route Confidence.',
);

console.log('route confidence presentation checks passed');
