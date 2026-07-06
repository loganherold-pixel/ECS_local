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

const screen = fs.readFileSync(path.join(root, 'app', 'explore-trip-builder.tsx'), 'utf8').replace(/\r\n/g, '\n');

const origin = { latitude: 39.0, longitude: -121.4 };
const trailhead = { latitude: 40.0, longitude: -121.4 };
const approachRoute = [
  origin,
  { latitude: 39.35, longitude: -121.4 },
  { latitude: 39.7, longitude: -121.4 },
  { latitude: 39.9, longitude: -121.4 },
  trailhead,
];

const remoteBoundaryAnchors = buildApproachResupplySearchAnchors({
  trailhead,
  approachRoute,
  remoteEntryProgressRatio: 0.88,
});
assert.ok(
  remoteBoundaryAnchors.some((anchor) => (
    anchor.basis === 'approach_corridor' &&
    anchor.progressRatio != null &&
    anchor.progressRatio >= 0.82 &&
    anchor.progressRatio <= 0.88
  )),
  'High-remoteness Smart Resupply search should sample the inferred remote-entry/civilization-exit approach segment.',
);
assert.strictEqual(
  remoteBoundaryAnchors[remoteBoundaryAnchors.length - 1].basis,
  'trailhead_fallback',
  'Remote-entry search anchors should still keep the trailhead as the final fallback.',
);

const ranked = rankApproachResupplyOptions({
  category: 'fuel',
  origin,
  trailhead,
  approachRoute,
  candidates: [
    {
      id: 'remote-trailhead-edge-fuel',
      title: 'Remote Edge Fuel',
      category: 'fuel',
      coordinate: { latitude: 39.996, longitude: -121.399 },
      sourceType: 'mapbox_search',
      confidence: 'high',
      score: 0.98,
    },
    {
      id: 'last-town-fuel-before-entry',
      title: 'Last Town Fuel Before Entry',
      category: 'fuel',
      coordinate: { latitude: 39.91, longitude: -121.397 },
      sourceType: 'mapbox_search',
      confidence: 'medium',
      score: 0.72,
    },
    {
      id: 'mid-corridor-fuel',
      title: 'Mid Corridor Fuel',
      category: 'fuel',
      coordinate: { latitude: 39.55, longitude: -121.4 },
      sourceType: 'mapbox_search',
      confidence: 'high',
      score: 0.95,
    },
  ],
  limit: 3,
});

assert.strictEqual(
  ranked[0].id,
  'last-town-fuel-before-entry',
  'Smart Resupply should prefer the last civilization-side stop before trail entry over a POI sitting at the remote trailhead edge.',
);
assert.ok(
  ranked.find((option) => option.id === 'remote-trailhead-edge-fuel')?.warnings.some((warning) => /trail-entry edge|civilization-side/i.test(warning)),
  'Fuel candidates at the trail-entry edge should remain visible only with explicit civilization-side verification copy.',
);
assert.ok(
  ranked.find((option) => option.id === 'mid-corridor-fuel')?.rank > ranked.find((option) => option.id === 'last-town-fuel-before-entry')?.rank,
  'Earlier civilization stops should not beat the last viable pre-entry stop when both are close to the approach route.',
);

const remoteBoundaryRanked = rankApproachResupplyOptions({
  category: 'fuel',
  origin,
  trailhead,
  approachRoute,
  remoteEntryProgressRatio: 0.88,
  candidates: [
    {
      id: 'beyond-remote-entry-fuel',
      title: 'Remote Entry Fuel',
      category: 'fuel',
      coordinate: { latitude: 39.94, longitude: -121.399 },
      sourceType: 'mapbox_search',
      confidence: 'high',
      score: 0.99,
    },
    {
      id: 'civilization-exit-fuel',
      title: 'Civilization Exit Fuel',
      category: 'fuel',
      coordinate: { latitude: 39.84, longitude: -121.397 },
      sourceType: 'mapbox_search',
      confidence: 'medium',
      score: 0.72,
    },
    {
      id: 'early-city-fuel',
      title: 'Early City Fuel',
      category: 'fuel',
      coordinate: { latitude: 39.52, longitude: -121.4 },
      sourceType: 'mapbox_search',
      confidence: 'high',
      score: 0.96,
    },
  ],
  limit: 3,
});

assert.strictEqual(
  remoteBoundaryRanked[0].id,
  'civilization-exit-fuel',
  'High-remoteness Smart Resupply should prefer the last civilization-side stop before the inferred remote-entry boundary.',
);
assert.ok(
  remoteBoundaryRanked.find((option) => option.id === 'beyond-remote-entry-fuel')?.warnings.some((warning) => /remote-entry edge|civilization-side/i.test(warning)),
  'Fuel candidates beyond the inferred remote-entry boundary should remain visible only with explicit civilization-side verification copy.',
);
assert.ok(
  remoteBoundaryRanked.find((option) => option.id === 'early-city-fuel')?.rank > remoteBoundaryRanked.find((option) => option.id === 'civilization-exit-fuel')?.rank,
  'Early city stops should not beat the last viable pre-remote-entry stop when both are close to the approach route.',
);

assert.ok(
  screen.includes('SMART_RESUPPLY_APPROACH_SIGNATURE_MAX_POINTS'),
  'Smart Resupply refresh signatures should cap sampled approach-route points.',
);
assert.ok(
  screen.includes('SMART_RESUPPLY_APPROACH_SIGNATURE_DECIMALS'),
  'Smart Resupply refresh signatures should coarsen live-route coordinate precision to avoid jitter refreshes.',
);
assert.ok(
  screen.includes('function smartResupplyApproachSignature(approachRoute: TripMapCoordinate[] = []): string'),
  'Smart Resupply should centralize approach-route refresh signature building.',
);
assert.ok(
  screen.includes('smartResupplyApproachSignature(approachRoute)'),
  'Smart Resupply search signatures should use the stable approach-route signature helper.',
);
assert.ok(
  screen.includes('function remoteEntryProgressRatioForResupply(route: TripBuilderRouteInput | null): number | null'),
  'Trip Builder should derive Smart Resupply remote-entry ranking boundaries from the selected route remoteness score.',
);
assert.ok(
  screen.includes('selectedRouteRemoteEntryProgressRatio'),
  'Trip Builder should carry the selected route remote-entry boundary through Smart Resupply ranking.',
);
assert.ok(
  screen.includes('remoteEntryProgressRatio: params.remoteEntryProgressRatio'),
  'Smart Resupply should pass remote-entry boundaries into the approach ranking funnel.',
);

console.log('Trip Builder resupply civilization refresh checks passed.');
