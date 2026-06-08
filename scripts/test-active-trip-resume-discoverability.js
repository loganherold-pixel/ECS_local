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
  buildActiveTripResumeCardModel,
} = require(path.join(root, 'lib', 'activeTripResumeCard.ts'));

function activeTripSnapshot(overrides = {}) {
  return {
    id: 'active-trip-1',
    status: 'active',
    sourceItineraryId: 'itinerary-1',
    route: {
      id: 'route-coldwater',
      name: 'FR 23N18 Coldwater',
      authorityLabel: 'Imported trail geometry',
      authorityStatus: 'imported_geometry',
      geometryStatus: 'trail_available',
    },
    vehicle: {
      id: 'rig-1',
      label: 'Overlander',
    },
    routeConfidence: {
      category: 'moderate',
      label: 'Moderate Confidence',
      score: 72,
    },
    freshness: {
      state: 'stale',
      label: 'Recovered local snapshot; live context unavailable until refreshed.',
      startedAt: '2026-06-08T12:00:00.000Z',
      updatedAt: '2026-06-08T13:15:00.000Z',
    },
    warnings: ['Weather unavailable'],
    ...overrides,
  };
}

function offlinePacket(overrides = {}) {
  return {
    id: 'packet-1',
    activeTripId: 'active-trip-1',
    localOnly: true,
    externalSharing: 'disabled',
    updatedAt: '2026-06-08T13:16:00.000Z',
    dataFreshness: {
      state: 'stale',
      label: 'Local-only packet recovered; stale until refreshed.',
    },
    ...overrides,
  };
}

const visibleModel = buildActiveTripResumeCardModel(activeTripSnapshot(), offlinePacket());
assert.strictEqual(visibleModel.visible, true);
assert.strictEqual(visibleModel.title, 'Active Trip in Progress');
assert.strictEqual(visibleModel.routeName, 'FR 23N18 Coldwater');
assert.strictEqual(visibleModel.vehicleLabel, 'Overlander');
assert.strictEqual(visibleModel.confidenceLabel, 'Moderate Confidence');
assert.strictEqual(visibleModel.confidenceScore, 72);
assert.strictEqual(visibleModel.routeAuthorityLabel, 'Imported trail geometry');
assert.strictEqual(visibleModel.routeAuthorityStatus, 'imported_geometry');
assert.strictEqual(visibleModel.resumeRoute, '/active-trip');
assert.strictEqual(visibleModel.packetRoute, '/offline-incident-packet');
assert.strictEqual(visibleModel.packetActionVisible, true);
assert.strictEqual(visibleModel.packetBadgeLabel, 'Local-only packet ready');
assert.ok(visibleModel.freshnessLabel.toLowerCase().includes('recovered'));
assert.ok(visibleModel.freshnessLabel.toLowerCase().includes('stale'));
assert.ok(!visibleModel.freshnessLabel.toLowerCase().includes('safe'));
assert.ok(!visibleModel.packetBadgeLabel.toLowerCase().includes('sent'));
assert.ok(!visibleModel.packetBadgeLabel.toLowerCase().includes('shared'));
assert.deepStrictEqual(visibleModel.warningLabels, ['Weather unavailable']);

const freshNoPacketModel = buildActiveTripResumeCardModel(
  activeTripSnapshot({
    freshness: {
      state: 'fresh',
      label: 'Active Trip snapshot current.',
      startedAt: '2026-06-08T12:00:00.000Z',
      updatedAt: '2026-06-08T12:05:00.000Z',
    },
  }),
  null,
);
assert.strictEqual(freshNoPacketModel.visible, true);
assert.strictEqual(freshNoPacketModel.packetActionVisible, false);
assert.strictEqual(freshNoPacketModel.packetBadgeLabel, null);
assert.strictEqual(freshNoPacketModel.packetRoute, null);
assert.strictEqual(freshNoPacketModel.freshnessLabel, 'Active Trip snapshot current.');

assert.strictEqual(buildActiveTripResumeCardModel(null, offlinePacket()).visible, false);
assert.strictEqual(buildActiveTripResumeCardModel(activeTripSnapshot({ status: 'stopped' }), offlinePacket()).visible, false);
assert.strictEqual(buildActiveTripResumeCardModel(activeTripSnapshot({ status: 'completed' }), offlinePacket()).visible, false);

const dashboardSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'dashboard.tsx'), 'utf8');
assert.ok(dashboardSource.includes('buildActiveTripResumeCardModel'), 'Dashboard should consume the resume-card model');
assert.ok(dashboardSource.includes('activeTripModeStore'), 'Dashboard should read active trip state');
assert.ok(dashboardSource.includes('offlineIncidentPacketStore'), 'Dashboard should read packet state');
assert.ok(dashboardSource.includes('activeTripModeStore.getRecovered()'), 'Dashboard should label recovered restart snapshots honestly');
assert.ok(dashboardSource.includes('dashboard-resume-active-trip-card'), 'Dashboard should expose a compact resume card test id');
assert.ok(dashboardSource.includes('dashboard-resume-active-trip-action'), 'Dashboard should expose the resume action test id');
assert.ok(dashboardSource.includes('dashboard-view-offline-packet-action'), 'Dashboard should expose packet action test id');
assert.ok(dashboardSource.includes("router.push('/active-trip')"), 'Resume action should route to active trip');
assert.ok(dashboardSource.includes("router.push('/offline-incident-packet')"), 'Packet action should route to offline incident packet');

const activeTripSource = fs.readFileSync(path.join(root, 'app', 'active-trip.tsx'), 'utf8');
assert.ok(activeTripSource.includes('activeTripModeStore.stop()'), 'Stop/end active trip should continue clearing active state');

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(
  packageJson.scripts['test:active-trip-resume-discoverability'],
  'node ./scripts/test-active-trip-resume-discoverability.js',
);

console.log('Active Trip resume discoverability tests passed');
