const assert = require('assert');
const Module = require('module');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function compileTypeScriptModule(mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  mod._compile(output.outputText, filename);
}

require.extensions['.ts'] = compileTypeScriptModule;

const {
  evaluateRouteFireIntelligence,
} = require(path.join(process.cwd(), 'lib', 'ecs5FireIntelligence.ts'));

const NOW = new Date('2026-07-13T12:00:00.000Z');
const ROUTE = [{ lat: 40, lon: -120 }, { lat: 40.2, lon: -120.2 }];

function detection(overrides = {}) {
  const observedAt = overrides.observedAt ?? new Date(NOW.getTime() - 60 * 60 * 1000).toISOString();
  return {
    id: overrides.id ?? 'firms-detection',
    providerId: 'nasa_firms',
    sourceName: 'NASA FIRMS',
    sourceType: 'satellite',
    subjectType: 'active_fire',
    subjectId: overrides.id ?? 'firms-detection',
    geometry: { type: 'Point', coordinates: [-120, 40] },
    bbox: null,
    observedAt,
    publishedAt: observedAt,
    ingestedAt: NOW.toISOString(),
    expiresAt: overrides.expiresAt ?? new Date(NOW.getTime() + 60 * 60 * 1000).toISOString(),
    rawPayloadRef: null,
    normalizedPayload: {
      confidence: overrides.confidence ?? 'h',
      frp: overrides.frp ?? 35,
      legalClosureSignal: false,
    },
    evidenceUrl: null,
    contentHash: overrides.id ?? 'firms-detection-hash',
    confidenceScore: overrides.confidenceScore ?? 84,
    confidenceBreakdown: {
      providerDefault: overrides.confidenceScore ?? 84,
      freshness: 90,
      sourceAuthority: 84,
      completeness: 90,
      stalePenalty: 0,
    },
    knownLimitations: ['satellite_detection_not_ground_confirmation', 'not_legal_closure_order'],
    supersedesObservationId: null,
    offlineCacheEligible: true,
    staleAt: overrides.staleAt ?? new Date(NOW.getTime() + 30 * 60 * 1000).toISOString(),
    validUntil: overrides.validUntil ?? new Date(NOW.getTime() + 60 * 60 * 1000).toISOString(),
  };
}

const current = evaluateRouteFireIntelligence({
  routeId: 'current-fire',
  routeGeometry: ROUTE,
  observations: [detection()],
  now: NOW,
});
assert.strictEqual(current.fireRiskLevel, 'critical');
assert.strictEqual(current.legalClosureImplied, false);
assert.ok(current.concerns.some((item) => item.includes('not a legal closure order')));

const stale = evaluateRouteFireIntelligence({
  routeId: 'stale-fire',
  routeGeometry: ROUTE,
  observations: [detection({
    id: 'stale-detection',
    observedAt: new Date(NOW.getTime() - 72 * 60 * 60 * 1000).toISOString(),
    staleAt: new Date(NOW.getTime() - 48 * 60 * 60 * 1000).toISOString(),
    expiresAt: new Date(NOW.getTime() - 48 * 60 * 60 * 1000).toISOString(),
  })],
  bailoutSegments: [{ id: 'bailout', label: 'Bailout', geometry: ROUTE }],
  now: NOW,
});
assert.strictEqual(stale.fireRiskLevel, 'unknown', 'Stale FIRMS data must not be labeled as current low/high risk.');
assert.strictEqual(stale.nearestActiveFireMiles, null, 'Stale detections must not populate the current active-fire distance.');
assert.strictEqual(stale.confidenceScore, 0, 'No current fire evidence should produce zero current-condition confidence.');
assert.strictEqual(stale.bailoutImpacts.length, 0, 'Stale detections must not mark a bailout as currently impacted.');
assert.ok(stale.concerns.some((item) => item.includes('Stale fire detection')));
assert.strictEqual(stale.legalClosureImplied, false);

const future = evaluateRouteFireIntelligence({
  routeId: 'future-fire',
  routeGeometry: ROUTE,
  observations: [detection({
    id: 'future-detection',
    observedAt: new Date(NOW.getTime() + 2 * 60 * 60 * 1000).toISOString(),
  })],
  now: NOW,
});
assert.strictEqual(future.fireRiskLevel, 'unknown');
assert.ok(future.concerns.some((item) => item.includes('timestamp is in the future')));

const lowConfidence = evaluateRouteFireIntelligence({
  routeId: 'low-confidence-fire',
  routeGeometry: ROUTE,
  observations: [detection({
    id: 'low-confidence-detection',
    confidence: 'l',
    confidenceScore: 40,
  })],
  now: NOW,
});
assert.strictEqual(lowConfidence.fireRiskLevel, 'moderate', 'Low-confidence satellite detection should not independently produce critical risk.');
assert.strictEqual(lowConfidence.blockingSafetyIssue, false);
assert.strictEqual(lowConfidence.legalClosureImplied, false);
assert.ok(lowConfidence.concerns.some((item) => item.includes('Low-confidence satellite detection')));

console.log('Operational weather fire freshness and confidence checks passed.');
