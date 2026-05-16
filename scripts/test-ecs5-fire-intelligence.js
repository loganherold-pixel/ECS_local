const assert = require('assert');
const Module = require('module');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function compileTypeScriptModule(mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  mod._compile(output.outputText, filename);
}

function loadTypeScriptModule(relPath) {
  const fullPath = path.join(process.cwd(), relPath);
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  compileTypeScriptModule(mod, fullPath);
  return mod.exports;
}

require.extensions['.ts'] = compileTypeScriptModule;

const {
  createECS5ProviderRegistry,
  getProviderConfig,
  getProviderHealth,
} = loadTypeScriptModule('lib/ecs5ProviderRegistry.ts');
const {
  NASA_FIRMS_KNOWN_LIMITATIONS,
  WFIGS_KNOWN_LIMITATIONS,
  INCIWEB_KNOWN_LIMITATIONS,
  buildNasaFirmsAreaUrl,
  evaluateRouteFireIntelligence,
  normalizeInciWebPayload,
  normalizeNasaFirmsPayload,
  normalizeWfigsPayload,
} = loadTypeScriptModule('lib/ecs5FireIntelligence.ts');
const {
  normalizeNwsWeatherPayload,
} = loadTypeScriptModule('lib/nwsWeatherAdapter.ts');

const now = new Date('2026-04-29T22:00:00.000Z');
const registry = createECS5ProviderRegistry({
  ENABLE_NASA_FIRMS: 'true',
  NASA_FIRMS_MAP_KEY: 'server-only-firms-key',
  ENABLE_NIFC_WFIGS: 'true',
  ENABLE_INCIWEB: 'true',
  ENABLE_NWS: 'true',
  NWS_USER_AGENT: 'ecs-tests@example.com',
}, [], now);
const firmsProvider = getProviderConfig('nasa_firms', registry);
const wfigsProvider = getProviderConfig('nifc_wfigs', registry);
const inciWebProvider = getProviderConfig('inciweb', registry);
const nwsProvider = getProviderConfig('nws', registry);

assert.strictEqual(getProviderHealth('nasa_firms', registry).status, 'configured');
assert.strictEqual(getProviderHealth('nasa_firms', createECS5ProviderRegistry({ ENABLE_NASA_FIRMS: 'true' }, [], now)).status, 'missing_config');
assert.strictEqual(getProviderHealth('openweather_fire_index', registry).status, 'intentionally_disabled');
assert.deepStrictEqual([...NASA_FIRMS_KNOWN_LIMITATIONS], [
  'satellite_detection_not_ground_confirmation',
  'not_legal_closure_order',
  'false_positives_possible',
  'detection_time_depends_on_satellite_pass',
]);
assert.deepStrictEqual([...WFIGS_KNOWN_LIMITATIONS], [
  'perimeter_not_legal_closure_by_itself',
  'update_frequency_varies',
  'use_active_current_layers_for_current_route_decisions',
]);
assert.deepStrictEqual([...INCIWEB_KNOWN_LIMITATIONS], [
  'webpage_or_feed_structure_may_change',
  'incident_context_not_always_geometry',
  'closure_language_requires_careful_parsing',
]);
assert.ok(buildNasaFirmsAreaUrl({
  bbox: [-121.6, 38.7, -121.1, 39.1],
  dataset: 'VIIRS_SNPP_NRT',
  days: 2,
}).includes('{{NASA_FIRMS_MAP_KEY}}'));

const firmsCsv = [
  'latitude,longitude,brightness,acq_date,acq_time,satellite,instrument,confidence,frp,source_dataset',
  '38.801,-121.221,335.2,2026-04-29,2140,N,VIIRS,h,45.7,VIIRS_SNPP_NRT',
].join('\n');
const firmsObservations = normalizeNasaFirmsPayload(firmsCsv, firmsProvider, { now });
assert.strictEqual(firmsObservations.length, 1);
assert.strictEqual(firmsObservations[0].sourceType, 'satellite');
assert.strictEqual(firmsObservations[0].subjectType, 'active_fire');
assert.strictEqual(firmsObservations[0].normalizedPayload.latitude, 38.801);
assert.strictEqual(firmsObservations[0].normalizedPayload.longitude, -121.221);
assert.strictEqual(firmsObservations[0].normalizedPayload.brightness, 335.2);
assert.strictEqual(firmsObservations[0].normalizedPayload.confidence, 'h');
assert.strictEqual(firmsObservations[0].normalizedPayload.frp, 45.7);
assert.strictEqual(firmsObservations[0].normalizedPayload.sourceDataset, 'VIIRS_SNPP_NRT');
assert.strictEqual(firmsObservations[0].normalizedPayload.legalClosureSignal, false);
assert.ok(firmsObservations[0].knownLimitations.includes('satellite_detection_not_ground_confirmation'));

const wfigsFixture = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    bbox: [-121.36, 38.72, -121.18, 38.92],
    geometry: {
      type: 'Polygon',
      coordinates: [[[-121.36, 38.72], [-121.18, 38.72], [-121.18, 38.92], [-121.36, 38.92], [-121.36, 38.72]]],
    },
    properties: {
      OBJECTID: 42,
      IrwinID: 'irwin-alpha',
      IncidentName: 'Granite Fire',
      GISAcres: 1200,
      PercentContained: 10,
      FireDiscoveryDateTime: '2026-04-29T18:00:00Z',
      ModifiedOnDateTime: '2026-04-29T21:30:00Z',
      IncidentTypeCategory: 'WF',
    },
  }],
};
const wfigsObservations = normalizeWfigsPayload(wfigsFixture, wfigsProvider, { now });
assert.strictEqual(wfigsObservations.length, 1);
assert.strictEqual(wfigsObservations[0].sourceType, 'official_gis');
assert.strictEqual(wfigsObservations[0].subjectType, 'fire_perimeter');
assert.strictEqual(wfigsObservations[0].normalizedPayload.incidentName, 'Granite Fire');
assert.strictEqual(wfigsObservations[0].normalizedPayload.legalClosureSignal, false);
assert.ok(wfigsObservations[0].knownLimitations.includes('perimeter_not_legal_closure_by_itself'));

const inciWebFixture = {
  items: [{
    id: 'inciweb-granite',
    incidentName: 'Granite Fire',
    status: 'Active',
    summary: 'Fire activity reported near Granite Creek. A road closure notice is linked separately by the forest.',
    url: 'https://inciweb.wildfire.gov/incident/granite-fire',
    updatedAt: '2026-04-29T20:00:00Z',
    latitude: 38.84,
    longitude: -121.28,
  }],
};
const inciWebObservations = normalizeInciWebPayload(inciWebFixture, inciWebProvider, { now });
assert.strictEqual(inciWebObservations.length, 1);
assert.strictEqual(inciWebObservations[0].sourceType, 'official_webpage');
assert.strictEqual(inciWebObservations[0].subjectType, 'fire_incident');
assert.strictEqual(inciWebObservations[0].normalizedPayload.incidentName, 'Granite Fire');
assert.strictEqual(inciWebObservations[0].normalizedPayload.closureLanguagePresent, true);
assert.strictEqual(inciWebObservations[0].normalizedPayload.legalClosureSignal, false);

const redFlagObservations = normalizeNwsWeatherPayload({
  alerts: {
    type: 'FeatureCollection',
    features: [{
      geometry: {
        type: 'Polygon',
        coordinates: [[[-121.6, 38.6], [-121.1, 38.6], [-121.1, 39.1], [-121.6, 39.1], [-121.6, 38.6]]],
      },
      properties: {
        id: 'red-flag-alpha',
        event: 'Red Flag Warning',
        headline: 'Red Flag Warning issued by NWS Sacramento',
        severity: 'Severe',
        urgency: 'Expected',
        certainty: 'Likely',
        onset: '2026-04-29T22:00:00Z',
        expires: '2026-04-30T04:00:00Z',
        description: 'Critical fire weather conditions expected.',
      },
    }],
  },
}, nwsProvider, { now });

const route = [
  { lat: 38.7, lon: -121.4 },
  { lat: 39.0, lon: -121.15 },
];
let fireResult = evaluateRouteFireIntelligence({
  routeId: 'route-fire',
  routeGeometry: route,
  observations: [
    ...firmsObservations,
    ...wfigsObservations,
    ...inciWebObservations,
    ...redFlagObservations,
  ],
  bailoutSegments: [{
    id: 'bailout-1',
    label: 'North Fork Bailout',
    geometry: [
      { lat: 38.76, lon: -121.35 },
      { lat: 38.86, lon: -121.22 },
    ],
  }],
  now,
});

assert.strictEqual(fireResult.fireRiskLevel, 'critical');
assert.strictEqual(fireResult.blockingSafetyIssue, true);
assert.strictEqual(fireResult.bailoutReevaluationRecommended, true);
assert.strictEqual(fireResult.legalClosureImplied, false);
assert.ok(fireResult.perimeterIntersections.includes('Granite Fire'));
assert.ok(fireResult.bailoutImpacts.includes('North Fork Bailout'));
assert.ok(fireResult.concerns.some((concern) => concern.includes('critical/blocking safety issue')));
assert.ok(fireResult.concerns.some((concern) => concern.includes('not a legal closure order')));
assert.ok(fireResult.evidenceObservationIds.includes(firmsObservations[0].id));
assert.ok(fireResult.nearestActiveFireMiles < 10);

fireResult = evaluateRouteFireIntelligence({
  routeId: 'route-red-flag',
  routeGeometry: route,
  observations: redFlagObservations,
  now,
});
assert.strictEqual(fireResult.fireWeatherContext, 'critical');
assert.strictEqual(fireResult.fireRiskLevel, 'high');
assert.strictEqual(fireResult.blockingSafetyIssue, false);
assert.strictEqual(fireResult.legalClosureImplied, false);
assert.ok(fireResult.concerns.some((concern) => concern.includes('not an active fire detection')));

const source = fs.readFileSync(path.join(process.cwd(), 'lib/ecs5FireIntelligence.ts'), 'utf8');
assert.ok(!source.includes('OPENWEATHER_FIRE_INDEX'));
assert.ok(!source.includes('NASA_FIRMS_MAP_KEY='));

console.log('ECS 5.0 fire intelligence tests passed.');
