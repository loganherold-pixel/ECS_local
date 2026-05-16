const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const navigatePath = path.join(root, 'app', '(tabs)', 'navigate.tsx');
const helperPath = path.join(root, 'lib', 'navigateMissionBriefContext.ts');
const aiContextBuilderPath = path.join(root, 'lib', 'aiContextBuilder.ts');

const navigate = fs.readFileSync(navigatePath, 'utf8');
const helper = fs.readFileSync(helperPath, 'utf8');
const aiContextBuilder = fs.readFileSync(aiContextBuilderPath, 'utf8');

assert.ok(
  navigate.includes('buildNavigateMissionBriefLiveState'),
  'Navigate should build a sanitized mission brief live-state packet.',
);
assert.ok(
  navigate.includes('buildAIContextFromLiveState(missionBriefContextRef.current.liveState'),
  'Navigate mission brief generation should pass the sanitized live-state packet through a signature-gated ref.',
);
assert.ok(
  navigate.includes('useStoreFallbacks: false'),
  'Navigate mission brief generation should not rehydrate raw stores after building the sanitized live-state packet.',
);
assert.ok(
  navigate.includes('const missionBriefVehicleState = useMemo') &&
    navigate.includes('vehicle: missionBriefVehicleState'),
  'Navigate mission brief generation should pass a stable flat vehicle summary into the sanitized live-state packet.',
);
assert.ok(
  !navigate.includes('buildAIContextFromLiveState({\n          route: {\n            activeRun,'),
  'Navigate should not pass raw activeRun/route objects directly into the AI context builder.',
);
assert.ok(
  navigate.includes('buildNavigateMissionBriefFallback(message)'),
  'Navigate should provide a safe fallback brief when mission context generation fails.',
);
assert.ok(
  helper.includes('const seen = new WeakSet<object>()'),
  'Mission brief signature serializer should guard circular references.',
);
assert.ok(
    aiContextBuilder.includes('useStoreFallbacks?: boolean') &&
    aiContextBuilder.includes('const useStoreFallbacks = options.useStoreFallbacks !== false') &&
    aiContextBuilder.includes('(useStoreFallbacks ? routeStore.getActive() : null)'),
  'AI context builder should support a live-bridge-only path that avoids store fallback objects.',
);
assert.ok(
  aiContextBuilder.includes('useStoreFallbacks ? resourceForecastEngine.getCurrent() : null'),
  'Live-bridge-only mission brief contexts should not fall back to resource forecast store snapshots.',
);
assert.ok(
  helper.includes('sanitizeActiveRun') &&
    helper.includes('sanitizeRouteIntelligence') &&
    helper.includes('sanitizeWeather') &&
    helper.includes('sanitizeVehicleLabel'),
  'Mission brief helper should sanitize route/run/weather/vehicle inputs.',
);
assert.ok(
  helper.includes('MAX_ROUTE_POINTS') &&
    helper.includes('MAX_SEGMENTS') &&
    helper.includes('MAX_ALERTS'),
  'Mission brief helper should bound nested collections.',
);

console.log('Navigate mission brief context sanitization checks passed.');
