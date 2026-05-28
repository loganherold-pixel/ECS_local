const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

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
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  });
  module._compile(transpiled.outputText, filename);
}

require.extensions['.ts'] = compileTypescript;
require.extensions['.tsx'] = compileTypescript;

const {
  normalizeRenderedCampsiteMarkers,
  normalizeRenderedCampScoutMarkers,
  buildCampScoutPinFeatureCollection,
  CAMP_SCOUT_PIN_SOURCE_ID,
  CAMP_SCOUT_PIN_LAYER_ID,
} = require(path.join(__dirname, '..', 'components', 'navigate', 'MapRenderer.tsx'));

const mapRendererSource = fs.readFileSync(
  path.join(__dirname, '..', 'components', 'navigate', 'MapRenderer.tsx'),
  'utf8',
);

function assertSourceIncludes(fragment, message) {
  assert.ok(mapRendererSource.includes(fragment), message);
}

function makeMarker(index, score = index) {
  return {
    id: `camp-${index}`,
    latitude: 39 + index * 0.001,
    longitude: -121,
    title: `Camp ${index}`,
    rating: index % 2 === 0 ? 'A' : 'B',
    score,
    ratingFactors: [
      {
        label: 'Access confidence',
        value: `${score}/100`,
        impact: score >= 70 ? 'positive' : 'neutral',
        description: 'Access confidence survives marker payload normalization.',
      },
    ],
    confidenceScore: score,
    rank: index + 1,
    rankLabel: String(index + 1),
  };
}

const eightMarkers = Array.from({ length: 8 }, (_, index) => makeMarker(index, 100 - index));
const capped = normalizeRenderedCampsiteMarkers(eightMarkers);
assert.strictEqual(capped.length, 5, 'Renderer payload normalization must cap AI campsite suggestions at 5.');
assert.deepStrictEqual(
  capped.map((marker) => marker.id),
  ['camp-0', 'camp-1', 'camp-2', 'camp-3', 'camp-4'],
  'Renderer must preserve upstream marker order and CampIntel site ids instead of sorting/scoring.',
);

const knownSourceMarkers = [
  ...eightMarkers,
  {
    ...makeMarker(20, 72),
    id: 'community-campsite:approved-1',
    markerKind: 'community_campsite',
    communityCampSiteId: 'approved-1',
    category: 'community',
    rankLabel: 'CM',
  },
  {
    ...makeMarker(21, 64),
    id: 'private_campsite:private-1',
    markerKind: 'private_campsite',
    reportId: 'private-1',
    visibilityScope: 'private',
    category: 'private',
    rankLabel: 'PR',
  },
];
const cappedWithKnownSources = normalizeRenderedCampsiteMarkers(knownSourceMarkers);
assert.deepStrictEqual(
  cappedWithKnownSources.map((marker) => marker.id),
  ['camp-0', 'camp-1', 'camp-2', 'camp-3', 'camp-4', 'community-campsite:approved-1', 'private_campsite:private-1'],
  'Renderer should cap AI suggestions without dropping known campsite source layers.',
);
assert.strictEqual(
  cappedWithKnownSources[5].communityCampSiteId,
  'approved-1',
  'Renderer should preserve community source identifiers for campsite details.',
);
assert.strictEqual(
  cappedWithKnownSources[6].visibilityScope,
  'private',
  'Renderer should preserve personal campsite layer scope for detail routing.',
);

const empty = normalizeRenderedCampsiteMarkers([]);
assert.deepStrictEqual(empty, [], 'Empty campsite payload must normalize to an empty marker list.');

assert.strictEqual(capped[0].rating, 'A', 'Renderer payload normalization must preserve campsite rating.');
assert.strictEqual(capped[0].score, 100, 'Renderer payload normalization must preserve campsite score.');
assert.strictEqual(capped[0].rank, 1, 'Renderer payload normalization must preserve campsite rank.');
assert.strictEqual(capped[0].rankLabel, '1', 'Renderer payload normalization must preserve campsite rank label.');
assert.deepStrictEqual(
  capped[0].ratingFactors,
  [
    {
      label: 'Access confidence',
      value: '100/100',
      impact: 'positive',
      description: 'Access confidence survives marker payload normalization.',
    },
  ],
  'Renderer payload normalization must preserve ratingFactors for marker popups.',
);

const unsortedByScore = [
  makeMarker(1, 10),
  makeMarker(2, 99),
  makeMarker(3, 5),
];
const orderPreserved = normalizeRenderedCampsiteMarkers(unsortedByScore);
assert.deepStrictEqual(
  orderPreserved.map((marker) => marker.id),
  ['camp-1', 'camp-2', 'camp-3'],
  'Renderer must not own campsite scoring or reorder markers by score.',
);
assert.deepStrictEqual(
  orderPreserved.map((marker) => marker.rankLabel),
  ['2', '3', '4'],
  'Renderer should preserve upstream marker rank labels even when scores are unsorted.',
);

const fallbackRanked = normalizeRenderedCampsiteMarkers([
  { id: 'legacy-1', latitude: 39.1, longitude: -121.1, title: 'Legacy One' },
  { id: 'legacy-2', latitude: 39.2, longitude: -121.2, title: 'Legacy Two' },
]);
assert.deepStrictEqual(
  fallbackRanked.map((marker) => marker.rankLabel),
  ['1', '2'],
  'Renderer should add deterministic fallback rank labels for legacy campsite markers.',
);

const invalidSkipped = normalizeRenderedCampsiteMarkers([
  makeMarker(1),
  { id: 'bad-lat', latitude: 999, longitude: -121 },
  makeMarker(2),
]);
assert.deepStrictEqual(
  invalidSkipped.map((marker) => marker.id),
  ['camp-1', 'camp-2'],
  'Renderer should skip invalid marker coordinates without breaking the cap path.',
);

const campScoutMarkers = normalizeRenderedCampScoutMarkers([
  {
    id: 'draw-area-possible-1',
    latitude: 39.1234,
    longitude: -121.5678,
    title: 'Potential campsite',
    sourceType: 'ecs_inferred',
    confidenceGrade: 'C',
    confidenceScore: 54,
    legalityStatus: 'unknown_needs_verification',
    warnings: ['Potential campsite: verify local rules, permits, closures, and land ownership.'],
    reasons: ['Inside selected campsite search area.'],
    distanceFromRoadOrTrail: 0.8,
    slope: 4,
    accessNotes: 'Access requires field verification.',
  },
]);
assert.strictEqual(campScoutMarkers.length, 1, 'Non-empty Camp Scout candidate lists must create rendered marker payloads.');
assert.strictEqual(
  campScoutMarkers[0].legalityStatus,
  'unknown_needs_verification',
  'Camp Scout marker payloads should preserve legality status for pin details.',
);
assert.deepStrictEqual(
  campScoutMarkers[0].warnings,
  ['Potential campsite: verify local rules, permits, closures, and land ownership.'],
  'Camp Scout marker payloads should preserve source warnings.',
);
assert.strictEqual(
  campScoutMarkers[0].rankLabel,
  undefined,
  'Camp Scout marker payloads should not synthesize visible rank labels.',
);

const campScoutGeoJson = buildCampScoutPinFeatureCollection([
  {
    id: 'geojson-camp',
    latitude: 39.25,
    longitude: -121.75,
    title: 'GeoJSON Camp',
    sourceType: 'ecs_inferred',
    confidenceGrade: 'B',
    confidenceScore: 76,
  },
]);
assert.strictEqual(campScoutGeoJson.features.length, 1, 'Camp Scout GeoJSON feature collection should be non-empty.');
assert.deepStrictEqual(
  campScoutGeoJson.features[0].geometry.coordinates,
  [-121.75, 39.25],
  'Camp Scout GeoJSON point coordinates must be [lng, lat] for Mapbox.',
);
assert.strictEqual(campScoutGeoJson.features[0].geometry.type, 'Point', 'Camp Scout features must render as Point geometry.');
assert.strictEqual(
  campScoutGeoJson.features[0].properties.source,
  'ecs_inferred',
  'Camp Scout GeoJSON properties must expose a source alias for Mapbox styling/debugging.',
);
assert.strictEqual(
  campScoutGeoJson.features[0].properties.confidence,
  'B',
  'Camp Scout GeoJSON properties must expose confidence for Mapbox styling/debugging.',
);
assert.strictEqual(
  campScoutGeoJson.features[0].properties.legalityStatus,
  'unknown_needs_verification',
  'Camp Scout GeoJSON properties must include legality status.',
);

assertSourceIncludes(
  "anchor: 'center'",
  'Camp markers must use a center anchor so the visual center stays on the campsite coordinate.',
);
assertSourceIncludes(
  'offset: [0, 0]',
  'Camp markers must not use screen-space offsets that drift at different zoom levels.',
);
assertSourceIncludes(
  '[CAMP_MARKER] overlay_projection_used false',
  'Camp marker diagnostics should confirm screen-space overlay projection is not used.',
);
assertSourceIncludes(
  '[CAMP_MARKER] camera_update zoom=',
  'Camp marker diagnostics should include camera zoom updates.',
);
assertSourceIncludes(
  "setLngLat([item.longitude, item.latitude])",
  'Camp Scout DOM markers must send coordinates to Mapbox as [lng, lat].',
);
assert.strictEqual(
  CAMP_SCOUT_PIN_SOURCE_ID,
  'ecs-camp-scout-pins-source',
  'Camp Scout Mapbox source id should be stable for addSource/getSource/setData.',
);
assert.strictEqual(
  CAMP_SCOUT_PIN_LAYER_ID,
  'ecs-camp-scout-pins-layer',
  'Camp Scout Mapbox layer id should be stable and singular.',
);
assertSourceIncludes(
  'ensureCampScoutPinLayer();',
  'Camp Scout source/layer should be re-created after map load and style reload.',
);
assertSourceIncludes(
  'setGeoJson(CAMP_SCOUT_SOURCE_ID, featureCollection(features));',
  'Camp Scout Mapbox source should receive a non-empty FeatureCollection when candidates exist.',
);
assertSourceIncludes(
  'pointFeature(item.id ||',
  'Camp Scout Mapbox features should be valid Point features.',
);
assertSourceIncludes(
  '[item.longitude, item.latitude]',
  'Camp Scout Mapbox features must use [lng, lat] coordinate order.',
);
assertSourceIncludes(
  '[CAMP_SCOUT_DEBUG] mapbox_pin_layer candidateCount=',
  'Camp Scout Mapbox diagnostics should report candidate/feature counts and source/layer ids behind the debug flag.',
);
assertSourceIncludes(
  '[CAMP_SCOUT_DEBUG] rendered_marker_count=',
  'Camp Scout diagnostics should report rendered marker counts behind the debug flag.',
);
assertSourceIncludes(
  'createDroppedPinMarkerElement(item)',
  'Dropped map pins should render through a typed marker element instead of a plain colored dot.',
);
assertSourceIncludes(
  'pin-type-camp',
  'Dropped camp pins should include an inside camp symbol.',
);
assertSourceIncludes(
  'pin-type-fuel',
  'Dropped fuel pins should include an inside fuel symbol.',
);
assertSourceIncludes(
  'pin-type-water',
  'Dropped water pins should include an inside water symbol.',
);
assertSourceIncludes(
  'pin-type-poi',
  'Dropped POI pins should include an inside location symbol.',
);
assertSourceIncludes(
  'mapChar: typeof m.mapChar ===',
  'Dropped pin payloads should preserve mapChar fallback metadata for unknown pin types.',
);
assertSourceIncludes(
  'height: 42px;',
  'Selected camp marker shell should stay square so the selected core/ripple share one coordinate center.',
);
assertSourceIncludes(
  'content: none;',
  'Selected camp marker should not add a bottom pointer that visually moves the coordinate center.',
);
assert.ok(
  !mapRendererSource.includes("anchor: item.selected ? 'bottom' : 'center'"),
  'Selected camp markers must not use bottom anchoring.',
);

console.log('Campsite renderer checks passed.');
