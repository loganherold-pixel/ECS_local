const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '..');

function loadTsModule(relativePath) {
  const filename = path.join(repoRoot, relativePath);
  const source = fs.readFileSync(filename, 'utf8');
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
  !fs.existsSync(path.join(repoRoot, 'docs/rive/convoy-command-rive-contract.md')),
  'Old dashboard Convoy Command Rive contract should be removed.',
);

const hookSource = fs.readFileSync(
  path.join(repoRoot, 'components/dashboard/commandCenter/useConvoyCommandData.ts'),
  'utf8',
);
assert(hookSource.includes('routeStore.getActive()'), 'Convoy adapter hook should use the active route store');
assert(hookSource.includes('navigateRouteSessionStore'), 'Convoy adapter hook should use the Navigate route session store');
assert(hookSource.includes('connectivity.getDetailedState()'), 'Convoy adapter hook should use connectivity state');
assert(
  hookSource.includes('liveSharingAvailable: false'),
  'Convoy adapter hook must not label current team/check-in data as live sharing',
);

const dispatchPanelSource = fs.readFileSync(
  path.join(repoRoot, 'components/dispatch/DispatchConvoyCommandPanel.tsx'),
  'utf8',
);
const dispatchCommandCenterSource = fs.readFileSync(
  path.join(repoRoot, 'components/dispatch/DispatchCadCommandCenter.tsx'),
  'utf8',
);
assert(dispatchPanelSource.includes('ECSConvoyCommandPanelRive'), 'Dispatch Convoy Command should render the full-panel Rive wrapper');
assert(
  dispatchPanelSource.includes('DISPATCH CONVOY COMMAND') &&
    dispatchPanelSource.includes('EMERGENCY COORDINATE PING'),
  'Dispatch Convoy Command should retain the convoy panel and emergency ping action',
);
assert(
  dispatchPanelSource.includes("presentation?: 'full' | 'feed'") &&
    dispatchPanelSource.includes("presentation = 'full'") &&
    dispatchPanelSource.includes('isFeedPresentation') &&
    dispatchPanelSource.includes('feedPanelStage') &&
    dispatchPanelSource.includes('!isFeedPresentation ?'),
  'Dispatch Convoy Command should support a feed-only presentation for the lower CAD feed surface.',
);
assert(
  dispatchCommandCenterSource.includes('DispatchConvoyTeamSetupCard') &&
    dispatchCommandCenterSource.includes('dispatch-convoy-team-setup-card') &&
    dispatchCommandCenterSource.includes('CONVOY SETUP / TEAM') &&
    dispatchCommandCenterSource.includes('<DispatchReadinessContextCard />') &&
    dispatchCommandCenterSource.includes('<View style={styles.liveStrip}>') &&
    dispatchCommandCenterSource.includes('<View style={styles.feedPanel}>') &&
    dispatchCommandCenterSource.includes('presentation="feed"'),
  'Dispatch CAD screen should keep convoy/team setup and existing upper status sections while placing the Rive panel in the lower feed area.',
);
assert(
  dispatchPanelSource.includes('No active convoy. Live convoy tracking is not being simulated.') &&
    dispatchPanelSource.includes('Live convoy telemetry is active.'),
  'Dispatch Convoy Command should truthfully distinguish live telemetry from inactive convoy state',
);
assert(
  dispatchPanelSource.includes('formatConvoyDistanceMiles') &&
    dispatchPanelSource.includes('selectConvoyCommandPanelViewModel') &&
    dispatchPanelSource.includes('useConvoyCommandData'),
  'Dispatch Convoy Command should use the existing convoy command data selectors',
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

const riveWrapperSource = fs.readFileSync(
  path.join(repoRoot, 'components/rive/ECSConvoyCommandPanelRive.native.tsx'),
  'utf8',
);
assert(riveWrapperSource.includes('ConvoyCommand_Panel.riv'), 'Convoy panel Rive wrapper should bundle the panel asset');
assert(riveWrapperSource.includes('dashboard_no_exterior_border'), 'Convoy panel Rive wrapper should target the provided panel artboard');
assert(riveWrapperSource.includes('reducedMotion !== true'), 'Convoy panel Rive wrapper should disable autoplay under reduced motion');
assert(riveWrapperSource.includes("Constants.appOwnership === 'expo'"), 'Convoy panel Rive wrapper should fall back cleanly in Expo Go');

const registrySource = fs.readFileSync(
  path.join(repoRoot, 'components/dashboard/commandCenter/commandCenterRegistry.ts'),
  'utf8',
);
assert(
  !registrySource.includes('ConvoyCommandWidget') &&
    !registrySource.includes("id: 'convoyCommand'") &&
    !registrySource.includes("label: 'Convoy Command'"),
  'Dashboard command center registry should no longer expose Convoy Command as a widget category',
);

console.log('[convoy-command] normalization, Dispatch panel Rive, emergency ping, and dashboard removal checks passed');
