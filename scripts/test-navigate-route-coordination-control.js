const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const resolverPath = path.join(root, 'lib', 'navigation', 'navigateRouteCoordination.ts');
const navigatePath = path.join(root, 'app', '(tabs)', 'navigate.tsx');

require.extensions['.ts'] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

assert(
  fs.existsSync(resolverPath),
  'Navigate Route Coordination should expose a focused presentation resolver.',
);

const {
  resolveNavigateRouteCoordinationControl,
} = require(resolverPath);

assert.strictEqual(
  typeof resolveNavigateRouteCoordinationControl,
  'function',
  'Navigate Route Coordination should export resolveNavigateRouteCoordinationControl.',
);

const validRoute = {
  routeId: 'route-solo-1',
  lifecycle: 'active',
  routePoints: [
    { lat: 39.1001, lng: -120.2001 },
    { lat: 39.2002, lng: -120.3002 },
  ],
};

function resolve(overrides = {}) {
  return resolveNavigateRouteCoordinationControl({
    missionCommandEnabled: true,
    hydrationStatus: 'ready',
    routeSession: validRoute,
    inFlight: false,
    hasActiveConvoy: false,
    ...overrides,
  });
}

const validSolo = resolve();
assert.strictEqual(
  validSolo.enabled,
  true,
  'A valid canonical route should enable Route Coordination without a convoy.',
);
assert.strictEqual(validSolo.disabledReason, null);
assert.match(
  validSolo.subtitle,
  /personal|mission command|coordinate/i,
  'The enabled control should explain the individual Mission Command action.',
);

const inactive = resolve({
  routeSession: {
    routeId: null,
    lifecycle: 'inactive',
    routePoints: [],
  },
});
assert.strictEqual(inactive.enabled, false);
assert.match(
  inactive.disabledReason,
  /stage|start|active route/i,
  'An inactive route should expose a visible recovery reason.',
);

const hydrating = resolve({ hydrationStatus: 'loading' });
assert.strictEqual(hydrating.enabled, false);
assert.match(
  hydrating.disabledReason,
  /loading|restor|hydrat/i,
  'Route-session hydration should be a finite disabled state with a reason.',
);

const sparseGeometry = resolve({
  routeSession: {
    routeId: 'route-sparse-1',
    lifecycle: 'preview',
    routePoints: [{ lat: 39.1001, lng: -120.2001 }],
  },
});
assert.strictEqual(sparseGeometry.enabled, false);
assert.match(
  sparseGeometry.disabledReason,
  /geometry|points|complete/i,
  'Sparse geometry should not be staged as a route-coordination command.',
);

const busy = resolve({ inFlight: true });
assert.strictEqual(busy.enabled, false);
assert.strictEqual(busy.busy, true);
assert.match(
  busy.disabledReason,
  /opening|progress|already/i,
  'An in-flight handoff should expose a terminally understandable busy reason.',
);

const navigateSource = fs.readFileSync(navigatePath, 'utf8');
assert.match(
  navigateSource,
  /navigateRouteCoordination/,
  'The mounted Navigate route should consume the focused Route Coordination resolver.',
);
assert(
  navigateSource.includes('useSyncExternalStore') &&
    navigateSource.includes('navigateRouteSessionStore.subscribe'),
  'The mounted control should react to the canonical Navigate route-session store.',
);

const cardStart = navigateSource.indexOf('title="ROUTE COORDINATION"');
assert(cardStart >= 0, 'The mounted Navigate Tools surface should render Route Coordination.');
const cardSource = navigateSource.slice(cardStart, cardStart + 1_200);
assert.match(
  cardSource,
  /subtitle=\{routeCoordinationControl\.subtitle\}/,
  'Route Coordination should display its current eligibility or recovery state.',
);
assert.match(
  cardSource,
  /disabled=\{!routeCoordinationControl\.enabled\}/,
  'Route Coordination should disable the mounted action when the resolver rejects it.',
);

const handlerStart = navigateSource.indexOf('const handleOpenRouteMissionCommand');
const handlerEnd = navigateSource.indexOf('const getActiveTrailPackSubmissionRoute', handlerStart);
assert(handlerStart >= 0 && handlerEnd > handlerStart, 'The mounted Route Coordination handler should exist.');
const handlerSource = navigateSource.slice(handlerStart, handlerEnd);

assert.match(
  navigateSource,
  /routeCoordinationInFlightRef\s*=\s*useRef\(false\)/,
  'Route Coordination should own a stable single-flight guard.',
);
assert.match(
  handlerSource,
  /routeCoordinationInFlightRef\.current\s*=\s*true/,
  'The mounted handler should acquire its single-flight guard before staging.',
);
assert.match(
  handlerSource,
  /finally\s*\{[\s\S]*routeCoordinationInFlightRef\.current\s*=\s*false/,
  'The mounted handler should always release its single-flight guard.',
);
assert.strictEqual(
  (handlerSource.match(/missionCommandProposalHandoffAdapter\.stage\(/g) ?? []).length,
  1,
  'One activation path should contain exactly one Mission Command handoff stage.',
);
assert.strictEqual(
  (handlerSource.match(/pushSingleFlight\('\/alert'/g) ?? []).length,
  1,
  'One activation path should use the canonical single-flight navigator exactly once for Dispatch.',
);
assert.strictEqual(
  (handlerSource.match(/router\.push\('\/alert'/g) ?? []).length,
  0,
  'Route Coordination should not bypass the canonical navigation dedupe coordinator.',
);

console.log('Navigate Route Coordination control checks passed.');
