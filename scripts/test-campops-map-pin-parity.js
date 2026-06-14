const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const mapRendererPath = path.join(root, 'components', 'navigate', 'MapRenderer.tsx');
const navigatePath = path.join(root, 'app', '(tabs)', 'navigate.tsx');
const adapterPath = path.join(root, 'lib', 'campops', 'campOpsMapPins.ts');
const docsPath = path.join(root, 'docs', 'campops', 'map_pin_parity.md');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return {
      ActivityIndicator() { return null; },
      Platform: { OS: 'web', select: (values) => values?.web ?? values?.default },
      StyleSheet: {
        absoluteFillObject: {},
        create(styles) { return styles; },
      },
      Text() { return null; },
      View() { return null; },
    };
  }
  if (request === 'react-native-webview') {
    return { WebView() { return null; } };
  }
  if (request === 'react-native-svg') {
    function Svg() { return null; }
    return {
      __esModule: true,
      default: Svg,
      Circle() { return null; },
      Line() { return null; },
      Polyline() { return null; },
      Rect() { return null; },
    };
  }
  if (request === 'expo-constants') {
    return { default: { expoConfig: { extra: {} }, manifest: { extra: {} } } };
  }
  if (request.endsWith('/supabase') || request === './supabase') {
    return { supabase: null };
  }
  if (request.endsWith('/ecsIssueReporter') || request === './ecsIssueReporter') {
    return { reportRecoverableFailure() {} };
  }
  return originalLoad(request, parent, isMain);
};

function compileTypescript(module, filename) {
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
  module._compile(output.outputText, filename);
}

require.extensions['.ts'] = compileTypescript;
require.extensions['.tsx'] = compileTypescript;

const {
  buildCampOpsCampEndpointMapPins,
  buildCampOpsCampScoutMapPins,
  campOpsSourceToSharedCampPinSource,
  getCampOpsMapPinRoleLabel,
  isCampOpsMapPinPayload,
} = require(adapterPath);
const {
  normalizeRenderedCampEndpointMarkers,
  normalizeRenderedCampScoutMarkers,
} = require(mapRendererPath);

function makeCamp(id, name, source, sourceConfidence, latitude, longitude, score, overrides = {}) {
  return {
    id,
    name,
    source,
    sourceConfidence,
    location: { latitude, longitude },
    score,
    ...overrides,
  };
}

const longCampName =
  'Ridgeline Endpoint With A Very Long Operational Name That Must Not Break Marker Rendering';
const recommendationSet = {
  recommendedCamp: makeCamp('rec-1', longCampName, 'route_candidate', 'high', 39.1, -120.1, 91),
  backupCamp: makeCamp('backup-1', 'Creek Backup Pullout', 'community', 'medium', 39.2, -120.2, 74),
  emergencyCamp: makeCamp('emergency-1', 'Fallback Meadow', 'manual', 'medium', 39.3, -120.3, 72),
  rankedCandidates: [
    makeCamp('rec-1', longCampName, 'route_candidate', 'high', 39.1, -120.1, 91),
    makeCamp('backup-1', 'Creek Backup Pullout', 'community', 'medium', 39.2, -120.2, 74),
    makeCamp('emergency-1', 'Fallback Meadow', 'manual', 'medium', 39.3, -120.3, 72),
    makeCamp('weather-1', 'Wind-Sheltered Bench', 'route_candidate', 'medium', 39.4, -120.4, 71),
    makeCamp('resupply-1', 'Fuel Margin Camp', 'route_candidate', 'medium', 39.5, -120.5, 70),
    makeCamp('overflow-1', 'Sixth Camp Should Not Render', 'route_candidate', 'medium', 39.6, -120.6, 67),
  ],
  rejectedCandidates: [],
  warnings: ['Source data stale'],
  assumptions: [],
  confidenceSummary: {
    level: 'medium',
    score: 76,
    reasons: [],
    missingDataFields: [],
  },
  scoresByCandidateId: {
    'rec-1': { overall: 93 },
    'backup-1': { overall: 74 },
    'emergency-1': { overall: 72 },
    'weather-1': { overall: 71 },
    'resupply-1': { overall: 70 },
    'overflow-1': { overall: 67 },
  },
};

assert.strictEqual(
  buildCampOpsCampEndpointMapPins,
  buildCampOpsCampScoutMapPins,
  'Legacy CampScout map-pin builder should remain a one-release Camp Endpoint shim.',
);
assert.strictEqual(
  normalizeRenderedCampEndpointMarkers,
  normalizeRenderedCampScoutMarkers,
  'Legacy CampScout marker renderer should remain a one-release Camp Endpoint shim.',
);

const pins = buildCampOpsCampEndpointMapPins(recommendationSet, {
  selectedCampOpsCandidateId: 'rec-1',
});

assert.deepStrictEqual(
  pins.map((pin) => pin.campOpsCandidateId),
  ['emergency-1'],
  'CampOps should only render user-confirmed/imported camp endpoints as actionable map pins.',
);
assert.deepStrictEqual(
  pins.map((pin) => pin.rankLabel),
  ['1'],
  'Actionable CampOps endpoint pins should use compact numeric rank labels.',
);
assert.deepStrictEqual(
  pins.map((pin) => pin.title),
  ['Camp 1'],
  'Actionable CampOps endpoint labels should stay generic and compact.',
);
assert(
  pins.every((pin) => pin.pinFamily === 'campops' && isCampOpsMapPinPayload(pin)),
  'CampOps pins should be tagged for behavior while reusing the Camp Scout marker payload.',
);
assert(
  pins.every((pin) => pin.sourceType === 'imported_route_context'),
  'Actionable CampOps pins should come from user-controlled or imported route context sources.',
);
assert.strictEqual(pins[0].selected, false, 'Suppressed inferred endpoint selection should not leak onto another pin.');
assert.strictEqual(pins[0].confidenceGrade, 'B', 'Actionable endpoint should carry a shared confidence grade.');

for (const role of ['recommended', 'backup', 'emergency']) {
  assert(
    getCampOpsMapPinRoleLabel(role),
    `Missing role label helper for ${role}.`,
  );
}

assert.strictEqual(
  buildCampOpsCampEndpointMapPins(null).length,
  0,
  'Feature-off or missing CampOps payloads should add no endpoint pins.',
);
assert.strictEqual(
  buildCampOpsCampEndpointMapPins({ ...recommendationSet, rankedCandidates: [] }).length,
  0,
  'An explicit empty ranked candidate list should not fall back to role pins.',
);
assert.strictEqual(
  buildCampOpsCampEndpointMapPins({
    ...recommendationSet,
    rankedCandidates: recommendationSet.rankedCandidates.filter((candidate) =>
      ['route_candidate', 'route_endpoint_candidate', 'draw_area_candidate', 'inferred', 'offline_dataset'].includes(candidate.source),
    ),
  }).length,
  0,
  'ECS-inferred, draw-area, route-candidate, and offline-only candidates must stay research-only and never render as navigable pins.',
);
assert.strictEqual(
  campOpsSourceToSharedCampPinSource('community'),
  'community_suggested',
  'Community CampOps endpoints should reuse the community Camp Scout source style.',
);
assert.strictEqual(
  campOpsSourceToSharedCampPinSource('manual'),
  'imported_route_context',
  'Manual or imported CampOps endpoints should reuse the imported route context source style.',
);

const duplicatePins = buildCampOpsCampEndpointMapPins({
  ...recommendationSet,
  rankedCandidates: [
    recommendationSet.rankedCandidates[2],
    recommendationSet.rankedCandidates[2],
    makeCamp('manual-2', 'Second User Camp', 'user_saved', 'medium', 39.6, -120.6, 74),
  ],
});
assert.strictEqual(
  duplicatePins.length,
  2,
  'Duplicate actionable CampOps candidates for the same camp should not create duplicate pins.',
);
assert.strictEqual(
  buildCampOpsCampEndpointMapPins({ ...recommendationSet, rankedCandidates: [recommendationSet.rankedCandidates[5]] }).length,
  0,
  'Low-confidence ranked candidates should not create route camp pins.',
);

const structureBufferPins = buildCampOpsCampEndpointMapPins({
  ...recommendationSet,
  rankedCandidates: [
    makeCamp('near-structure', 'Too Close To Structure', 'route_candidate', 'high', 39.7, -120.7, 95, {
      nearestStructureDistanceMiles: 0.8,
    }),
    makeCamp('clear-structure', 'Clear Structure Buffer', 'manual', 'high', 39.8, -120.8, 94, {
      nearestStructureDistanceMiles: 1.2,
    }),
  ],
  scoresByCandidateId: {
    'near-structure': { overall: 95 },
    'clear-structure': { overall: 94 },
  },
});
assert.deepStrictEqual(
  structureBufferPins.map((pin) => pin.campOpsCandidateId),
  ['clear-structure'],
  'CampOps route pins must suppress candidates inside the one-mile structure privacy buffer.',
);

const renderedPins = normalizeRenderedCampEndpointMarkers(pins);
assert.strictEqual(renderedPins.length, 1, 'Shared renderer should accept actionable CampOps pins through campEndpointMarkers.');
assert.strictEqual(renderedPins[0].pinFamily, 'campops', 'Renderer payload should preserve CampOps behavior tag.');
assert.strictEqual(
  renderedPins[0].campOpsCandidateId,
  'emergency-1',
  'Renderer payload should preserve the CampOps candidate id for marker tap behavior.',
);
assert.strictEqual(renderedPins[0].rankLabel, '1', 'Renderer should keep numeric CampOps rank labels.');
assert(
  renderedPins[0].title === 'Camp 1',
  'Renderer should preserve CampOps route pin labels.',
);

const mapRendererSource = fs.readFileSync(mapRendererPath, 'utf8');
const navigateSource = fs.readFileSync(navigatePath, 'utf8');
const adapterSource = fs.readFileSync(adapterPath, 'utf8');
const docs = fs.readFileSync(docsPath, 'utf8');

assert(
  mapRendererSource.includes('camp-scout-marker camp-scout-grade-') &&
    mapRendererSource.includes('camp-scout-selected') &&
    mapRendererSource.includes('camp-scout-tent') &&
    mapRendererSource.includes('camp-scout-rank') &&
    mapRendererSource.includes('root.appendChild(rank)') &&
    !mapRendererSource.includes('camp-scout-label') &&
    !mapRendererSource.includes("label.textContent = 'camp'"),
  'Remote Camp Pin Scout base marker style should render a tent icon with a hovering rank badge.',
);
assert(
  !mapRendererSource.includes('campops-marker') &&
    !mapRendererSource.includes('camp-ops-marker') &&
    !mapRendererSource.includes("addImage('campops") &&
    !mapRendererSource.includes('addImage("campops'),
  'CampOps must not register or define a duplicate marker asset/style.',
);
assert(
  mapRendererSource.includes("'aria-label'") &&
    mapRendererSource.includes("'role', 'button'"),
  'Shared Camp Scout pins should expose accessible marker labels.',
);
assert(
  navigateSource.includes('CAMPOPS_ROUTE_PINS_ENABLED') &&
    navigateSource.includes('getCampOpsRoutePinsRolloutConfig') &&
    navigateSource.includes('buildCampOpsCampEndpointMapPins(campOpsRecommendationSet') &&
    navigateSource.includes('campEndpointMarkers={sharedCampPinMapMarkers}') &&
    navigateSource.includes('onCampEndpointTap={handleCampScoutTap}'),
  'Navigate should gate and feed CampOps route candidates through the shared Camp Endpoint marker prop.',
);
assert(
  navigateSource.includes('campsiteCandidates?.campOps?.enabled') &&
    navigateSource.includes('isCampOpsMapPinPayload(payload)'),
  'Navigate should gate CampOps pins by the existing CampOps payload flag and behavior tag.',
);
assert(
  navigateSource.includes('setSelectedCampOpsEndpointId(endpointId)'),
  'Selecting a CampOps pin should mark the endpoint selected.',
);
assert(
  adapterSource.includes("pinFamily: 'campops'") &&
    adapterSource.includes('isCampOpsActionableMapPinCandidate') &&
    adapterSource.includes('Camp ${rank}'),
  'Adapter should preserve CampOps behavior tags only for user-confirmed/imported actionable camp pins.',
);
assert(
  !adapterSource.includes('definitely legal') &&
    !adapterSource.includes('guaranteed open') &&
    !adapterSource.includes('confirmed'),
  'CampOps map pin copy must avoid overclaiming legal/access confidence.',
);
assert(
  docs.includes('components/navigate/MapRenderer.tsx') &&
    docs.includes('lib/campops/campOpsMapPins.ts') &&
    docs.includes('research-only') &&
    docs.includes('Community publishing and telemetry remain off'),
  'Map pin parity documentation should describe shared style, research-only filtering, adapter, and feature flag posture.',
);

console.log('CampOps map pin parity checks passed.');
