const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();

function read(...segments) {
  return fs.readFileSync(path.join(root, ...segments), 'utf8').replace(/\r\n/g, '\n');
}

const dispatchTabSource = read('app', '(tabs)', 'alert.tsx');
const commandCenterSource = read('components', 'dispatch', 'DispatchCadCommandCenter.tsx');
const panelSource = read('components', 'dispatch', 'DispatchConvoyCommandPanel.tsx');
const navigateSource = read('app', '(tabs)', 'navigate.tsx');
const mapRendererSource = read('components', 'navigate', 'MapRenderer.tsx');
const navigateSurfaceSource = read('components', 'dashboard', 'NavigateSurfaceWidget.tsx');
const widgetRenderersSource = read('components', 'dashboard', 'WidgetRenderers.tsx');
const dockSource = read('components', 'CommandDock.tsx');

const landscapeTopRowStyle = commandCenterSource.slice(
  commandCenterSource.indexOf('landscapeTopRow:'),
  commandCenterSource.indexOf('landscapeSummaryDock:'),
);
const landscapeSummaryDockStyle = commandCenterSource.slice(
  commandCenterSource.indexOf('landscapeSummaryDock:'),
  commandCenterSource.indexOf('landscapeDockRevealButton:'),
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
    commandCenterSource.includes('styles.feedPanelLandscapeMap') &&
    commandCenterSource.includes('rootLandscape:') &&
    commandCenterSource.includes('paddingBottom: 0') &&
    landscapeTopRowStyle.includes('minHeight: 0') &&
    landscapeTopRowStyle.includes('marginHorizontal: -8') &&
    landscapeSummaryDockStyle.includes("alignSelf: 'stretch'") &&
    landscapeSummaryDockStyle.includes("width: '100%'"),
  'Dispatch landscape should keep the compact full-width command shell and lower signal panel area.',
);

assert.ok(
  commandCenterSource.includes('presentation="summary"') &&
    commandCenterSource.includes("presentation={isLandscapeDispatch ? 'signals' : 'feed'}") &&
    commandCenterSource.includes('<LandscapeShellControls') &&
    commandCenterSource.includes('onRevealDock={handleRevealDispatchDock}') &&
    dockSource.includes("expandedChromeTab === 'dispatch'"),
  'Dispatch landscape should keep shell controls and render a signal-only Convoy Command lower panel.',
);

assert.ok(
  panelSource.includes("presentation?: 'full' | 'feed' | 'signals' | 'summary'") &&
    panelSource.includes('const isSignalOnlyPresentation = presentation === \'signals\'') &&
    panelSource.includes('function ConvoySignalSurface') &&
    panelSource.includes('DISPATCH SIGNALS') &&
    panelSource.includes('Map visibility moved to Navigate.') &&
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
  !navigateSurfaceSource.includes('MapRenderer') &&
    !navigateSurfaceSource.includes('MapFallbackSurface') &&
    navigateSurfaceSource.includes('dashboard-navigation-command-status-card') &&
    widgetRenderersSource.includes("const RouteProgressMiniMap = React.lazy(() => import('./RouteProgressMiniMap'));") &&
    widgetRenderersSource.includes('<RouteProgressMiniMap'),
  'Dashboard Navigate Surface should be a non-map status card while Route Progress mini-map remains available.',
);

console.log('dispatch landscape layout checks passed');
