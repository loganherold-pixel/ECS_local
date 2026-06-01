const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    const passthrough = ({ children }) => children ?? null;
    return {
      View: passthrough,
      Text: passthrough,
      ActivityIndicator: passthrough,
      StyleSheet: {
        absoluteFillObject: {
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
        },
        create(styles) {
          return styles;
        },
      },
      Platform: { OS: 'web', select: (values) => values?.web ?? values?.default },
    };
  }
  if (request === 'react-native-webview') {
    return { WebView: function WebView() { return null; } };
  }
  if (request === 'expo-constants') {
    return { default: { expoConfig: { extra: {} }, manifest: { extra: {} } } };
  }
  if (request === './supabase' || request.endsWith('/supabase')) {
    return { supabase: null };
  }
  if (request === './ecsIssueReporter' || request.endsWith('/ecsIssueReporter')) {
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
  locateCampsitesForPolygon,
  pointInPolygon,
} = require(path.join(root, 'lib', 'campsites', 'campsiteLocatorService.ts'));
const {
  rankCampScoutCandidates,
  scoreCampScoutCandidate,
} = require(path.join(root, 'lib', 'campScout', 'campScoutScoring.ts'));
const {
  buildCampScoutPinFeatureCollection,
  CAMP_SCOUT_PIN_SOURCE_ID,
  CAMP_SCOUT_PIN_LAYER_ID,
} = require(path.join(root, 'components', 'navigate', 'MapRenderer.tsx'));

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function polygonFixture() {
  return [
    { latitude: 39.0, longitude: -121.0 },
    { latitude: 39.0, longitude: -120.9 },
    { latitude: 39.1, longitude: -120.9 },
    { latitude: 39.1, longitude: -121.0 },
  ];
}

function locatorCandidate(id, latitude, longitude, score, overrides = {}) {
  return {
    id,
    latitude,
    longitude,
    score,
    remotenessScore: score,
    campingSuitabilityScore: score,
    legalAccessScore: overrides.legalityStatus === 'unknown_needs_verification' ? 35 : score,
    terrainScore: score,
    sourceType: 'inferred',
    legalityStatus: 'unknown_needs_verification',
    ...overrides,
  };
}

function blankBreakdown(total = 0) {
  return {
    flatnessTerrain: total,
    accessConfidence: total,
    remotenessValue: total,
    legalAccessConfidence: total,
    safetyEnvironmentalRisk: total,
    sourceSignal: total,
    sourceQuality: total,
    remoteness: total,
    access: total,
    legality: total,
    terrain: total,
    proximity: total,
    confidence: total,
    total,
  };
}

function scoutCandidate(id, overrides = {}) {
  return {
    id,
    coordinate: { latitude: 39.04, longitude: -120.96 },
    title: `Candidate ${id}`,
    sourceType: 'ecs_inferred',
    confidenceScore: 0,
    confidenceGrade: 'D',
    scoreBreakdown: blankBreakdown(),
    reasons: [],
    cautions: [],
    accessConfidence: 80,
    legalityConfidence: 80,
    remotenessScore: 78,
    terrainConfidence: 80,
    slopeEstimate: 4,
    distanceFromNearestRoadMiles: 0.7,
    distanceFromPavementMiles: 5,
    safetyRiskScore: 0,
    environmentalRiskScore: 0,
    knownConflictRiskScore: 0,
    mapDataCompleteness: 90,
    ...overrides,
  };
}

class MockMapboxMap {
  constructor() {
    this.sources = new Map();
    this.layers = new Map();
    this.setDataCalls = 0;
  }

  addSource(id, config) {
    const source = {
      id,
      config,
      data: config.data,
      setData: (data) => {
        this.setDataCalls += 1;
        source.data = data;
      },
    };
    this.sources.set(id, source);
  }

  getSource(id) {
    return this.sources.get(id);
  }

  addLayer(layer) {
    this.layers.set(layer.id, layer);
  }

  getLayer(id) {
    return this.layers.get(id);
  }

  setLayoutProperty(id, key, value) {
    const layer = this.layers.get(id);
    if (layer) {
      layer.layout = { ...(layer.layout ?? {}), [key]: value };
    }
  }
}

function updateMockCampScoutMapboxSource(map, markers) {
  if (!map.getSource(CAMP_SCOUT_PIN_SOURCE_ID)) {
    map.addSource(CAMP_SCOUT_PIN_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }
  if (!map.getLayer(CAMP_SCOUT_PIN_LAYER_ID)) {
    map.addLayer({
      id: CAMP_SCOUT_PIN_LAYER_ID,
      type: 'circle',
      source: CAMP_SCOUT_PIN_SOURCE_ID,
      layout: { visibility: 'visible' },
      paint: { 'circle-radius': 7, 'circle-color': '#F2C24D' },
    });
  } else {
    map.setLayoutProperty(CAMP_SCOUT_PIN_LAYER_ID, 'visibility', 'visible');
  }
  const featureCollection = buildCampScoutPinFeatureCollection(markers);
  map.getSource(CAMP_SCOUT_PIN_SOURCE_ID).setData(featureCollection);
  return featureCollection;
}

async function main() {
  const polygon = polygonFixture();
  assert.strictEqual(polygon.length, 4, 'A completed draw-area polygon should contain captured vertices.');
  assert.strictEqual(
    pointInPolygon({ latitude: 39.05, longitude: -120.95 }, polygon),
    true,
    'A point inside the draw-area polygon should be recognized as inside.',
  );
  assert.strictEqual(
    pointInPolygon({ latitude: 39.2, longitude: -120.95 }, polygon),
    false,
    'A point outside the draw-area polygon should be recognized as outside.',
  );

  const polygonResults = await locateCampsitesForPolygon({
    polygonCoordinates: polygon,
    candidates: [
      locatorCandidate('official-inside', 39.05, -120.95, 92, {
        sourceType: 'official',
        legalityStatus: 'verified_allowed',
      }),
      locatorCandidate('inferred-inside', 39.06, -120.96, 72, {
        sourceType: 'inferred',
        legalityStatus: 'unknown_needs_verification',
      }),
      locatorCandidate('outside-area', 39.25, -120.95, 99, {
        sourceType: 'official',
        legalityStatus: 'verified_allowed',
      }),
    ],
  });
  assert.ok(
    polygonResults.some((candidate) => candidate.id === 'official-inside'),
    'A valid official campsite inside the drawn area should be returned.',
  );
  assert.ok(
    polygonResults.some((candidate) => candidate.id === 'inferred-inside'),
    'A valid inferred candidate inside the drawn area should be returned outside Official Only mode.',
  );
  assert.ok(
    !polygonResults.some((candidate) => candidate.id === 'outside-area'),
    'A candidate outside the drawn polygon should be excluded from draw-area results.',
  );

  const unknownLegalityResults = await locateCampsitesForPolygon({
    polygonCoordinates: polygon,
    candidates: [
      locatorCandidate('unknown-legality-inside', 39.055, -120.955, 46, {
        legalityStatus: 'unknown_needs_verification',
        legalAccessScore: 20,
      }),
    ],
  });
  assert.deepStrictEqual(
    unknownLegalityResults.map((candidate) => candidate.id),
    ['unknown-legality-inside'],
    'Unknown legality should not automatically exclude an otherwise viable draw-area candidate.',
  );
  assert.ok(
    unknownLegalityResults[0].warnings.some((warning) => warning.includes('verify local rules')),
    'Unknown legality candidates should carry rule-verification warning copy.',
  );

  const hardExcludedResults = await locateCampsitesForPolygon({
    polygonCoordinates: polygon,
    candidates: [
      locatorCandidate('private-land', 39.04, -120.94, 99, { isPrivateLand: true }),
      locatorCandidate('restricted-land', 39.045, -120.945, 98, {
        legalityStatus: 'restricted_or_not_allowed',
      }),
      locatorCandidate('closed-area', 39.05, -120.95, 97, { isClosed: true }),
      locatorCandidate('no-camping', 39.055, -120.955, 96, { noCamping: true }),
      locatorCandidate('still-usable', 39.06, -120.96, 58, {
        legalityStatus: 'unknown_needs_verification',
      }),
    ],
  });
  assert.deepStrictEqual(
    hardExcludedResults.map((candidate) => candidate.id),
    ['still-usable'],
    'Known private/restricted/closed/no-camping locations must be hard-excluded.',
  );

  const softCandidate = scoutCandidate('soft-slope', { slopeEstimate: 14 });
  const easyCandidate = scoutCandidate('easy-slope', { slopeEstimate: 2 });
  const scoredSoft = scoreCampScoutCandidate(softCandidate);
  const scoredEasy = scoreCampScoutCandidate(easyCandidate);
  assert.ok(
    scoredSoft.confidenceScore < scoredEasy.confidenceScore,
    'Soft terrain signals should reduce score.',
  );
  assert.deepStrictEqual(
    rankCampScoutCandidates([softCandidate], {
      expandedResults: true,
      allowLowConfidenceFallback: true,
    }).map((candidate) => candidate.id),
    ['soft-slope'],
    'Soft terrain signals should not hard-exclude unless a filter config says so.',
  );
  assert.deepStrictEqual(
    rankCampScoutCandidates([softCandidate], {
      expandedResults: true,
      allowLowConfidenceFallback: true,
      maximumSlopeEstimate: 5,
    }).map((candidate) => candidate.id),
    [],
    'Configured slope limits should be able to exclude soft terrain failures.',
  );

  const strictSoftFallback = await locateCampsitesForPolygon({
    polygonCoordinates: polygon,
    candidates: [
      locatorCandidate('fallback-low-1', 39.04, -120.94, 30, {
        legalityStatus: 'unknown_needs_verification',
      }),
      locatorCandidate('fallback-low-2', 39.045, -120.945, 28, {
        legalityStatus: 'unknown_needs_verification',
      }),
    ],
  });
  assert.deepStrictEqual(
    strictSoftFallback.map((candidate) => candidate.id),
    ['fallback-low-1', 'fallback-low-2'],
    'Fallback candidates should be returned when strict soft filters produce zero results.',
  );
  assert.ok(
    strictSoftFallback.every((candidate) => candidate.viabilityTier === 'possible'),
    'Fallback candidates should be marked possible rather than verified.',
  );

  assert.deepStrictEqual(
    rankCampScoutCandidates(
      [
        scoutCandidate('official-visible', {
          sourceType: 'official_mapped',
          legalityConfidence: 95,
          accessConfidence: 95,
          terrainConfidence: 95,
          remotenessScore: 85,
        }),
        scoutCandidate('inferred-hidden', { sourceType: 'ecs_inferred' }),
        scoutCandidate('fallback-hidden', { sourceType: 'ecs_inferred', legalityConfidence: 35 }),
      ],
      {
        filterMode: 'official_only',
        sourceTypes: ['official_mapped'],
        includeCommunitySuggestions: false,
        expandedResults: true,
        allowLowConfidenceFallback: true,
      },
    ).map((candidate) => candidate.id),
    ['official-visible'],
    'Official Only mode must not return inferred or fallback candidates.',
  );

  const featureCollection = buildCampScoutPinFeatureCollection([
    {
      id: 'draw-pin-1',
      latitude: 39.05,
      longitude: -120.95,
      title: 'Potential campsite',
      sourceType: 'ecs_inferred',
      confidenceGrade: 'C',
      confidenceScore: 58,
      rankLabel: 'C1',
      legalityStatus: 'unknown_needs_verification',
      warnings: ['Verify local rules before camping.'],
    },
  ]);
  assert.strictEqual(
    featureCollection.features.length,
    1,
    'A non-empty candidate list should create a non-empty GeoJSON FeatureCollection.',
  );
  assert.strictEqual(
    featureCollection.features[0].type,
    'Feature',
    'Camp Scout pin entries should be GeoJSON Features.',
  );
  assert.strictEqual(
    featureCollection.features[0].geometry.type,
    'Point',
    'Camp Scout pin geometries should be GeoJSON Points.',
  );
  assert.deepStrictEqual(
    featureCollection.features[0].geometry.coordinates,
    [-120.95, 39.05],
    'Mapbox campsite pin coordinates must use [lng, lat] order.',
  );
  assert.strictEqual(featureCollection.features[0].properties.id, 'camp-scout-draw-pin-1');
  assert.strictEqual(featureCollection.features[0].properties.source, 'ecs_inferred');
  assert.strictEqual(featureCollection.features[0].properties.confidence, 'C');
  assert.strictEqual(
    featureCollection.features[0].properties.legalityStatus,
    'unknown_needs_verification',
  );

  const mockMap = new MockMapboxMap();
  const firstUpdate = updateMockCampScoutMapboxSource(mockMap, [
    {
      id: 'area-a-pin',
      latitude: 39.05,
      longitude: -120.95,
      title: 'Area A Pin',
      sourceType: 'ecs_inferred',
      confidenceGrade: 'B',
      confidenceScore: 75,
      rankLabel: 'B1',
    },
  ]);
  assert.strictEqual(mockMap.getSource(CAMP_SCOUT_PIN_SOURCE_ID).data, firstUpdate);
  assert.strictEqual(mockMap.getSource(CAMP_SCOUT_PIN_SOURCE_ID).data.features.length, 1);
  assert.strictEqual(
    mockMap.getLayer(CAMP_SCOUT_PIN_LAYER_ID).layout.visibility,
    'visible',
    'The campsite Mapbox layer should be visible when pins are present.',
  );

  const sourceBeforeRefresh = mockMap.getSource(CAMP_SCOUT_PIN_SOURCE_ID);
  const secondUpdate = updateMockCampScoutMapboxSource(mockMap, [
    {
      id: 'area-b-pin',
      latitude: 39.07,
      longitude: -120.97,
      title: 'Area B Pin',
      sourceType: 'official_mapped',
      confidenceGrade: 'A',
      confidenceScore: 90,
      rankLabel: 'OFF',
    },
  ]);
  assert.strictEqual(
    mockMap.getSource(CAMP_SCOUT_PIN_SOURCE_ID),
    sourceBeforeRefresh,
    'Updating the drawn area should refresh the campsite source instead of permanently clearing/recreating it.',
  );
  assert.strictEqual(mockMap.setDataCalls, 2);
  assert.strictEqual(secondUpdate.features[0].properties.id, 'camp-scout-area-b-pin');
  assert.strictEqual(mockMap.getSource(CAMP_SCOUT_PIN_SOURCE_ID).data.features.length, 1);
  assert.strictEqual(mockMap.getLayer(CAMP_SCOUT_PIN_LAYER_ID).layout.visibility, 'visible');

  const navigateSource = read(path.join('app', '(tabs)', 'navigate.tsx'));
  assert.ok(
    navigateSource.includes('No raw campsite candidates were found in this area.') &&
      navigateSource.includes('No candidate campsites passed the current filters.') &&
      navigateSource.includes('Only restricted/private/closed areas were found.') &&
      navigateSource.includes('Potential inferred locations are hidden because Official Only is enabled.') &&
      navigateSource.includes('Lower-confidence inferred campsite options are available, but they require rule verification.'),
    'Zero-pin empty states should explain no raw candidates, filtered candidates, restrictions, Official Only hiding, and lower-confidence options.',
  );
  assert.ok(
    navigateSource.includes('draw_area_empty_state') &&
      navigateSource.includes('zeroResultReason') &&
      navigateSource.includes('mapboxSourceContainsFeatures') &&
      navigateSource.includes('mapboxLayerContainsFeatures'),
    'Zero-pin diagnostics should expose candidate counts, dominant reason, and Mapbox feature presence.',
  );
  assert.ok(
    !navigateSource.includes('Legal campsite') &&
      !navigateSource.includes('Camping is allowed here'),
    'Draw-area campsite UI copy must not imply legality for inferred or unknown sites.',
  );

  console.log('CampOps draw-area campsite pin flow regression checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
