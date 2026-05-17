const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const remotenessWidget = read('components', 'dashboard', 'RemotenessIndexWidget.tsx');
const routeConfidenceWidget = read('components', 'dashboard', 'RouteConfidenceWidget.tsx');
const renderers = read('components', 'dashboard', 'WidgetRenderers.tsx');
const registry = read('lib', 'widgetRegistry.ts');
const dashboardStore = read('lib', 'dashboardStore.ts');

function extractCatalogBlock(widgetId) {
  const match = registry.match(new RegExp(`\\{\\s*widgetId: '${widgetId}',[\\s\\S]*?\\n\\s*\\},`, 'm'));
  assert.ok(match, `Expected catalog block for ${widgetId}`);
  return match[0];
}

function extractRegistryBlock(widgetId) {
  const match = registry.match(new RegExp(`\\{\\s*widget_id: '${widgetId}',[\\s\\S]*?\\n\\s*\\},`, 'm'));
  assert.ok(match, `Expected registry block for ${widgetId}`);
  return match[0];
}

const routeConfidenceCatalog = extractCatalogBlock('route-confidence');
const routeConfidenceRegistry = extractRegistryBlock('route-confidence');
const remotenessCatalog = extractCatalogBlock('remoteness');

assert.ok(
  remotenessWidget.includes('[0, 1, 2, 3, 4].map'),
  'Remoteness widget should render five signal-style bars.',
);
assert.ok(
  remotenessWidget.includes('<Text style={styles.distanceLabel}>{row.label}: </Text>') &&
    remotenessWidget.includes('getPrimaryDistanceMetrics'),
  'Remoteness widget should show compact Road/Town distance rows.',
);
assert.ok(
  remotenessWidget.includes("title=\"Remoteness\"") &&
    remotenessWidget.includes('WidgetCompactRow') &&
    !remotenessWidget.includes('ScrollView') &&
    !remotenessWidget.includes('MapRenderer'),
  'Remoteness compact widget should remain a single-line, no-map dashboard widget.',
);

assert.ok(
  routeConfidenceWidget.includes('buildNavigateRouteConfidenceSummary'),
  'Route Confidence widget should use the route confidence summary pipeline.',
);
assert.ok(
  routeConfidenceWidget.includes('confidenceLabel: `${summary.confidence}%`') &&
    routeConfidenceWidget.includes('Signal in ${formatRemotenessDistance(nextSignalMi)}'),
  'Route Confidence widget should show percent confidence and signal-ahead text.',
);
assert.ok(
  routeConfidenceWidget.includes('RouteConfidenceCompact') &&
    routeConfidenceWidget.includes('WidgetCompactRow') &&
    !routeConfidenceWidget.includes('ScrollView') &&
    !routeConfidenceWidget.includes('MapRenderer'),
  'Route Confidence widget should support compact mode without maps or scrolling.',
);

assert.ok(
  renderers.includes("case 'route-confidence'") &&
    renderers.includes('<RouteConfidenceCompact />') &&
    renderers.includes('<RouteConfidenceWidget />'),
  'Widget renderer should render Route Confidence in compact and standard modes.',
);
assert.ok(
  dashboardStore.includes("| 'route-confidence'"),
  'Dashboard store widget type should include route-confidence.',
);

for (const block of [routeConfidenceCatalog, remotenessCatalog]) {
  assert.ok(block.includes("recommendedWidgetSize: '1x1'"), 'Widget should be recommended as 1x1.');
  assert.ok(block.includes("supportedWidgetSizes: ['1x1']"), 'Widget should support only 1x1.');
  assert.ok(block.includes("minimumWidgetSize: '1x1'"), 'Widget minimum size should be 1x1.');
  assert.ok(block.includes('userResizable: false'), 'Widget should not be resizable.');
}

assert.ok(
  routeConfidenceRegistry.includes("default_size: '1x1'") &&
    routeConfidenceRegistry.includes('default_dashboard: false') &&
    routeConfidenceRegistry.includes('supports_compact: true') &&
    routeConfidenceRegistry.includes("'route_confidence'") &&
    routeConfidenceRegistry.includes("'signal_forecast'"),
  'Route Confidence registry entry should be compact, optional, and data-scoped.',
);

assert.ok(
  registry.includes('Expected 8 curated dashboard widgets') &&
    registry.includes('complete 1-8 ranking'),
  'Dashboard registry validation should account for the curated widget set.',
);

console.log('Dashboard remoteness and route confidence widget checks passed.');
