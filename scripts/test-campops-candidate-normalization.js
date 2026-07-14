const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return {
      AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
      Platform: { OS: 'web', select: (values) => values?.web ?? values?.default },
    };
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

const adapters = require(path.join(root, 'lib', 'campops', 'campOpsAdapters.ts'));
const normalization = require(path.join(root, 'lib', 'campops', 'campOpsCandidateNormalization.ts'));
const hardGates = require(path.join(root, 'lib', 'campops', 'campOpsHardGates.ts'));

const NOW = Date.parse('2026-07-13T12:00:00.000Z');

function established(overrides = {}) {
  return {
    id: 'ridb-42',
    name: 'Pine Ridge Campground',
    latitude: 39.1,
    longitude: -119.9,
    campsiteType: 'campground',
    source: 'RECREATION_GOV',
    feeStatus: 'paid',
    reservationStatus: 'reservable',
    amenities: ['water', 'toilets'],
    status: 'open',
    availabilityStatus: 'available',
    siteCount: 20,
    sourceConfidence: 90,
    primaryProvider: 'RIDB',
    attribution: 'Recreation.gov / RIDB',
    lastSyncedAt: '2026-07-13T11:55:00.000Z',
    lastAvailabilityCheckedAt: '2026-07-13T11:50:00.000Z',
    lastVerifiedAt: '2026-07-13T11:00:00.000Z',
    trailersAllowed: true,
    requiresVerification: true,
    ...overrides,
  };
}

function publicSite(overrides = {}) {
  return {
    id: 'community-7',
    canonical_name: 'Pine Ridge Campground',
    latitude: 39.1002,
    longitude: -119.9002,
    status: 'approved',
    visibility: 'community',
    site_type: 'developed',
    access_difficulty: 'easy_2wd',
    vehicle_fit: ['suv'],
    trailer_friendly: true,
    max_rig_length_ft: 30,
    max_group_size: 8,
    amenities: {},
    conditions: {},
    trust_score: 88,
    legal_confidence: 'medium',
    last_confirmed_at: '2026-07-12T12:00:00.000Z',
    confirmation_count: 3,
    flag_count: 0,
    created_at: '2026-07-01T12:00:00.000Z',
    updated_at: '2026-07-12T12:00:00.000Z',
    ...overrides,
  };
}

function context() {
  return {
    id: 'campops-normalization-test',
    currentTimeIso: '2026-07-13T12:00:00.000Z',
    riskTolerance: 'balanced',
    offlineMode: 'online',
  };
}

function campScout(overrides = {}) {
  return {
    id: 'scout-1',
    coordinate: { latitude: 39.2, longitude: -119.8 },
    title: 'Mapped Scout Camp',
    sourceType: 'official_mapped',
    confidenceScore: 88,
    confidenceGrade: 'A',
    scoreBreakdown: {
      flatnessTerrain: 85,
      accessConfidence: 84,
      remotenessValue: 70,
      legalAccessConfidence: 90,
      safetyEnvironmentalRisk: 80,
      sourceSignal: 90,
      sourceQuality: 90,
      remoteness: 70,
      access: 84,
      legality: 90,
      terrain: 85,
      proximity: 80,
      confidence: 88,
      total: 86,
    },
    reasons: ['Official mapped campground'],
    cautions: ['Verify current conditions'],
    accessConfidence: 84,
    legalityConfidence: 90,
    remotenessScore: 70,
    legalityStatus: 'verified_allowed',
    sourceTimestamp: '2026-07-13T11:00:00.000Z',
    sourceLabel: 'Official land manager',
    ...overrides,
  };
}

const freshEstablished = adapters.campOpsCandidateFromEstablishedCampsite(established(), NOW);
assert.strictEqual(freshEstablished.candidateClass, 'established');
assert.strictEqual(freshEstablished.recommendationVisibility, 'operational');
assert.strictEqual(freshEstablished.evidence.availability.status, 'available');
assert.strictEqual(freshEstablished.evidence.availability.freshness, 'live');
assert.strictEqual(freshEstablished.evidence.availability.usableForDecision, true);
assert.notStrictEqual(
  freshEstablished.evidence.legalAccess.sourceRefs[0].id,
  freshEstablished.evidence.availability.sourceRefs[0].id,
  'Legal and availability evidence must remain separate.',
);
const refreshedLater = normalization.refreshCampCandidateSourceTruth(
  freshEstablished,
  '2026-07-14T12:00:00.000Z',
);
assert.strictEqual(refreshedLater.evidence.availability.freshness, 'unavailable');
assert.strictEqual(refreshedLater.evidence.availability.usableForDecision, false);

const staleEstablished = adapters.campOpsCandidateFromEstablishedCampsite(established({
  id: 'ridb-stale',
  lastAvailabilityCheckedAt: '2026-07-13T02:00:00.000Z',
}), NOW);
assert.strictEqual(staleEstablished.evidence.availability.status, 'available');
assert.strictEqual(staleEstablished.evidence.availability.freshness, 'expired');
assert.strictEqual(staleEstablished.evidence.availability.usableForDecision, false);
assert.ok(staleEstablished.description.includes('reported campground status'));
const availabilityScoreProbe = {
  source: 'OSM',
  primaryProvider: 'OSM',
  sourceConfidence: 48,
  status: 'unknown',
  siteCount: null,
  amenities: [],
  reservationUrl: null,
  detailUrl: null,
  managingAgency: null,
  managingOrg: null,
  trailersAllowed: undefined,
};
const freshAvailabilityScore = adapters.campOpsCandidateFromEstablishedCampsite(established({
  ...availabilityScoreProbe,
  id: 'availability-fresh-score',
}), NOW);
const staleAvailabilityScore = adapters.campOpsCandidateFromEstablishedCampsite(established({
  ...availabilityScoreProbe,
  id: 'availability-stale-score',
  lastAvailabilityCheckedAt: '2026-07-13T02:00:00.000Z',
}), NOW);
assert.ok(
  freshAvailabilityScore.score > staleAvailabilityScore.score,
  'Stale positive availability must not receive a current-availability score boost.',
);
const staleEnrichment = normalization.campOpsEnrichmentFromCandidateEvidence(staleEstablished);
const staleGate = hardGates.evaluateCampCandidateHardGates({
  context: context(),
  candidate: staleEstablished,
  enrichment: staleEnrichment,
});
assert.ok(staleGate.allGates.some((gate) => gate.gateId === 'campops.availability.not_current'));

const osm = adapters.campOpsCandidateFromEstablishedCampsite(established({
  id: 'osm-1',
  source: 'OSM',
  primaryProvider: 'OSM',
  sourceConfidence: 60,
}), NOW);
assert.strictEqual(osm.evidence.legalAccess.legalStatus, 'unknown');
assert.strictEqual(osm.evidence.legalAccess.publicAccessStatus, 'unknown');
assert.ok(osm.evidence.legalAccess.notes.some((note) => note.includes('not authority')));

const redacted = adapters.campOpsCandidateFromEstablishedCampsite(established({
  id: 'redaction-1',
  primaryProvider: 'api_key=sk-proj-supersecretvalue',
  attribution: 'Bearer sensitive-token-value',
}), NOW);
const redactedDisplay = JSON.stringify({
  provenance: redacted.provenance,
  evidence: redacted.evidence,
});
assert.ok(redactedDisplay.includes('[redacted]'));
assert.ok(!redactedDisplay.includes('supersecretvalue'));
assert.ok(!redactedDisplay.includes('sensitive-token-value'));

const pending = adapters.campOpsCandidateFromPublicCampSite(publicSite({
  id: 'pending-1',
  status: 'hidden_pending_review',
}));
assert.strictEqual(pending.recommendationVisibility, 'blocked');
assert.strictEqual(pending.evidence.communityTrust.status, 'pending');
const pendingPool = normalization.normalizeCampCandidatePool({ candidates: [pending] });
assert.strictEqual(pendingPool.candidates.length, 0);
assert.strictEqual(pendingPool.diagnostics.blockedCount, 1);

const officialScout = adapters.campOpsCandidateFromCampScoutCandidate(campScout(), NOW);
assert.strictEqual(officialScout.recommendationVisibility, 'operational');
assert.strictEqual(officialScout.evidence.legalAccess.legalStatus, 'allowed');
const pendingScout = adapters.campOpsCandidateFromCampScoutCandidate(campScout({
  id: 'scout-pending',
  sourceType: 'community_suggested',
  moderationStatus: 'pending',
}), NOW);
assert.strictEqual(pendingScout.recommendationVisibility, 'blocked');
const inferredScout = adapters.campOpsCandidateFromCampScoutCandidate(campScout({
  id: 'scout-inferred',
  sourceType: 'ecs_inferred',
  legalityStatus: 'unknown_needs_verification',
}), NOW);
assert.strictEqual(inferredScout.recommendationVisibility, 'research_only');

const community = adapters.campOpsCandidateFromPublicCampSite(publicSite());
const communityEnrichment = normalization.campOpsEnrichmentFromCandidateEvidence(community);
const deduped = normalization.normalizeCampCandidatePool({
  candidates: [community, freshEstablished],
  enrichmentsByCandidateId: {
    [community.id]: communityEnrichment,
    [freshEstablished.id]: normalization.campOpsEnrichmentFromCandidateEvidence(freshEstablished),
  },
});
assert.strictEqual(deduped.candidates.length, 1);
assert.strictEqual(deduped.candidates[0].source, 'established_campground');
assert.strictEqual(deduped.diagnostics.duplicateCount, 1);
assert.strictEqual(deduped.aliasesByCandidateId[community.id], freshEstablished.id);
assert.ok(deduped.candidates[0].provenance.sourceRecordIds.includes('camp_site:community-7'));

const conflictingCommunity = normalization.normalizeCampCandidate({
  ...community,
  id: 'camp-site:conflict',
  evidence: {
    ...community.evidence,
    legalAccess: {
      ...community.evidence.legalAccess,
      legalStatus: 'prohibited',
      closureStatus: 'closed',
    },
    availability: {
      ...community.evidence.availability,
      status: 'unavailable',
      usableForDecision: true,
      freshness: 'live',
      sourceRefs: community.evidence.legalAccess.sourceRefs,
    },
  },
});
const conflictPool = normalization.normalizeCampCandidatePool({
  candidates: [freshEstablished, conflictingCommunity],
  enrichmentsByCandidateId: {
    [freshEstablished.id]: normalization.campOpsEnrichmentFromCandidateEvidence(freshEstablished),
    [conflictingCommunity.id]: normalization.campOpsEnrichmentFromCandidateEvidence(conflictingCommunity),
  },
});
assert.strictEqual(conflictPool.candidates.length, 1);
assert.strictEqual(conflictPool.candidates[0].evidence.legalAccess.legalStatus, 'prohibited');
assert.strictEqual(conflictPool.candidates[0].evidence.legalAccess.conflict, true);
assert.strictEqual(conflictPool.candidates[0].evidence.availability.status, 'unknown');
assert.strictEqual(conflictPool.candidates[0].evidence.availability.usableForDecision, false);
assert.strictEqual(conflictPool.candidates[0].evidence.availability.conflict, true);

const dispersed = adapters.campOpsCandidateFromDispersedCampingRegion({
  id: 'blm-region',
  geometry: { type: 'Polygon', coordinates: [[[-119.95, 39.05], [-119.85, 39.05], [-119.85, 39.15], [-119.95, 39.15], [-119.95, 39.05]]] },
  landManager: 'BLM',
  confidence: 'high',
  eligibilityLabel: 'Likely eligible',
  basis: ['BLM source boundary'],
  restrictions: [],
  sourceNames: ['BLM boundary'],
  requiresVerification: true,
  closureKnown: true,
  closureActive: false,
}, { latitude: 39.1, longitude: -119.9 }, NOW);
assert.ok(dispersed);
assert.strictEqual(dispersed.recommendationVisibility, 'research_only');
const dispersedGate = hardGates.evaluateCampCandidateHardGates({
  context: context(),
  candidate: dispersed,
  enrichment: normalization.campOpsEnrichmentFromCandidateEvidence(dispersed),
});
assert.ok(dispersedGate.failedGates.some((gate) => gate.gateId === 'campops.candidate.research_only'));
assert.strictEqual(
  adapters.campOpsCandidateFromDispersedCampingRegion({
    id: 'outside-region',
    geometry: { type: 'Polygon', coordinates: [[[-119.95, 39.05], [-119.85, 39.05], [-119.85, 39.15], [-119.95, 39.15], [-119.95, 39.05]]] },
    landManager: 'BLM',
    confidence: 'high',
    eligibilityLabel: 'Likely eligible',
    basis: [],
    restrictions: [],
    sourceNames: [],
    requiresVerification: true,
  }, { latitude: 40, longitude: -119.9 }, NOW),
  null,
  'A dispersed-region source must not be attached to a point outside its polygon.',
);

console.log('CampOps canonical candidate normalization checks passed.');
