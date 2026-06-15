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
  buildSuggestedEstablishedCampPins,
} = require(path.join(root, 'lib', 'tripBuilder', 'tripBuilderCampSuggestionPins.ts'));

const routePoints = [
  { latitude: 39, longitude: -120 },
  { latitude: 39.05, longitude: -119.95 },
  { latitude: 39.1, longitude: -119.9 },
  { latitude: 39.15, longitude: -119.85 },
  { latitude: 39.2, longitude: -119.8 },
];

const candidate = (id, index, overrides = {}) => ({
  id,
  name: `Established Campground ${index}`,
  lat: 39 + index * 0.03,
  lng: -120 + index * 0.03,
  source: 'mapbox_route_context_places',
  distanceFromRouteMeters: 400 + index * 50,
  distanceFromTrailheadMeters: 3000 + index * 1000,
  accessStatus: 'open',
  legalStatus: 'permit_required',
  score: 0.7 + index * 0.02,
  confidence: { value: 0.75 + index * 0.02, reasons: ['Provider campground search.'] },
  warnings: [],
  ...overrides,
});

const suggestions = buildSuggestedEstablishedCampPins({
  routePoints,
  candidates: [
    candidate('camp-1', 1),
    candidate('camp-2', 2),
    candidate('camp-3', 3),
    candidate('camp-4', 4),
    candidate('camp-5', 5),
    candidate('camp-6', 6),
    candidate('route-inferred', 2, { source: 'ecs_route_inferred', name: 'Inferred Route Clearing' }),
    candidate('too-far', 3, { source: 'established_campground', distanceFromRouteMeters: 30000 }),
  ],
});

assert.strictEqual(suggestions.length, 5, 'Camp picker should cap suggested established camps at five.');
assert(!suggestions.some((pin) => pin.id === 'route-inferred'), 'Route-inferred camps should not be presented as established suggestions.');
assert(!suggestions.some((pin) => pin.id === 'too-far'), 'Camps too far from the selected route should be suppressed.');
assert(
  suggestions.every((pin) => pin.referenceOnly === true),
  'Suggested established camp pins must remain reference-only and out of guidance sequencing.',
);
assert(
  suggestions.every((pin) => pin.subtitle.includes('Verify reservation, access, seasonal restrictions, and current conditions.')),
  'Suggested established camp copy must stay conservative.',
);
assert(
  suggestions.every((pin) => pin.routeProgressRatio >= 0 && pin.routeProgressRatio <= 1),
  'Suggested established camp pins should be projected between trail entry and trail end.',
);

console.log('Trip Builder camp suggestion pin tests passed.');
