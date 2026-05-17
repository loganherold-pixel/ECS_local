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
  getCampScoutConfidenceGrade,
  rankCampScoutCandidates,
  scoreCampScoutCandidate,
} = require(path.join(root, 'lib', 'campScout', 'campScoutScoring.ts'));
const {
  aggregateCampScoutCandidates,
} = require(path.join(root, 'lib', 'campScout', 'campScoutAggregator.ts'));
const {
  validateCampScoutArea,
} = require(path.join(root, 'lib', 'campScout', 'campScoutAreaSelection.ts'));
const {
  getCommunityCampCandidatesForArea,
} = require(path.join(root, 'lib', 'campScout', 'campScoutCommunityAdapter.ts'));
const {
  normalizeRenderedCampScoutMarkers,
} = require(path.join(root, 'components', 'navigate', 'MapRenderer.tsx'));

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function blankBreakdown() {
  return {
    flatnessTerrain: 0,
    accessConfidence: 0,
    remotenessValue: 0,
    legalAccessConfidence: 0,
    safetyEnvironmentalRisk: 0,
    sourceSignal: 0,
    sourceQuality: 0,
    remoteness: 0,
    access: 0,
    legality: 0,
    terrain: 0,
    proximity: 0,
    confidence: 0,
    total: 0,
  };
}

function candidate(id, overrides = {}) {
  const numeric = Number(String(id).replace(/\D/g, '') || 0);
  return {
    id,
    coordinate: {
      latitude: 39 + numeric * 0.001,
      longitude: -105,
    },
    title: `Camp Scout ${id}`,
    sourceType: 'official_mapped',
    confidenceScore: 0,
    confidenceGrade: 'D',
    scoreBreakdown: blankBreakdown(),
    reasons: [],
    cautions: [],
    accessConfidence: 88,
    legalityConfidence: 90,
    remotenessScore: 82,
    terrainConfidence: 90,
    slopeEstimate: 2,
    distanceFromNearestRoadMiles: 1.2,
    distanceFromPavementMiles: 7,
    safetyRiskScore: 5,
    environmentalRiskScore: 5,
    knownConflictRiskScore: 0,
    mapDataCompleteness: 95,
    sourceTimestamp: '2026-04-20T12:00:00.000Z',
    ...overrides,
  };
}

function square(south, west, north, east) {
  return [
    { latitude: south, longitude: west },
    { latitude: south, longitude: east },
    { latitude: north, longitude: east },
    { latitude: north, longitude: west },
  ];
}

async function run() {
  assert.equal(getCampScoutConfidenceGrade(85), 'A');
  assert.equal(getCampScoutConfidenceGrade(70), 'B');
  assert.equal(getCampScoutConfidenceGrade(50), 'C');
  assert.equal(getCampScoutConfidenceGrade(49), 'D');

  const scored = scoreCampScoutCandidate(candidate('score-1', {
    sourceType: 'ecs_inferred',
    accessConfidence: 62,
    legalityConfidence: 70,
    terrainConfidence: 68,
    mapDataCompleteness: 62,
  }), { nowIso: '2026-05-01T12:00:00.000Z' });
  assert.ok(scored.confidenceGrade);
  assert.ok(scored.reasons.length >= 2 && scored.reasons.length <= 4);
  assert.ok(scored.cautions.some((text) => text.includes('Access uncertain')));
  assert.ok(scored.cautions.some((text) => text.includes('Legal status uncertain')));
  assert.ok(scored.cautions.some((text) => text.includes('Low data coverage')));

  const many = Array.from({ length: 14 }, (_, index) =>
    candidate(`rank-${index}`, {
      accessConfidence: 92 - index,
      legalityConfidence: 94 - index,
      remotenessScore: 88 - index,
    }),
  );
  assert.equal(rankCampScoutCandidates(many).length, 5);
  assert.equal(
    rankCampScoutCandidates(many, { expandedResults: true, expandedLimit: 99 }).length,
    10,
  );
  assert.deepEqual(
    rankCampScoutCandidates([
      candidate('official-kept', { sourceType: 'official_mapped' }),
      candidate('community-hidden', { sourceType: 'community_suggested' }),
      candidate('ecs-hidden', { sourceType: 'ecs_inferred' }),
    ], { filterMode: 'official_only' }).map((item) => item.id),
    ['official-kept'],
  );
  assert.ok(
    !rankCampScoutCandidates([
      candidate('official-visible', { sourceType: 'official_mapped' }),
      candidate('community-off', { sourceType: 'community_suggested' }),
    ], { includeCommunitySuggestions: false }).some((item) => item.id === 'community-off'),
  );
  assert.deepEqual(
    rankCampScoutCandidates([
      candidate('unknown-possible', {
        sourceType: 'ecs_inferred',
        accessConfidence: 45,
        legalityConfidence: 35,
        remotenessScore: 54,
        terrainConfidence: 55,
        safetyRiskScore: 10,
        mapDataCompleteness: 55,
        legalityStatus: 'unknown_needs_verification',
      }),
    ], { allowLowConfidenceFallback: true, expandedResults: true }).map((item) => item.id),
    ['unknown-possible'],
    'Low-confidence unknown-legal candidates should be available to draw-area fallback ranking.',
  );
  assert.deepEqual(
    rankCampScoutCandidates([
      candidate('restricted-hidden', {
        sourceType: 'ecs_inferred',
        legalityStatus: 'restricted_or_not_allowed',
        legalityConfidence: 95,
      }),
    ], { allowLowConfidenceFallback: true, expandedResults: true }).map((item) => item.id),
    [],
    'Known restricted/no-camping candidates must stay hard-excluded even in fallback ranking.',
  );

  const area = {
    id: 'camp-scout-regression',
    bounds: {
      north: 39.3,
      south: 39,
      east: -104.7,
      west: -105,
    },
  };
  const aggregate = aggregateCampScoutCandidates({
    area,
    generatedAt: '2026-05-01T12:00:00.000Z',
    officialMappedCandidates: [
      candidate('dupe-official', {
        coordinate: { latitude: 39.1, longitude: -104.9 },
        sourceLabel: 'Official mapped source',
      }),
    ],
    communitySuggestedCandidates: [
      candidate('dupe-community', {
        coordinate: { latitude: 39.1003, longitude: -104.9003 },
        sourceType: 'community_suggested',
        sourceNote: 'Community report near official source',
      }),
    ],
    ecsInferredCandidates: [
      candidate('weak-hidden', {
        sourceType: 'ecs_inferred',
        accessConfidence: 20,
        legalityConfidence: 20,
        remotenessScore: 25,
        terrainConfidence: 30,
        safetyRiskScore: 80,
      }),
    ],
  });
  assert.equal(aggregate.totalCandidatesConsidered, 3);
  assert.equal(aggregate.officialMappedCount, 1);
  assert.equal(aggregate.communitySuggestedCount, 1);
  assert.ok(aggregate.candidatesShown.length <= 5);
  assert.ok(aggregate.hiddenLowConfidenceCount >= 1);
  assert.ok(aggregate.warnings.some((warning) => warning.includes('duplicate')));
  assert.ok(
    aggregate.candidatesShown.some((item) =>
      item.mergedSourceTypes?.includes('official_mapped') &&
      item.mergedSourceTypes?.includes('community_suggested'),
    ),
  );

  const empty = aggregateCampScoutCandidates({
    area,
    generatedAt: '2026-05-01T12:00:00.000Z',
    ecsInferredCandidates: [
      candidate('empty-weak', {
        sourceType: 'ecs_inferred',
        accessConfidence: 15,
        legalityConfidence: 15,
        remotenessScore: 20,
        terrainConfidence: 25,
        safetyRiskScore: 85,
      }),
    ],
  });
  assert.equal(empty.candidatesShown.length, 0);
  assert.equal(empty.summary, 'No high-confidence camp candidates found in this area.');
  assert.ok(empty.warnings.some((warning) => warning.includes('Try widening the area')));

  assert.equal(validateCampScoutArea(square(38, -106, 40, -104)).status, 'too_large');
  assert.equal(
    validateCampScoutArea(square(39, -105, 39.05, -104.95), {
      estimatedCandidateCount: 99,
    }).status,
    'excessive_candidates',
  );

  assert.deepEqual(
    await getCommunityCampCandidatesForArea(area, { includeCommunitySuggestions: true }),
    [],
  );

  const renderedCampScout = normalizeRenderedCampScoutMarkers(
    Array.from({ length: 12 }, (_, index) => ({
      id: `pin-${index}`,
      latitude: 39 + index * 0.001,
      longitude: -105,
      title: `Pin ${index}`,
      sourceType: index % 2 === 0 ? 'ecs_inferred' : 'community_suggested',
      confidenceGrade: index % 2 === 0 ? 'A' : 'B',
      confidenceScore: 90 - index,
      rank: index + 1,
      rankLabel: index % 2 === 0 ? `A${index}` : 'COM',
    })),
  );
  assert.equal(renderedCampScout.length, 10);
  assert.equal(renderedCampScout[0].sourceType, 'ecs_inferred');
  assert.equal(renderedCampScout[1].rankLabel, 'COM');

  const navigate = read(path.join('app', '(tabs)', 'navigate.tsx'));
  assert.ok(
    navigate.includes('campIntelMarkers={combinedCampMarkers}'),
    'MapRenderer should keep existing campsite marker layer wired.',
  );
  assert.ok(
    navigate.includes('campScoutMarkers={sharedCampPinMapMarkers}') &&
      navigate.includes('const sharedCampPinMapMarkers = useMemo<CampScoutMapMarkerPayload[]>') &&
      navigate.includes('...campScoutMapMarkers'),
    'MapRenderer should receive Camp Scout markers through the separate shared camp pin layer.',
  );
  const combinedStart = navigate.indexOf('const combinedCampMarkers = useMemo');
  const combinedEnd = navigate.indexOf('const activePolygonCampsiteSuggestions', combinedStart);
  const combinedBlock = navigate.slice(combinedStart, combinedEnd);
  assert.ok(
    combinedBlock.includes('routeKnownCampsiteMarkers'),
    'Existing route campsite pins should remain part of the campsite marker set.',
  );
  assert.ok(
    navigate.includes("const mapToastAttachedToGuidance = navigationOverlayMode === 'active'") &&
      navigate.includes('const activeGuidanceToastTopOffset =') &&
      navigate.includes('zIndex={mapToastAttachedToGuidance ? 84 : undefined}'),
    'Temporary notifications should remain below active guidance.',
  );
  assert.ok(
    navigate.includes("if (campScoutAreaMode !== 'results') return [];"),
    'Camp Scout candidate and marker paths should stay empty until scan results exist.',
  );
  assert.ok(
    navigate.includes("clearOwnedCampsiteCandidates('camp_scout_drawing_started', { clearPolygon: true })") &&
      navigate.includes("reason: 'polygon_scan_refresh_started'") &&
      !navigate.includes("clearOwnedCampsiteCandidates('camp_scout_view_scan_started', { clearPolygon: true })"),
    'Starting a same-context Camp Scout scan should use a refresh token instead of clearing pins through zero.',
  );
  assert.ok(
    navigate.includes('CAMP_SCOUT_DEFAULT_VISIBLE_PIN_LIMIT = 5') &&
      navigate.includes('CAMP_SCOUT_EXPANDED_VISIBLE_PIN_LIMIT = 10'),
    'Navigate should keep Camp Scout pin count constants at 5 default and 10 expanded.',
  );
  assert.ok(
    navigate.includes('No official campsite records found in this area.') &&
      navigate.includes('No candidate campsites passed the current filters.') &&
      navigate.includes('Only restricted/private/closed areas were found.') &&
      navigate.includes('Try expanding the area or switching from Official Only to Balanced.') &&
      navigate.includes('Potential inferred locations are hidden because Official Only is enabled.') &&
      navigate.includes('Lower-confidence inferred campsite options are available, but they require rule verification.'),
    'Camp Scout zero-pin states should explain no official records, filtered candidates, restrictions, Official Only hiding, and lower-confidence options without legality claims.',
  );
  assert.ok(
    navigate.includes("logCampScoutDebug('draw_area_empty_state'") &&
      navigate.includes('rawCandidateCount') &&
      navigate.includes('finalCandidateCount') &&
      navigate.includes('activeFilterPreset') &&
      navigate.includes('zeroResultReason') &&
      navigate.includes('mapboxSourceContainsFeatures') &&
      navigate.includes('mapboxLayerContainsFeatures'),
    'Camp Scout should expose debug-safe empty-state diagnostics for candidate counts and Mapbox pin feature state.',
  );

  const campScoutSources = [
    read(path.join('lib', 'campScout', 'types.ts')),
    read(path.join('lib', 'campScout', 'campScoutScoring.ts')),
    read(path.join('lib', 'campScout', 'campScoutAggregator.ts')),
    read(path.join('lib', 'campScout', 'campScoutCommunityAdapter.ts')),
    read(path.join('lib', 'campScout', 'index.ts')),
  ].join('\n');
  assert.ok(
    !/campops/i.test(campScoutSources),
    'Camp Scout domain should stay standalone and not import or reference CampOps.',
  );

  console.log('Camp Scout regression checks passed.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
