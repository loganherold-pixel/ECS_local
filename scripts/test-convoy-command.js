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

const source = fs.readFileSync(path.join(repoRoot, 'components/dashboard/commandCenter/ConvoyCommand.tsx'), 'utf8');
assert(source.includes('CommandCenterFrame'), 'Convoy Command should use CommandCenterFrame');
assert(source.includes('No continuous live tracking in this mode'), 'Convoy Command must label non-live modes honestly');
assert(source.includes('CHECK-IN'), 'Convoy Command should expose check-in status copy');
assert(source.includes('PLANNED'), 'Convoy Command should expose planned status copy');

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

const riveWidgetSource = fs.readFileSync(
  path.join(repoRoot, 'components/dashboard/command-center/widgets/ConvoyCommandWidget.tsx'),
  'utf8',
);
assert(riveWidgetSource.includes('ECSConvoyCommandRive'), 'Dashboard Convoy Command should render the Rive wrapper');
assert(
  !riveWidgetSource.includes('mode={mode}') &&
    !riveWidgetSource.includes('availableModes={availableModes}') &&
    !riveWidgetSource.includes('onModeChange={onModeChange}'),
  'Dashboard Convoy Command should rely on the dashboard three-dot selector instead of rendering an internal mode strip',
);
assert(
  riveWidgetSource.includes('showStateBadge={false}') &&
    riveWidgetSource.includes('bodyChrome={false}') &&
    !riveWidgetSource.includes('footer={footer}'),
  'Dashboard Convoy Command should let the Rive panel own status/footer containers instead of duplicating outer frame chrome',
);
assert(
  riveWidgetSource.includes('style={styles.riveLayer}') &&
    riveWidgetSource.includes('style={styles.overlay}') &&
    riveWidgetSource.includes("position: 'relative'") &&
    riveWidgetSource.includes("left: '74.08%'"),
  'Dashboard Convoy Command overlays should share the same locked surface as the Rive background and final alert container placement',
);
assert(
  riveWidgetSource.includes('selectConvoyCommandWidgetViewModel'),
  'Dashboard Convoy Command should use the truthful convoy view-model selector',
);
assert(
  riveWidgetSource.includes('No Active Convoy') === false,
  'Dashboard Convoy Command should use selector copy instead of hardcoding fake no-data state',
);
assert(
  !/mock|fixture/i.test(riveWidgetSource),
  'Dashboard Convoy Command widget must not wire mock or fixture convoy data',
);
assert(riveWidgetSource.includes('ConvoyRiveErrorBoundary'), 'Dashboard Convoy Command should isolate Rive render errors');
assert(riveWidgetSource.includes('reducedMotion={reducedMotion}'), 'Dashboard Convoy Command should pass reduced motion to Rive');
assert(riveWidgetSource.includes('ellipsizeMode="tail"'), 'Dashboard Convoy Command should protect long alert text');
assert(
  riveWidgetSource.includes("process.env.EXPO_PUBLIC_ECS_CONVOY_RIVE_QA === '1'"),
  'Dashboard Convoy Command visual-state QA controls must be gated behind an explicit dev flag',
);
assert(
  riveWidgetSource.includes('DEV VISUAL QA ONLY - no live convoy data.'),
  'Dashboard Convoy Command visual-state QA must visibly avoid claiming live convoy data',
);
assert(
  riveWidgetSource.includes('members: []'),
  'Dashboard Convoy Command visual-state QA must not create fake convoy members',
);
assert(
  riveWidgetSource.includes('DEV_VISUAL_STATES') &&
    riveWidgetSource.includes("'live'") &&
    riveWidgetSource.includes("'partial'") &&
    riveWidgetSource.includes("'estimated'") &&
    riveWidgetSource.includes("'alert'") &&
    riveWidgetSource.includes("'offline'"),
  'Dashboard Convoy Command should expose dev-only visual paths for all Rive states',
);

const riveWrapperSource = fs.readFileSync(
  path.join(repoRoot, 'components/rive/ECSConvoyCommandRive.tsx'),
  'utf8',
);
assert(riveWrapperSource.includes('try {'), 'Convoy Rive wrapper should guard the asset require path');
assert(riveWrapperSource.includes('ConvoyCommand.riv asset unavailable'), 'Convoy Rive wrapper should fall back when the asset is unavailable');
assert(riveWrapperSource.includes('reducedMotion !== true'), 'Convoy Rive wrapper should disable autoplay under reduced motion');
assert(riveWrapperSource.includes('warnMissingProperty'), 'Convoy Rive wrapper should warn but continue when Rive input names differ');

const registrySource = fs.readFileSync(
  path.join(repoRoot, 'components/dashboard/commandCenter/commandCenterRegistry.ts'),
  'utf8',
);
assert(
  registrySource.includes("../command-center/widgets/ConvoyCommandWidget") ||
    registrySource.includes("'../command-center/widgets/ConvoyCommandWidget'"),
  'Command center registry should point convoyCommand to the Rive-backed widget',
);

console.log('[convoy-command] normalization, non-live staging, Rive widget, and UI contract checks passed');
