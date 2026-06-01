const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  return originalLoad(request, parent, isMain);
};

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(transpiled.outputText, filename);
};

const {
  CAMPSITE_GOOD_FALLBACK_SCORE,
  CAMPSITE_LIMITED_CONFIDENCE_SCORE,
  CAMPSITE_POSSIBLE_FALLBACK_SCORE,
  MIN_CAMPSITE_CORE_SCORE,
  MIN_CAMPSITE_SAFETY_SCORE,
  evaluateCampsiteCandidateViability,
  filterViableCampsiteCandidates,
  getCampsiteScore,
  isViableCampsiteCandidate,
} = require(path.join(__dirname, '..', 'lib', 'campsites', 'campsiteViabilityFilter.ts'));
const { campsiteCandidateEngineTestHooks } = require(path.join(__dirname, '..', 'lib', 'campsiteCandidateEngine.ts'));

function candidate(id, source, overrides = {}) {
  return {
    id,
    source,
    campSuitability: 82,
    terrainSuitability: 76,
    accessConfidence: 71,
    legalAccess: 70,
    ...overrides,
  };
}

function main() {
  assert.strictEqual(MIN_CAMPSITE_CORE_SCORE, 70, 'Campsite core threshold must be 70.');
  assert.strictEqual(CAMPSITE_GOOD_FALLBACK_SCORE, 60, 'Good fallback threshold must be 60.');
  assert.strictEqual(CAMPSITE_POSSIBLE_FALLBACK_SCORE, 55, 'Possible fallback threshold must be 55.');
  assert.strictEqual(CAMPSITE_LIMITED_CONFIDENCE_SCORE, 50, 'Limited fallback threshold must be 50.');
  assert.strictEqual(MIN_CAMPSITE_SAFETY_SCORE, 50, 'Known unsafe access/legal scores must stay hard rejects.');

  const allPass = evaluateCampsiteCandidateViability(candidate('all-pass', 'route'));
  assert.strictEqual(allPass.isViable, true, 'All required scores above threshold should pass.');
  assert.strictEqual(allPass.tier, 'preferred', 'All required scores above threshold should use the preferred tier.');

  assert.ok(
    isViableCampsiteCandidate(
      candidate('exact-threshold', 'polygon', {
        campSuitability: 70,
        terrainSuitability: 70,
        accessConfidence: 70,
        legalAccess: 70,
      }),
    ),
    'Scores exactly at 70 should pass.',
  );

  const belowLegal = evaluateCampsiteCandidateViability(
    candidate('low-legal', 'route', {
      campSuitability: 95,
      terrainSuitability: 90,
      accessConfidence: 88,
      legalAccess: 62,
    }),
  );
  assert.strictEqual(belowLegal.isViable, true, 'A single sub-70 but safe score should fall back, not fail.');
  assert.strictEqual(belowLegal.tier, 'good', 'A safe 60+ score should use the good fallback tier.');
  assert.strictEqual(belowLegal.activeThreshold, 60);
  assert.deepStrictEqual(
    belowLegal.belowThresholdScoreNames,
    ['legalAccess'],
    'Below-threshold score names should still identify legal access for diagnostics.',
  );

  const belowCamp = evaluateCampsiteCandidateViability(
    candidate('low-camp', 'polygon', {
      campSuitability: 68,
      terrainSuitability: 93,
      accessConfidence: 85,
      legalAccess: 91,
    }),
  );
  assert.strictEqual(belowCamp.isViable, true, 'Low camp suitability should fall back when safety scores pass.');
  assert.strictEqual(belowCamp.tier, 'good');
  assert.deepStrictEqual(belowCamp.belowThresholdScoreNames, ['campSuitability']);

  const missing = evaluateCampsiteCandidateViability({
    id: 'missing',
    source: 'route',
    campSuitability: 82,
    terrainSuitability: 82,
    legalAccess: 82,
  });
  assert.strictEqual(missing.isViable, true, 'A missing inferred score should be a fallback, not an automatic failure.');
  assert.strictEqual(missing.tier, 'possible');
  assert.deepStrictEqual(missing.missingScoreNames, ['accessConfidence']);

  const nullScore = evaluateCampsiteCandidateViability(
    candidate('null-score', 'polygon', {
      legalAccess: null,
    }),
  );
  assert.strictEqual(nullScore.isViable, true, 'Null inferred legal score should be lower confidence unless explicit unsafe data exists.');
  assert.strictEqual(nullScore.tier, 'possible');
  assert.strictEqual(nullScore.safetyRejected, false, 'Missing legal access should not be mislabeled as known unsafe.');
  assert.deepStrictEqual(nullScore.missingScoreNames, ['legalAccess']);

  const nonNumeric = evaluateCampsiteCandidateViability(
    candidate('bad-score', 'route', {
      accessConfidence: 'not available',
    }),
  );
  assert.strictEqual(nonNumeric.isViable, true, 'Non-numeric inferred access score should not block safe fallback candidates.');
  assert.strictEqual(nonNumeric.tier, 'possible');
  assert.deepStrictEqual(nonNumeric.missingScoreNames, ['accessConfidence']);

  const possibleFallback = evaluateCampsiteCandidateViability(
    candidate('possible', 'polygon', {
      campSuitability: 56,
      terrainSuitability: 58,
      accessConfidence: 59,
      legalAccess: 57,
    }),
  );
  assert.strictEqual(possibleFallback.isViable, true, 'Scores in the mid-50s should surface as possible candidates.');
  assert.strictEqual(possibleFallback.tier, 'possible');
  assert.strictEqual(possibleFallback.confidenceLabel, 'Possible');

  const limitedFallback = evaluateCampsiteCandidateViability(
    candidate('limited', 'polygon', {
      campSuitability: 44,
      terrainSuitability: 49,
      accessConfidence: 52,
      legalAccess: 51,
    }),
  );
  assert.strictEqual(limitedFallback.isViable, true, 'Low non-safety scores should be limited-confidence candidates.');
  assert.strictEqual(limitedFallback.tier, 'limited_confidence');
  assert.strictEqual(limitedFallback.confidenceLabel, 'Limited confidence');

  const unsafeAccess = evaluateCampsiteCandidateViability(
    candidate('unsafe-access', 'polygon', {
      accessConfidence: 49,
      legalAccess: 80,
    }),
  );
  assert.strictEqual(unsafeAccess.isViable, false, 'Known unsafe access must stay excluded.');
  assert.strictEqual(unsafeAccess.tier, 'rejected_safety');
  assert.ok(unsafeAccess.safetyRejected);
  assert.deepStrictEqual(
    unsafeAccess.hardGateResults.map((gate) => gate.gateId),
    ['campops.legacy.access_confidence_score'],
    'Legacy viability should expose its CampOps hard-gate compatibility signal.',
  );

  const unsafeLegalAccess = evaluateCampsiteCandidateViability(
    candidate('unsafe-legal-access', 'polygon', {
      campSuitability: 95,
      terrainSuitability: 94,
      accessConfidence: 92,
      legalAccess: 48,
    }),
  );
  assert.strictEqual(unsafeLegalAccess.isViable, false, 'Legal access below 50 must be a hard safety rejection.');
  assert.strictEqual(unsafeLegalAccess.tier, 'rejected_safety');
  assert.strictEqual(unsafeLegalAccess.activeThreshold, MIN_CAMPSITE_SAFETY_SCORE);
  assert.deepStrictEqual(
    unsafeLegalAccess.safetyRejectionReasons,
    ['legalAccess<50'],
    'Known legal access below the safety threshold should identify the exact hard-gate reason.',
  );

  const explicitRestriction = evaluateCampsiteCandidateViability(
    candidate('private-land', 'polygon', {
      accessStatus: 'private property - no access',
      accessConfidence: 90,
      legalAccess: 90,
    }),
  );
  assert.strictEqual(explicitRestriction.isViable, false, 'Explicit private/no-access restrictions must stay excluded.');
  assert.strictEqual(explicitRestriction.tier, 'rejected_safety');

  const aliasCandidate = {
    id: 'aliases',
    source: 'polygon',
    campsite_suitability: '82/100',
    terrain_suitability: 0.76,
    access_confidence: 7.1,
    legal_access: '70',
  };
  assert.ok(isViableCampsiteCandidate(aliasCandidate), 'Existing alias names should be supported.');
  assert.strictEqual(getCampsiteScore(aliasCandidate, 'terrainSuitability'), 76);
  assert.strictEqual(getCampsiteScore(aliasCandidate, 'accessConfidence'), 71);

  const ratingFactorCandidate = {
    id: 'rating-factors',
    source: 'route',
    ratingFactors: [
      { label: 'Camping suitability', value: '88/100' },
      { label: 'Terrain suitability', value: 74 },
      { label: 'Access confidence', value: '73/100' },
      { label: 'Legal access', value: '70/100' },
    ],
  };
  assert.ok(isViableCampsiteCandidate(ratingFactorCandidate), 'Rating factors should provide core scores.');

  const filtered = filterViableCampsiteCandidates([
    candidate('route-pass', 'route'),
    candidate('polygon-pass', 'polygon'),
    candidate('route-fallback', 'route', { legalAccess: 55 }),
    candidate('polygon-fallback', 'polygon', { accessConfidence: null }),
    candidate('unsafe', 'polygon', { legalAccess: 42 }),
  ]);
  assert.deepStrictEqual(
    filtered.map((item) => item.id),
    ['route-pass', 'polygon-pass', 'route-fallback', 'polygon-fallback'],
    'Route and polygon candidates must use the same fallback viability filter while excluding unsafe candidates.',
  );

  function result(source, candidates) {
    return {
      id: `${source}-result`,
      routeIntelligenceId: `${source}-owner`,
      routeName: `${source} route`,
      totalDistanceMiles: 12,
      estimatedDriveTimeHours: 1,
      candidates,
      suggestedCampsites: candidates,
      candidateCount: candidates.length,
      totalSegments: 6,
      excludedSegments: 0,
      analyzedAt: '2026-04-26T00:00:00.000Z',
      scoringApplied: true,
      isShortRoute: false,
      overnightUnlikely: false,
      hasHighConfidence: true,
      bestConfidence: 'HIGH',
      fallbackStage: 0,
      fallbackMode: 'strict',
      criteriaBroadened: false,
      healthyThreshold: 3,
      minimumAcceptableThreshold: 1,
      uiNotice: null,
      analysisSource: source,
      source,
      polygonId: source === 'polygon' ? 'polygon-alpha' : null,
    };
  }

  const viableCandidate = (id, source, overrides = {}) => ({
    ...candidate(id, source, overrides),
    segmentIndex: 0,
    coordinates: [39.1, -120.1],
    distanceMiles: 4,
    avgElevation: 5400,
    elevationGain: 20,
    candidateReason: ['flat terrain'],
    segmentRange: '4-5 mi',
    difficulty: 'easy',
    qualityScore: 90,
    suitabilityScore: 10,
    suitabilityLevel: 'HIGH',
    estimatedArrivalHour: 1,
    scoringBreakdown: {},
    confidence: 'HIGH',
    confidenceReasons: [],
    fallbackStage: 0,
    fallbackMode: 'strict',
    criteriaBroadened: false,
    credibilityTier: 'verified',
  });

  const debugLogs = [];
  const originalDebug = console.debug;
  console.debug = (...args) => {
    debugLogs.push(args);
  };
  let routePrepared;
  try {
    routePrepared = campsiteCandidateEngineTestHooks.prepareCampsiteResultForDisplay(
      result('route', [
        viableCandidate('route-viable', 'route'),
        viableCandidate('route-good-fallback', 'route', { legalAccess: 62 }),
        viableCandidate('route-safety-reject', 'route', { legalAccess: 48 }),
      ]),
    );
  } finally {
    console.debug = originalDebug;
  }
  assert.strictEqual(routePrepared.candidateCount, 1, 'Preferred route candidates should keep high-score behavior when present.');
  assert.deepStrictEqual(routePrepared.suggestedCampsites.map((item) => item.id), ['route-viable']);
  assert.strictEqual(routePrepared.suggestedCampsites[0].viabilityConfidenceLabel, 'Preferred');
  assert.strictEqual(routePrepared.viabilitySummary.fallbackTier, 'preferred');
  assert.strictEqual(routePrepared.viabilitySummary.generationId, 'route-result');
  assert.strictEqual(routePrepared.viabilitySummary.generatedCount, 3);
  assert.strictEqual(routePrepared.viabilitySummary.afterSafetyCount, 2);
  assert.strictEqual(routePrepared.viabilitySummary.afterScoreCount, 1);
  assert.strictEqual(routePrepared.viabilitySummary.renderCount, 1);
  assert.strictEqual(routePrepared.viabilitySummary.acceptedCount, 1);
  assert.strictEqual(routePrepared.viabilitySummary.rejectedCount, 2);
  assert.deepStrictEqual(routePrepared.viabilitySummary.tierCounts, {
    preferred: 1,
    good: 1,
    rejected_safety: 1,
  });
  assert.deepStrictEqual(routePrepared.viabilitySummary.failingFactors, ['legalAccess']);
  const safetyLog = debugLogs.find((entry) => entry[1] === 'candidate_rejected_safety');
  assert.ok(safetyLog, 'Display filtering should log safety rejections when a rendered candidate is excluded.');
  assert.strictEqual(safetyLog[2].generationId, 'route-result');
  assert.strictEqual(safetyLog[2].routeIntelligenceId, 'route-owner');
  assert.strictEqual(safetyLog[2].polygonId, null);
  assert.strictEqual(safetyLog[2].analysisLayer, 'display_filter');
  assert.deepStrictEqual(safetyLog[2].safetyRejectionReasons, ['legalAccess<50']);

  const polygonPrepared = campsiteCandidateEngineTestHooks.prepareCampsiteResultForDisplay(
    result('polygon', [
      viableCandidate('polygon-good-a', 'polygon', { campSuitability: 66, terrainSuitability: 64, accessConfidence: 62, legalAccess: 61 }),
      viableCandidate('polygon-good-b', 'polygon', { campSuitability: 63, terrainSuitability: 65, accessConfidence: 66, legalAccess: 67 }),
      viableCandidate('polygon-safety-reject', 'polygon', { accessConfidence: 45 }),
    ]),
  );
  assert.strictEqual(polygonPrepared.candidateCount, 2, 'Polygon result set should return good fallback candidates.');
  assert.deepStrictEqual(polygonPrepared.suggestedCampsites.map((item) => item.id), ['polygon-good-a', 'polygon-good-b']);
  assert.strictEqual(polygonPrepared.suggestedCampsites[0].viabilityConfidenceLabel, 'Good');
  assert.strictEqual(polygonPrepared.suggestedCampsites[0].confidence, 'MEDIUM');
  assert.strictEqual(polygonPrepared.viabilitySummary.fallbackTier, 'good');
  assert.strictEqual(polygonPrepared.viabilitySummary.activeThreshold, 60);
  assert.strictEqual(polygonPrepared.viabilitySummary.afterSafetyCount, 2);
  assert.strictEqual(polygonPrepared.viabilitySummary.acceptedCount, 2);
  assert.strictEqual(polygonPrepared.viabilitySummary.rejectedCount, 1);
  assert.deepStrictEqual(polygonPrepared.viabilitySummary.tierCounts, {
    good: 2,
    rejected_safety: 1,
  });
  assert.deepStrictEqual(
    polygonPrepared.viabilitySummary.failingFactors,
    ['campSuitability', 'terrainSuitability', 'accessConfidence', 'legalAccess'],
  );

  const lowConfidencePrepared = campsiteCandidateEngineTestHooks.prepareCampsiteResultForDisplay(
    result('polygon', [
      viableCandidate('polygon-low-a', 'polygon', { campSuitability: 47, terrainSuitability: 53, accessConfidence: 52, legalAccess: 51 }),
      viableCandidate('polygon-low-b', 'polygon', { campSuitability: 35, terrainSuitability: 48, accessConfidence: 53, legalAccess: 52 }),
    ]),
  );
  assert.strictEqual(lowConfidencePrepared.candidateCount, 2, 'Safe low-confidence candidates should be returned instead of no results.');
  assert.strictEqual(lowConfidencePrepared.viabilitySummary.fallbackTier, 'limited_confidence');
  assert.strictEqual(lowConfidencePrepared.suggestedCampsites[0].viabilityConfidenceLabel, 'Limited confidence');
  assert.strictEqual(lowConfidencePrepared.suggestedCampsites[0].confidence, 'LOW');

  const { campsiteCandidateEngine } = require(path.join(__dirname, '..', 'lib', 'campsiteCandidateEngine.ts'));
  campsiteCandidateEngine.clear('unit_test_reset', {
    source: 'polygon',
    routeIntelligenceId: 'polygon-owner',
    polygonId: 'polygon-alpha',
  });
  const publishedResults = [];
  const unsubscribe = campsiteCandidateEngine.subscribe((next) => {
    publishedResults.push(next?.id ?? null);
  });
  const capturedInfoLogs = [];
  const originalLog = console.log;
  const previousCampDebugFlag = global.ECS_DEBUG_CAMP;
  const previousCampDebugGlobalFlag = global.__ECS_DEBUG_CAMP;
  global.ECS_DEBUG_CAMP = true;
  global.__ECS_DEBUG_CAMP = true;
  console.log = (...args) => {
    capturedInfoLogs.push(args);
  };
  try {
    const routeResolvedToken = campsiteCandidateEngine.beginRefresh({
      source: 'route',
      routeIntelligenceId: null,
      reason: 'route_scan_refresh_started',
    });
    const routeResolvedResult = campsiteCandidateEngine.publishResult(
      {
        ...result('route', [viableCandidate('route-resolved-result', 'route')]),
        id: 'route-resolved-result',
        routeIntelligenceId: 'dfab532a-c2ef-4a50-a6c1-80e7a7e11964',
      },
      { requestToken: routeResolvedToken },
    );
    assert.strictEqual(
      routeResolvedResult.id,
      'route-resolved-result',
      'A route generation that resolves routeIntelligenceId after scan start should be accepted for the same token.',
    );
    assert.strictEqual(campsiteCandidateEngine.getCurrent().id, 'route-resolved-result');
    assert.ok(
      capturedInfoLogs.some((entry) =>
        entry[1] === 'route_owner_resolved' &&
        entry[2]?.previousOwnerKey === 'route:unknown' &&
        entry[2]?.nextOwnerKey === 'route:dfab532a-c2ef-4a50-a6c1-80e7a7e11964' &&
        entry[2]?.requestToken === routeResolvedToken
      ),
      'Route owner resolution from route:unknown to route:<id> should be logged.',
    );

    const staleRouteToken = campsiteCandidateEngine.beginRefresh({
      source: 'route',
      routeIntelligenceId: null,
      reason: 'route_scan_refresh_started',
    });
    const freshRouteToken = campsiteCandidateEngine.beginRefresh({
      source: 'route',
      routeIntelligenceId: null,
      reason: 'route_scan_refresh_started',
    });
    campsiteCandidateEngine.publishResult(
      {
        ...result('route', [viableCandidate('fresh-route-result', 'route')]),
        id: 'fresh-route-result',
        routeIntelligenceId: 'fresh-route-id',
      },
      { requestToken: freshRouteToken },
    );
    campsiteCandidateEngine.publishResult(
      {
        ...result('route', [viableCandidate('stale-route-result', 'route')]),
        id: 'stale-route-result',
        routeIntelligenceId: 'stale-route-id',
      },
      { requestToken: staleRouteToken },
    );
    assert.strictEqual(
      campsiteCandidateEngine.getCurrent().id,
      'fresh-route-result',
      'A route result from an older request token must not overwrite the latest route scan.',
    );

    campsiteCandidateEngine.clear('route_unit_test_reset', {
      source: 'route',
      routeIntelligenceId: 'fresh-route-id',
    });
    publishedResults.length = 0;

    const staleToken = campsiteCandidateEngine.beginRefresh({
      source: 'polygon',
      routeIntelligenceId: 'polygon-owner',
      polygonId: 'polygon-alpha',
      reason: 'polygon_scan_refresh_started',
    });
    const freshToken = campsiteCandidateEngine.beginRefresh({
      source: 'polygon',
      routeIntelligenceId: 'polygon-owner',
      polygonId: 'polygon-alpha',
      reason: 'polygon_scan_refresh_started',
    });
    const freshResult = campsiteCandidateEngine.publishResult(
      {
        ...result('polygon', [viableCandidate('fresh-polygon-result', 'polygon')]),
        id: 'fresh-polygon-result',
      },
      { requestToken: freshToken },
    );
    assert.strictEqual(freshResult.id, 'fresh-polygon-result');
    assert.deepStrictEqual(publishedResults, ['fresh-polygon-result']);

    campsiteCandidateEngine.publishResult(
      {
        ...result('polygon', [viableCandidate('stale-polygon-result', 'polygon')]),
        id: 'stale-polygon-result',
      },
      { requestToken: staleToken },
    );
    assert.strictEqual(
      campsiteCandidateEngine.getCurrent().id,
      'fresh-polygon-result',
      'A stale polygon generation must not overwrite the newer accepted result.',
    );
    assert.deepStrictEqual(
      publishedResults,
      ['fresh-polygon-result'],
      'Ignored stale generations must not notify subscribers or trigger a render-to-stale result.',
    );
    assert.ok(
      capturedInfoLogs.some((entry) => entry[1] === 'stale_generation_ignored'),
      'Stale candidate generations should log an explicit ignore reason.',
    );

    const clearedToken = campsiteCandidateEngine.beginRefresh({
      source: 'polygon',
      routeIntelligenceId: 'polygon-owner',
      polygonId: 'polygon-alpha',
      reason: 'polygon_scan_refresh_started',
    });
    campsiteCandidateEngine.clear('user_cleared_drawing', {
      source: 'polygon',
      routeIntelligenceId: 'polygon-owner',
      polygonId: 'polygon-alpha',
    });
    assert.strictEqual(campsiteCandidateEngine.getCurrent(), null);
    campsiteCandidateEngine.publishResult(
      {
        ...result('polygon', [viableCandidate('cleared-stale-result', 'polygon')]),
        id: 'cleared-stale-result',
      },
      { requestToken: clearedToken },
    );
    assert.strictEqual(
      campsiteCandidateEngine.getCurrent(),
      null,
      'A stale result must not restore candidates after the polygon was explicitly cleared.',
    );
  } finally {
    console.log = originalLog;
    if (previousCampDebugFlag === undefined) {
      delete global.ECS_DEBUG_CAMP;
    } else {
      global.ECS_DEBUG_CAMP = previousCampDebugFlag;
    }
    if (previousCampDebugGlobalFlag === undefined) {
      delete global.__ECS_DEBUG_CAMP;
    } else {
      global.__ECS_DEBUG_CAMP = previousCampDebugGlobalFlag;
    }
    unsubscribe();
    campsiteCandidateEngine.clear('unit_test_cleanup', {
      source: 'polygon',
      routeIntelligenceId: 'polygon-owner',
      polygonId: 'polygon-alpha',
    });
  }

  console.log('Campsite viability filter checks passed.');
}

main();
