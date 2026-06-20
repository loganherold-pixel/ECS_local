const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(...parts) {
  return fs.readFileSync(path.join(root, ...parts), 'utf8').replace(/\r\n/g, '\n');
}

const navigateBailouts = read('app', 'navigate-bailouts.tsx');
const navigate = read('app', '(tabs)', 'navigate.tsx');
const mapRenderer = read('components', 'navigate', 'MapRenderer.tsx');
const bailoutStore = read('lib', 'bailoutStore.ts');
const bailoutIntelligence = read('lib', 'bailoutIntelligence.ts');
const departureAudit = read('lib', 'readiness', 'departureAudit.ts');
const readinessStore = read('lib', 'readiness', 'expeditionReadinessStore.ts');

assert.ok(
  navigateBailouts.includes('MapRenderer'),
  'Review Bailouts should render the active route map, not only the bailout list.',
);
assert.ok(
  navigateBailouts.includes('navigateRouteSessionStore.getSnapshot()'),
  'Review Bailouts should derive context from the active guidance session.',
);
assert.ok(
  navigateBailouts.includes('routeStore.getActive()'),
  'Review Bailouts should fall back to the active imported GPX/custom route.',
);
assert.ok(
  navigateBailouts.includes('onMapTap={handleDropRouteBailoutPoint}'),
  'Review Bailouts map taps should drop route-associated bailout pins.',
);
assert.ok(
  navigateBailouts.includes('bailoutStore.addBailoutToRun(activeRouteId'),
  'Dropped bailout pins should be attached to the current route/run id for GPX reuse.',
);
assert.ok(
  navigateBailouts.includes('handleCompleteReview'),
  'Review Bailouts should have a completion action that returns the operator to the audit.',
);
assert.ok(
  navigateBailouts.includes('params.bailoutId'),
  'Review Bailouts should support opening a tapped active-guidance bailout marker for edit/view.',
);

assert.ok(
  departureAudit.includes('routeBailoutPointCount'),
  'Departure Audit should evaluate route-specific bailout pin count.',
);
assert.ok(
  readinessStore.includes('bailoutStore.getRunBailouts(activeRouteId)'),
  'Readiness offline input should count bailout pins attached to the active route.',
);

assert.ok(
  mapRenderer.includes('onBailoutTap?: (pin: any) => void'),
  'MapRenderer should expose a bailout marker tap callback.',
);
assert.ok(
  mapRenderer.includes("payload?.kind === 'bailout'"),
  'MapRenderer should route bailout marker taps separately from generic saved pins.',
);
assert.ok(
  navigate.includes('onBailoutTap={handleBailoutMarkerTap}'),
  'Active Navigate should wire bailout marker taps to the review/edit screen.',
);
assert.ok(
  navigate.includes('activeBailoutRouteId'),
  'Active Navigate bailout markers should resolve against the active route/session id.',
);

assert.ok(
  bailoutStore.includes("| 'bailout'") && bailoutStore.includes("key: 'bailout'"),
  'Bailout store should expose a first-class Bailout pin type.',
);
assert.ok(
  bailoutIntelligence.includes("return 'bailout'"),
  'Bailout intelligence should preserve explicit bailout waypoint text as bailout pins.',
);

console.log('Navigate bailout review flow checks passed.');
