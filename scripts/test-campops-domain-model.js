const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const campOpsPath = path.join(root, 'lib', 'campops', 'index.ts');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web', select: (values) => values?.web ?? values?.default } };
  }
  return originalLoad.call(this, request, parent, isMain);
};

require.extensions['.ts'] = function compileTs(module, filename) {
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

const campops = require(campOpsPath);

assert.deepStrictEqual(campops.CAMP_OPERATIONAL_ROLES, [
  'primary',
  'backup',
  'emergency',
  'weather_fallback',
  'resupply',
  'recovery',
  'trailer_safe',
  'family_safe',
  'unknown',
]);

assert.deepStrictEqual(campops.CAMP_HARD_GATE_STATES, ['allowed', 'rejected', 'caution', 'unknown']);
assert.strictEqual(campops.normalizeCampOpsScore(101.4), 100);
assert.strictEqual(campops.normalizeCampOpsScore(-8), 0);
assert.strictEqual(campops.normalizeCampOpsScore(68.6), 69);
assert.strictEqual(campops.normalizeCampOpsScore(null), null);
assert.strictEqual(
  campops.isCampHardGateBlocking({
    state: 'rejected',
    gateId: 'legal-status',
    severity: 'caution',
    reason: 'Known closure.',
    missingDataFields: [],
  }),
  true,
);
assert.strictEqual(
  campops.isCampHardGateBlocking({
    state: 'unknown',
    gateId: 'weather',
    severity: 'critical',
    reason: 'Lightning risk cannot be cleared.',
    missingDataFields: ['weatherExposure'],
  }),
  true,
);

const emptyRecommendation = campops.createEmptyCampRecommendationSet('low');
assert.strictEqual(emptyRecommendation.recommendedCamp, null);
assert.strictEqual(emptyRecommendation.backupCamp, null);
assert.strictEqual(emptyRecommendation.emergencyCamp, null);
assert.strictEqual(emptyRecommendation.confidenceSummary.level, 'low');
assert.deepStrictEqual(emptyRecommendation.warnings, []);
assert.deepStrictEqual(emptyRecommendation.rolesByCandidateId, {});

const generatedCandidate = campops.campOpsCandidateFromGeneratedCandidate({
  segmentIndex: 2,
  coordinates: [39.14521, -119.93691],
  distanceMiles: 64,
  avgElevation: 6100,
  elevationGain: 55,
  candidateReason: ['flat terrain', 'good timing'],
  segmentRange: '60-70 mi',
  difficulty: 'moderate',
  qualityScore: 82,
  suitabilityScore: 9,
  rating: 'B',
  score: 84,
  legalAccessScore: 62,
  suitabilityLevel: 'HIGH',
  estimatedArrivalHour: 7.5,
  scoringBreakdown: {
    flatTerrainBonus: 3,
    remotenessBonus: 2,
    timingBonus: 2,
    elevationPenalty: 0,
    mountainPassPenalty: 0,
    idealTimingBonus: 4,
    tooEarlyPenalty: 0,
    tooLatePenalty: 0,
    shortRouteReduction: 0,
    overnightReduction: 0,
    reasons: ['good end-of-day segment'],
  },
  confidence: 'HIGH',
  confidenceReasons: ['Strong terrain and timing score'],
  fallbackStage: 0,
  fallbackMode: 'strict',
  criteriaBroadened: false,
  credibilityTier: 'likely',
});
assert.strictEqual(generatedCandidate.source, 'route_candidate');
assert.strictEqual(generatedCandidate.sourceConfidence, 'high');
assert.strictEqual(generatedCandidate.location.latitude, 39.14521);
assert.strictEqual(generatedCandidate.legalConfidence, 'medium');
assert.strictEqual(generatedCandidate.existingRef.system, 'campsite_candidate');

const locatorCandidate = campops.campOpsCandidateFromLocatorCandidate({
  id: 'locator-1',
  name: 'Bench above creek',
  latitude: 39.2,
  longitude: -119.91,
  rating: 'A',
  score: 94,
  legalAccessScore: 91,
  viabilityTier: 'preferred',
  accessType: 'high_clearance',
  source: 'terrain',
  explanation: 'Flat bench near the route.',
});
assert.strictEqual(locatorCandidate.name, 'Bench above creek');
assert.strictEqual(locatorCandidate.sourceConfidence, 'high');
assert.strictEqual(locatorCandidate.accessDifficulty, 'high_clearance');
assert.strictEqual(locatorCandidate.legalConfidence, 'high');

const publicSite = campops.campOpsCandidateFromPublicCampSite({
  id: 'site-1',
  canonical_name: 'Old Mill Camp',
  latitude: 39.3,
  longitude: -119.8,
  status: 'approved',
  visibility: 'public',
  site_type: 'dispersed',
  access_difficulty: 'moderate',
  vehicle_fit: ['truck', 'van'],
  trailer_friendly: true,
  max_rig_length_ft: 28,
  max_group_size: 4,
  amenities: { fire_ring: true },
  conditions: { shade: 'partial' },
  trust_score: 88,
  legal_confidence: 'high',
  last_confirmed_at: '2026-04-01T00:00:00.000Z',
  confirmation_count: 3,
  flag_count: 0,
  created_at: '2026-03-01T00:00:00.000Z',
  updated_at: '2026-04-01T00:00:00.000Z',
});
assert.strictEqual(publicSite.id, 'camp-site:site-1');
assert.strictEqual(publicSite.source, 'community');
assert.strictEqual(publicSite.lastVerifiedDate, '2026-04-01T00:00:00.000Z');
assert.strictEqual(publicSite.existingRef.system, 'camp_site');

const reportCandidate = campops.campOpsCandidateFromReport({
  id: 'report-1',
  camp_site_id: null,
  latitude: 39.31,
  longitude: -119.81,
  source_type: 'manual',
  location_accuracy_m: 12,
  user_stayed_here: true,
  verified_in_person: false,
  visited_at: '2026-04-02T00:00:00.000Z',
  site_type: 'dispersed',
  access_difficulty: 'easy',
  vehicle_fit: ['truck'],
  amenities: {},
  conditions: {},
  notes: 'Creekside turnout\nquiet on weekday',
  visibility_requested: 'private',
  moderation_status: 'pending',
  stewardship_acknowledged: true,
  sensitive_area_acknowledged: true,
  review_state: 'awaiting_review',
  triage_score: 57,
  triage_summary: null,
  created_at: '2026-04-02T00:00:00.000Z',
  updated_at: '2026-04-02T00:00:00.000Z',
});
assert.strictEqual(reportCandidate.name, 'Creekside turnout');
assert.strictEqual(reportCandidate.sourceConfidence, 'medium');
assert.strictEqual(reportCandidate.score, 57);

const groupCandidate = campops.campOpsCandidateFromGroupItem({
  share: {
    id: 'share-1',
    camp_site_report_id: null,
    camp_site_id: 'site-1',
    group_id: 'group-1',
    shared_by_user_id: 'user-1',
    created_at: '2026-04-03T00:00:00.000Z',
  },
  report: null,
  camp_site: {
    ...publicSite,
    id: 'site-2',
    canonical_name: 'Group Shared Camp',
    latitude: 39.32,
    longitude: -119.82,
    status: 'approved',
    visibility: 'group',
    site_type: 'established',
    access_difficulty: 'easy',
    vehicle_fit: ['truck'],
    trailer_friendly: null,
    max_rig_length_ft: null,
    max_group_size: null,
    amenities: {},
    conditions: {},
    trust_score: 76,
    legal_confidence: 'medium',
    last_confirmed_at: null,
    confirmation_count: 1,
    flag_count: 0,
    created_at: '2026-04-03T00:00:00.000Z',
    updated_at: '2026-04-03T00:00:00.000Z',
  },
});
assert.strictEqual(groupCandidate.source, 'group');
assert.strictEqual(groupCandidate.existingRef.system, 'group_share');
assert.strictEqual(groupCandidate.existingRef.id, 'share-1');

console.log('CampOps domain model checks passed.');
