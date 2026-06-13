const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const routeContextPath = path.join(root, 'lib', 'routeContext', 'index.ts');

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

const {
  buildBailoutDensityOverlays,
  buildCampDeadlineOverlays,
  buildClosureConditionOverlays,
  buildIncidentRecoveryOverlays,
  buildLegalAccessConfidenceOverlays,
  buildOfflineCoverageOverlays,
  buildTerrainExposureOverlays,
  buildWeatherConfidenceOverlays,
  buildRouteConfidenceTimelineOverlaysFromAdapterResults,
  buildRouteConfidenceTimeline,
  generateRouteContext,
  resolveRouteContextFeatureFlags,
  routeConfidenceTimelineItemCopy,
} = require(routeContextPath);

const now = '2026-06-13T14:00:00.000Z';
const geometry = {
  origin: { lat: 38.0, lng: -110.0 },
  destination: { lat: 38.0, lng: -109.7 },
  waypoints: [],
  coordinates: [
    { lat: 38.0, lng: -110.0 },
    { lat: 38.0, lng: -109.9 },
    { lat: 38.0, lng: -109.8 },
    { lat: 38.0, lng: -109.7 },
  ],
  distanceMeters: 3000,
  durationSeconds: 900,
  bbox: { west: -110.0, south: 38.0, east: -109.7, north: 38.0 },
  corridor: null,
  segments: [],
  providerMetadata: { geometryVersion: 'geom-v7', source: 'fixture_geometry' },
};

function source(id, freshness = 'fresh', observedAt = now) {
  return {
    id,
    label: id.replace(/-/g, ' '),
    sourceType: 'fixture',
    observedAt,
    freshness,
  };
}

function overlay(overrides) {
  return {
    id: overrides.id,
    routeId: overrides.routeId,
    routeGeometryVersion: overrides.routeGeometryVersion,
    startMeasure: overrides.startMeasure,
    endMeasure: overrides.endMeasure,
    label: overrides.label,
    confidenceLevel: overrides.confidenceLevel,
    conditionState: overrides.conditionState,
    driverCategory: overrides.driverCategory,
    source: overrides.source ?? source(overrides.id),
    detail: overrides.detail ?? null,
    impactRank: overrides.impactRank ?? null,
  };
}

function assertAdapterSpanContract(result, label) {
  result.spans.forEach((span) => {
    assert.strictEqual(span.routeId, 'route-alpha', `${label} span should carry routeId.`);
    assert.strictEqual(span.routeGeometryVersion, 'geom-v7', `${label} span should carry route geometry version.`);
    assert.ok(span.source, `${label} span should carry source attribution.`);
    assert.ok(span.source.sourceType, `${label} span should carry source type.`);
    assert.ok(span.source.freshness, `${label} span should carry source freshness.`);
    assert.ok(span.driverCategory, `${label} span should carry driver category.`);
    assert.ok(span.confidenceLevel, `${label} span should carry confidence level.`);
    assert.ok(span.conditionState, `${label} span should carry condition state.`);
  });
}

const adapterBase = {
  routeId: 'route-alpha',
  routeGeometryVersion: 'geom-v7',
  totalMeasure: 3000,
  generatedAt: now,
};

const legalUnknown = buildLegalAccessConfidenceOverlays({
  ...adapterBase,
  accessOverlays: [
    {
      id: 'legal-unvalidated',
      startMeasure: 100,
      endMeasure: 600,
      label: 'Unvalidated access',
      validation: 'unvalidated',
      freshness: 'fresh',
      sourceId: 'route-catalog-access-1',
      sourceName: 'Route Catalog access overlay',
    },
  ],
});
assert.strictEqual(legalUnknown.sourceType, 'route_catalog');
assert.strictEqual(legalUnknown.spans[0].driverCategory, 'legal_access');
assert.strictEqual(legalUnknown.spans[0].conditionState, 'unknown');
assert.notStrictEqual(
  legalUnknown.spans[0].conditionState,
  'known_risky',
  'Unvalidated access should produce uncertainty, not known risk.',
);
assertAdapterSpanContract(legalUnknown, 'legal access');

const validatedClosure = buildClosureConditionOverlays({
  ...adapterBase,
  closureOverlays: [
    {
      id: 'active-closure',
      startMeasure: 800,
      endMeasure: 1200,
      label: 'Confirmed agency closure',
      active: true,
      validation: 'validated',
      freshness: 'fresh',
      sourceId: 'closure-1',
      sourceName: 'Agency closure feed',
    },
  ],
});
assert.strictEqual(validatedClosure.spans[0].conditionState, 'known_risky');

const unvalidatedClosure = buildClosureConditionOverlays({
  ...adapterBase,
  closureOverlays: [
    {
      id: 'unvalidated-closure',
      startMeasure: 1200,
      endMeasure: 1600,
      active: true,
      validation: 'unvalidated',
      freshness: 'fresh',
      sourceId: 'closure-2',
    },
  ],
});
assert.strictEqual(
  unvalidatedClosure.spans[0].conditionState,
  'unknown',
  'Closure/current-condition known risk requires validated current source evidence.',
);

const offlineGap = buildOfflineCoverageOverlays({
  ...adapterBase,
  coverageOverlays: [
    {
      id: 'offline-gap-adapter',
      startMeasure: 500,
      endMeasure: 900,
      coverageState: 'missing',
      freshness: 'unavailable',
      sourceId: 'offline-route-cache',
    },
  ],
});
assert.strictEqual(offlineGap.spans[0].driverCategory, 'offline_coverage');
assert.ok(['low', 'unknown'].includes(offlineGap.spans[0].confidenceLevel));
assert.notStrictEqual(offlineGap.spans[0].conditionState, 'known_risky');

const staleWeather = buildWeatherConfidenceOverlays({
  ...adapterBase,
  weatherOverlays: [
    {
      id: 'stale-weather',
      startMeasure: 1600,
      endMeasure: 2100,
      hazardous: true,
      validation: 'validated',
      freshness: 'stale',
      sourceId: 'weather-stale',
    },
  ],
});
assert.strictEqual(staleWeather.spans[0].conditionState, 'unknown');

const verifiedWeather = buildWeatherConfidenceOverlays({
  ...adapterBase,
  weatherOverlays: [
    {
      id: 'verified-weather',
      startMeasure: 1600,
      endMeasure: 2100,
      hazardous: true,
      validation: 'validated',
      freshness: 'fresh',
      sourceId: 'weather-live',
    },
  ],
});
assert.strictEqual(verifiedWeather.spans[0].conditionState, 'known_risky');

const terrainExposure = buildTerrainExposureOverlays({
  ...adapterBase,
  exposureOverlays: [
    {
      id: 'terrain-exposure',
      startMeasure: 2000,
      endMeasure: 2500,
      exposureLevel: 'high',
      validation: 'inferred',
      freshness: 'fresh',
      sourceId: 'terrain-model',
    },
  ],
});
assert.strictEqual(terrainExposure.spans[0].driverCategory, 'terrain_weather');
assert.strictEqual(terrainExposure.spans[0].conditionState, 'unknown');

const bailoutSparse = buildBailoutDensityOverlays({
  ...adapterBase,
  bailoutOverlays: [
    {
      id: 'sparse-bailout',
      startMeasure: 2200,
      endMeasure: 2800,
      density: 'sparse',
      validation: 'inferred',
      freshness: 'fresh',
      sourceId: 'bailout-density',
    },
  ],
});
assert.strictEqual(bailoutSparse.spans[0].driverCategory, 'bailout_density');
assert.ok(['low', 'unknown'].includes(bailoutSparse.spans[0].confidenceLevel));
assert.notStrictEqual(bailoutSparse.spans[0].conditionState, 'known_risky');

const campDeadline = buildCampDeadlineOverlays({
  ...adapterBase,
  deadlineOverlays: [
    {
      id: 'camp-deadline-adapter',
      startMeasure: 2400,
      endMeasure: 3000,
      deadlineAt: '2026-06-13T23:00:00.000Z',
      validation: 'validated',
      freshness: 'fresh',
      sourceId: 'campops-clock',
    },
  ],
});
assert.strictEqual(campDeadline.spans[0].driverCategory, 'camp_deadline');
assert.notStrictEqual(campDeadline.spans[0].conditionState, 'known_risky');

const validatedIncident = buildIncidentRecoveryOverlays({
  ...adapterBase,
  incidentOverlays: [
    {
      id: 'incident-zone',
      startMeasure: 1000,
      endMeasure: 1400,
      active: true,
      validation: 'validated',
      freshness: 'fresh',
      sourceId: 'incident-1',
    },
  ],
});
assert.strictEqual(validatedIncident.spans[0].conditionState, 'known_risky');

const unvalidatedIncident = buildIncidentRecoveryOverlays({
  ...adapterBase,
  incidentOverlays: [
    {
      id: 'incident-unvalidated',
      startMeasure: 1400,
      endMeasure: 1800,
      active: true,
      validation: 'unvalidated',
      freshness: 'fresh',
      sourceId: 'incident-2',
    },
  ],
});
assert.strictEqual(unvalidatedIncident.spans[0].conditionState, 'unknown');

const unavailableWeather = buildWeatherConfidenceOverlays(adapterBase);
assert.strictEqual(unavailableWeather.spans.length, 0);
assert.ok(unavailableWeather.warnings.some((warning) => warning.includes('unavailable')));
assert.ok(unavailableWeather.unavailableReason);

[
  legalUnknown,
  validatedClosure,
  offlineGap,
  staleWeather,
  verifiedWeather,
  terrainExposure,
  bailoutSparse,
  campDeadline,
  validatedIncident,
].forEach((result) => assertAdapterSpanContract(result, result.sourceType));

const adapterOverlays = buildRouteConfidenceTimelineOverlaysFromAdapterResults([
  legalUnknown,
  validatedClosure,
  unavailableWeather,
]);
assert.ok(
  adapterOverlays.overlays.every((item) => item.source.sourceType && item.source.freshness),
  'Adapter timeline overlays should preserve source type and freshness.',
);
assert.ok(
  adapterOverlays.warnings.some((warning) => warning.includes('unavailable')),
  'Adapter result warnings should be carried forward.',
);

const identityTimeline = buildRouteConfidenceTimeline({
  routeId: 'route-alpha',
  geometryVersion: 'geom-v7',
  routeGeometry: geometry,
  generatedAt: now,
  overlays: [
    overlay({
      id: 'identity-valid',
      routeId: 'route-alpha',
      routeGeometryVersion: 'geom-v7',
      startMeasure: 100,
      endMeasure: 250,
      label: 'Valid identity span',
      confidenceLevel: 'medium',
      conditionState: 'unknown',
      driverCategory: 'legal_access',
    }),
    overlay({
      id: 'identity-wrong-route',
      routeId: 'route-bravo',
      routeGeometryVersion: 'geom-v7',
      startMeasure: 260,
      endMeasure: 320,
      label: 'Wrong route span',
      confidenceLevel: 'low',
      conditionState: 'unknown',
      driverCategory: 'offline_coverage',
    }),
    overlay({
      id: 'identity-wrong-geometry',
      routeId: 'route-alpha',
      routeGeometryVersion: 'geom-v8',
      startMeasure: 330,
      endMeasure: 390,
      label: 'Wrong geometry span',
      confidenceLevel: 'low',
      conditionState: 'unknown',
      driverCategory: 'offline_coverage',
    }),
    overlay({
      id: 'identity-reversed',
      routeId: 'route-alpha',
      routeGeometryVersion: 'geom-v7',
      startMeasure: 500,
      endMeasure: 420,
      label: 'Reversed repaired span',
      confidenceLevel: 'low',
      conditionState: 'unknown',
      driverCategory: 'bailout_density',
    }),
    overlay({
      id: 'identity-zero',
      routeId: 'route-alpha',
      routeGeometryVersion: 'geom-v7',
      startMeasure: 700,
      endMeasure: 700,
      label: 'Zero length span',
      confidenceLevel: 'low',
      conditionState: 'unknown',
      driverCategory: 'offline_coverage',
    }),
    overlay({
      id: 'identity-outside',
      routeId: 'route-alpha',
      routeGeometryVersion: 'geom-v7',
      startMeasure: 3300,
      endMeasure: 3600,
      label: 'Outside route span',
      confidenceLevel: 'low',
      conditionState: 'unknown',
      driverCategory: 'offline_coverage',
    }),
    overlay({
      id: 'identity-partial',
      routeId: 'route-alpha',
      routeGeometryVersion: 'geom-v7',
      startMeasure: -100,
      endMeasure: 75,
      label: 'Partially outside repaired span',
      confidenceLevel: 'low',
      conditionState: 'unknown',
      driverCategory: 'offline_coverage',
    }),
    overlay({
      id: 'identity-nonfinite',
      routeId: 'route-alpha',
      routeGeometryVersion: 'geom-v7',
      startMeasure: Number.NaN,
      endMeasure: 900,
      label: 'Non-finite span',
      confidenceLevel: 'low',
      conditionState: 'unknown',
      driverCategory: 'offline_coverage',
    }),
  ],
});
assert.strictEqual(identityTimeline.coverageMode, 'notable_spans_only');
assert.strictEqual(identityTimeline.completeness, 'partial');
assert.strictEqual(identityTimeline.diagnostics.generatedAt, now);
assert.ok(identityTimeline.diagnostics.rejectedSpanCount >= 5);
assert.ok(identityTimeline.diagnostics.rejectedReasons.some((reason) => reason.includes('routeId mismatch')));
assert.ok(identityTimeline.diagnostics.rejectedReasons.some((reason) => reason.includes('geometry version mismatch')));
assert.ok(identityTimeline.diagnostics.rejectedReasons.some((reason) => reason.includes('zero-length')));
assert.ok(identityTimeline.diagnostics.rejectedReasons.some((reason) => reason.includes('outside route bounds')));
assert.ok(identityTimeline.diagnostics.rejectedReasons.some((reason) => reason.includes('non-finite')));
assert.ok(
  identityTimeline.items.some((item) => item.startMeasure === 420 && item.endMeasure === 500),
  'Reversed spans with matching identity should be repaired by measure ordering.',
);
assert.ok(
  identityTimeline.items.some((item) => item.startMeasure === 0 && item.endMeasure === 75),
  'Partially out-of-bounds spans should be clamped to route measure bounds.',
);
assert.ok(
  identityTimeline.items.every((item) => Array.isArray(item.contributingDrivers) && Array.isArray(item.sources)),
  'Timeline items should expose contributingDrivers and sources aliases for detail views.',
);

const unavailableTimeline = buildRouteConfidenceTimeline({
  routeId: 'route-alpha',
  geometryVersion: 'geom-v7',
  routeGeometry: geometry,
  generatedAt: now,
  overlays: [],
  sourceWarnings: unavailableWeather.warnings,
  unavailableSources: [unavailableWeather.sourceType],
});
assert.strictEqual(unavailableTimeline.completeness, 'unavailable');
assert.deepStrictEqual(unavailableTimeline.diagnostics.unavailableSources, ['weather_intelligence']);
assert.strictEqual(unavailableTimeline.items.length, 0);

const noNotableFullRouteTimeline = buildRouteConfidenceTimeline({
  routeId: 'route-alpha',
  geometryVersion: 'geom-v7',
  routeGeometry: geometry,
  generatedAt: now,
  coverageMode: 'full_route',
  overlays: [],
});
assert.strictEqual(noNotableFullRouteTimeline.coverageMode, 'full_route');
assert.strictEqual(
  noNotableFullRouteTimeline.completeness,
  'complete',
  'Full-route coverage with no notable spans and no source warnings may be complete.',
);

const staleKnownRiskTimeline = buildRouteConfidenceTimeline({
  routeId: 'route-alpha',
  geometryVersion: 'geom-v7',
  routeGeometry: geometry,
  generatedAt: now,
  overlays: [
    overlay({
      id: 'stale-direct-hazard',
      routeId: 'route-alpha',
      routeGeometryVersion: 'geom-v7',
      startMeasure: 900,
      endMeasure: 1200,
      label: 'Stale hazard source',
      confidenceLevel: 'high',
      conditionState: 'known_risky',
      driverCategory: 'terrain_weather',
      source: source('stale-hazard-source', 'stale', '2026-06-12T08:00:00.000Z'),
    }),
  ],
});
assert.strictEqual(staleKnownRiskTimeline.completeness, 'source_limited');
assert.strictEqual(staleKnownRiskTimeline.items[0].conditionState, 'unknown');
assert.strictEqual(
  staleKnownRiskTimeline.items[0].primaryDriver.conditionState,
  'unknown',
  'Stale direct hazard overlays should be downgraded to uncertainty, not confirmed risk.',
);
assert.ok(staleKnownRiskTimeline.diagnostics.staleSources.includes('stale hazard source'));

const flags = resolveRouteContextFeatureFlags({
  'ecs.routeContextEngine.enabled': true,
  'ecs.routeContextEngine.routeConfidenceTimeline': true,
});
assert.strictEqual(flags['ecs.routeContextEngine.routeConfidenceTimeline'], true);
assert.strictEqual(
  resolveRouteContextFeatureFlags({
    'ecs.routeContextEngine.enabled': false,
    'ecs.routeContextEngine.routeConfidenceTimeline': true,
  })['ecs.routeContextEngine.routeConfidenceTimeline'],
  false,
  'Timeline flag should be gated off when Route Context Engine is disabled.',
);

const timeline = buildRouteConfidenceTimeline({
  routeId: 'route-alpha',
  geometryVersion: 'geom-v7',
  routeGeometry: geometry,
  generatedAt: now,
  overlays: [
    overlay({
      id: 'paved-approach',
      startMeasure: 0,
      endMeasure: 500,
      label: 'Paved approach',
      confidenceLevel: 'high',
      conditionState: 'normal',
      driverCategory: 'offline_coverage',
    }),
    overlay({
      id: 'unverified-a',
      startMeasure: 500,
      endMeasure: 1000,
      label: 'Unverified trail section',
      confidenceLevel: 'low',
      conditionState: 'unknown',
      driverCategory: 'legal_access',
    }),
    overlay({
      id: 'unverified-b',
      startMeasure: 1000,
      endMeasure: 1500,
      label: 'Unverified trail section',
      confidenceLevel: 'low',
      conditionState: 'unknown',
      driverCategory: 'legal_access',
    }),
    overlay({
      id: 'offline-gap',
      startMeasure: 1600,
      endMeasure: 2100,
      label: 'Offline map gap',
      confidenceLevel: 'unknown',
      conditionState: 'unknown',
      driverCategory: 'offline_coverage',
      source: source('offline-cache', 'missing', null),
    }),
    overlay({
      id: 'weather-exposed',
      startMeasure: 1600,
      endMeasure: 2100,
      label: 'Weather-exposed corridor',
      confidenceLevel: 'medium',
      conditionState: 'unknown',
      driverCategory: 'terrain_weather',
      source: source('weather-cache', 'stale', '2026-06-12T10:00:00.000Z'),
    }),
    overlay({
      id: 'closure',
      startMeasure: 2000,
      endMeasure: 2600,
      label: 'Confirmed closure',
      confidenceLevel: 'high',
      conditionState: 'known_risky',
      driverCategory: 'closure_current_condition',
      source: source('agency-closure', 'fresh', now),
    }),
    overlay({
      id: 'bailout-density',
      startMeasure: 2800,
      endMeasure: 3600,
      label: 'Sparse bailout density',
      confidenceLevel: 'low',
      conditionState: 'unknown',
      driverCategory: 'bailout_density',
    }),
  ],
});

assert.strictEqual(timeline.routeId, 'route-alpha');
assert.strictEqual(timeline.geometryVersion, 'geom-v7');
assert.strictEqual(timeline.totalMeasure, 3000);
assert.strictEqual(timeline.readiness, 'feature_flagged');
assert.strictEqual(timeline.coverageMode, 'notable_spans_only');
assert.strictEqual(timeline.completeness, 'source_limited');
assert.ok(
  timeline.items.every((item) => item.startMeasure >= 0 && item.endMeasure <= 3000 && item.startMeasure < item.endMeasure),
  'Timeline spans should be clamped to the measured route.',
);
assert.ok(
  timeline.items.some((item) => (
    item.startMeasure === 500 &&
    item.endMeasure === 1500 &&
    item.label === 'Unverified trail section' &&
    item.drivers.length === 2 &&
    item.contributingDrivers.length === 2 &&
    item.mergeReason === 'adjacent_same_state'
  )),
  'Adjacent compatible spans should merge while preserving contributing drivers.',
);
const offlineWeather = timeline.items.find((item) => item.startMeasure === 1600 && item.endMeasure === 2000);
assert.ok(offlineWeather, 'Overlapping offline/weather overlays should produce a partitioned timeline item.');
assert.strictEqual(offlineWeather.conditionState, 'unknown');
assert.strictEqual(
  offlineWeather.primaryDriver.category,
  'offline_coverage',
  'Highest-impact uncertainty driver should become the primary driver for the span.',
);
assert.ok(
  offlineWeather.drivers.some((driver) => driver.category === 'terrain_weather'),
  'Multiple contributing drivers should remain available for details.',
);
assert.ok(
  offlineWeather.contributingDrivers.some((driver) => driver.category === 'terrain_weather'),
  'Contributing drivers should mirror detail drivers for overlapping spans.',
);
assert.ok(
  offlineWeather.sources.some((item) => item.id === 'weather-cache'),
  'Overlapping spans should preserve every contributing source.',
);
assert.strictEqual(offlineWeather.mergeReason, 'overlap_highest_impact');
assert.ok(
  timeline.items.some((item) => item.conditionState === 'known_risky' && item.primaryDriver.category === 'closure_current_condition'),
  'Confirmed closure overlays should render as known risk.',
);
assert.ok(
  timeline.items
    .filter((item) => item.confidenceLevel === 'low' || item.confidenceLevel === 'unknown')
    .every((item) => item.conditionState !== 'known_risky' || item.primaryDriver.category === 'closure_current_condition'),
  'Low or unknown confidence should not be treated as confirmed danger.',
);
assert.ok(
  timeline.items.some((item) => item.sourceFreshness.some((freshness) => freshness.freshness === 'missing')),
  'Missing offline package source freshness should be preserved in timeline items.',
);
assert.ok(
  timeline.warnings.some((warning) => warning.includes('missing source metadata')),
  'Missing source metadata should be visible as a freshness warning.',
);

const uncertaintyCopy = routeConfidenceTimelineItemCopy(
  timeline.items.find((item) => item.primaryDriver.category === 'legal_access'),
);
assert.ok(uncertaintyCopy.includes('uncertainty'), 'Low confidence copy should be framed as uncertainty.');
assert.ok(!uncertaintyCopy.toLowerCase().includes('danger'), 'Low confidence copy should not imply danger.');
const knownRiskCopy = routeConfidenceTimelineItemCopy(
  timeline.items.find((item) => item.primaryDriver.category === 'closure_current_condition'),
);
assert.ok(knownRiskCopy.includes('known risk'), 'Confirmed hazards should use known-risk copy.');

async function main() {
  const context = await generateRouteContext({
    trail: {
      id: 'route-alpha',
      explicitTrailhead: { lat: 38.0, lng: -110.0 },
      endpointCoordinate: { lat: 38.0, lng: -109.7 },
      routeGeometry: geometry.coordinates,
    },
    providers: {
      geometryProvider: {
        id: 'timeline-geometry-provider',
        async buildRouteGeometry() {
          return geometry;
        },
      },
    },
    routeConfidenceTimelineOverlays: [
      overlay({
        id: 'camp-deadline',
        startMeasure: 2200,
        endMeasure: 3000,
        label: 'Camp decision deadline',
        confidenceLevel: 'medium',
        conditionState: 'unknown',
        driverCategory: 'camp_deadline',
      }),
      overlay({
        id: 'recovery-zone',
        startMeasure: 1200,
        endMeasure: 1900,
        label: 'Recovery exposure zone',
        confidenceLevel: 'medium',
        conditionState: 'known_risky',
        driverCategory: 'recovery_exposure',
      }),
    ],
    featureFlags: {
      'ecs.routeContextEngine.enabled': true,
      'ecs.routeContextEngine.routeConfidenceTimeline': true,
    },
    now,
  });
  assert.ok(context.routeConfidenceTimeline, 'Route Context Engine should attach a feature-flagged timeline.');
  assert.strictEqual(context.routeConfidenceTimeline.routeId, 'route-alpha');
  assert.strictEqual(context.routeConfidenceTimeline.geometryVersion, 'geom-v7');
  assert.ok(
    context.routeConfidenceTimeline.items.some((item) => item.primaryDriver.category === 'camp_deadline'),
    'Camp deadline overlays should flow through the Route Context Engine contract.',
  );
  assert.ok(
    context.routeConfidenceTimeline.items.some((item) => item.primaryDriver.category === 'recovery_exposure'),
    'Recovery exposure overlays should flow through the Route Context Engine contract.',
  );

  const disabled = await generateRouteContext({
    trail: {
      id: 'timeline-disabled',
      explicitTrailhead: { lat: 38.0, lng: -110.0 },
      endpointCoordinate: { lat: 38.0, lng: -109.7 },
    },
    routeConfidenceTimelineOverlays: [
      overlay({
        id: 'offline-gap-disabled',
        startMeasure: 0,
        endMeasure: 500,
        label: 'Offline map gap',
        confidenceLevel: 'unknown',
        conditionState: 'unknown',
        driverCategory: 'offline_coverage',
      }),
    ],
    featureFlags: {
      'ecs.routeContextEngine.enabled': true,
      'ecs.routeContextEngine.routeConfidenceTimeline': false,
    },
    now,
  });
  assert.strictEqual(disabled.routeConfidenceTimeline, null);

  console.log('Route Confidence Timeline checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
