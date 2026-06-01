const assert = require('assert');
const path = require('path');
const fs = require('fs');
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
  createNoopCampCandidateProviderAdapter,
  createRouteContextProviderRegistry,
  findCampCandidates,
  generateRouteContext,
} = require(path.join(root, 'lib', 'routeContext', 'index.ts'));

const routeGeometry = {
  origin: { lat: 38, lng: -110.1 },
  destination: { lat: 38.2, lng: -109.8 },
  waypoints: [],
  coordinates: [
    { lat: 38, lng: -110.1 },
    { lat: 38.1, lng: -109.95 },
    { lat: 38.2, lng: -109.8 },
  ],
  distanceMeters: 28000,
  durationSeconds: 3600,
  bbox: { west: -110.1, south: 38, east: -109.8, north: 38.2 },
  corridor: { widthMeters: 8000, bbox: { west: -110.2, south: 37.9, east: -109.7, north: 38.3 } },
  segments: [],
};

const trailheadAnchor = {
  lat: 38,
  lng: -110.1,
  source: 'explicit_trailhead',
  confidence: { value: 0.96, reasons: ['Known trailhead.'] },
  warnings: [],
};

async function main() {
  let disabledCampCalled = false;
  const disabled = await generateRouteContext({
    trail: {
      id: 'camp-disabled',
      explicitTrailhead: trailheadAnchor,
      routeGeometry: {
        type: 'LineString',
        coordinates: [[-110.1, 38], [-109.8, 38.2]],
      },
    },
    providers: {
      campProvider: {
        id: 'disabled-camp-provider',
        async findCampCandidates() {
          disabledCampCalled = true;
          return [{ id: 'camp-disabled-1', lat: 38.1, lng: -109.95, source: 'fixture', confidence: { value: 0.7, reasons: [] }, warnings: [] }];
        },
      },
    },
    featureFlags: { 'ecs.routeContextEngine.enabled': true },
  });
  assert.strictEqual(disabled.campCandidates.length, 0);
  assert.strictEqual(disabledCampCalled, false, 'camp provider must not be called when camp flag is disabled');

  const missingGeometry = await findCampCandidates({
    routeGeometry: null,
    trailheadAnchor,
    candidates: [{ id: 'camp-missing-geometry', lat: 38.1, lng: -109.95, source: 'fixture' }],
  });
  assert.strictEqual(missingGeometry.candidates.length, 0);
  assert.ok(missingGeometry.warnings.some((item) => item.code === 'missing_route_geometry'));

  const unavailable = await findCampCandidates({
    routeGeometry,
    trailheadAnchor,
    provider: createNoopCampCandidateProviderAdapter(),
  });
  assert.strictEqual(unavailable.candidates.length, 0);
  assert.ok(unavailable.warnings.some((item) => item.code === 'provider_unavailable'));

  const normalized = await findCampCandidates({
    routeGeometry,
    trailheadAnchor,
    candidates: [
      {
        id: 'open-known-camp',
        name: 'Known Camp',
        lat: 38.1,
        lng: -109.95,
        source: 'fixture-established-camp',
        accessStatus: 'open',
        legalStatus: 'explicitly_allowed',
        restrictionStatus: 'season checked',
        confidence: 0.88,
        score: 0.9,
        providerMetadata: { attribution: 'fixture' },
      },
      {
        id: 'unknown-camp',
        name: 'Unknown Camp',
        lat: 38.12,
        lng: -109.96,
        source: 'fixture-poi',
        confidence: 0.58,
      },
      {
        id: 'closed-camp',
        name: 'Closed Camp',
        lat: 38.09,
        lng: -109.96,
        source: 'fixture-poi',
        accessStatus: 'closed',
        legalStatus: 'not_allowed',
        restrictionStatus: 'closed',
        confidence: 0.9,
      },
    ],
  });
  assert.strictEqual(normalized.candidates.length, 3);
  assert.strictEqual(normalized.candidates[0].id, 'open-known-camp');
  assert.ok(normalized.candidates[0].score > normalized.candidates[1].score);
  assert.ok(normalized.candidates[1].warnings.some((item) => item.code === 'unknown_camp_access'));
  assert.ok(normalized.candidates[1].warnings.some((item) => item.code === 'unknown_camp_legal_status'));
  assert.ok(normalized.candidates[1].warnings.some((item) => item.code === 'unknown_camp_restrictions'));
  assert.ok(normalized.candidates[2].score < normalized.candidates[0].score, 'closed/not-allowed candidates should be penalized');

  const registry = createRouteContextProviderRegistry({
    camp: {
      id: 'mock-camp-adapter',
      isAvailable: () => true,
      async searchCampCandidates(input) {
        assert.strictEqual(input.trailheadAnchor.lat, 38);
        assert.ok(input.routeGeometry.coordinates.length >= 2);
        return [{
          id: 'adapter-camp',
          name: 'Adapter Camp',
          coordinate: { lat: 38.1, lng: -109.95 },
          source: 'mock-camp-adapter',
          accessStatus: 'open',
          legalStatus: 'permit_required',
          restrictionStatus: 'permit required',
          confidence: 0.78,
        }];
      },
    },
  });
  assert.strictEqual(registry.canSearchCampCandidates(), true);
  assert.ok(registry.getCapabilities().includes('camp_candidates'));

  const context = await generateRouteContext({
    trail: {
      id: 'camp-enabled',
      explicitTrailhead: trailheadAnchor,
      routeGeometry: {
        type: 'LineString',
        coordinates: [[-110.1, 38], [-109.95, 38.1], [-109.8, 38.2]],
      },
    },
    providerRegistry: registry,
    featureFlags: {
      ecs: {
        routeContextEngine: {
          enabled: true,
          enableCampCandidates: true,
        },
      },
    },
  });
  assert.strictEqual(context.campCandidates.length, 1);
  assert.strictEqual(context.campCandidates[0].id, 'adapter-camp');
  assert.strictEqual(context.campCandidates[0].legalStatus, 'permit_required');
  assert.ok(context.campCandidates[0].distanceFromRouteMeters >= 0);
  assert.ok(context.campCandidates[0].distanceFromTrailheadMeters > 0);

  const noProviderContext = await generateRouteContext({
    trail: {
      id: 'camp-no-provider',
      explicitTrailhead: trailheadAnchor,
      routeGeometry: {
        type: 'LineString',
        coordinates: [[-110.1, 38], [-109.95, 38.1]],
      },
    },
    featureFlags: {
      ecs: {
        routeContextEngine: {
          enabled: true,
          enableCampCandidates: true,
        },
      },
    },
  });
  assert.strictEqual(noProviderContext.campCandidates.length, 0);
  assert.ok(noProviderContext.warnings.some((item) => item.code === 'provider_unavailable'));
}

main()
  .then(() => {
    console.log('Route Context camp candidate foundation tests passed.');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
