const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const inspector = read('components', 'source-truth', 'SourceTruthInspector.tsx');
const indicators = read('components', 'source-truth', 'SourceTruthIndicators.tsx');
const modalShell = read('components', 'ECSModalShell.tsx');
const readiness = read('components', 'readiness', 'ReadinessDetailSheet.tsx');
const weather = read('components', 'weather', 'WeatherIntelPanel.tsx');
const routeCatalog = read('components', 'discover', 'RouteCatalogSummaryCard.tsx');
const fleet = read('app', '(tabs)', 'fleet.tsx');
const navigate = read('app', '(tabs)', 'navigate.tsx');
const campground = read('components', 'navigate', 'EstablishedCampsiteSheet.tsx');
const adapters = read('lib', 'sourceTruthAdapters.ts');
const packageJson = JSON.parse(read('package.json'));

for (const primitive of [
  'ECSModalShell',
  'ECSBadge',
  'ECSPanel',
  'ECSSectionHeader',
  'ECSListRow',
  'ECSButton',
]) {
  assert(inspector.includes(primitive), `Inspector should reuse ${primitive}.`);
}

for (const copy of [
  'Source Details',
  'ECS SOURCE TRUTH',
  'Decision Impact',
  'Freshness And Quality',
  'Source Warnings',
  'Conflicts And Warnings',
]) {
  assert(inspector.includes(copy), `Inspector should render ${copy}.`);
}

assert(
  inspector.includes('accessibilityViewIsModal') &&
    inspector.includes('AccessibilityInfo.setAccessibilityFocus') &&
    inspector.includes('accessibilityRole="button"') &&
    inspector.includes('accessibilityHint=') &&
    inspector.includes('hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}'),
  'Inspector should expose modal semantics, focus management, accessible trigger copy, and a readable touch target.',
);
assert(
  modalShell.includes('accessibilityLabel={`Close ${title}`}') &&
    modalShell.includes('accessibilityLabel="Go back"') &&
    modalShell.includes('accessibilityRole="header"'),
  'The shared modal shell should label close/back controls and its title for screen readers.',
);
assert(
  inspector.includes('stackBehavior="allow-stack"') &&
    inspector.includes('overlayClass="editor"') &&
    inspector.includes('allowSwipeDismiss') &&
    inspector.includes('showHandle') &&
    inspector.includes('inspectorMounted ? ('),
  'Inspector should use the existing adaptive sheet behavior and stack safely over detail views.',
);

for (const forbidden of [
  'JSON.stringify',
  '.rawProviderResponse',
  '.rawPayload',
  'serviceRole',
  'apiKey',
  'authorizationHeader',
  'restrictedCoordinates',
]) {
  assert.strictEqual(inspector.includes(forbidden), false, `Inspector UI must not render ${forbidden}.`);
}
for (const forbiddenImport of ['supabase', 'axios', 'weatherService', 'fetch(']) {
  assert.strictEqual(inspector.includes(forbiddenImport), false, `Inspector must work offline without ${forbiddenImport}.`);
}

for (const component of [
  'ECSSourceBadge',
  'ECSFreshnessBadge',
  'ECSConfidenceBadge',
  'ECSSourceConflictWarning',
]) {
  assert(indicators.includes(`function ${component}`), `${component} should be reusable across ECS surfaces.`);
  assert(inspector.includes(component), `Inspector should compose the shared ${component}.`);
}
assert(
  inspector.includes('sources?: readonly SourceTruthRef[] | null') &&
    inspector.includes('sources={sources}'),
  'Inspector and trigger should preserve multiple evidence sources through the detail sheet.',
);

assert(
  readiness.includes("import { SourceTruthInspectorTrigger } from '../source-truth';") &&
    readiness.includes('buildReadinessAssessmentSourceTruthBinding') &&
    readiness.includes('readiness-assessment-source-truth') &&
    readiness.includes('label={`Confidence ${assessment.confidence}`}'),
  'Dashboard readiness confidence should open the shared inspector without changing the readiness decision.',
);
assert(
  weather.includes('sources={weatherSourceTruthBinding.sources}') &&
    adapters.includes("role: origin === 'cached' ? 'last_good' : 'primary'") &&
    adapters.includes('liveUnavailableRef'),
  'Weather should expose live failure and usable cached last-good evidence together.',
);
assert(
  fleet.includes('buildFleetWeightSourceTruthBinding') &&
    fleet.includes('sourceTruthBinding={selectedVehicleWeightSourceTruth}') &&
    fleet.includes('label="Weight sources"'),
  'Fleet confidence should expose canonical weight provenance without changing Fleet scoring.',
);
assert(
  campground.includes('buildEstablishedCampgroundSourceTruthBinding') &&
    campground.includes('label="Source and conditions"') &&
    !adapters.includes('.rawJson') &&
    !adapters.includes('.sourceUrl'),
  'Established campground detail should separate source conditions without forwarding provider payloads.',
);
assert(
  navigate.includes('buildConvoyLocationSourceTruthBinding') &&
    navigate.includes('label="GPS source"') &&
    !adapters.includes('latitude:') &&
    !adapters.includes('longitude:'),
  'Navigate convoy detail should expose source freshness without forwarding restricted coordinates.',
);
assert(
  weather.includes("import { SourceTruthInspectorTrigger } from '../source-truth';") &&
    weather.includes('buildWeatherSourceTruthBinding') &&
    weather.includes('testID="weather-source-truth-trigger"') &&
    weather.includes("kind: 'refresh'") &&
    weather.includes('onPress: () => handleFetch(true)') &&
    weather.includes('Saved source details remain available offline.'),
  'Weather should expose canonical source details and reuse its existing refresh path with an offline-disabled state.',
);
assert(
  routeCatalog.includes("import { SourceTruthInspectorTrigger } from '../source-truth';") &&
    routeCatalog.includes('buildRouteCatalogSourceTruthBinding') &&
    routeCatalog.includes('route-source-truth-') &&
    !routeCatalog.includes("sourceType === 'official' ? 'live'") &&
    routeCatalog.includes('onOpenTripBuilder(summary.routeId)') &&
    !routeCatalog.includes('onPreview(summary.routeId)') &&
    !routeCatalog.includes('onStartGuidance(summary.routeId)'),
  'Route Catalog source badges should open the inspector while preserving the summary-first Trip Builder handoff.',
);
assert(
    adapters.includes("confidence: 'unknown'") &&
    adapters.includes('route_legal_status_unverified') &&
    adapters.includes('readiness_assessment_inferred') &&
    !adapters.includes('rawProviderResponse') &&
    !adapters.includes('restrictedCoordinates'),
  'Legacy adapters should preserve unknown confidence and omit sensitive/raw fields.',
);
assert.strictEqual(
  packageJson.scripts['test:source-truth-inspector-model'],
  'node ./scripts/test-source-truth-inspector-model.js',
);
assert.strictEqual(
  packageJson.scripts['test:source-truth-inspector-ui'],
  'node ./scripts/test-source-truth-inspector-ui.js',
);

console.log('Source Truth Inspector UI and integration contract checks passed.');
