const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(transpiled.outputText, filename);
};

const {
  buildApproachResupplySearchAnchors,
  rankApproachResupplyOptions,
} = require(path.join(root, 'lib', 'tripBuilder', 'approachResupplyPlanner.ts'));

const origin = { latitude: 39.0, longitude: -121.5 };
const trailhead = { latitude: 40.5, longitude: -121.4 };
const approachRoute = [
  origin,
  { latitude: 39.45, longitude: -121.5 },
  { latitude: 39.9, longitude: -121.5 },
  { latitude: 40.25, longitude: -121.5 },
  trailhead,
];

const anchors = buildApproachResupplySearchAnchors({
  trailhead,
  approachRoute,
});
assert.ok(anchors.length >= 3, 'Approach resupply should sample more than the trailhead point.');
assert.ok(
  anchors.some((anchor) => anchor.basis === 'approach_corridor'),
  'Approach resupply should search along the approach corridor before trail entry.',
);
assert.ok(
  anchors.some((anchor) => anchor.basis === 'approach_corridor' && anchor.progressRatio != null && anchor.progressRatio <= 0.2),
  'Approach resupply should sample the early/home-side corridor instead of only searching near the trailhead.',
);
assert.ok(
  anchors.some((anchor) => anchor.basis === 'approach_corridor' && anchor.progressRatio != null && anchor.progressRatio >= 0.9),
  'Approach resupply should still sample the last approach segment before trail entry.',
);
assert.strictEqual(
  anchors[anchors.length - 1].basis,
  'trailhead_fallback',
  'The trailhead should remain the final fallback anchor, not the only search point.',
);

const rankedFuel = rankApproachResupplyOptions({
  category: 'fuel',
  origin,
  trailhead,
  approachRoute,
  candidates: [
    {
      id: 'chico-straight-line-nearest',
      title: 'Straight-Line Nearest Fuel',
      category: 'fuel',
      coordinate: { latitude: 40.45, longitude: -121.95 },
      sourceType: 'mapbox_search',
      confidence: 'medium',
    },
    {
      id: 'on-approach-last-fuel',
      title: 'Last Fuel On Approach',
      category: 'fuel',
      coordinate: { latitude: 40.25, longitude: -121.5 },
      sourceType: 'mapbox_search',
      confidence: 'medium',
    },
    {
      id: 'after-entry-fuel',
      title: 'Fuel After Trail Entry',
      category: 'fuel',
      coordinate: { latitude: 40.52, longitude: -121.38 },
      sourceType: 'mapbox_search',
      confidence: 'high',
      beforeTrailEntry: false,
    },
  ],
  limit: 3,
});

assert.strictEqual(
  rankedFuel[0].id,
  'on-approach-last-fuel',
  'A station on the GPS-to-trailhead approach should outrank a straight-line-nearest station away from the approach path.',
);
assert.ok(
  rankedFuel.find((option) => option.id === 'chico-straight-line-nearest').warnings.some((warning) => /approach-route deviation/i.test(warning)),
  'Off-corridor options should be labeled with approach-route deviation warnings.',
);
assert.ok(
  rankedFuel.find((option) => option.id === 'after-entry-fuel').warnings.some((warning) => /after trail entry/i.test(warning)),
  'Candidates known to occur after trail entry should be disclosed and penalized.',
);
assert.ok(
  rankedFuel[0].remainingApproachMilesToTrailhead < rankedFuel.find((option) => option.id === 'chico-straight-line-nearest').remainingApproachMilesToTrailhead,
  'The preferred option should be the last practical stop before trail entry.',
);

const fallbackFuel = rankApproachResupplyOptions({
  category: 'fuel',
  origin: null,
  trailhead,
  approachRoute: [],
  candidates: [{
    id: 'trailhead-only-fuel',
    title: 'Trailhead Only Fuel',
    category: 'fuel',
    coordinate: { latitude: 40.48, longitude: -121.42 },
    sourceType: 'mapbox_search',
    confidence: 'medium',
  }],
});
assert.strictEqual(fallbackFuel[0].fallbackState, 'trailhead_only');
assert.ok(
  fallbackFuel[0].warnings.some((warning) => /GPS approach route is unavailable/i.test(warning)),
  'Trailhead fallback ranking should be explicit when GPS/approach geometry is missing.',
);

console.log('Trip Builder approach resupply corridor checks passed.');
