import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const Module = require('node:module');
const ts = require('typescript');

const currentFile = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(currentFile), '..', '..');
const FIXED_NOW_MS = Date.parse('2026-07-15T12:00:00.000Z');
const SCENARIO_TIMEOUT_MS = 3_000;

const DEFAULT_DISPATCH_STATE = Object.freeze({
  pings: [],
  queueItems: [],
  assignments: [],
  timelineEvents: [],
  cadEvents: [],
});

function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
}

function passthroughComponent(name, react) {
  return function PassthroughComponent(props) {
    return react.createElement(name, props, props?.children);
  };
}

function createReactHarness() {
  const react = {
    Fragment: Symbol.for('react.fragment'),
    Component: class Component {
      constructor(props) {
        this.props = props;
        this.state = {};
      }
      setState(next) {
        const patch = typeof next === 'function' ? next(this.state, this.props) : next;
        this.state = { ...this.state, ...patch };
      }
    },
    createElement(type, props, ...children) {
      return {
        type,
        props: {
          ...(props ?? {}),
          children: children.length <= 1 ? children[0] : children,
        },
      };
    },
    memo(component) {
      return component;
    },
    useCallback(callback) {
      return callback;
    },
    useEffect() {},
    useLayoutEffect() {},
    useMemo(factory) {
      return factory();
    },
    useRef(value) {
      return { current: value };
    },
    useState(initial) {
      return [typeof initial === 'function' ? initial() : initial, () => {}];
    },
    useSyncExternalStore(_subscribe, getSnapshot) {
      return getSnapshot();
    },
  };
  react.default = react;
  return react;
}

function createAnimatedHarness() {
  class Value {
    constructor(value) {
      this.value = value;
    }
    interpolate() {
      return this;
    }
    setValue(value) {
      this.value = value;
    }
    stopAnimation() {}
  }
  const animation = () => ({
    start(callback) {
      callback?.({ finished: true });
    },
    stop() {},
  });
  return {
    Value,
    View: 'Animated.View',
    Text: 'Animated.Text',
    delay: animation,
    parallel: animation,
    sequence: animation,
    timing: animation,
  };
}

function createMemoryPersistence() {
  const files = new Map();
  return function createPersistedKeyValueCache(fileKey) {
    if (!files.has(fileKey)) files.set(fileKey, new Map());
    const values = files.get(fileKey);
    return {
      get(key) {
        return values.get(key) ?? null;
      },
      set(key, value) {
        values.set(key, String(value));
      },
      delete(key) {
        values.delete(key);
      },
      clear() {
        values.clear();
      },
      flush: async () => {},
      waitForHydration: async () => {},
      isHydrated: () => true,
      readResult(key) {
        return { ok: true, value: values.get(key) ?? null };
      },
    };
  };
}

function createFailedSupabaseProvider() {
  let routeCatalogRequestCount = 0;
  let legacyRequestCount = 0;
  return {
    get routeCatalogRequestCount() {
      return routeCatalogRequestCount;
    },
    get legacyRequestCount() {
      return legacyRequestCount;
    },
    supabase: {
      functions: {
        async invoke() {
          routeCatalogRequestCount += 1;
          return {
            data: null,
            error: { message: 'Deterministic provider-unavailable fixture.' },
          };
        },
      },
      from() {
        legacyRequestCount += 1;
        const query = {
          select() { return query; },
          eq() { return query; },
          neq() { return query; },
          order() { return query; },
          limit() { return query; },
          abortSignal() { return query; },
          then(resolve, reject) {
            return Promise.resolve({
              data: null,
              error: { message: 'Deterministic fallback-unavailable fixture.' },
            }).then(resolve, reject);
          },
        };
        return query;
      },
    },
  };
}

function installModuleHarness() {
  const originalLoad = Module._load;
  const originalTs = require.extensions['.ts'];
  const originalTsx = require.extensions['.tsx'];
  const react = createReactHarness();
  const Animated = createAnimatedHarness();
  const createPersistedKeyValueCache = createMemoryPersistence();
  const failedProvider = createFailedSupabaseProvider();
  const navigationCalls = [];
  let currentPathname = '/settings';

  function CanonicalDispatchMarker() {
    return react.createElement('CanonicalDispatchMarker', {
      testID: 'dispatch-canonical-command-center',
    });
  }
  function DirectCadImplementationMarker() {
    return react.createElement('DirectCadImplementationMarker');
  }

  const View = 'View';
  const Text = 'Text';
  const Pressable = 'Pressable';
  const reactNative = {
    Animated,
    Platform: { OS: 'web' },
    Pressable,
    ScrollView: 'ScrollView',
    StyleSheet: { create: (styles) => styles },
    Text,
    TouchableOpacity: 'TouchableOpacity',
    View,
    useWindowDimensions: () => ({ width: 390, height: 844 }),
    AccessibilityInfo: { announceForAccessibility() {} },
  };

  require.extensions['.ts'] = compileTypeScript;
  require.extensions['.tsx'] = compileTypeScript;

  Module._load = function loadHarnessDependency(request, parent, isMain) {
    const parentFilename = parent?.filename ?? '';
    const fromCommandDock = parentFilename.endsWith(path.join('components', 'CommandDock.tsx'));
    const fromDispatchRoute = parentFilename.endsWith(path.join('app', '(tabs)', 'alert.tsx'));
    const fromDispatchEntry = parentFilename.endsWith(
      path.join('components', 'dispatch', 'DispatchCommandCenter.tsx'),
    );
    const fromLiveCatalog = parentFilename.endsWith(
      path.join('lib', 'explore', 'liveTrailPackCatalog.ts'),
    );
    const fromExploreInventory = parentFilename.endsWith(
      path.join('lib', 'explore', 'exploreGuidanceReadyInventory.ts'),
    );
    const fromDispatchPersistence = parentFilename.endsWith(
      path.join('lib', 'dispatchPersistenceAdapter.ts'),
    );

    if (request === 'react') return react;
    if (request === 'react-native') return reactNative;
    if (request === 'expo-image') return { Image: 'Image' };
    if (request.endsWith('.png')) return request;
    if (request === 'react-native-safe-area-context') {
      return { useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
    }

    if (fromDispatchRoute && request === '../../components/dispatch/DispatchCommandCenter') {
      return { __esModule: true, default: CanonicalDispatchMarker };
    }
    if (fromDispatchRoute && request === '../../components/dispatch/DispatchCadCommandCenter') {
      return { __esModule: true, default: DirectCadImplementationMarker };
    }
    if (fromDispatchEntry && request === './DispatchCadCommandCenter') {
      return { __esModule: true, default: DirectCadImplementationMarker };
    }
    if (fromDispatchRoute && request === '../../components/Header') {
      return { __esModule: true, default: passthroughComponent('Header', react) };
    }
    if (fromDispatchRoute && request === '../../components/TabErrorBoundary') {
      return { __esModule: true, default: passthroughComponent('TabErrorBoundary', react) };
    }
    if (fromDispatchRoute && request === '../../components/TopoBackground') {
      return { __esModule: true, default: passthroughComponent('TopoBackground', react) };
    }
    if (fromDispatchRoute && request === '../../lib/shellLayout') {
      return { getShellBottomClearance: (bottom, extra) => bottom + extra };
    }

    if ((fromLiveCatalog && request === '../keyValuePersistence') ||
        (fromDispatchPersistence && request === './keyValuePersistence')) {
      return { createPersistedKeyValueCache };
    }
    if (fromLiveCatalog && request === '../supabase') {
      return { supabase: failedProvider.supabase };
    }
    if (fromExploreInventory && request === '../discoverEngine') {
      return { MIN_DISCOVERY_ROUTE_MILES: 5 };
    }

    if (fromCommandDock && request === 'expo-router') {
      return { usePathname: () => currentPathname };
    }
    if (fromCommandDock && request === './QuickActionsSheet') {
      return { __esModule: true, default: passthroughComponent('QuickActionsSheet', react) };
    }
    if (fromCommandDock && request === '../context/ThemeContext') {
      return {
        useTheme: () => ({
          palette: {},
          colors: {},
          effectiveTheme: 'dark',
        }),
      };
    }
    if (fromCommandDock && request === '../lib/motion') {
      return {
        MOTION: { stateTransition: 0, tapPress: 0, pressRelease: 0, longPress: 500 },
        EASING: { standard: () => {}, press: () => {} },
        PRESS: { scaleDown: 0.98, scaleUp: 1, shieldScaleDown: 0.98 },
      };
    }
    if (fromCommandDock && request === '../lib/haptics') {
      return { hapticMicro() {}, hapticCommand() {} };
    }
    if (fromCommandDock && request === '../lib/theme') {
      return { TYPO: { U3: {} }, ECS: {} };
    }
    if (fromCommandDock && request === '../lib/firstLaunchGuidanceStore') {
      return {
        hasSeenDashboardLongPressHint: async () => true,
        markDashboardLongPressHintSeen: async () => {},
      };
    }
    if (fromCommandDock && request === '../lib/shellLayout') {
      return {
        ECS_COMMAND_DOCK_BAR_HEIGHT: 76,
        ECS_COMMAND_DOCK_CENTER_SLOT_WIDTH: 96,
        ECS_COMMAND_DOCK_CENTER_SLOT_FLEX: 1.15,
        ECS_COMMAND_DOCK_EDGE_SLOT_FLEX: 1,
        ECS_COMMAND_DOCK_INNER_SLOT_FLEX: 1,
        ECS_COMMAND_DOCK_LABEL_HEIGHT: 20,
        ECS_COMMAND_DOCK_OUTER_ITEM_MAX_WIDTH: 92,
      };
    }
    if (fromCommandDock && request === '../lib/dashboardChromeStore') {
      return {
        getDashboardChromeState: () => ({ expanded: false, dockRevealed: true }),
        hideDashboardDockReveal() {},
        subscribeDashboardChrome: () => () => {},
      };
    }
    if (fromCommandDock && request === '../lib/useAdaptiveLayout') {
      return {
        useAdaptiveLayout: () => ({
          isTablet: false,
          isLargePhone: false,
          shell: {
            dockOuterGutter: 0,
            dockMaxWidth: null,
            dockHorizontalPadding: 0,
          },
        }),
      };
    }
    if (fromCommandDock && request === '../lib/chromeAssets') {
      return { BOTTOM_BANNER_BG: 1 };
    }
    if (fromCommandDock && request === '../lib/ui/shellChromeTheme') {
      return {
        resolveShellChromeTheme: () => ({
          goldRail: '#C48A2C',
          hintText: '#FFFFFF',
          dockLabelActive: '#D1AC59',
          dockLabelMuted: '#6E7886',
        }),
      };
    }
    if (fromCommandDock && request === '../lib/features/featureVisibilityRegistry') {
      return { createRuntimeFeatureVisibilityContext: () => ({}) };
    }
    if (fromCommandDock && request === '../lib/navigation/ecsRoutePolicy') {
      return {
        selectVisibleECSPrimaryTabs: () => require(
          path.join(root, 'lib', 'routeManifest.ts'),
        ).ECS_PRIMARY_TAB_MANIFEST,
      };
    }
    if (fromCommandDock && request === '../lib/navigation/useECSNavigation') {
      return {
        useECSNavigation: () => ({
          navigate(route) {
            navigationCalls.push(route);
            return { accepted: true, reason: 'accepted' };
          },
        }),
      };
    }
    if (fromCommandDock && request === './ECSGlobalBanner') {
      return {
        ECSGlobalBanner: passthroughComponent('ECSGlobalBanner', react),
        getEcsBottomSafePadding: () => 0,
      };
    }
    if (fromCommandDock && request === '../lib/shellInteractionScheduler') {
      return {
        cancelShellInteractionTask() {},
        deferShellRouteNavigation(callback) {
          callback();
          return { id: 'deterministic-route-task' };
        },
      };
    }
    if (fromCommandDock && request === '../lib/performance/ecsPerformanceDiagnostics') {
      return {
        startECSPerformanceSpan: () => ({
          cancel() {},
          end() {},
        }),
      };
    }
    if (fromCommandDock && request === '../lib/ecsAnimations') {
      return { useReducedMotion: () => true };
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  return {
    CanonicalDispatchMarker,
    DirectCadImplementationMarker,
    failedProvider,
    navigationCalls,
    react,
    setPathname(value) {
      currentPathname = value;
    },
    restore() {
      Module._load = originalLoad;
      if (originalTs) require.extensions['.ts'] = originalTs;
      else delete require.extensions['.ts'];
      if (originalTsx) require.extensions['.tsx'] = originalTsx;
      else delete require.extensions['.tsx'];
    },
  };
}

function mountTree(node, mounted = []) {
  if (node == null || typeof node === 'boolean') return mounted;
  if (Array.isArray(node)) {
    node.forEach((child) => mountTree(child, mounted));
    return mounted;
  }
  if (typeof node !== 'object' || !('type' in node)) return mounted;
  mounted.push(node);
  if (typeof node.type === 'function') {
    mountTree(node.type(node.props ?? {}), mounted);
  } else {
    mountTree(node.props?.children, mounted);
  }
  return mounted;
}

function fixedExploreRoute(id, overrides = {}) {
  return {
    id,
    name: `Runtime route ${id}`,
    region: 'Deterministic regression region',
    regionGroup: 'great-basin',
    distanceMiles: 18,
    terrainType: 'remote two-track',
    remotenessScore: 8,
    estimatedDays: 1,
    startLat: 38,
    startLng: -110,
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [-110, 38],
        [-109.95, 38.05],
        [-109.9, 38.1],
      ],
    },
    routeMetadata: {
      routeTypeStatus: 'suggested_trailhead',
      routeGeometryMode: 'full',
      activeGuidance: { status: 'ready' },
      legalAccessStatus: 'verified',
      confidenceScore: 90,
    },
    ...overrides,
  };
}

async function verifyDispatchCanonicalRouteAndStore(harness) {
  const dispatchRoutePath = path.join(root, 'app', '(tabs)', 'alert.tsx');
  delete require.cache[require.resolve(dispatchRoutePath)];
  const AlertScreen = require(dispatchRoutePath).default;
  const mounted = mountTree(AlertScreen());
  assert(
    mounted.some((node) => node.type === harness.CanonicalDispatchMarker),
    'The registered Dispatch route must mount the canonical entry.',
  );
  assert(
    !mounted.some((node) => node.type === harness.DirectCadImplementationMarker),
    'The registered route must not bypass the canonical entry.',
  );

  const compatibilityEntryPath = path.join(
    root,
    'components',
    'dispatch',
    'DispatchCommandCenter.tsx',
  );
  delete require.cache[require.resolve(compatibilityEntryPath)];
  const compatibilityEntry = require(compatibilityEntryPath);
  assert.equal(
    compatibilityEntry.default,
    harness.DirectCadImplementationMarker,
    'Compatibility imports must resolve to the single CAD implementation.',
  );

  const { normalizeDispatchEvent } = require(path.join(root, 'lib', 'dispatchLiveEvents.ts'));
  const { dispatchPersistenceAdapter } = require(
    path.join(root, 'lib', 'dispatchPersistenceAdapter.ts'),
  );
  const { dispatchEventStore } = require(path.join(root, 'lib', 'dispatchEventStore.ts'));
  const { createDispatchEventDetailPresentation } = require(
    path.join(root, 'lib', 'dispatchEventDetailPresentation.ts'),
  );

  dispatchEventStore.clear();
  const expeditionId = 'runtime-regression-dispatch-expedition';
  const event = normalizeDispatchEvent({
    id: 'runtime-regression-dispatch-event',
    timestamp: '2026-07-15T11:59:00.000Z',
    updatedAt: '2026-07-15T11:59:00.000Z',
    type: 'recovery',
    severity: 'warning',
    title: 'Deterministic Recovery Update',
    message: 'A local Dispatch state update is ready for operator review.',
    source: 'user_report',
    status: 'active',
    priority: 'High',
    category: 'recovery_assist',
    dedupeKey: 'runtime-regression-dispatch-event',
  });
  assert(event, 'The deterministic Dispatch fixture must normalize.');

  let persistenceNotifications = 0;
  let observedHydration = null;
  const beforeRevision = dispatchPersistenceAdapter.getRevision(expeditionId);
  const unsubscribePersistence = dispatchPersistenceAdapter.subscribe((changedId) => {
    if (changedId !== expeditionId) return;
    persistenceNotifications += 1;
    observedHydration = dispatchPersistenceAdapter.hydrateResult(
      expeditionId,
      DEFAULT_DISPATCH_STATE,
      { timeoutMs: 500 },
    );
  });
  dispatchPersistenceAdapter.upsertCadEvent(
    expeditionId,
    DEFAULT_DISPATCH_STATE,
    event,
  );
  unsubscribePersistence();
  assert.equal(persistenceNotifications, 1, 'One Dispatch mutation must emit one persistence update.');
  assert.equal(
    dispatchPersistenceAdapter.getRevision(expeditionId),
    beforeRevision + 1,
    'The authoritative local Dispatch revision must advance once.',
  );
  assert(observedHydration, 'The Dispatch persistence event must initiate one hydration read.');
  const hydrated = await observedHydration;
  assert.equal(hydrated.status, 'ready');
  assert(hydrated.snapshot, 'The authoritative Dispatch hydration must return a terminal snapshot.');

  let visibleStoreUpdates = 0;
  const unsubscribeEvents = dispatchEventStore.subscribe((events) => {
    if (events.some((candidate) => candidate.id === event.id)) visibleStoreUpdates += 1;
  });
  dispatchEventStore.replaceEvents(hydrated.snapshot.cadEvents);
  unsubscribeEvents();

  const visibleEvent = dispatchEventStore.getSnapshot().find((candidate) => candidate.id === event.id);
  assert(visibleEvent, 'The canonical component event store must receive the hydrated mutation.');
  assert.equal(visibleStoreUpdates, 1, 'The visible event store must notify its mounted consumer once.');
  const presentation = createDispatchEventDetailPresentation(visibleEvent);
  assert.equal(presentation.title, 'Deterministic Recovery Update');
  assert.match(presentation.body, /local Dispatch state update/i);
  assert.notEqual(presentation.sourceLabel, '', 'Visible Dispatch output must retain a source label.');
  dispatchEventStore.clear();
}

async function verifyExploreReadinessPromotion() {
  const {
    buildExploreGuidanceReadyInventory,
    defaultExploreReadyRouteEligibility,
  } = require(path.join(root, 'lib', 'explore', 'exploreGuidanceReadyInventory.ts'));

  const missingGeometryRoute = fixedExploreRoute('pending-geometry-route', {
    routeGeometry: undefined,
    routeMetadata: {
      routeTypeStatus: 'suggested_trailhead',
      routeGeometryMode: 'omitted',
      activeGuidance: { status: 'unavailable' },
      legalAccessStatus: 'verified',
      confidenceScore: 90,
    },
  });
  const qualifiedRoute = {
    ...missingGeometryRoute,
    routeGeometry: fixedExploreRoute('geometry-fixture').routeGeometry,
    routeMetadata: {
      ...missingGeometryRoute.routeMetadata,
      routeGeometryMode: 'full',
      activeGuidance: { status: 'ready' },
    },
  };

  const qualifiedEligibility = defaultExploreReadyRouteEligibility(qualifiedRoute);
  assert.equal(qualifiedEligibility.eligible, true, 'A qualified source-backed route must be ready.');
  const missingEligibility = defaultExploreReadyRouteEligibility(missingGeometryRoute);
  assert.equal(missingEligibility.eligible, false);
  assert(
    missingEligibility.exclusionCodes.includes('missing_geometry'),
    'Missing geometry must retain its typed exclusion.',
  );

  const beforeDetail = buildExploreGuidanceReadyInventory({
    trailPacks: [missingGeometryRoute],
    selectedRefinement: null,
  });
  assert.equal(beforeDetail.readyCount, 0);
  assert(
    beforeDetail.rangeExclusions.some((entry) => entry.exclusionCodes.includes('missing_geometry')),
    'The rendered inventory contract must expose the missing-geometry reason.',
  );

  const afterDetail = buildExploreGuidanceReadyInventory({
    trailPacks: [qualifiedRoute],
    selectedRefinement: null,
  });
  assert.equal(afterDetail.readyCount, 1, 'Geometry completion must promote the route into ready.');
  assert.equal(
    afterDetail.candidateSet.candidates[0].route.id,
    missingGeometryRoute.id,
    'Detail hydration must promote the same normalized route identity.',
  );
}

async function verifyExploreProviderFailureTruth(harness) {
  const catalog = require(path.join(root, 'lib', 'explore', 'liveTrailPackCatalog.ts'));
  const { deriveExploreGuidanceProviderAvailability } = require(
    path.join(root, 'lib', 'explore', 'exploreGuidanceReadyInventory.ts'),
  );
  const { resolveECSAsyncSurfacePresentation } = require(
    path.join(root, 'lib', 'state', 'asyncSurfacePresentation.ts'),
  );

  const snapshot = await catalog.refreshLiveTrailPackCatalog(
    {
      latitude: 38.9,
      longitude: -110.1,
      radiusMiles: 50,
      locationSource: 'manual_area',
      limit: 25,
    },
    { timeoutMs: 500 },
  );

  assert.equal(snapshot.status, 'error', 'Provider failure must terminate in error.');
  assert.notEqual(snapshot.status, 'empty', 'Provider failure must never become no routes.');
  assert.equal(snapshot.source, 'unavailable');
  assert.equal(snapshot.coverageState.state, 'unavailable');
  assert.equal(snapshot.asyncState.retryEligible, true);
  assert.equal(snapshot.asyncState.safeErrorCode, 'ROUTE_CATALOG_PROVIDER_UNAVAILABLE');
  assert(harness.failedProvider.routeCatalogRequestCount >= 1);
  assert.equal(harness.failedProvider.legacyRequestCount, 1);

  const availability = deriveExploreGuidanceProviderAvailability({
    providerStatus: snapshot.status,
    providerHasData: false,
    evaluatedCount: 0,
    readyCount: 0,
  });
  assert.equal(availability.providerUnavailableWithoutData, true);
  assert.equal(availability.blockCanonicalInventory, true);

  const presentation = resolveECSAsyncSurfacePresentation(snapshot.asyncState, {
    subject: 'Guidance Ready routes',
  });
  assert.equal(presentation.kind, 'provider_unavailable');
  assert.equal(presentation.showRetry, true);
  if (process.env.ECS_RUNTIME_REGRESSION_DEBUG === '1') {
    process.stderr.write(`${JSON.stringify({
      presentationKind: presentation.kind,
      message: presentation.message,
      helper: presentation.helper,
    })}\n`);
  }
  assert.match(
    `${presentation.title} ${presentation.message}`,
    /provider unavailable|did not return a usable result/i,
    'The mounted state primitive must describe provider failure truthfully.',
  );
  assert.doesNotMatch(
    `${presentation.title} ${presentation.message} ${presentation.helper}`,
    /completed successfully with no results|no guidance ready routes available/i,
    'Provider failure must not use the valid-empty presentation.',
  );
}

async function verifyPrimaryDockAction(harness, label, expectedRoute) {
  harness.navigationCalls.length = 0;
  harness.setPathname('/settings');
  const commandDockPath = path.join(root, 'components', 'CommandDock.tsx');
  delete require.cache[require.resolve(commandDockPath)];
  const CommandDock = require(commandDockPath).default;
  const mounted = mountTree(CommandDock());
  const primaryControl = mounted.find((node) => (
    node.type === 'Pressable' &&
    node.props?.accessibilityRole === 'tab' &&
    String(node.props?.accessibilityLabel ?? '').toLowerCase() === label.toLowerCase()
  ));
  assert(primaryControl, `${label} must expose a mounted primary navigation control.`);
  assert.equal(typeof primaryControl.props.onPress, 'function');
  primaryControl.props.onPress();
  assert.deepEqual(
    harness.navigationCalls,
    [expectedRoute],
    `${label} must perform one real navigation mutation, not a placeholder or no-op.`,
  );
}

function failureSafeCode(scenario, timedOut) {
  if (timedOut) return `${scenario}_timed_out`;
  return `${scenario}_assertion_failed`;
}

async function runScenario(definition) {
  const startedAt = performance.now();
  let timeoutId;
  try {
    await Promise.race([
      Promise.resolve().then(definition.run),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          const error = new Error('Scenario exceeded its deterministic timeout.');
          error.name = 'ScenarioTimeoutError';
          reject(error);
        }, definition.timeoutMs ?? SCENARIO_TIMEOUT_MS);
      }),
    ]);
    return {
      scenario: definition.scenario,
      status: 'passed',
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      sourceFixtureProvider: definition.sourceFixtureProvider,
      failureSafeCode: null,
      deviceEvidenceStillRequired: definition.deviceEvidenceStillRequired,
      qualifiedTestIdentity: definition.qualifiedTestIdentity,
    };
  } catch (error) {
    const timedOut = error?.name === 'ScenarioTimeoutError';
    if (process.env.ECS_RUNTIME_REGRESSION_DEBUG === '1') {
      process.stderr.write(`${error?.stack ?? String(error)}\n`);
    }
    return {
      scenario: definition.scenario,
      status: timedOut ? 'timed_out' : 'failed',
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      sourceFixtureProvider: definition.sourceFixtureProvider,
      failureSafeCode: failureSafeCode(definition.scenario, timedOut),
      deviceEvidenceStillRequired: definition.deviceEvidenceStillRequired,
      qualifiedTestIdentity: definition.qualifiedTestIdentity,
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function runDispatchExploreControlScenarios() {
  const RealDate = globalThis.Date;
  const originalDev = globalThis.__DEV__;
  const originalLog = console.log;
  const originalWarn = console.warn;
  class FixedDate extends RealDate {
    constructor(...args) {
      super(...(args.length > 0 ? args : [FIXED_NOW_MS]));
    }
    static now() {
      return FIXED_NOW_MS;
    }
  }

  globalThis.Date = FixedDate;
  globalThis.__DEV__ = false;
  console.log = () => {};
  console.warn = () => {};
  const harness = installModuleHarness();
  try {
    const definitions = [
      {
        scenario: 'dispatch_canonical_route_store_update',
        sourceFixtureProvider: 'isolated_dispatch_persistence_fixture',
        deviceEvidenceStillRequired: ['android_dispatch_bundle_resolution'],
        qualifiedTestIdentity: 'runtime.integration.dispatch.canonical-route-store-update',
        run: () => verifyDispatchCanonicalRouteAndStore(harness),
      },
      {
        scenario: 'explore_guidance_readiness_promotion',
        sourceFixtureProvider: 'deterministic_route_catalog_fixture',
        deviceEvidenceStillRequired: ['real_provider_qualified_route_visibility'],
        qualifiedTestIdentity: 'runtime.integration.explore.guidance-readiness-promotion',
        run: verifyExploreReadinessPromotion,
      },
      {
        scenario: 'explore_provider_failure_truth',
        sourceFixtureProvider: 'controlled_route_provider_failure_fixture',
        deviceEvidenceStillRequired: ['real_provider_recovery_after_failure'],
        qualifiedTestIdentity: 'runtime.integration.explore.provider-failure-truth',
        run: () => verifyExploreProviderFailureTruth(harness),
      },
      ...[
        ['fleet', 'Fleet', '/fleet'],
        ['navigate', 'Navigate', '/navigate'],
        ['dashboard', 'Dashboard', '/dashboard'],
        ['explore', 'Explore', '/discover'],
        ['dispatch', 'Dispatch', '/alert'],
      ].map(([surface, label, route]) => ({
        scenario: `interaction_primary_${surface}`,
        sourceFixtureProvider: 'mounted_command_dock_component',
        deviceEvidenceStillRequired: [],
        qualifiedTestIdentity: `runtime.integration.controls.${surface}-primary-navigation`,
        run: () => verifyPrimaryDockAction(harness, label, route),
      })),
    ];

    const scenarios = [];
    for (const definition of definitions) {
      scenarios.push(await runScenario(definition));
    }
    return {
      suite: 'runtime-regression-integration-dispatch-explore-controls',
      status: scenarios.every((scenario) => scenario.status === 'passed') ? 'passed' : 'failed',
      scenarios,
    };
  } finally {
    harness.restore();
    globalThis.Date = RealDate;
    if (originalDev === undefined) delete globalThis.__DEV__;
    else globalThis.__DEV__ = originalDev;
    console.log = originalLog;
    console.warn = originalWarn;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  const report = await runDispatchExploreControlScenarios();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.status !== 'passed') process.exitCode = 1;
}
