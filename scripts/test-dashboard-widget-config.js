const fs = require('fs');
const path = require('path');
const assert = require('assert');

const registryPath = path.join(__dirname, '..', 'lib', 'widgetRegistry.ts');
const source = fs.readFileSync(registryPath, 'utf8');

function extractCatalogWidgetIds() {
  const match = source.match(/export const DASHBOARD_WIDGET_CATALOG:[\s\S]*?= \[(.*?)\] as const;/ms);
  if (!match) {
    throw new Error('Unable to locate DASHBOARD_WIDGET_CATALOG in widgetRegistry.ts');
  }
  return Array.from(match[1].matchAll(/widgetId:\s*'([^']+)'/g)).map((result) => result[1]);
}

function extractDefaultSlotIds(mode) {
  const match = source.match(
    new RegExp(`export const DEFAULT_DASHBOARD_LAYOUTS[\\s\\S]*?${mode}: \\{[\\s\\S]*?slots: \\[(.*?)\\][\\s\\S]*?\\}`, 'ms'),
  );
  if (!match) {
    throw new Error(`Unable to locate default layout block for "${mode}"`);
  }
  return Array.from(match[1].matchAll(/widgetId: '([^']+)'/g)).map((result) => result[1]);
}

function extractCatalogPriorities() {
  const match = source.match(/export const DASHBOARD_WIDGET_CATALOG:[\s\S]*?= \[(.*?)\] as const;/ms);
  if (!match) {
    throw new Error('Unable to locate DASHBOARD_WIDGET_CATALOG in widgetRegistry.ts');
  }
  return Array.from(match[1].matchAll(/priority:\s*(\d+)/g)).map((result) => Number(result[1]));
}

const curatedIds = extractCatalogWidgetIds();
const expeditionDefaults = extractDefaultSlotIds('expedition');
const highwayDefaults = extractDefaultSlotIds('highway');
const priorities = extractCatalogPriorities().sort((a, b) => a - b);

assert.strictEqual(curatedIds.length, 10, 'Dashboard library must stay capped at exactly 10 curated widgets.');
assert.strictEqual(new Set(curatedIds).size, curatedIds.length, 'Curated widget IDs must remain unique.');
assert.deepStrictEqual(priorities, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'Dashboard widget priorities must remain a complete 1-10 ranking.');
assert.strictEqual(expeditionDefaults.length, 3, 'Expedition defaults must stay at exactly three widgets.');
assert.ok(
  expeditionDefaults.includes('attitude-monitor'),
  'Expedition defaults must include Attitude Monitor.',
);
assert.deepStrictEqual(
  expeditionDefaults,
  ['attitude-monitor', 'remoteness', 'hwy-forward-weather'],
  'Expedition defaults must remain the curated trail-focused set.',
);
assert.deepStrictEqual(
  highwayDefaults,
  ['vehicle-systems', 'progress', 'hwy-forward-weather', 'hwy-cell-coverage'],
  'Highway defaults must remain the curated travel-focused set.',
);

console.log('Dashboard widget configuration checks passed.');
