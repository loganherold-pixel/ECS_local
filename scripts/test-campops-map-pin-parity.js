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
  buildCampOpsCampScoutMapPins,
  campOpsSourceToSharedCampPinSource,
  getCampOpsMapPinRoleLabel,
  isCampOpsMapPinPayload,
} = require(adapterPath);
const { normalizeRenderedCampScoutMarkers } = require(mapRendererPath);

function makeCamp(id, name, source, sourceConfidence, latitude, longitude, score) {
  return {
    id,
    name,
    source,
    sourceConfidence,
    location: { latitude, longitude },
    score,
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

const pins = buildCampOpsCampScoutMapPins(recommendationSet, {
  selectedCampOpsCandidateId: 'rec-1',
});

assert.strictEqual(pins.length, 5, 'CampOps should render at most five ranked route candidate pins.');
assert.deepStrictEqual(
  pins.map((pin) => pin.rankLabel),
  ['1', '2', '3', '4', '5'],
  'CampOps route candidates should use rank numbers on the shared camp pin.',
);
assert.deepStrictEqual(
  pins.map((pin) => pin.title),
  ['Camp 1', 'Camp 2', 'Camp 3', 'Camp 4', 'Camp 5'],
  'CampOps route candidate labels should read Camp 1 through Camp 5.',
);
assert(
  pins.every((pin) => pin.pinFamily === 'campops' && isCampOpsMapPinPayload(pin)),
  'CampOps pins should be tagged for behavior while reusing the Camp Scout marker payload.',
);
assert(
  pins.every((pin) => ['ecs_inferred', 'community_suggested', 'imported_route_context'].includes(pin.sourceType)),
  'CampOps pins should normalize into existing Camp Scout source style buckets.',
);
assert.strictEqual(pins[0].selected, true, 'Selected CampOps endpoint should use the shared selected pin state.');
assert.strictEqual(pins[1].selected, false, 'Unselected CampOps endpoint should not use selected state.');
assert.strictEqual(pins[0].confidenceGrade, 'A', 'Recommended endpoint should carry a shared confidence grade.');
assert.strictEqual(pins[1].confidenceGrade, 'B', 'Backup endpoint should carry a shared confidence grade.');
assert.strictEqual(pins[2].confidenceGrade, 'B', 'Emergency endpoint should carry a shared confidence grade.');

for (const role of ['recommended', 'backup', 'emergency']) {
  assert(
    getCampOpsMapPinRoleLabel(role),
    `Missing role label helper for ${role}.`,
  );
}

assert.strictEqual(
  buildCampOpsCampScoutMapPins(null).length,
  0,
  'Feature-off or missing CampOps payloads should add no endpoint pins.',
);
assert.strictEqual(
  buildCampOpsCampScoutMapPins({ ...recommendationSet, rankedCandidates: [] }).length,
  0,
  'An explicit empty ranked candidate list should not fall back to role pins.',
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

const duplicatePins = buildCampOpsCampScoutMapPins({
  ...recommendationSet,
  rankedCandidates: [
    recommendationSet.rankedCandidates[0],
    recommendationSet.rankedCandidates[0],
    recommendationSet.rankedCandidates[1],
  ],
});
assert.strictEqual(
  duplicatePins.length,
  2,
  'Duplicate ranked CampOps route candidates for the same camp should not create duplicate pins.',
);
assert.strictEqual(
  buildCampOpsCampScoutMapPins({ ...recommendationSet, rankedCandidates: [recommendationSet.rankedCandidates[5]] }).length,
  0,
  'Low-confidence ranked candidates should not create route camp pins.',
);

const renderedPins = normalizeRenderedCampScoutMarkers(pins);
assert.strictEqual(renderedPins.length, 5, 'Shared renderer should accept CampOps pins through campScoutMarkers.');
assert.strictEqual(renderedPins[0].pinFamily, 'campops', 'Renderer payload should preserve CampOps behavior tag.');
assert.strictEqual(
  renderedPins[0].campOpsCandidateId,
  'rec-1',
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
    mapRendererSource.includes('camp-scout-label') &&
    mapRendererSource.includes("label.textContent = 'camp'"),
  'Remote Camp Pin Scout base marker style should remain the renderer source of truth.',
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
    navigateSource.includes('buildCampOpsCampScoutMapPins(campOpsRecommendationSet') &&
    navigateSource.includes('campScoutMarkers={sharedCampPinMapMarkers}'),
  'Navigate should gate and feed CampOps route candidates through the shared Camp Scout marker prop.',
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
    adapterSource.includes('CAMP_OPS_ROUTE_PIN_LIMIT = 5') &&
    adapterSource.includes('Camp ${rank}'),
  'Adapter should preserve CampOps behavior tags while rendering the top five route candidates as shared camp pins.',
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
    docs.includes('Community publishing and telemetry remain off'),
  'Map pin parity documentation should describe shared style, adapter, and feature flag posture.',
);

console.log('CampOps map pin parity checks passed.');
