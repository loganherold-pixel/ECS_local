const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const root = process.cwd();

function read(...segments) {
  return fs.readFileSync(path.join(root, ...segments), 'utf8').replace(/\r\n/g, '\n');
}

function loadTsModule(...segments) {
  const filename = path.join(root, ...segments);
  const source = read(...segments);
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

const dispatchTabSource = read('app', '(tabs)', 'alert.tsx');
const commandCenterSource = read('components', 'dispatch', 'DispatchCadCommandCenter.tsx');
const panelSource = read('components', 'dispatch', 'DispatchConvoyCommandPanel.tsx');
const navigateSource = read('app', '(tabs)', 'navigate.tsx');
const mapRendererSource = read('components', 'navigate', 'MapRenderer.tsx');
const mapFallbackSource = read('components', 'navigate', 'MapFallbackSurface.tsx');
const userIdentitySource = read('lib', 'navigation', 'navigateUserIdentityCallout.ts');
const navigateSurfaceSource = read('components', 'dashboard', 'NavigateSurfaceWidget.tsx');
const widgetRenderersSource = read('components', 'dashboard', 'WidgetRenderers.tsx');
const dockSource = read('components', 'CommandDock.tsx');
const { buildNavigateUserIdentityCallout } = loadTsModule(
  'lib',
  'navigation',
  'navigateUserIdentityCallout.ts',
);

const landscapeTopRowStyle = commandCenterSource.slice(
  commandCenterSource.indexOf('landscapeTopRow:'),
  commandCenterSource.indexOf('landscapeSummaryDock:'),
);
const landscapeSummaryDockStyle = commandCenterSource.slice(
  commandCenterSource.indexOf('landscapeSummaryDock:'),
  commandCenterSource.indexOf('landscapeDockRevealButton:'),
);
const panelStageStyle = panelSource.slice(
  panelSource.indexOf('panelStage:'),
  panelSource.indexOf('feedPanelStage:'),
);

assert.ok(
  dispatchTabSource.includes('const isLandscape = width > height') &&
    dispatchTabSource.includes('!isLandscape ? <Header title="Dispatch" /> : null') &&
    dispatchTabSource.includes('const containerBottomPadding = isLandscape || useScrollableDispatch ? 0 : dockClearance') &&
    dispatchTabSource.includes('{ paddingBottom: containerBottomPadding }'),
  'Dispatch tab should keep a fixed, header-free body in landscape without reserving hidden dock clearance.',
);

assert.ok(
  commandCenterSource.includes('const isLandscapeDispatch = windowWidth > windowHeight') &&
    commandCenterSource.includes('styles.landscapeTopRow') &&
    commandCenterSource.includes('styles.feedPanelLandscapeSignal') &&
    commandCenterSource.includes('rootLandscape:') &&
    commandCenterSource.includes('paddingBottom: 0') &&
    landscapeTopRowStyle.includes('minHeight: 0') &&
    landscapeTopRowStyle.includes('marginHorizontal: -8') &&
    landscapeSummaryDockStyle.includes("alignSelf: 'stretch'") &&
    landscapeSummaryDockStyle.includes("width: '100%'"),
  'Dispatch landscape should keep the compact full-width command shell and lower signal panel area.',
);

assert.ok(
  commandCenterSource.includes('const showLandscapeConvoySummary = Boolean(') &&
    commandCenterSource.includes("missionCommandView !== 'team'") &&
    commandCenterSource.includes('{showLandscapeConvoySummary ? (') &&
    commandCenterSource.includes('presentation="summary"') &&
    commandCenterSource.includes("presentation={isLandscapeDispatch ? 'signals' : 'feed'}") &&
    commandCenterSource.includes('activeConvoyContext={dispatchConvoyPresentationContext}') &&
    commandCenterSource.includes('activeConvoyContextAuthority={activeConvoyContextAuthority}') &&
    commandCenterSource.includes('<LandscapeShellControls') &&
    commandCenterSource.includes('onRevealDock={handleRevealDispatchDock}') &&
    dockSource.includes("expandedChromeTab === 'dispatch'"),
  'Dispatch landscape should keep shell controls, conditionally render one secondary summary, and use the lower signal panel as the Team/local-CAD workspace.',
);

assert.ok(
  panelSource.includes("presentation?: 'full' | 'feed' | 'signals' | 'summary'") &&
    panelSource.includes('const isSignalOnlyPresentation = presentation === \'signals\'') &&
    panelSource.includes('function ConvoySignalSurface') &&
    panelSource.includes('ACTIVE CONVOY') &&
    panelSource.includes('FORMATION NOMINAL') &&
    panelSource.includes('ROSTER TELEMETRY') &&
    panelSource.includes('members={liveMapMembers}') &&
    panelSource.includes('Roster reflects consent-based GPS reports only.') &&
    !panelSource.includes('Map visibility moved to Navigate.') &&
    !panelSource.includes('signalSweepLine') &&
    !panelStageStyle.includes('aspectRatio') &&
    !panelStageStyle.includes('minHeight: 320') &&
    !panelSource.includes('ConvoyCommandMap') &&
    !panelSource.includes('cameraResetKey') &&
    !panelSource.includes('advisoryFocusCoordinate'),
  'DispatchConvoyCommandPanel should support signal-only and summary-only modes without importing or rendering the convoy map.',
);

assert.ok(
  panelSource.includes('Start live sharing') &&
    panelSource.includes('Stop live sharing') &&
    panelSource.includes('Live Sharing Active') &&
    panelSource.includes('onEmergencyPing') &&
    panelSource.includes('Open active GPS ping') &&
    commandCenterSource.includes('handleConvoyLifecycleAction') &&
    commandCenterSource.includes('End Convoy') &&
    commandCenterSource.includes('Leave Convoy'),
  'Dispatch should keep live-sharing, convoy lifecycle, emergency ping, and recovery report controls after map removal.',
);

assert.ok(
  navigateSource.includes('buildConvoyMapOverlayModel') &&
    navigateSource.includes('convoyMarkers={navigateConvoyMarkers}') &&
    navigateSource.includes('dispatchPingMarkers={navigateDispatchPingMarkers}') &&
    navigateSource.includes('onConvoyMemberTap={handleNavigateConvoyMemberTap}') &&
    navigateSource.includes('onDispatchPingTap={handleNavigateDispatchPingTap}') &&
    navigateSource.includes("expeditionRuntime.state === 'active'") &&
    navigateSource.includes('includeCurrentUser: !mapRendererShowUserLocation') &&
    mapRendererSource.includes('convoyMarkers?: ConvoyMapOverlayMarker[]') &&
    mapRendererSource.includes('dispatchPingMarkers?: DispatchPingMapMarker[]') &&
    mapRendererSource.includes("payload?.kind === 'convoyMember'") &&
    mapRendererSource.includes("payload?.kind === 'dispatchPing'"),
  'Navigate should own Dispatch convoy and active GPS ping map overlays.',
);

assert.ok(
  mapRendererSource.includes('onUserLocationTap?: (payload: UserLocationTapPayload) => void') &&
    mapRendererSource.includes("send('userLocationTap'") &&
    mapRendererSource.includes("case 'userLocationTap':") &&
    mapRendererSource.includes('userLocationTapEnabled') &&
    mapFallbackSource.includes('onUserLocationTap') &&
    mapFallbackSource.includes('projectedUserScreenPoint') &&
    mapFallbackSource.includes('nativeX - projectedUserScreenPoint.x') &&
    navigateSource.includes('buildNavigateUserIdentityCallout') &&
    navigateSource.includes('onUserLocationTap={navigateUserIdentityCallout ? handleNavigateUserLocationTap : undefined}') &&
    navigateSource.includes('if (marker.isCurrentUser && navigateUserIdentityCallout)') &&
    navigateSource.includes('testID="navigate-user-identity-callout"') &&
    navigateSource.includes('TROPHY RANK') &&
    navigateSource.includes('USER_IDENTITY_CALLOUT_VISIBLE_MS') &&
    userIdentitySource.includes("const DEFAULT_TROPHY_RANK = 'Trail Scout'") &&
    userIdentitySource.includes('localExpeditionIdentityTitle'),
  'Navigate should make the current-user puck interactive and show a timed, source-backed convoy identity and trophy-rank callout.',
);

assert.equal(
  buildNavigateUserIdentityCallout({ activeConvoyContext: null }),
  null,
  'The self-profile callout should remain hidden without an active convoy context.',
);
assert.deepEqual(
  buildNavigateUserIdentityCallout({
    activeConvoyContext: { callsign: 'BASE', role: 'member', expeditionBadgeTitle: 'Trail Scout' },
    currentConvoyMember: {
      displayName: 'Morgan Reyes',
      callsign: 'RIDGE',
      role: 'lead',
      expeditionBadgeTitle: 'Field Planner',
    },
    localExpeditionIdentityTitle: 'Route Analyst',
  }),
  {
    displayName: 'Morgan Reyes',
    trophyRank: 'Route Analyst',
    contextLabel: 'ACTIVE CONVOY / LEAD',
  },
  'The self-profile callout should prefer current local identity rank and scoped member identity.',
);
assert.deepEqual(
  buildNavigateUserIdentityCallout({
    activeConvoyContext: { callsign: 'SCOUT-7', role: 'sweep' },
  }),
  {
    displayName: 'SCOUT-7',
    trophyRank: 'Trail Scout',
    contextLabel: 'ACTIVE CONVOY / SWEEP',
  },
  'The self-profile callout should retain a readable callsign and baseline ECS title when optional profile data is absent.',
);

assert.ok(
  !navigateSurfaceSource.includes('MapRenderer') &&
    !navigateSurfaceSource.includes('MapFallbackSurface') &&
    navigateSurfaceSource.includes('dashboard-navigation-command-status-card') &&
    widgetRenderersSource.includes("const RouteProgressMiniMap = React.lazy(() => import('./RouteProgressMiniMap'));") &&
    widgetRenderersSource.includes('<RouteProgressMiniMap'),
  'Dashboard Navigate Surface should be a non-map status card while Route Progress mini-map remains available.',
);

console.log('dispatch landscape layout checks passed');
