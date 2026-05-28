const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const adapterPath = path.join(root, 'lib', 'convoy', 'convoyAssessmentAdapter.ts');
const enginePath = path.join(root, 'lib', 'expedition', 'operationalAssessmentEngine.ts');
const fixturesPath = path.join(root, 'lib', 'expedition', 'operationalAssessmentFixtures.ts');
const expeditionStorePath = path.join(root, 'stores', 'expeditionAssessmentStore.ts');
const trackingStorePath = path.join(root, 'stores', 'convoyTrackingStore.ts');
const packagePath = path.join(root, 'package.json');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  if (request === '@supabase/supabase-js') {
    return {
      createClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              is: async () => ({ data: [], error: null }),
            }),
          }),
        }),
        channel: () => ({
          on() {
            return this;
          },
          subscribe() {},
        }),
        removeChannel: () => {},
      }),
    };
  }
  return originalLoad.apply(this, arguments);
};

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

function isoOffset(baseMs, offsetMs) {
  return new Date(baseMs + offsetMs).toISOString();
}

function members() {
  return [
    { id: 'lead-member', convoy_id: 'convoy-live', callsign: 'LEAD', role: 'lead', revoked_at: null },
    { id: 'v2-member', convoy_id: 'convoy-live', callsign: 'V2', role: 'member', revoked_at: null },
    { id: 'sweep-member', convoy_id: 'convoy-live', callsign: 'SWEEP', role: 'sweep', revoked_at: null },
  ];
}

function location(memberId, baseMs, overrides = {}) {
  return {
    id: `${memberId}-loc`,
    convoy_id: 'convoy-live',
    member_id: memberId,
    latitude: overrides.latitude ?? 38.78,
    longitude: overrides.longitude ?? -121.2,
    accuracy_meters: overrides.accuracy_meters ?? 8,
    heading_degrees: overrides.heading_degrees ?? 90,
    speed_mps: overrides.speed_mps ?? 6.7,
    battery_percent: overrides.battery_percent ?? 88,
    movement_status: overrides.movement_status ?? 'moving',
    captured_at: overrides.captured_at ?? isoOffset(baseMs, -60_000),
    updated_at: overrides.updated_at ?? isoOffset(baseMs, -60_000),
  };
}

function buildContext(snapshot, fixtures) {
  return {
    ...fixtures.allSystemsNormalFixture,
    capturedAt: '2026-05-21T12:00:00.000Z',
    convoy: snapshot,
  };
}

async function main() {
  const {
    buildConvoySnapshotFromTracking,
    applyLiveConvoyTrackingToAssessmentContext,
    haversineMiles,
  } = require(adapterPath);
  const { buildExpeditionOperationalAssessmentMap } = require(enginePath);
  const fixtures = require(fixturesPath);
  const {
    expeditionAssessmentStore,
    getExpeditionAssessmentStoreSnapshot,
  } = require(expeditionStorePath);
  const { setConvoyTrackingDataForTest, stopConvoyLocationSubscription } = require(trackingStorePath);

  const nowMs = Date.parse('2026-05-21T12:00:00.000Z');
  const freshLocations = [
    location('lead-member', nowMs, { latitude: 38.78, longitude: -121.2 }),
    location('v2-member', nowMs, { latitude: 38.779, longitude: -121.201 }),
    location('sweep-member', nowMs, { latitude: 38.778, longitude: -121.202 }),
  ];

  const normalSnapshot = buildConvoySnapshotFromTracking({
    convoyId: 'convoy-live',
    members: members(),
    locations: freshLocations,
    connectionStatus: 'connected',
    nowMs,
  });
  const normal = buildExpeditionOperationalAssessmentMap(buildContext(normalSnapshot, fixtures)).convoy;
  assert.strictEqual(normal.status, 'normal', 'fresh moving convoy should assess as normal.');
  assert.ok(
    normal.dataUsed.some((item) => item.id === 'live-location-member-count' && item.value === 3 && item.source === 'liveGps'),
    'live tracking should be visible as liveGps evidence.',
  );
  assert.ok(
    normal.dataUsed.some((item) => item.id === 'member-lead-member-live-location' && String(item.value).includes('38.78')),
    'member coordinates should be captured in dataUsed.',
  );

  const staleSnapshot = buildConvoySnapshotFromTracking({
    convoyId: 'convoy-live',
    members: members(),
    locations: [
      freshLocations[0],
      freshLocations[1],
      location('sweep-member', nowMs, {
        captured_at: isoOffset(nowMs, -16 * 60_000),
        updated_at: isoOffset(nowMs, -16 * 60_000),
      }),
    ],
    connectionStatus: 'connected',
    nowMs,
  });
  const stale = buildExpeditionOperationalAssessmentMap(buildContext(staleSnapshot, fixtures)).convoy;
  assert.ok(['watch', 'caution'].includes(stale.status), `one stale member should be watch/caution, got ${stale.status}.`);
  assert.ok(stale.why.join(' ').toLowerCase().includes('stale'), 'stale location should explain the status.');

  const degradedSnapshot = buildConvoySnapshotFromTracking({
    convoyId: 'convoy-live',
    members: members(),
    locations: [
      location('lead-member', nowMs, {
        captured_at: isoOffset(nowMs, -18 * 60_000),
        updated_at: isoOffset(nowMs, -18 * 60_000),
      }),
      location('v2-member', nowMs, {
        captured_at: isoOffset(nowMs, -18 * 60_000),
        updated_at: isoOffset(nowMs, -18 * 60_000),
      }),
      location('sweep-member', nowMs, {
        captured_at: isoOffset(nowMs, -18 * 60_000),
        updated_at: isoOffset(nowMs, -18 * 60_000),
      }),
    ],
    connectionStatus: 'disconnected',
    nowMs,
  });
  const degraded = buildExpeditionOperationalAssessmentMap(buildContext(degradedSnapshot, fixtures)).convoy;
  assert.strictEqual(degradedSnapshot.communicationsStatus.value, 'degraded');
  assert.strictEqual(degraded.status, 'caution', 'offline realtime plus stale locations should degrade to caution.');

  const assistanceSnapshot = buildConvoySnapshotFromTracking({
    convoyId: 'convoy-live',
    members: members(),
    locations: [
      freshLocations[0],
      location('v2-member', nowMs, { movement_status: 'needs_assistance' }),
      freshLocations[2],
    ],
    connectionStatus: 'connected',
    nowMs,
  });
  const assistance = buildExpeditionOperationalAssessmentMap(buildContext(assistanceSnapshot, fixtures)).convoy;
  assert.strictEqual(assistance.status, 'critical', 'needs_assistance should be critical.');
  assert.strictEqual(assistance.escalationRecommended, true);

  const separatedSnapshot = buildConvoySnapshotFromTracking({
    convoyId: 'convoy-live',
    members: members(),
    locations: [
      location('lead-member', nowMs, { latitude: 38.78, longitude: -121.2, speed_mps: 8 }),
      location('v2-member', nowMs, { latitude: 38.72, longitude: -121.32, speed_mps: 8 }),
      location('sweep-member', nowMs, { latitude: 38.6, longitude: -121.5, speed_mps: 8 }),
    ],
    connectionStatus: 'connected',
    nowMs,
  });
  const separated = buildExpeditionOperationalAssessmentMap(buildContext(separatedSnapshot, fixtures)).convoy;
  assert.ok(separatedSnapshot.leadSweepSeparationMiles.value > 10, 'test fixture should create a large separation.');
  assert.strictEqual(separated.status, 'caution', 'large lead/sweep separation should become caution.');

  const miles = haversineMiles({ latitude: 38.78, longitude: -121.2 }, { latitude: 38.79, longitude: -121.21 });
  assert.ok(miles > 0.5 && miles < 1, 'haversine helper should produce plausible local distance.');

  const enriched = applyLiveConvoyTrackingToAssessmentContext(fixtures.allSystemsNormalFixture, {
    convoyId: 'convoy-live',
    members: members(),
    locations: freshLocations,
    connectionStatus: 'connected',
    recommendedRegroupPoint: 'Wide turnout at mile 19',
    nowMs,
  });
  assert.strictEqual(enriched.convoy.teamId, 'convoy-live');
  assert.strictEqual(enriched.convoy.recommendedRegroupPoint.value, 'Wide turnout at mile 19');

  expeditionAssessmentStore.reset();
  setConvoyTrackingDataForTest({
    convoyId: 'convoy-live',
    members: members(),
    locations: freshLocations,
    connectionStatus: 'connected',
  });
  expeditionAssessmentStore.setContextProvider(() => fixtures.allSystemsNormalFixture);
  await expeditionAssessmentStore.refreshAssessments();
  assert.strictEqual(getExpeditionAssessmentStoreSnapshot().contextSnapshot.convoy.teamId, 'convoy-live');
  assert.strictEqual(getExpeditionAssessmentStoreSnapshot().assessments.convoy.status, 'normal');

  await expeditionAssessmentStore.updateManualConvoyCheckIn({
    overdueMemberLabels: ['V2'],
    communicationsStatus: 'degraded',
    lastCheckInAt: '2026-05-21T12:01:00.000Z',
  });
  const manualConvoy = getExpeditionAssessmentStoreSnapshot().assessments.convoy;
  assert.ok(['watch', 'caution'].includes(manualConvoy.status), 'manual convoy check-in should still recompute status.');
  assert.ok(
    manualConvoy.dataUsed.some((item) => item.id === 'overdue-members' && item.source === 'userManual'),
    'manual convoy evidence should still override/supplement live data.',
  );
  stopConvoyLocationSubscription();
  expeditionAssessmentStore.reset();

  const adapterSource = fs.readFileSync(adapterPath, 'utf8');
  assert.ok(adapterSource.includes('CONVOY_LOCATION_STALE_AFTER_MS'), 'adapter should align with tracking stale thresholds.');
  assert.ok(adapterSource.includes('haversineMiles'), 'adapter should use local distance math.');

  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  assert.ok(pkg.scripts['test:convoy-assessment-adapter'], 'package.json should expose convoy assessment adapter tests.');

  console.log('convoy assessment adapter tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
