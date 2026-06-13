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
    startMeasure: overrides.startMeasure,
    endMeasure: overrides.endMeasure,
    label: overrides.label,
    confidenceLevel: overrides.confidenceLevel,
    conditionState: overrides.conditionState,
    driverCategory: overrides.driverCategory,
    source: overrides.source ?? source(overrides.id),
    detail: overrides.detail ?? null,
  };
}

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
assert.ok(
  timeline.items.every((item) => item.startMeasure >= 0 && item.endMeasure <= 3000 && item.startMeasure < item.endMeasure),
  'Timeline spans should be clamped to the measured route.',
);
assert.ok(
  timeline.items.some((item) => (
    item.startMeasure === 500 &&
    item.endMeasure === 1500 &&
    item.label === 'Unverified trail section' &&
    item.drivers.length === 2
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
