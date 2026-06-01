const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const briefCard = fs.readFileSync(path.join(root, 'components', 'dashboard', 'MissionBriefCard.tsx'), 'utf8');
const missionBriefEngine = fs.readFileSync(path.join(root, 'lib', 'missionBriefEngine.ts'), 'utf8');
const degradedOps = fs.readFileSync(path.join(root, 'lib', 'ai', 'degradedOperationsEngine.ts'), 'utf8');
const packageSource = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

function assertIncludes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function assertNotIncludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

assertIncludes(
  missionBriefEngine,
  'weatherMeta: buildWeatherMeta(ctx)',
  'Mission Brief should expose weather metadata for source-driven activity log wording.',
);
assertIncludes(
  missionBriefEngine,
  'routeGuidanceMeta: buildRouteGuidanceMeta(ctx)',
  'Mission Brief should expose route guidance metadata for source-driven activity log wording.',
);
assertIncludes(
  missionBriefEngine,
  "label = 'Weather updated recently'",
  'Weather metadata should distinguish recently updated weather.',
);
assertIncludes(
  missionBriefEngine,
  "label = 'Weather data is stale'",
  'Weather metadata should distinguish stale weather.',
);
assertIncludes(
  missionBriefEngine,
  "label = 'Weather provider unavailable'",
  'Weather metadata should distinguish provider unavailable state.',
);
assertIncludes(
  briefCard,
  'function sourceDrivenActivityLine',
  'Mission Brief activity log should prefer source-driven state lines.',
);
assertIncludes(
  briefCard,
  'weatherActivityLine(brief?.weatherMeta)',
  'Activity log should include weather state from Mission Brief weather metadata.',
);
assertIncludes(
  briefCard,
  'routeGuidanceActivityLine(brief?.routeGuidanceMeta)',
  'Activity log should include route guidance state from Mission Brief route metadata.',
);
assertIncludes(
  briefCard,
  'Staging/pre-departure active',
  'Activity log should label staging/pre-departure from actual phase state.',
);
assertIncludes(
  degradedOps,
  'Weather data is stale.',
  'Degraded operations should use source-driven stale weather wording.',
);
assertIncludes(
  degradedOps,
  'Route guidance available.',
  'Degraded operations should include explicit route guidance availability when known.',
);
assertNotIncludes(
  degradedOps,
  'Weather is stale, but route guidance remains available.',
  'Old stale fallback wording should not remain in degraded operations.',
);
assertIncludes(
  packageSource,
  '"test:ecs-brief-activity-source-state": "node ./scripts/test-ecs-brief-activity-source-state.js"',
  'package.json should expose the ECS Brief activity source-state regression test.',
);

console.log('ECS Brief activity source-state wording checks passed.');
