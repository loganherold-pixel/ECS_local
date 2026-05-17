const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const overlay = read('components/navigate/RoadNavigationOverlay.tsx');
assert(!overlay.includes('campsiteStops?: RouteGuidanceCampStop[]'), 'active guidance should no longer accept rendered campsite stop data');
assert(!overlay.includes('No ideal stops found along this route.'), 'active guidance should not render route-stop empty states');
assert(!overlay.includes('styles.activeGuidanceCampBlock'), 'camp stops must not render inside the active guidance container');
assert(overlay.includes('top: topOffset'), 'active guidance must be positioned from the top offset');
assert(overlay.includes('styles.previewBottomWrap'), 'route preview should be bounded by the same top/bottom safe overlay area');
assert(overlay.includes('topOffset={props.topOffset}'), 'route preview should receive the safe top offset from Navigate');
assert(overlay.includes('nestedScrollEnabled'), 'route preview content should scroll internally on constrained mobile screens');
assert(overlay.includes('<ECSActionRow compact wrap'), 'route preview actions should wrap instead of overflowing the card');
assert(overlay.includes('styles.previewActionButton'), 'route preview action buttons should use compact responsive sizing');
assert(!overlay.includes('bottom: bottomOffset,\n        left: horizontalInset,\n        right: horizontalInset,\n        paddingRight: guidanceRightInset'), 'active guidance must not anchor from the bottom');
assert(overlay.includes('maxWidth: 720'), 'active guidance should be a broad tactical banner');
assert(overlay.includes("backgroundColor: 'rgba(5,8,10,0.90)'"), 'active guidance background must be darker for map contrast');

const activeCardStart = overlay.indexOf('function ActiveNavigationCard({');
const activeCardEnd = overlay.indexOf('function ArrivedCard', activeCardStart);
assert(activeCardStart !== -1 && activeCardEnd !== -1, 'RoadNavigationOverlay should define the active guidance card.');
const activeCardBlock = overlay.slice(activeCardStart, activeCardEnd);
assert(!activeCardBlock.includes('activeContext.tripMode.toUpperCase()'), 'Active Guide must not render the route-type road/trail pill.');
assert(!activeCardBlock.includes('label={activeContext?.tripMode'), 'Active Guide must not render an active trip-mode badge.');
assert(
  activeCardBlock.includes("{guidanceEyebrow}") &&
    activeCardBlock.includes('styles.activeGuidanceEyebrow') &&
    activeCardBlock.includes('numberOfLines={1}'),
  'Active Guide title should render as clear text in the compact header row.',
);
assert(
  activeCardBlock.includes('activeContext?.progressLabel') &&
    !activeCardBlock.includes("label={activeContext?.tripMode?.toUpperCase()}"),
  'Active Guide may show progress, but should not crowd the header with a route-type badge.',
);
assert(
  !activeCardBlock.includes('<RouteConfidencePill'),
  'Active Guide must not render the Route Confidence visual container during active navigation.',
);
assert(
  overlay.includes('activeGuidanceWrap:') &&
    overlay.includes('zIndex: 120'),
  'Active Guide should own the highest guidance overlay z-index tier.',
);
assert(
  overlay.includes('paddingVertical: 7') &&
    overlay.includes('gap: 5') &&
    overlay.includes('width: 30') &&
    overlay.includes('height: 30') &&
    overlay.includes('minHeight: 0') &&
    overlay.includes('paddingVertical: 5'),
  'Active Guide should keep a compact top-center footprint while preserving readable guidance content.',
);
assert(
  !activeCardBlock.includes('styles.activeTopWrap') &&
    !activeCardBlock.includes('styles.activeTopCard') &&
    !activeCardBlock.includes('showActiveTopCard ?'),
  'Active navigation should render one active guidance container, not a second top-card variant.',
);

const navigate = read('app/(tabs)/navigate.tsx');
assert(!navigate.includes('TRAIL AUTO-PAUSED'), 'Trail auto-pause stationary state should not create a user-facing toast.');
assert(!navigate.includes('STATIONARY)'), 'Trail stationary auto-pause copy should stay out of user-facing Navigate surfaces.');
assert(!navigate.includes('trailStore.checkMovement('), 'Trail recording should not auto-start or auto-pause from GPS movement checks.');
assert(navigate.includes("if (trailStore.getStatus() !== 'recording')"), 'Trail points should only record after explicit manual start.');
assert(navigate.includes('if (recorded) refreshTrailState();'), 'Trail state should refresh after manual recording stores a GPS point.');
assert(!navigate.includes('const routeGuidanceCampStops = useMemo'), 'Navigate should not build route-stop lists for the compact active guide');
assert(!navigate.includes('campsiteStops: routeGuidanceCampStops'), 'active context must not pass route camp stops into guidance');
assert(!navigate.includes('routeGuidanceCampStops'), 'Navigate must not reference stale routeGuidanceCampStops bindings');
assert(!navigate.includes('campRouteBuildState'), 'Navigate must not reference stale campRouteBuildState bindings');
assert(!navigate.includes('activeRouteCampStops'), 'active guidance must not reference stale activeRouteCampStops binding');
assert(navigate.includes('const ACTIVE_GUIDANCE_TOP = MAP_TOP_EDGE'), 'active guidance must sit on the top edge of the map body');
assert(navigate.includes('const roadNavigationSurfaceTopOffset = ACTIVE_GUIDANCE_TOP'), 'active guidance must use the dedicated top-priority route surface offset');
assert(navigate.includes("guidanceRightInset={navigationOverlayMode === 'active' ? 0 : ACTIVE_GUIDANCE_RIGHT_INSET}"), 'active guidance must span broadly without compass bottom inset');
assert(
  navigate.includes("const mapToastAttachedToGuidance = navigationOverlayMode === 'active'"),
  'active navigation should attach transient toasts to the active guidance stack.',
);
assert(
  navigate.includes('const activeGuidanceToastTopOffset =') &&
    navigate.includes('roadNavigationSurfaceTopOffset +') &&
    navigate.includes('(activeGuidanceMinimized ? 46 : routeSurfaceHeight) +') &&
    navigate.includes('activeGuidanceNotificationGap') &&
    navigate.includes('placement="top"') &&
    navigate.includes('zIndex={mapToastAttachedToGuidance ? 84 : undefined}'),
  'temporary navigation notices should render below Active Guidance instead of covering it.',
);
assert(
  navigate.includes('const [activeReadinessMinimized, setActiveReadinessMinimized] = useState(true);') &&
    navigate.includes('onMinimize={() => setActiveReadinessMinimized(true)}') &&
    navigate.includes('onExpandActiveAccessory={() => setActiveReadinessMinimized(false)}') &&
    !navigate.includes('activeReadinessSignature') &&
    !navigate.includes("if (navigationOverlayMode !== 'active' || activeGuidanceMinimized || activeReadinessMinimized) return;"),
  'Active Expedition Readiness should stay user-controlled and stable across route calculation updates.',
);
assert(
  overlay.includes("if (lower.includes('continue') || lower.includes('straight')) return 'arrow-up';") &&
    overlay.includes('accessibilityHint="Restores the route update panel without changing Active Expedition Readiness state."') &&
    overlay.includes('accessibilityLabel={`Expand active guidance. ${nextInstruction}`}'),
  'Route guidance minimized arrow should reflect current instruction and restore without changing readiness minimize state.',
);
assert(
  navigate.includes('const activeGuidancePopupTopOffset =') &&
    navigate.includes("navigationOverlayMode === 'active' ? activeGuidanceToastTopOffset : null") &&
    navigate.includes('activeGuidancePopupTopOffset ?? PAGE_FRAME_TOP_GAP') &&
    navigate.includes('activeGuidancePopupTopOffset ?? MAP_POPUP_TOP'),
  'Navigate popups should reserve the Active Guidance band instead of covering it during active navigation.',
);

const topStatusStart = navigate.indexOf('const topStatusOverlaysVisible =');
const topStatusEnd = navigate.indexOf('const floatingToolsVisible', topStatusStart);
assert(topStatusStart !== -1 && topStatusEnd !== -1, 'Navigate should define a top status overlay visibility gate');
const topStatusBlock = navigate.slice(topStatusStart, topStatusEnd);
assert(
  topStatusBlock.includes("navigationOverlayMode !== 'active'"),
  'Active guidance should reserve the top map band so Road/Terrain controls cannot overlap it',
);

const activeContextStart = navigate.indexOf('const navigationActiveContext = useMemo(() => {');
const activeContextEnd = navigate.indexOf('const navigateRoutePreviewPayload = useMemo', activeContextStart);
assert(activeContextStart !== -1 && activeContextEnd !== -1, 'Navigate should define active navigation context before route preview payload setup.');
const activeContextBlock = navigate.slice(activeContextStart, activeContextEnd);
assert(
  !activeContextBlock.includes('routeConfidenceSummary: navigateRouteConfidenceSummary'),
  'Active navigation context should preserve route confidence internally but not pass it to a standalone active map banner.',
);

console.log('Navigate active guidance checks passed.');
