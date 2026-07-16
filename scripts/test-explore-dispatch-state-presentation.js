const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const explore = read('app', '(tabs)', 'discover.tsx');
const dispatch = read('components', 'dispatch', 'DispatchCadCommandCenter.tsx');
const exploreFilters = read('components', 'discover', 'DistanceRadiusFilter.tsx');

assert.match(
  explore,
  /<TabErrorBoundary\s+tabName="EXPLORE">[\s\S]*?<DiscoverScreenInner\s*\/>[\s\S]*?<\/TabErrorBoundary>/,
  'The registered Explore screen must use the canonical tab error boundary.',
);

assert.doesNotMatch(
  exploreFilters,
  /ANDROID_DRAW_OPTIMIZED_SURFACE|backgroundColor:\s*`\$\{TACTICAL\.amber\}0?[0-9A-F]+`/,
  'Explore filter controls must not become transparent dark-theme surfaces over the light web shell.',
);
for (const styleContract of [
  /container:\s*\{[\s\S]*?backgroundColor:\s*ECS\.bgPanel/,
  /filterContentSurface:\s*\{[\s\S]*?backgroundColor:\s*ECS\.bgElev/,
  /segment:\s*\{[\s\S]*?backgroundColor:\s*ECS\.bgPanel/,
  /refinementChip:\s*\{[\s\S]*?backgroundColor:\s*ECS\.bgPanel/,
]) {
  assert.match(
    exploreFilters,
    styleContract,
    'Explore filter surfaces must use opaque ECS tactical surfaces on every mounted platform.',
  );
}
assert.doesNotMatch(
  explore,
  /class\s+DiscoverErrorBoundary\b|<DiscoverErrorBoundary>/,
  'Explore must not retain a divergent local error boundary.',
);

for (const stateKind of [
  'loading',
  'empty',
  'filtered',
  'provider_error',
  'stale',
  'partial',
  'disabled',
  'permission_required',
  'cancelled',
]) {
  assert.match(
    explore,
    new RegExp(`${stateKind}:\\s*'[^']+'`),
    `ExplorerStateCard must map ${stateKind} to a shared ECS state presentation.`,
  );
}

assert.match(
  explore,
  /sourceLabel=\{routeCatalogSourceStateLabel\}/,
  'Route catalog terminal states must expose canonical source/freshness language.',
);
assert.match(
  explore,
  /<ECSButton[\s\S]*?label="Retry Live Routes"[\s\S]*?onPress=\{handleRetryLiveTrailPackCatalog\}/,
  'Explore provider recovery must use the shared accessible action primitive and the real retry handler.',
);

assert.match(
  dispatch,
  /<ECSAsyncStateMessage[\s\S]*?state=\{dispatchLocalSurfaceState\}[\s\S]*?onRetry=\{retryDispatchLocalHydration\}/,
  'Dispatch hydration must render the typed async state and retain its real retry action.',
);
for (const stateKind of ['loading', 'empty', 'partial', 'stale', 'provider_unavailable', 'recoverable_error', 'nonrecoverable_error', 'cancelled']) {
  assert.match(
    dispatch,
    new RegExp(`${stateKind}:\\s*\\{`),
    `Dispatch hydration must preserve approved copy for ${stateKind}.`,
  );
}
assert.match(
  dispatch,
  /testID="dispatch-mission-command-disabled"[\s\S]*?variant="disabled"/,
  'Mission Command rollout disablement must use the explicit disabled presentation.',
);

console.log('Explore and Dispatch shared state presentation checks passed.');
