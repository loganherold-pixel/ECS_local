const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const dispatchTabSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'alert.tsx'), 'utf8');
const commandCenterSource = fs.readFileSync(path.join(root, 'components', 'dispatch', 'DispatchCadCommandCenter.tsx'), 'utf8');
const panelSource = fs.readFileSync(path.join(root, 'components', 'dispatch', 'DispatchConvoyCommandPanel.tsx'), 'utf8');
const mapSource = fs.readFileSync(path.join(root, 'components', 'convoy', 'ConvoyCommandMap.tsx'), 'utf8');
const dockSource = fs.readFileSync(path.join(root, 'components', 'CommandDock.tsx'), 'utf8');
const landscapeTopRowStyle = commandCenterSource.slice(
  commandCenterSource.indexOf('landscapeTopRow:'),
  commandCenterSource.indexOf('landscapeSetupRail:'),
);
const landscapeSummaryDockStyle = commandCenterSource.slice(
  commandCenterSource.indexOf('landscapeSummaryDock:'),
  commandCenterSource.indexOf('landscapeDockRevealButton:'),
);
const liveChipPrimaryStyle = commandCenterSource.slice(
  commandCenterSource.indexOf('liveChipPrimary:'),
  commandCenterSource.indexOf('liveChipSourceLive:'),
);
const liveChipSourceLiveStyle = commandCenterSource.slice(
  commandCenterSource.indexOf('liveChipSourceLive:'),
  commandCenterSource.indexOf('liveChipSourceCached:'),
);
const feedPanelStyle = commandCenterSource.slice(
  commandCenterSource.indexOf('feedPanel:'),
  commandCenterSource.indexOf('feedPanelLandscapeMap:'),
);
const summaryCommandSummaryStyle = panelSource.slice(
  panelSource.indexOf('summaryCommandSummary:'),
  panelSource.indexOf('legendHeaderRow:'),
);

assert.ok(
  dispatchTabSource.includes('const isLandscape = width > height') &&
    dispatchTabSource.includes('!isLandscape ? <Header title="Dispatch" /> : null') &&
    dispatchTabSource.includes('height < 820 && !isLandscape') &&
    dispatchTabSource.includes('const containerBottomPadding = isLandscape || useScrollableDispatch ? 0 : dockClearance') &&
    dispatchTabSource.includes('{ paddingBottom: containerBottomPadding }'),
  'Dispatch tab should use a fixed, header-free body in landscape without reserving hidden dock clearance under the map.',
);

assert.ok(
  dispatchTabSource.includes('<TopoBackground>') &&
    dispatchTabSource.includes("backgroundColor: 'transparent'") &&
    commandCenterSource.includes("import { ECS_SURFACE } from '../../lib/ecsSurfaceTokens'") &&
    !commandCenterSource.includes('ECSShellTexture') &&
    !commandCenterSource.includes('ECS_POPUP_SURFACE_DARK') &&
    commandCenterSource.includes('backgroundColor: ECS_SURFACE.background.primary') &&
    commandCenterSource.includes('backgroundColor: ECS_SURFACE.background.secondary') &&
    commandCenterSource.includes('backgroundColor: ECS_SURFACE.background.compact') &&
    commandCenterSource.includes('borderColor: ECS_SURFACE.border.default') &&
    commandCenterSource.includes('borderBottomColor: ECS_SURFACE.border.quiet'),
  'Dispatch should share the Fleet topo background and translucent ECS surface opacity instead of the popup texture/surface background.',
);

assert.ok(
  panelSource.includes("import { ECS_SURFACE } from '../../lib/ecsSurfaceTokens'") &&
    panelSource.includes('backgroundColor: ECS_SURFACE.background.primary') &&
    panelSource.includes('backgroundColor: ECS_SURFACE.background.secondary') &&
    panelSource.includes('backgroundColor: ECS_SURFACE.background.compact') &&
    panelSource.includes('borderColor: ECS_SURFACE.border.default') &&
    !panelSource.includes("backgroundColor: 'rgba(3,7,9,0.92)'") &&
    !panelSource.includes("backgroundColor: 'rgba(5,8,10,0.72)'"),
  'Dispatch Convoy Command panel should use the same translucent Fleet surface tokens as the Dispatch shell.',
);

assert.ok(
  commandCenterSource.includes('const isLandscapeDispatch = windowWidth > windowHeight') &&
    !commandCenterSource.includes('styles.landscapeTitleBar') &&
    commandCenterSource.includes('styles.landscapeTopRow') &&
    commandCenterSource.includes('styles.landscapeSetupRail') &&
    commandCenterSource.includes('styles.feedPanelLandscapeMap'),
  'DispatchCadCommandCenter should split landscape into a compact top row and larger lower map panel without the redundant Dispatch title bar.',
);

assert.ok(
  !commandCenterSource.includes('landscapeTitleCenter') &&
    !commandCenterSource.includes('<Text style={styles.channelLandscape} numberOfLines={1}>{teamStatusLabel}</Text>') &&
    commandCenterSource.includes('{advisoryLine}') &&
    !commandCenterSource.includes('landscapeSetupTopSpacer') &&
    commandCenterSource.includes('{headerStrip}') &&
    commandCenterSource.includes('marginHorizontal: 2') &&
    commandCenterSource.includes('paddingHorizontal: 2'),
  'Dispatch landscape should remove the title/spacer lane and align advisory/action lanes with live chips.',
);

assert.ok(
  commandCenterSource.includes('compact ? styles.liveStripLandscape : styles.liveStripPortrait') &&
    commandCenterSource.includes('liveStripPortrait') &&
    commandCenterSource.includes("justifyContent: 'space-between'") &&
    commandCenterSource.includes('columnGap: 0') &&
    commandCenterSource.includes('width: \'32%\''),
  'Dispatch portrait live status chips should span the same left/right rail as advisory, setup, and command surfaces.',
);

assert.ok(
  commandCenterSource.includes('const dockRevealControl = isLandscapeDispatch ? (') &&
    commandCenterSource.includes('{dockRevealControl}') &&
    commandCenterSource.includes("compact && channel.id === 'sync' ? '' : displayActionLabel") &&
    commandCenterSource.includes('feedPanelLandscapeMap') &&
    commandCenterSource.includes('flex: 1'),
  'Dispatch landscape should place dock reveal beside connection state, suppress the compact Sync footer action, and expand the lower map panel.',
);

assert.ok(
  commandCenterSource.includes("import LandscapeShellControls from '../LandscapeShellControls'") &&
    commandCenterSource.includes('<LandscapeShellControls') &&
    commandCenterSource.includes('onBluetoothPress={handleOpenLandscapeBluetoothControls}') &&
    commandCenterSource.includes('onProfilePress={() => setProfileVisible(true)}') &&
    commandCenterSource.includes('onRevealDock={handleRevealDispatchDock}') &&
    commandCenterSource.includes("profileAccessibilityLabel=\"Open dispatch profile command hub\"") &&
    commandCenterSource.includes('styles.headerActionsPrimaryLandscape') &&
    commandCenterSource.includes('styles.headerActionsShellLandscape'),
  'Dispatch landscape should place Bluetooth, theme, profile, and lower dock reveal controls in a compact top-right shell cluster.',
);

assert.ok(
  commandCenterSource.includes('rootLandscape:') &&
    commandCenterSource.includes('paddingBottom: 0') &&
    commandCenterSource.includes('landscapeSummaryDock') &&
    commandCenterSource.includes('styles.landscapeSummaryDock') &&
    commandCenterSource.includes('<View style={styles.landscapeSummaryDock}>') &&
    landscapeTopRowStyle.includes('minHeight: 0') &&
    !landscapeTopRowStyle.includes('maxHeight: 148') &&
    landscapeSummaryDockStyle.includes("alignSelf: 'stretch'") &&
    !landscapeSummaryDockStyle.includes('maxHeight: 148') &&
    !landscapeSummaryDockStyle.includes("overflow: 'hidden'") &&
    commandCenterSource.includes('feedPanelLandscapeMap') &&
    commandCenterSource.includes('marginTop: 3') &&
    commandCenterSource.includes("alignSelf: 'stretch'") &&
    commandCenterSource.includes('marginBottom: 0'),
  'Dispatch landscape summary rail should stretch down to the map surface without clipping its convoy command rows.',
);

assert.ok(
  commandCenterSource.includes('presentation="summary"') &&
    commandCenterSource.includes("presentation={isLandscapeDispatch ? 'map' : 'feed'}") &&
    !commandCenterSource.includes('showMapStatusSummary'),
  'Dispatch should render command metrics separately and keep the redundant map status overlay removed.',
);

assert.ok(
  commandCenterSource.includes('revealDashboardDock(5000)') &&
    commandCenterSource.includes('setDashboardExpanded(isLandscapeDispatch)') &&
    dockSource.includes("expandedChromeTab === 'dispatch'"),
  'Dispatch landscape should share the Dashboard expanded chrome hide/reveal behavior for the lower dock.',
);

assert.ok(
  panelSource.includes("presentation?: 'full' | 'feed' | 'map' | 'summary'") &&
    panelSource.includes('isMapOnlyPresentation') &&
    panelSource.includes('isSummaryOnlyPresentation'),
  'DispatchConvoyCommandPanel should support map-only and summary-only modes.',
);

assert.ok(
  mapSource.includes('showStatusSummary = false') &&
    mapSource.includes('followUserWhenEmpty = false') &&
    mapSource.includes('const shouldFollowUser = followUserWhenEmpty && !hasRouteLine') &&
    mapSource.includes('followUserLocation={shouldFollowUser}') &&
    panelSource.includes('localVehicleFromUserLocation') &&
    panelSource.includes('!hasActiveConvoy') &&
    commandCenterSource.includes('const dispatchConvoyUserLocation = useMemo') &&
    commandCenterSource.includes('userLocation={dispatchConvoyUserLocation}') &&
    mapSource.includes('compass-outline') &&
    mapSource.includes('const targetBounds = latestHasRouteLine ? latestRouteBounds : latestBounds') &&
    mapSource.includes('routeCoordinateSignature') &&
    mapSource.includes('lastRouteCameraSignatureRef') &&
    commandCenterSource.includes('const [mapCameraResetKey, setMapCameraResetKey] = useState(0)') &&
    commandCenterSource.includes('setConvoyLifecycleRevision((current) => current + 1)') &&
    commandCenterSource.includes('navigateRouteSessionStore.hydrateFromPersistence()') &&
    commandCenterSource.includes('cameraResetKey={mapCameraResetKey}') &&
    panelSource.includes('cameraResetKey={cameraResetKey}'),
  'ConvoyCommandMap should hide redundant overlays, preserve freeform camera movement during live updates, and refresh/refit on Dispatch return or when route geometry appears.',
);

assert.ok(
  !commandCenterSource.includes('commandSurfaceStatusLabel') &&
    !commandCenterSource.includes('<Text style={styles.feedCount}>') &&
    !commandCenterSource.includes("getSourceStateLabel(sourceState).toLowerCase()}</Text>"),
  'Dispatch command surface header should not render a redundant top-right standby/status word.',
);

assert.ok(
  !commandCenterSource.includes('DispatchConvoyTeamSetupCard') &&
    !commandCenterSource.includes('CONVOY SETUP / TEAM') &&
    !commandCenterSource.includes('dispatch-convoy-team-setup-card') &&
    panelSource.includes('shouldShowEmergencyFeed') &&
    !panelSource.includes('(!isFeedPresentation || emergencyEvents.length > 0)'),
  'Dispatch should remove the redundant setup/team card and keep emergency pings in the active Convoy Command feed surface.',
);

assert.ok(
  liveChipPrimaryStyle.includes('borderColor: `${TACTICAL.amber}2E`') &&
    liveChipPrimaryStyle.includes('backgroundColor: `${TACTICAL.amber}12`') &&
    liveChipSourceLiveStyle.includes('borderColor: `${TACTICAL.amber}2E`') &&
    liveChipSourceLiveStyle.includes('backgroundColor: `${TACTICAL.amber}12`') &&
    !liveChipSourceLiveStyle.includes('shadowColor: TACTICAL.amber') &&
    !liveChipSourceLiveStyle.includes('shadowOpacity') &&
    !liveChipSourceLiveStyle.includes('elevation:'),
  'Dispatch active channel tiles should keep a thin gold border and wash without the thick gold glow overlay.',
);

assert.ok(
  feedPanelStyle.includes('borderColor: ECS_SURFACE.border.default') &&
    feedPanelStyle.includes("backgroundColor: 'transparent'") &&
    !feedPanelStyle.includes('borderColor: ECS_SURFACE.border.selected') &&
    !feedPanelStyle.includes('backgroundColor: ECS_SURFACE.background.selected') &&
    !commandCenterSource.includes('styles.feedHeader') &&
    !commandCenterSource.includes('COMMAND SURFACE') &&
    mapSource.includes('convoy-members-source') &&
    !mapSource.includes('<Mapbox.UserLocation visible showsUserHeadingIndicator />'),
  'Dispatch bottom Convoy Command map surface should keep the transparent surface, remove its header banner, and avoid a second Mapbox user-location dot.',
);

assert.ok(
  panelSource.includes('const showCommandFooterFacts = !summaryCompact') &&
    panelSource.includes('const showSummaryConvoySignals = isSummaryOnlyPresentation && panelViewModel.isUsingLiveData && panelViewModel.members.length > 0') &&
    panelSource.includes('{showCommandFooterFacts ? (') &&
    panelSource.includes('!isFeedPresentation && (!isSummaryOnlyPresentation || showSummaryConvoySignals)') &&
    panelSource.includes('isSummaryOnlyPresentation ? styles.summaryMetricGrid : null') &&
    panelSource.includes('showSummaryConvoySignals ? styles.summaryMetricGridWithSignals : null') &&
    panelSource.includes('expanded={isSummaryOnlyPresentation}'),
  'Dispatch compact Convoy Command summary should remove Team/Link/Updated footer rows, keep metrics at the base, and reserve member signals only when live members exist.',
);

assert.ok(
  summaryCommandSummaryStyle.includes('borderColor: `${TACTICAL.amber}2E`') &&
    summaryCommandSummaryStyle.includes('backgroundColor: `${TACTICAL.amber}12`'),
  'Dispatch landscape Convoy Command summary should retain the same translucent ECS gold wash as portrait.',
);

assert.ok(
  commandCenterSource.includes("justifyContent: 'center'") &&
    commandCenterSource.includes('maxWidth: 110') &&
    commandCenterSource.includes('alignSelf: \'stretch\'') &&
    commandCenterSource.includes('textAlign: \'center\''),
  'Dispatch landscape action controls should be centered with shared sizing and centered labels.',
);

console.log('dispatch landscape layout checks passed');
