const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const enginePath = path.join(root, 'lib', 'expedition', 'operationalAssessmentEngine.ts');
const fixturesPath = path.join(root, 'lib', 'expedition', 'operationalAssessmentFixtures.ts');
const storePath = path.join(root, 'stores', 'expeditionAssessmentStore.ts');
const detailViewPath = path.join(root, 'components', 'dashboard', 'ExpeditionAssessmentDetailView.tsx');
const dispatchConvoyCommandPath = path.join(root, 'components', 'dispatch', 'DispatchConvoyCommandPanel.tsx');
const convoyCommandDataPath = path.join(root, 'lib', 'navigation', 'convoyCommandData.ts');

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

const { buildExpeditionOperationalAssessmentMap } = require(enginePath);
const fixtures = require(fixturesPath);
const {
  expeditionAssessmentStore,
  getExpeditionAssessmentStoreSnapshot,
} = require(storePath);
const detailViewSource = fs.readFileSync(detailViewPath, 'utf8');
const dispatchConvoyCommandSource = fs.readFileSync(dispatchConvoyCommandPath, 'utf8');
const convoyCommandDataSource = fs.readFileSync(convoyCommandDataPath, 'utf8');

function dp(value, options = {}) {
  return {
    value,
    source: options.source || 'mock',
    updatedAt: options.updatedAt || fixtures.allSystemsNormalFixture.capturedAt,
    confidence: options.confidence || 'high',
    reliability: options.confidence || 'high',
    isStale: options.isStale,
    staleAfterMinutes: options.staleAfterMinutes,
  };
}

function convoyFor(context) {
  return buildExpeditionOperationalAssessmentMap(context).convoy;
}

function withConvoy(convoyPatch) {
  return {
    ...fixtures.allSystemsNormalFixture,
    convoy: {
      ...fixtures.allSystemsNormalFixture.convoy,
      ...convoyPatch,
    },
  };
}

async function main() {
  const normal = convoyFor(fixtures.allSystemsNormalFixture);
  assert.strictEqual(normal.status, 'normal', 'All members accounted should be normal.');
  assert.ok(normal.summary.toLowerCase().includes('stable'));
  assert.ok(normal.dataUsed.some((item) => item.id === 'member-list' && String(item.value).includes('Lead Tacoma')));
  assert.ok(normal.dataUsed.some((item) => item.id.endsWith('-movement-status') && item.value === 'moving'));
  assert.ok(
    normal.dataUsed.some((item) => item.id === 'live-location-member-count' && item.value === 3 && item.source === 'liveGps'),
    'Convoy assessment should capture live location member count when tracking is available.',
  );
  assert.ok(
    normal.dataUsed.some((item) => item.id === 'member-lead-live-location' && String(item.value).includes('38.10242')),
    'Convoy assessment should capture live member coordinates in dataUsed.',
  );

  const overdueOnly = convoyFor(withConvoy({
    overdueMemberLabels: dp(['Vehicle 3']),
    assistanceNeededMemberLabels: dp([]),
    communicationsStatus: dp('online'),
  }));
  assert.ok(
    ['watch', 'caution'].includes(overdueOnly.status),
    `One overdue member should be watch/caution, got ${overdueOnly.status}.`,
  );
  assert.notStrictEqual(overdueOnly.status, 'critical', 'Overdue-only state should not be critical without missing/assistance data.');
  assert.ok(overdueOnly.why.join(' ').toLowerCase().includes('overdue'));

  const offlineWithStaleLocation = convoyFor(withConvoy({
    members: [
      ...fixtures.allSystemsNormalFixture.convoy.members.slice(0, 2),
      {
        ...fixtures.allSystemsNormalFixture.convoy.members[2],
        movementStatus: dp('offline'),
        lastKnownLocationLabel: dp('Shelf road mile 12', { isStale: true }),
      },
    ],
    communicationsStatus: dp('degraded'),
  }));
  assert.strictEqual(offlineWithStaleLocation.status, 'caution');
  assert.ok(
    offlineWithStaleLocation.staleDataWarnings.some((item) => item.includes('last known location')),
    'Offline member with stale location should surface stale location data.',
  );

  const staleLiveLocation = convoyFor(withConvoy({
    members: fixtures.allSystemsNormalFixture.convoy.members.map((member) =>
      member.id === 'sweep'
        ? {
            ...member,
            lastKnownLocation: dp(
              { latitude: 38.084, longitude: -109.425, accuracyMeters: 40 },
              {
                source: 'liveGps',
                updatedAt: '2026-04-28T17:00:00.000Z',
                staleAfterMinutes: 20,
              },
            ),
            locationStale: dp(true, { source: 'liveGps' }),
          }
        : member,
    ),
    liveLocationMemberCount: dp(3, { source: 'liveGps' }),
    staleLocationMemberLabels: dp(['Sweep vehicle'], { source: 'liveGps' }),
  }));
  assert.ok(['watch', 'caution'].includes(staleLiveLocation.status));
  assert.notStrictEqual(staleLiveLocation.status, 'critical', 'Stale live location alone should not become critical.');
  assert.ok(
    staleLiveLocation.why.join(' ').toLowerCase().includes('stale'),
    'Stale live location should create a convoy warning reason.',
  );
  assert.ok(
    staleLiveLocation.staleDataWarnings.some((item) => item.includes('Sweep vehicle live location')),
    'Stale live coordinates should surface in stale data warnings.',
  );

  const missingLiveLocations = convoyFor(withConvoy({
    members: fixtures.allSystemsNormalFixture.convoy.members.map((member) => ({
      ...member,
      lastKnownLocation: undefined,
      locationStale: undefined,
    })),
    trackingEnabled: dp(true, { source: 'liveGps' }),
    liveLocationMemberCount: dp(0, { source: 'liveGps' }),
    staleLocationMemberLabels: dp([], { source: 'liveGps' }),
  }));
  assert.strictEqual(missingLiveLocations.status, 'caution', 'Missing live coordinates should contribute caution, not critical.');
  assert.ok(
    missingLiveLocations.why.join(' ').toLowerCase().includes('coordinates'),
    'Missing live coordinate state should be explained.',
  );

  const missedCheckpointNoLocationOffline = convoyFor(withConvoy({
    members: fixtures.allSystemsNormalFixture.convoy.members.map((member) =>
      member.id === 'sweep'
        ? {
            ...member,
            lastKnownLocation: undefined,
            missedCheckpoint: dp(true),
          }
        : member,
    ),
    missedCheckpointMemberLabels: dp(['Sweep vehicle']),
    trackingEnabled: dp(true, { source: 'liveGps' }),
    liveLocationMemberCount: dp(2, { source: 'liveGps' }),
    staleLocationMemberLabels: dp([]),
    communicationsStatus: dp('offline'),
  }));
  assert.strictEqual(
    missedCheckpointNoLocationOffline.status,
    'critical',
    'Missed checkpoint plus unavailable location and offline comms should escalate.',
  );

  const split = convoyFor(withConvoy({
    convoySpacingMinutes: dp(50),
    leadSweepSeparationMiles: dp(12),
    recommendedRegroupPoint: dp('Wide turnout at mile 19'),
  }));
  assert.strictEqual(split.status, 'caution', 'Convoy split beyond preferred range should be caution.');
  assert.ok(split.why.join(' ').toLowerCase().includes('spacing') || split.why.join(' ').toLowerCase().includes('separation'));

  expeditionAssessmentStore.reset();
  expeditionAssessmentStore.setContextProvider(() => fixtures.allSystemsNormalFixture);
  await expeditionAssessmentStore.refreshAssessments();
  assert.strictEqual(getExpeditionAssessmentStoreSnapshot().assessments.convoy.status, 'normal');
  await expeditionAssessmentStore.updateManualConvoyCheckIn({
    overdueMemberLabels: ['Vehicle 2'],
    communicationsStatus: 'degraded',
    lastCheckInAt: '2026-04-28T18:05:00.000Z',
  });
  const manualConvoy = getExpeditionAssessmentStoreSnapshot().assessments.convoy;
  assert.ok(['watch', 'caution'].includes(manualConvoy.status), 'Manual check-in should recompute convoy status.');
  assert.ok(
    manualConvoy.dataUsed.some((item) => item.id === 'overdue-members' && item.source === 'userManual'),
    'Manual convoy updates should be represented as userManual data.',
  );

  const assistance = convoyFor(withConvoy({
    members: [
      ...fixtures.allSystemsNormalFixture.convoy.members.slice(0, 2),
      {
        ...fixtures.allSystemsNormalFixture.convoy.members[2],
        movementStatus: dp('needs_assistance'),
        needsAssistance: dp(true),
      },
    ],
    assistanceNeededMemberLabels: dp(['Sweep vehicle']),
  }));
  assert.strictEqual(assistance.status, 'critical', 'Assistance request should be critical.');
  assert.strictEqual(assistance.escalationRecommended, true);
  assert.ok(assistance.recommendedAction.includes('Incident & Recovery'));

  for (const action of [
    'Send check-in request',
    'Mark member OK',
    'Mark member delayed',
    'Set regroup point',
    'Start assistance workflow',
    'Open Incident & Recovery',
    'Generate communication packet',
  ]) {
    assert.ok(normal.relatedActions.some((item) => item.label === action), `${action} related action should exist.`);
  }

  for (const text of [
    'Convoy Accountability',
    'Members accounted for',
    'Member/callsign list',
    'Last check-in',
    'Last known location',
    'Movement status',
    'Convoy spacing',
    'Lead/sweep separation',
    'Missed checkpoint or overdue member',
    'Communications status',
    'Recommended regroup or check-in action',
    'buildConvoySystemSummary',
    "category === 'convoy'",
  ]) {
    assert.ok(detailViewSource.includes(text), `Convoy detail view should include ${text}.`);
  }

  assert.ok(
    !dispatchConvoyCommandSource.includes('ECSConvoyCommandPanelRive') &&
      !dispatchConvoyCommandSource.includes('testID={`${testID}-rive`'),
    'Convoy Command should no longer render the Rive panel surface.',
  );
  assert.ok(
    dispatchConvoyCommandSource.includes('ConvoyCommandMap') &&
      dispatchConvoyCommandSource.includes('fallbackVehiclesFromCommandData') &&
      dispatchConvoyCommandSource.includes('Start live sharing') &&
      dispatchConvoyCommandSource.includes('Stop live sharing'),
    'Convoy Command map/fallback and explicit live sharing controls should be reachable.',
  );
  assert.ok(
    convoyCommandDataSource.includes('valueOf(member.lastKnownLocation)') &&
      convoyCommandDataSource.includes('lastPingAt: locationUpdatedAt'),
    'Convoy Command fallback should keep assessment/snapshot coordinates available for map rendering.',
  );

  console.log('Expedition convoy detail behavior checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
