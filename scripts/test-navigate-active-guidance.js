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
assert(overlay.includes('activeGuidancePrimaryMetricChip'), 'active guidance should stack turn distance above remaining and ETA.');
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
  overlay.includes('paddingVertical: 6') &&
    overlay.includes('gap: 4') &&
    overlay.includes('width: 28') &&
    overlay.includes('height: 28') &&
    overlay.includes('minHeight: 0') &&
    overlay.includes('paddingVertical: 4'),
  'Active Guide should keep a compact top-left footprint while preserving readable guidance content.',
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
assert(
  navigate.includes('const ACTIVE_GUIDANCE_TOP = effectiveMapExpanded') &&
    navigate.includes('Math.max(insets.top + 12, 42)') &&
    navigate.includes('MAP_TOP_EDGE + PAGE_FRAME_TOP_GAP'),
  'active guidance must keep a safe top buffer in fullscreen while staying compact inside the normal map body.',
);
assert(navigate.includes('const roadNavigationSurfaceTopOffset = ACTIVE_GUIDANCE_TOP'), 'active guidance must use the dedicated top-priority route surface offset');
assert(navigate.includes("guidanceRightInset={navigationOverlayMode === 'active' ? 0 : ACTIVE_GUIDANCE_RIGHT_INSET}"), 'active guidance must span broadly without compass bottom inset');
assert(
  navigate.includes("const mapToastAttachedToGuidance = navigationOverlayMode === 'active'"),
  'active navigation should attach transient toasts to the active guidance stack.',
);
assert(
  navigate.includes('const activeGuidanceToastTopOffset =') &&
    navigate.includes('roadNavigationSurfaceTopOffset +') &&
    navigate.includes('activeGuidanceRenderedHeight +') &&
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
assert(
  !navigate.includes('const ROUTE_STAGED_TOAST_MIN_INTERVAL_MS') &&
    !navigate.includes('const routeStagedToastRef = useRef') &&
    !navigate.includes('const showRouteStagedToast = useCallback') &&
    !navigate.includes("showToast('ROUTE STAGED: READY TO START WHEN YOU ARE')"),
  'Route staged restore should not show a transient toast.',
);
assert(
  !navigate.includes("showToast('ACTIVE GUIDANCE ALREADY RUNNING')"),
  'Repeated active guidance handoffs should be ignored without a transient toast.',
);
assert(
  navigate.includes('const navigateLandscapeExpanded = adaptive.isLandscape;') &&
    navigate.includes('const effectiveMapExpanded = mapExpanded || navigateLandscapeExpanded;') &&
    navigate.includes('setDashboardExpanded(navigateLandscapeExpanded);') &&
    navigate.includes('revealDashboardDock(5000);') &&
    navigate.includes('styles.navigateLandscapeDockRevealButton') &&
    navigate.includes('{ top: roadNavigationSurfaceTopOffset }') &&
    navigate.includes('activeGuidanceWidth={activeGuidanceLandscapeWidth}') &&
    navigate.includes('activeAccessoryMinimized={navigateLandscapeExpanded ? true : activeReadinessMinimized}'),
  'Navigate landscape should use expanded map chrome with a dock reveal control aligned to compact active guidance.',
);
assert(
  overlay.includes('activeGuidanceWidth?: number;') &&
    overlay.includes('const landscapeCompact = typeof activeGuidanceWidth === \'number\'') &&
    overlay.includes('styles.activeGuidanceLandscapeWrap') &&
    overlay.includes('styles.activeGuidanceLandscapeCard'),
  'RoadNavigationOverlay should support a compact top-left landscape active guidance presentation.',
);
assert(
  navigate.includes('const initialMapTokenRef = useRef(getMapboxTokenSync());') &&
    navigate.includes('void getMapboxToken()') &&
    navigate.includes('setMapToken(token || \'\')') &&
    navigate.includes('setMapLoading(false)') &&
    navigate.includes('tokenResolvedRef.current = token.length > 0;'),
  'Navigate should asynchronously resolve the Mapbox token on startup so native maps do not stay disabled after sync lookup misses.',
);

const commandDock = read('components/CommandDock.tsx');
assert(
  commandDock.includes("pathname.includes('/navigate')"),
  'CommandDock should honor Navigate landscape expanded chrome hide/reveal state.',
);

const toast = read('components/Toast.tsx');
assert(
  toast.includes("import ECSShellTexture from './ECSShellTexture';") &&
    toast.includes('<ECSShellTexture />') &&
    toast.includes('backgroundColor: surfaceTheme.shellBg') &&
    toast.includes('borderColor: surfaceTheme.shellBorder') &&
    toast.includes("overflow: 'hidden'"),
  'Map toasts should use the themed ECS popup texture instead of a flat gray shell.',
);
assert(
  navigate.includes('clearTokenCache();') &&
    navigate.includes('const handleMapRetry = useCallback(async () =>') &&
    navigate.includes('tokenResolvedRef.current = false;') &&
    navigate.includes('setMapSurfaceRevision((revision) => revision + 1);') &&
    navigate.includes('key={`navigate-map-${mapSurfaceRevision}`}'),
  'Navigate map retry should clear stale token state and force the MapRenderer surface to remount.',
);

const mapRenderer = read('components/navigate/MapRenderer.tsx');
assert(
  mapRenderer.includes("if (payload?.reason === 'bootstrap_timeout')") &&
    mapRenderer.includes("debugLog('[MapRenderer] Provisional bootstrap timeout received; showing initialized map shell'") &&
    mapRenderer.includes('hasEverReachedReadyRef.current = true;') &&
    mapRenderer.includes('setWebReady(true);'),
  'MapRenderer should show the initialized WebView map shell once the Mapbox constructor is alive instead of blocking behind a late load event.',
);
assert(
  mapRenderer.includes("baseUrl: 'https://api.mapbox.com/'") &&
    mapRenderer.includes('mixedContentMode="always"') &&
    mapRenderer.includes('onHttpError=') &&
    mapRenderer.includes('setWebBootIssue('),
  'MapRenderer should give Android WebView a stable Mapbox base URL and surface boot/http failures for blank-map diagnosis.',
);
assert(
  mapRenderer.includes('const WEBVIEW_HARD_FAILURE_TIMEOUT_MS = 90000;') &&
    mapRenderer.includes('const hardFailureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);') &&
    mapRenderer.includes('const hasEverReachedReadyRef = useRef(false);') &&
    mapRenderer.includes('onReadyStateChange?.(shouldLoadMap && (webReady || hasEverReachedReadyRef.current));') &&
    mapRenderer.includes('setWebBootIssue(phase === \'bootstrap_progress\' ? \'map_load_timeout\' : \'webview_startup_timeout\');') &&
    !mapRenderer.includes('Auto-recovery remount after cold-start timeout') &&
    !mapRenderer.includes('WEBVIEW_AUTO_RECOVERY_LIMIT'),
  'MapRenderer should treat slow Mapbox/WebView startup as a soft degraded boot and avoid automatic cold-start remount loops.',
);
assert(
  mapRenderer.includes('const MAP_CONSTRUCTOR_RETRY_LIMIT = 3;') &&
    mapRenderer.includes("const MAPBOX_WEBVIEW_GL_JS_VERSION = 'v2.15.0';") &&
    mapRenderer.includes('mapbox-gl-js/${MAPBOX_WEBVIEW_GL_JS_VERSION}/mapbox-gl.js') &&
    mapRenderer.includes('mapboxgl.workerCount = 1;') &&
    mapRenderer.includes('const constructorRetryCountRef = useRef(0);') &&
    mapRenderer.includes('scheduleConstructorRetry(payload.reason)') &&
    mapRenderer.includes('remountWebView(`map_constructor_retry:${reason}:${nextAttempt}`)') &&
    mapRenderer.includes("send('mapReady', { ok: false, reason: 'constructor_failed', detail: constructorMessage });") &&
    mapRenderer.includes('antialias: false') &&
    mapRenderer.includes('preserveDrawingBuffer: false') &&
    mapRenderer.includes('failIfMajorPerformanceCaveat: false') &&
    mapRenderer.includes('fadeDuration: 0'),
  'MapRenderer should recover from Android WebView Mapbox constructor failures with bounded retries, compatible WebView Mapbox GL, diagnostics, and low-pressure GL options.',
);
assert(
  mapRenderer.includes("import MapFallbackSurface from './MapFallbackSurface';") &&
    mapRenderer.includes('const fallbackMarkers = useMemo(') &&
    mapRenderer.includes('const hasFallbackGeometry = useMemo(') &&
    mapRenderer.includes('const fallbackVisible =') &&
    mapRenderer.includes('<MapFallbackSurface') &&
    mapRenderer.includes("statusLabel={shouldLoadMap ? 'ECS fallback map' : 'Offline map fallback'}") &&
    mapRenderer.includes('{showBootOverlay && !fallbackVisible && ('),
  'MapRenderer should provide a native route fallback surface when Mapbox/WebView cannot initialize.',
);

const fallbackSurface = read('components/navigate/MapFallbackSurface.tsx');
assert(
  fallbackSurface.includes("import Svg, { Circle, Line, Polyline, Rect } from 'react-native-svg';") &&
    fallbackSurface.includes('function buildBounds(') &&
    fallbackSurface.includes('function makeProjector(') &&
    fallbackSurface.includes('routeCoords?: LngLat[];') &&
    fallbackSurface.includes('progressRouteCoords?: LngLat[];') &&
    fallbackSurface.includes('statusLabel = \'Fallback map\'') &&
    fallbackSurface.includes('zIndex: 4'),
  'MapFallbackSurface should draw route/progress/user geometry without depending on Mapbox GL or WebView.',
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
