const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const navigate = fs.readFileSync(path.join(root, 'app', '(tabs)', 'navigate.tsx'), 'utf8');

function assertIncludes(fragment, message) {
  assert.ok(navigate.includes(fragment), message);
}

function assertNotMatches(pattern, message) {
  assert.ok(!pattern.test(navigate), message);
}

assertIncludes(
  "case 'intel':",
  'Tools primary Intel button should route through the single Intel popup entry point.',
);
assertIncludes(
  "openTopPopup('intel')",
  'Tools primary Intel button should open the live Intel panel.',
);
assertIncludes(
  'const intelRouteContext = useMemo',
  'Intel panel should derive the current built/active route through a memoized route context.',
);
assertIncludes(
  'Build or select a route first.',
  'Intel panel should provide a clear no-route state.',
);
[
  'Route Snapshot',
  'Terrain Watch',
  'Forecast',
  'Staging / Pre-Departure',
  'Camp',
  'Resource Check',
].forEach((label) => {
  assertIncludes(label, `Intel panel should expose ${label} from the main Intel entry point.`);
});

assertNotMatches(
  /quickActionsSectionTitle[^>]*>\s*INTEL\s*</,
  'Tools popup should not render the removed lower Intel section.',
);
[
  'route_snapshot',
  'terrain_watch',
  'resource_check',
  'staging_pre_departure',
].forEach((legacyAction) => {
  assert.ok(
    !navigate.includes(`handleQuickAction('${legacyAction}')`) &&
      !navigate.includes(`handleIntelAction('${legacyAction}')`),
    `Tools popup should not keep duplicate lower Intel button handler ${legacyAction}.`,
  );
});

console.log('Navigate Tools Intel regression checks passed.');
