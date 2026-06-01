const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const visibleCopyFiles = [
  'components/navigate/MapFallbackSurface.tsx',
  'components/navigate/MapRenderer.tsx',
  'components/dashboard/WidgetRenderers.tsx',
  'components/navigate/CampsiteCandidatePanel.tsx',
  'components/convoy/ConvoyMapFallback.tsx',
  'components/campops/CampOpsVisualQaScreen.tsx',
  'lib/vehicleDisplayStore.ts',
  'lib/widgetRegistry.ts',
];

const forbiddenVisibleFragments = [
  'Map fallback ready',
  "statusLabel = 'Fallback map'",
  "'ECS fallback map'",
  "'Offline map fallback'",
  'configured fallback where available',
  'No fixed fallback coordinates are used.',
  "'Device fallback'",
  'configure fallback data',
  "'Manual fallback'",
  "'Manual resource fallback'",
  'No live telemetry or configured fallback',
  "'Fallback only'",
  'Convoy map fallback',
  'Emergency fallback',
  'emergency fallback',
  'Gravel Lot Fallback',
];

const combined = visibleCopyFiles
  .map((relativePath) => `\n// ${relativePath}\n${read(relativePath)}`)
  .join('\n');

for (const fragment of forbiddenVisibleFragments) {
  assert.ok(
    !combined.includes(fragment),
    `User-facing copy must not expose fallback wording: ${fragment}`,
  );
}

console.log('[user-facing-fallback-copy] visible fallback wording contract passed');
