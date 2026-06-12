const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function loadTsModule(relativePath) {
  const filename = path.join(repoRoot, relativePath);
  const source = readSource(relativePath);
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(outputText, filename);
  return mod.exports;
}

const {
  normalizeConvoyCommandData,
} = loadTsModule('lib/navigation/convoyCommandData.ts');

const now = '2026-05-14T12:00:00.000Z';
const point = (value) => ({
  value,
  source: 'userManual',
  updatedAt: now,
  confidence: 'medium',
  reliability: 'medium',
});

const empty = normalizeConvoyCommandData();
assert.strictEqual(empty.dataState, 'setupNeeded');
assert.strictEqual(empty.usesLiveTracking, false);
assert.strictEqual(empty.recommendationLabel, 'SET CONVOY PLAN TO BEGIN');

const planned = normalizeConvoyCommandData({
  teamSnapshot: {
    activeTeam: { id: 'team-1', name: 'Mojave Line', ownerId: 'u-1' },
    updatedAt: now,
    members: [
      { id: 'm-1', teamId: 'team-1', userId: 'u-1', role: 'owner' },
      { id: 'm-2', teamId: 'team-1', userId: 'u-2', role: 'member' },
    ],
  },
  convoySnapshot: {
    teamMemberCount: point(2),
    convoySpacingMinutes: point(8),
    recommendedRegroupPoint: point('Ridge gate'),
  },
});
assert.strictEqual(planned.dataState, 'planned');
assert.strictEqual(planned.convoySize, 2);
assert.strictEqual(planned.recommendationLabel, 'CONVOY PLAN READY');
assert.strictEqual(planned.usesLiveTracking, false);

const checkIn = normalizeConvoyCommandData({
  convoySnapshot: {
    members: [
      {
        id: 'lead',
        callsign: 'Lead',
        role: 'lead',
        lastCheckInAt: point(now),
        movementStatus: point('moving'),
      },
      {
        id: 'sweep',
        callsign: 'Sweep',
        role: 'sweep',
        lastCheckInAt: point(now),
        movementStatus: point('delayed'),
      },
    ],
    lastCheckInAt: point(now),
    communicationsStatus: point('degraded'),
  },
});
assert.strictEqual(checkIn.dataState, 'checkIn');
assert.strictEqual(checkIn.mode, 'checkIn');
assert.strictEqual(checkIn.delayedCount, 1);
assert.strictEqual(checkIn.recommendationLabel, 'REGROUP / CHECK SWEEP');
assert.strictEqual(checkIn.usesLiveTracking, false);

const live = normalizeConvoyCommandData({
  liveSharingAvailable: true,
  convoySnapshot: {
    members: [
      {
        id: 'lead-live',
        callsign: 'Lead',
        role: 'lead',
        lastCheckInAt: point(now),
        movementStatus: point('moving'),
      },
      {
        id: 'sweep-live',
        callsign: 'Sweep',
        role: 'sweep',
        lastCheckInAt: point(now),
        movementStatus: point('moving'),
      },
    ],
    lastCheckInAt: point(now),
  },
});
assert.strictEqual(live.dataState, 'live');
assert.strictEqual(live.mode, 'live');
assert.strictEqual(live.usesLiveTracking, true);

const assistance = normalizeConvoyCommandData({
  convoySnapshot: {
    members: [
      {
        id: 'recovery',
        callsign: 'Recovery',
        role: 'support',
        needsAssistance: point(true),
      },
    ],
    assistanceNeededMemberLabels: point(['Recovery']),
  },
});
assert.strictEqual(assistance.emergencyCount, 1);
assert.strictEqual(assistance.recommendationLabel, 'MEMBER NEEDS ASSISTANCE');

const offline = normalizeConvoyCommandData({
  isOffline: true,
  convoySnapshot: {
    teamMemberCount: point(3),
    recommendedRegroupPoint: point('Trailhead'),
  },
});
assert.strictEqual(offline.dataState, 'offline');
assert.strictEqual(offline.usesLiveTracking, false);

const limitedConnectivity = normalizeConvoyCommandData({
  connectivityStatus: 'reconnecting',
  connectivityLevel: 'limited',
  teamSnapshot: {
    activeTeam: { id: 'team-limited', name: 'Limited Signal Team', ownerId: 'u-1' },
    updatedAt: now,
    members: [
      { id: 'lm-1', teamId: 'team-limited', userId: 'u-1', role: 'owner' },
      { id: 'lm-2', teamId: 'team-limited', userId: 'u-2', role: 'member' },
    ],
  },
});
assert.strictEqual(limitedConnectivity.dataState, 'partial');
assert.strictEqual(limitedConnectivity.isOffline, false);
assert.strictEqual(limitedConnectivity.usesLiveTracking, false);

const offlineConnectivity = normalizeConvoyCommandData({
  connectivityStatus: 'offline',
  teamSnapshot: {
    activeTeam: { id: 'team-offline', name: 'Offline Team', ownerId: 'u-1' },
    updatedAt: now,
    members: [
      { id: 'om-1', teamId: 'team-offline', userId: 'u-1', role: 'owner' },
      { id: 'om-2', teamId: 'team-offline', userId: 'u-2', role: 'member' },
    ],
  },
});
assert.strictEqual(offlineConnectivity.dataState, 'offline');
assert.strictEqual(offlineConnectivity.isOffline, true);

assert(
  !fs.existsSync(path.join(repoRoot, 'components/dashboard/commandCenter/ConvoyCommand.tsx')),
  'Dashboard Convoy Command component should be removed now that Convoy Command lives in Dispatch.',
);
assert(
  !fs.existsSync(path.join(repoRoot, 'components/dashboard/command-center/widgets/ConvoyCommandWidget.tsx')),
  'Dashboard Convoy Command widget should be removed from the command-center widget menu.',
);
assert(
  !fs.existsSync(path.join(repoRoot, 'components/rive/ECSConvoyCommandRive.tsx')),
  'Old dashboard Convoy Command Rive wrapper should be removed.',
);
assert(
  !fs.existsSync(path.join(repoRoot, 'assets/rive/ConvoyCommand.riv')),
  'Old dashboard Convoy Command Rive asset should be removed.',
);
assert(
  !fs.existsSync(path.join(repoRoot, 'components/rive/ECSConvoyCommandPanelRive.tsx')) &&
    !fs.existsSync(path.join(repoRoot, 'components/rive/ECSConvoyCommandPanelRive.native.tsx')) &&
    !fs.existsSync(path.join(repoRoot, 'assets/rive/ConvoyCommand_Panel.riv')) &&
    !fs.existsSync(path.join(repoRoot, 'public/rive/ConvoyCommand_Panel.riv')),
  'Old Dispatch Convoy Command Rive panel wrappers and assets should be removed after Mapbox replacement.',
);
assert(
  !fs.existsSync(path.join(repoRoot, 'docs/rive/convoy-command-rive-contract.md')),
  'Old dashboard Convoy Command Rive contract should be removed.',
);

const hookSource = readSource('components/dashboard/commandCenter/useConvoyCommandData.ts');
assert(hookSource.includes('routeStore.getActive()'), 'Convoy adapter hook should use the active route store');
assert(hookSource.includes('navigateRouteSessionStore'), 'Convoy adapter hook should use the Navigate route session store');
assert(hookSource.includes('connectivity.getDetailedState()'), 'Convoy adapter hook should use connectivity state');
assert(
  hookSource.includes('liveSharingAvailable: false'),
  'Convoy adapter hook must not label current team/check-in data as live sharing',
);

const convoyCommandDataSource = readSource('lib/navigation/convoyCommandData.ts');
assert(
  convoyCommandDataSource.includes('valueOf(member.lastKnownLocation)') &&
    convoyCommandDataSource.includes('coordinates:') &&
    convoyCommandDataSource.includes('lastPingAt: locationUpdatedAt'),
  'Convoy Command data should preserve assessment GPS coordinates for map fallback rendering.',
);

const dispatchPanelSource = readSource('components/dispatch/DispatchConvoyCommandPanel.tsx');
const dispatchCommandCenterSource = readSource('components/dispatch/DispatchCadCommandCenter.tsx');
const convoyCredentialsSource = readSource('app/convoy-command.tsx');
assert(
  !dispatchPanelSource.includes('ECSConvoyCommandPanelRive') &&
    !dispatchPanelSource.includes("from '../rive/ECSConvoyCommandPanelRive'") &&
    !dispatchPanelSource.includes(`${'testID={`${testID}-rive`'}`),
  'Dispatch Convoy Command should no longer render the Rive surface.',
);
assert(
  dispatchPanelSource.includes('ConvoyCommandMap') &&
    dispatchPanelSource.includes('useConvoyTrackingStore') &&
    dispatchPanelSource.includes('fallbackVehiclesFromCommandData') &&
    dispatchPanelSource.includes('localVehicleFromRouteSession') &&
    dispatchPanelSource.includes('routeCoordinates={routeCoordinates}') &&
    dispatchPanelSource.includes('showMapWhenEmpty') &&
    dispatchPanelSource.includes('Start live sharing') &&
    dispatchPanelSource.includes('Stop live sharing') &&
    dispatchPanelSource.includes('Live Sharing Active') &&
    dispatchPanelSource.includes('Open active GPS ping tactical map') &&
    dispatchPanelSource.includes('Tap for tactical map and active guidance route') &&
    dispatchPanelSource.includes('useEmergencyPulse') &&
    dispatchPanelSource.includes('Alert.alert') &&
    dispatchPanelSource.includes('Stop live sharing?'),
  'Dispatch Convoy Command should render the map/fallback surface and expose live sharing and active GPS ping controls.',
);
assert(
  dispatchPanelSource.includes('const refreshLiveSharingControls = useCallback') &&
    dispatchPanelSource.includes('sharingBusyRef.current = true') &&
    dispatchPanelSource.includes('sharingBusyRef.current = false') &&
    dispatchPanelSource.includes('disabled={sharingBusy}') &&
    dispatchPanelSource.includes('onPress={handleShareLiveLocationPress}') &&
    !dispatchPanelSource.includes('disabled={!canShareLiveLocation || sharingBusy}'),
  'Dispatch live sharing control should refresh convoy state on demand and must not get stuck disabled behind stale convoy context.',
);
assert(
  dispatchPanelSource.includes('DISPATCH CONVOY COMMAND') &&
    !dispatchPanelSource.includes('legendStatusPill'),
  'Dispatch Convoy Command should retain the convoy panel and remove the redundant internal status pill',
);
assert(
  dispatchPanelSource.includes('styles.commandSummary') &&
    dispatchPanelSource.includes('function LegendMetric') &&
    dispatchPanelSource.includes('function LegendFact') &&
    !dispatchPanelSource.includes('styles.riveLayer') &&
    !dispatchPanelSource.includes('styles.mapLegend'),
  'Dispatch Convoy Command should keep live map information in a compact summary instead of overlaying the map.',
);
assert(
  dispatchPanelSource.includes("presentation?: 'full' | 'feed'") &&
    dispatchPanelSource.includes("presentation = 'full'") &&
    dispatchPanelSource.includes('isFeedPresentation') &&
    dispatchPanelSource.includes('feedPanelStage') &&
    dispatchPanelSource.includes('flex: 1,\n    minHeight: 210') &&
    dispatchPanelSource.includes('legendMetricGridCompact') &&
    dispatchPanelSource.includes('legendMetricCompact') &&
    dispatchPanelSource.includes("label={summaryCompact ? 'Veh' : 'Vehicles'}") &&
    dispatchPanelSource.includes('!isFeedPresentation ?'),
  'Dispatch Convoy Command should support a feed-only presentation for the lower CAD feed surface.',
);
assert(
  dispatchCommandCenterSource.includes('DispatchConvoyTeamSetupCard') &&
    dispatchCommandCenterSource.includes('dispatch-convoy-team-setup-card') &&
    dispatchCommandCenterSource.includes('CONVOY SETUP / TEAM') &&
    dispatchCommandCenterSource.includes('End Convoy') &&
    dispatchCommandCenterSource.includes('Leave Convoy') &&
    dispatchCommandCenterSource.includes('handleConvoyLifecycleAction') &&
    dispatchCommandCenterSource.includes('convoyMembershipService.endConvoy') &&
    dispatchCommandCenterSource.includes('convoyMembershipService.leaveConvoy') &&
    dispatchCommandCenterSource.includes('renderLiveStrip(false)') &&
    dispatchCommandCenterSource.includes('styles.feedPanel') &&
    dispatchCommandCenterSource.includes('COMMAND SURFACE') &&
    !dispatchCommandCenterSource.includes('RIVE COMMAND SURFACE') &&
    dispatchCommandCenterSource.includes('emergencyPingButtonAccessibilityLabel') &&
    dispatchCommandCenterSource.includes('Cancel') &&
    dispatchCommandCenterSource.includes('Clear GPS') &&
    dispatchCommandCenterSource.includes('handleEmergencyPingButtonPress') &&
    dispatchCommandCenterSource.includes('accessibilityLabel="Create recovery report"') &&
    dispatchCommandCenterSource.includes('showEmergencyOverlay={false}') &&
    dispatchCommandCenterSource.includes('await loadConvoyLifecycleControl()') &&
    dispatchCommandCenterSource.includes('convoyLifecycleRevision={convoyLifecycleRevision}') &&
    dispatchCommandCenterSource.includes("presentation={isLandscapeDispatch ? 'map' : 'feed'}"),
  'Dispatch CAD screen should keep convoy/team setup, compact header actions, convoy lifecycle controls, SYNC DISPATCH reconciliation, and a larger middle Convoy Command surface.',
);
assert(
  dispatchCommandCenterSource.includes('const hasDispatchConvoyContext = Boolean(activeConvoyControl?.convoyId)') &&
    dispatchCommandCenterSource.includes('const dispatchTeamStatusLabel = hasDispatchConvoyContext') &&
    dispatchCommandCenterSource.includes('const dispatchTeamMemberCount = hasActiveTeam') &&
    dispatchCommandCenterSource.includes('activeConvoyName={activeConvoyControl?.convoyName ?? null}') &&
    dispatchCommandCenterSource.includes('activeConvoyMemberCount={activeConvoyControl?.memberUserIds.length ?? 0}') &&
    dispatchCommandCenterSource.includes("hasDispatchConvoyContext ? 'Active convoy roster' : teamStatusLabel") &&
    dispatchCommandCenterSource.includes("hasActiveConvoy ? activeConvoyName ?? 'Active convoy'") &&
    dispatchCommandCenterSource.includes("hasActiveConvoy ? 'Active convoy'"),
  'Dispatch top team card should use active Convoy context for copy so it does not show no-active-team while an active convoy is visible.',
);
assert(
  !dispatchCommandCenterSource.includes('<DispatchReadinessContextCard />') &&
    !dispatchCommandCenterSource.includes("import DispatchReadinessContextCard"),
  'Dispatch CAD screen should not render the Expedition Readiness Context card.',
);
assert(
  dispatchPanelSource.includes('No active convoy. Live convoy tracking is not being simulated.') &&
    dispatchPanelSource.includes('Live convoy location sharing is active.') &&
    dispatchPanelSource.includes('Tracking disabled. Active convoy roster is available.') &&
    dispatchPanelSource.includes('panelViewModel.isUsingLiveData && isSharingLiveLocation') &&
    dispatchPanelSource.includes('(!hasActiveConvoy ? sharingState?.lastStopReason : null)') &&
    !dispatchPanelSource.includes('Live convoy telemetry is active.'),
  'Dispatch Convoy Command should truthfully distinguish live sharing, tracking disabled, stale/all-non-live, and inactive convoy state',
);
assert(
  dispatchPanelSource.includes('formatConvoyDistanceMiles') &&
    dispatchPanelSource.includes('selectConvoyCommandPanelViewModel') &&
    dispatchPanelSource.includes('useConvoyCommandData') &&
    dispatchPanelSource.includes('buildActiveConvoyPanelViewModel') &&
    dispatchPanelSource.includes('activeConvoyRawMemberCount') &&
    dispatchPanelSource.includes('widestLiveVehicleGapMiles'),
  'Dispatch Convoy Command should use existing selectors while preferring active convoy roster and live tracking metrics',
);
assert(
  convoyCredentialsSource.includes('useFocusEffect') &&
    convoyCredentialsSource.includes('reconcileConvoyState') &&
    convoyCredentialsSource.includes('listMyActiveConvoys()') &&
    convoyCredentialsSource.includes('listConvoyRoster') &&
    convoyCredentialsSource.includes('rosterRefreshInFlightRef') &&
    convoyCredentialsSource.includes('setInterval') &&
    convoyCredentialsSource.includes('clearInterval'),
  'Convoy Command credentials screen should reconcile active convoy and roster state on focus and while mounted so it does not keep stale member rows after joins or leader end.',
);
assert(
  convoyCredentialsSource.includes('No active convoys yet.') &&
    convoyCredentialsSource.includes('Roster syncing') &&
    convoyCredentialsSource.includes('showing last known roster') &&
    convoyCredentialsSource.includes('setMembers([])') &&
    convoyCredentialsSource.includes('setInvites([])') &&
    convoyCredentialsSource.includes('setLocationSummaries([])'),
  'Convoy Command roster UI should clear ended/inactive backend state and label stale roster data when reconciliation is unavailable.',
);
assert(
  dispatchPanelSource.includes('onEmergencyPing') &&
    dispatchPanelSource.includes('onOpenEmergencyEvent') &&
    dispatchPanelSource.includes('It does not contact emergency services.'),
  'Dispatch Convoy Command should retain only the emergency coordinate ping/map action from CAD',
);
assert(
  !/mock|fake live/i.test(dispatchPanelSource),
  'Dispatch Convoy Command should avoid mock/fake live convoy claims',
);

const registrySource = readSource('components/dashboard/commandCenter/commandCenterRegistry.ts');
assert(
  !registrySource.includes('ConvoyCommandWidget') &&
    !registrySource.includes("id: 'convoyCommand'") &&
    !registrySource.includes("label: 'Convoy Command'"),
  'Dashboard command center registry should no longer expose Convoy Command as a widget category',
);

console.log('[convoy-command] normalization, Dispatch map/fallback, emergency ping, and dashboard removal checks passed');
