const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const navigatePath = path.join(root, 'app', '(tabs)', 'navigate.tsx');
const navigateSource = fs.readFileSync(navigatePath, 'utf8');

function loadTypeScriptModule(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filePath,
  }).outputText;
  const loaded = { exports: {} };
  const execute = new Function('require', 'module', 'exports', '__filename', '__dirname', output);
  execute(require, loaded, loaded.exports, filePath, path.dirname(filePath));
  return loaded.exports;
}

function loadFunctionsFromNavigate(functionNames) {
  const sourceFile = ts.createSourceFile(
    navigatePath,
    navigateSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const declarations = new Map();
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      declarations.set(statement.name.text, statement.getText(sourceFile));
    }
  }
  const missing = functionNames.filter((name) => !declarations.has(name));
  assert.deepStrictEqual(missing, [], `Missing Navigate characterization functions: ${missing.join(', ')}`);
  const source = [
    ...functionNames.map((name) => declarations.get(name)),
    `module.exports = { ${functionNames.join(', ')} };`,
  ].join('\n\n');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const loaded = { exports: {} };
  new Function('module', 'exports', output)(loaded, loaded.exports);
  return loaded.exports;
}

function loadCharacterizedBoundary(modulePath, functionNames, expectedImport) {
  if (!fs.existsSync(modulePath)) {
    return loadFunctionsFromNavigate(functionNames);
  }
  assert(
    navigateSource.includes(expectedImport),
    `Navigate should compose the extracted boundary through ${expectedImport}.`,
  );
  for (const functionName of functionNames) {
    assert(
      !navigateSource.includes(`function ${functionName}(`),
      `${functionName} should not remain duplicated in the Navigate screen after extraction.`,
    );
  }
  return loadTypeScriptModule(modulePath);
}

const popupFunctionNames = [
  'raiseNavigateSurfaceLayer',
  'removeNavigateSurfaceLayer',
  'isToolsChildPopup',
];
const popupModule = loadCharacterizedBoundary(
  path.join(root, 'lib', 'navigation', 'navigateSurfaceLayerState.ts'),
  popupFunctionNames,
  "from '../../lib/navigation/navigateSurfaceLayerState'",
);

const originalStack = ['mapSelection', 'tools'];
assert.strictEqual(
  popupModule.raiseNavigateSurfaceLayer(originalStack, 'tools'),
  originalStack,
  'Raising the current top layer should preserve the stack reference.',
);
assert.deepStrictEqual(
  popupModule.raiseNavigateSurfaceLayer(originalStack, 'mapSelection'),
  ['tools', 'mapSelection'],
  'Raising an older layer should move it to the top without duplication.',
);
assert.strictEqual(
  popupModule.removeNavigateSurfaceLayer(originalStack, 'campLayers'),
  originalStack,
  'Removing an absent layer should preserve the stack reference.',
);
assert.deepStrictEqual(
  popupModule.removeNavigateSurfaceLayer(originalStack, 'mapSelection'),
  ['tools'],
  'Removing a present layer should preserve the order of remaining surfaces.',
);
assert.strictEqual(popupModule.isToolsChildPopup('importRoute'), true);
assert.strictEqual(popupModule.isToolsChildPopup('recommendRoute'), true);
assert.strictEqual(popupModule.isToolsChildPopup('tools'), false);
assert.strictEqual(popupModule.isToolsChildPopup(null), false);

const confidenceFunctionNames = [
  'routeConfidenceTimelineConfidenceFromPercent',
  'routeConfidenceTimelineTimestamp',
  'routeConfidenceTimelineString',
  'routeConfidenceTimelineSource',
  'navigateRouteConfidenceGeometry',
  'navigateTimelineMeasure',
  'buildNavigateRouteConfidenceTimelineOverlays',
  'routeConfidenceTimelinePointAtMeasure',
  'routeConfidenceTimelineMatchesRoute',
];
const confidenceModule = loadCharacterizedBoundary(
  path.join(root, 'lib', 'navigation', 'navigateRouteConfidenceTimelinePresentation.ts'),
  confidenceFunctionNames,
  "from '../../lib/navigation/navigateRouteConfidenceTimelinePresentation'",
);

assert.strictEqual(confidenceModule.routeConfidenceTimelineConfidenceFromPercent(70), 'high');
assert.strictEqual(confidenceModule.routeConfidenceTimelineConfidenceFromPercent(45), 'medium');
assert.strictEqual(confidenceModule.routeConfidenceTimelineConfidenceFromPercent(1), 'low');
assert.strictEqual(confidenceModule.routeConfidenceTimelineConfidenceFromPercent(0), 'unknown');
assert.strictEqual(confidenceModule.routeConfidenceTimelineConfidenceFromPercent(null), 'unknown');

assert.strictEqual(
  confidenceModule.routeConfidenceTimelineTimestamp('2026-07-13T12:00:00Z'),
  '2026-07-13T12:00:00.000Z',
);
assert.strictEqual(
  confidenceModule.routeConfidenceTimelineTimestamp(1_700_000_000),
  '2023-11-14T22:13:20.000Z',
);
assert.strictEqual(confidenceModule.routeConfidenceTimelineTimestamp(' provider supplied '), 'provider supplied');
assert.strictEqual(confidenceModule.routeConfidenceTimelineTimestamp(null), null);

const geometry = confidenceModule.navigateRouteConfidenceGeometry(
  [
    { lat: 34, lng: -117 },
    { lat: Number.NaN, lng: -117.1 },
    { lat: 35, lng: -118 },
  ],
  'geometry-v2',
  12_500,
);
assert.deepStrictEqual(geometry.coordinates, [
  { lat: 34, lng: -117 },
  { lat: 35, lng: -118 },
]);
assert.strictEqual(geometry.distanceMeters, 12_500);
assert.strictEqual(geometry.providerMetadata.geometryVersion, 'geometry-v2');
assert.strictEqual(
  confidenceModule.navigateRouteConfidenceGeometry([{ lat: 34, lng: -117 }], 'short', null),
  null,
);
assert.strictEqual(confidenceModule.navigateTimelineMeasure(geometry.coordinates, 12_500), 12_500);
assert.strictEqual(confidenceModule.navigateTimelineMeasure(geometry.coordinates, null), 1_000);

const generatedAt = '2026-07-13T12:00:00.000Z';
const overlays = confidenceModule.buildNavigateRouteConfidenceTimelineOverlays({
  totalMeasure: 10_000,
  routeConfidenceSummary: { confidence: 42, summary: 'Coverage is limited.' },
  cacheSnapshot: {
    cached_route_available: false,
    offline_cache_ready: false,
    evaluated_at: generatedAt,
  },
  routeHazardIntel: { headline: 'Wind exposure', summaryLine: 'Crosswinds expected.' },
  weatherObservedAt: generatedAt,
  weatherSource: 'cache_stale',
  generatedAt,
});
assert.deepStrictEqual(
  overlays.map((overlay) => overlay.id),
  ['navigate-route-confidence-summary', 'navigate-offline-map-gap', 'navigate-weather-risk'],
);
assert.strictEqual(overlays[0].confidenceLevel, 'low');
assert.strictEqual(overlays[0].conditionState, 'unknown');
assert.strictEqual(overlays[1].source.freshness, 'missing');
assert.strictEqual(overlays[2].source.freshness, 'stale');
assert.strictEqual(overlays[2].conditionState, 'known_risky');

const selectedPoint = confidenceModule.routeConfidenceTimelinePointAtMeasure(
  [
    { lat: 1, lng: 1 },
    { lat: 2, lng: 2 },
    { lat: 3, lng: 3 },
  ],
  { startMeasure: 400, endMeasure: 600 },
  1_000,
);
assert.deepStrictEqual(selectedPoint, { lat: 2, lng: 2 });
assert.strictEqual(
  confidenceModule.routeConfidenceTimelineMatchesRoute(
    { routeId: 'route-1', geometryVersion: 'v1' },
    'route-1',
    'v1',
  ),
  true,
);
assert.strictEqual(
  confidenceModule.routeConfidenceTimelineMatchesRoute(
    { routeId: 'route-1', geometryVersion: 'v1' },
    'route-2',
    'v1',
  ),
  false,
);
assert.strictEqual(confidenceModule.routeConfidenceTimelineMatchesRoute(null, 'route-1', 'v1'), false);

function countHookCalls(sourceFile) {
  const counts = { useEffect: 0, useFocusEffect: 0, useState: 0 };
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      if (Object.prototype.hasOwnProperty.call(counts, name)) counts[name] += 1;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return counts;
}

const measuredSourceFile = ts.createSourceFile(
  navigatePath,
  navigateSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const hookCounts = countHookCalls(measuredSourceFile);
const structuralEvidence = {
  baseline: {
    lines: 31_469,
    imports: 234,
    useEffect: 148,
    useFocusEffect: 8,
    useState: 236,
    explicitSubscriptions: 15,
    navigateScreenRenderInstrumentationCallSites: 1,
  },
  current: {
    lines: navigateSource.split(/\r?\n/).length,
    imports: measuredSourceFile.statements.filter(ts.isImportDeclaration).length,
    ...hookCounts,
    explicitSubscriptions:
      (navigateSource.match(/\.subscribe\(/g) ?? []).length +
      (navigateSource.match(/\.onStatusChange\(/g) ?? []).length +
      (navigateSource.match(/\.addEventListener\(/g) ?? []).length,
    navigateScreenRenderInstrumentationCallSites:
      (navigateSource.match(/recordECSPerformanceRender\(/g) ?? []).length,
  },
  bundleBoundary: {
    routeConfidencePanelLoad: navigateSource.includes(
      "import { RouteConfidenceTimelinePanel } from '../../components/navigate/RouteConfidenceTimelinePanel';",
    ) ? 'static' : 'missing',
    lazyLoadChanged: false,
  },
};

assert.ok(
  structuralEvidence.current.lines < structuralEvidence.baseline.lines,
  'The first slice should reduce the Navigate screen line count.',
);
assert.strictEqual(structuralEvidence.current.useEffect, structuralEvidence.baseline.useEffect);
assert.strictEqual(structuralEvidence.current.useFocusEffect, structuralEvidence.baseline.useFocusEffect);
assert.strictEqual(structuralEvidence.current.useState, structuralEvidence.baseline.useState);
assert.strictEqual(
  structuralEvidence.current.explicitSubscriptions,
  structuralEvidence.baseline.explicitSubscriptions,
);
assert.strictEqual(
  structuralEvidence.current.navigateScreenRenderInstrumentationCallSites,
  structuralEvidence.baseline.navigateScreenRenderInstrumentationCallSites,
);
assert.strictEqual(structuralEvidence.bundleBoundary.routeConfidencePanelLoad, 'static');

console.log(JSON.stringify({
  suite: 'navigate-decomposition-characterization',
  status: 'passed',
  structuralEvidence,
}, null, 2));
