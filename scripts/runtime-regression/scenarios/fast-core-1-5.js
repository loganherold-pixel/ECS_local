/* global __dirname */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const FIXED_NOW_MS = Date.parse('2026-07-15T12:00:00.000Z');
const DEFAULT_SCENARIO_TIMEOUT_MS = 2_000;

const FAST_CORE_SCENARIO_IDS = Object.freeze([
  'dashboard_weather',
  'terrain_risk',
  'draw_route',
  'guidance_snapping',
  'mvum_and_route_geometry',
]);

function resolveTypeScriptModule(request, parentFilename) {
  const base = path.isAbsolute(request)
    ? request
    : path.resolve(path.dirname(parentFilename), request);
  const candidates = path.extname(base)
    ? [base]
    : [
        `${base}.ts`,
        `${base}.tsx`,
        `${base}.js`,
        path.join(base, 'index.ts'),
        path.join(base, 'index.tsx'),
        path.join(base, 'index.js'),
      ];
  return candidates.find(candidate => fs.existsSync(candidate)) ?? null;
}

function createTypeScriptLoader(mocks = {}) {
  const moduleCache = new Map();

  function load(relativeOrAbsolutePath, parentFilename = path.join(ROOT, '__runtime_regression__.js')) {
    const filename = resolveTypeScriptModule(relativeOrAbsolutePath, parentFilename);
    if (!filename) {
      throw new Error(`Unable to resolve runtime regression module: ${relativeOrAbsolutePath}`);
    }
    if (moduleCache.has(filename)) return moduleCache.get(filename).exports;

    const source = fs.readFileSync(filename, 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.React,
        esModuleInterop: true,
      },
      fileName: filename,
    }).outputText;
    const mod = { exports: {} };
    moduleCache.set(filename, mod);

    function localRequire(request) {
      if (Object.prototype.hasOwnProperty.call(mocks, request)) {
        return mocks[request];
      }
      if (request.startsWith('.') || path.isAbsolute(request)) {
        const resolved = resolveTypeScriptModule(request, filename);
        if (resolved) return load(resolved, filename);
      }
      return require(request);
    }

    const compiled = new Function(
      'exports',
      'require',
      'module',
      '__filename',
      '__dirname',
      output,
    );
    compiled(mod.exports, localRequire, mod, filename, path.dirname(filename));
    return mod.exports;
  }

  return { load };
}

function createReactPresentationHarness() {
  const react = {
    Fragment: Symbol.for('react.fragment'),
    createElement(type, props, ...children) {
      return {
        type,
        props: {
          ...(props ?? {}),
          children: children.length <= 1 ? children[0] : children,
        },
      };
    },
    useCallback: callback => callback,
    useMemo: factory => factory(),
    useRef: value => ({ current: value }),
    useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
  };
  react.default = react;
  return react;
}

function collectPresentationTree(node, collected = []) {
  if (node == null || typeof node === 'boolean') return collected;
  if (Array.isArray(node)) {
    node.forEach(child => collectPresentationTree(child, collected));
    return collected;
  }
  if (typeof node !== 'object' || !('type' in node)) return collected;
  collected.push(node);
  collectPresentationTree(node.props?.children, collected);
  return collected;
}

function collectPresentationText(node, collected = []) {
  if (node == null || typeof node === 'boolean') return collected;
  if (typeof node === 'string' || typeof node === 'number') {
    collected.push(String(node));
    return collected;
  }
  if (Array.isArray(node)) {
    node.forEach(child => collectPresentationText(child, collected));
    return collected;
  }
  if (typeof node === 'object') {
    collectPresentationText(node.props?.children, collected);
  }
  return collected;
}

async function withFixedClock(callback, nowMs = FIXED_NOW_MS) {
  const RealDate = global.Date;
  class FixedDate extends RealDate {
    constructor(...args) {
      super(args.length > 0 ? args[0] : nowMs);
    }

    static now() {
      return nowMs;
    }
  }
  global.Date = FixedDate;
  try {
    return await callback();
  } finally {
    global.Date = RealDate;
  }
}

function waitUntil(predicate, safeCode, timeoutMs = 750) {
  const startedAt = performance.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (performance.now() - startedAt >= timeoutMs) {
        const error = new Error(safeCode);
        error.safeCode = safeCode;
        reject(error);
        return;
      }
      setTimeout(poll, 5);
    };
    poll();
  });
}

function runWithTimeout(callback, timeoutMs, safeCode) {
  let timeoutHandle;
  const timeout = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      const error = new Error(safeCode);
      error.safeCode = safeCode;
      error.isScenarioTimeout = true;
      reject(error);
    }, timeoutMs);
  });
  return Promise.race([Promise.resolve().then(callback), timeout]).finally(() => {
    clearTimeout(timeoutHandle);
  });
}

function hasUsableWeatherResult(result) {
  return Boolean(result?.data?.results?.some(entry => (
    entry?.current != null ||
    (Array.isArray(entry?.forecast) && entry.forecast.length > 0) ||
    (Array.isArray(entry?.daily) && entry.daily.length > 0)
  )));
}

function resolveWeatherTarget(input) {
  const candidate = input.currentGps || input.activeRoute || input.selectedCoordinate || input.lastKnown;
  if (!candidate) {
    return {
      coordinate: null,
      label: input.fallbackLabel || 'Current Position',
      sourceType: 'current_location',
      location: {
        coordinate: null,
        displayLabel: input.fallbackLabel || 'Current Position',
        source: 'unavailable',
        accuracyM: null,
        stale: false,
        staleReason: null,
        labelConfidence: 'unknown',
        unavailableReason: input.currentGpsPermissionDenied ? 'permission denied' : 'waiting for gps',
      },
    };
  }
  const sourceType = input.currentGps
    ? 'current_location'
    : input.activeRoute
      ? 'route_origin'
      : input.selectedCoordinate
        ? 'selected_coordinate'
        : 'last_known';
  const label = candidate.label || input.fallbackLabel || 'Current Position';
  return {
    coordinate: { ...candidate, label },
    label,
    sourceType,
    location: {
      coordinate: { lat: candidate.lat, lng: candidate.lng },
      displayLabel: label,
      source: input.currentGps ? 'current_gps' : sourceType,
      accuracyM: candidate.accuracyM ?? null,
      stale: false,
      staleReason: null,
      labelConfidence: input.currentGps ? 'high' : 'medium',
      unavailableReason: null,
    },
  };
}

function makeWeatherFetchResult({ latitude, temperatureF, source = 'live', error = null }) {
  return {
    data: {
      results: [{
        lat: latitude,
        lng: -120,
        label: 'Deterministic test location',
        current: {
          temp: temperatureF,
          feels_like: temperatureF - 1,
          humidity: 32,
          wind_speed: 7,
          weather_main: 'Clear',
          weather_description: 'clear sky',
        },
        forecast: [{
          time: '2026-07-15T18:00:00.000Z',
          highTemperatureF: temperatureF + 5,
          lowTemperatureF: temperatureF - 8,
          condition: 'Clear',
        }],
        daily: [],
        hourly: [],
        alerts: [],
      }],
      fetched_at: '2026-07-15T12:00:00.000Z',
      units: 'imperial',
      provider: 'openweather_one_call_3',
    },
    source,
    cachedAt: FIXED_NOW_MS,
    error,
  };
}

function createOperationalWeatherHarness(providerFetch, cachedResult = null) {
  const appStateListeners = new Set();
  const effectCleanups = [];
  const AppState = {
    currentState: 'active',
    addEventListener(event, listener) {
      if (event === 'change') appStateListeners.add(listener);
      return { remove: () => appStateListeners.delete(listener) };
    },
  };
  const noOpLogger = { dev() {}, warn() {}, info() {}, error() {} };
  const loader = createTypeScriptLoader({
    react: {
      useCallback: callback => callback,
      useEffect(effect) {
        const cleanup = effect();
        if (typeof cleanup === 'function') effectCleanups.push(cleanup);
      },
      useMemo: callback => callback(),
      useRef: value => ({ current: value }),
      useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
    },
    'react-native': { AppState },
    '@react-navigation/native': { useFocusEffect() {} },
    './weatherStore': {
      hasUsableWeatherFetchResult: hasUsableWeatherResult,
      waitForWeatherCacheHydration: () => Promise.resolve(),
    },
    './weatherService': {
      fetchSharedWeatherForCoordinates: coordinates => providerFetch(coordinates),
      getAnyCachedSharedWeather: () => cachedResult,
      getCachedSharedWeatherResult: () => cachedResult,
      resolveECSWeatherTarget: resolveWeatherTarget,
    },
    './ecsLogger': { ecsLog: noOpLogger },
    '../ecsLogger': { ecsLog: noOpLogger },
    './weatherDiagnostics': { logWeatherDiagnostics() {} },
    './weatherLocationResolver': { WEATHER_LOCATION_STALE_DISTANCE_METERS: 5_000 },
    './performance/ecsPerformanceDiagnostics': {
      incrementECSPerformanceCounter() {},
      startECSPerformanceRequest: () => ({ end() {} }),
    },
  });
  const api = loader.load(path.join(ROOT, 'lib', 'useOperationalWeather.ts'));
  return {
    api,
    mountConsumer(options) {
      api.useOperationalWeather(options);
      return () => {
        while (effectCleanups.length > 0) effectCleanups.pop()();
      };
    },
  };
}

function renderMountedWeatherIntelPanel(snapshot) {
  const react = createReactPresentationHarness();
  react.useEffect = () => {};
  const panel = createTypeScriptLoader({
    react,
    'react-native': {
      ActivityIndicator: 'ActivityIndicator',
      StyleSheet: { create: styles => styles },
      Text: 'Text',
      TouchableOpacity: 'TouchableOpacity',
      View: 'View',
    },
    '../SafeIcon': { SafeIcon: 'Ionicons' },
    '../../lib/theme': {
      TACTICAL: { amber: '#amber', text: '#text', textMuted: '#muted' },
    },
    '../../lib/weatherService': {
      fetchSharedWeatherForCoordinates: () => Promise.reject(new Error('network disabled in fixture')),
      getAnyCachedSharedWeather: () => null,
      getCachedSharedWeatherResult: () => null,
    },
    '../../lib/weatherStore': {
      getWeatherAge: () => '0m',
      getWeatherStaleness: () => 'fresh',
      hasUsableWeatherResponse: value => hasUsableWeatherResult({ data: value }),
    },
    '../../lib/weatherTypes': { getTrailOverallColor: () => '#neutral' },
    '../../context/AppContext': { useApp: () => ({ isOnline: true }) },
    './CurrentConditionsCard': 'CurrentConditionsCard',
    './ForecastTimeline': 'ForecastTimeline',
    './WeatherAlerts': 'WeatherAlerts',
    './TrailConditionsCard': 'TrailConditionsCard',
    '../source-truth': { SourceTruthInspectorTrigger: 'SourceTruthInspectorTrigger' },
    '../../lib/ecsLogger': { ecsLog: { dev() {}, warn() {}, info() {}, error() {} } },
  }).load(path.join(ROOT, 'components', 'weather', 'WeatherIntelPanel.tsx'));
  return collectPresentationTree(panel.default({
    latitude: snapshot.location.lat,
    longitude: snapshot.location.lng,
    locationLabel: snapshot.location.label,
    weatherSnapshot: snapshot,
    autoFetch: false,
    compact: false,
    frameless: true,
    units: snapshot.provider.units,
  }));
}

async function verifyDashboardWeatherScenario() {
  let providerCalls = 0;
  const weatherHarness = createOperationalWeatherHarness(coordinates => {
    providerCalls += 1;
    if (providerCalls === 1) {
      return Promise.resolve({
        result: makeWeatherFetchResult({
          latitude: coordinates[0].lat,
          temperatureF: 74,
        }),
      });
    }
    return Promise.reject(new Error('deterministic provider failure'));
  });
  const weather = weatherHarness.api;

  const unmountDashboardConsumer = weatherHarness.mountConsumer({
    enabled: true,
    gps: { lat: 35, lng: -120, hasFix: true, accuracyM: 8 },
  });
  await waitUntil(
    () => weather.getSharedOperationalWeatherState().asyncState.status === 'ready',
    'dashboard_weather_live_timeout',
  );

  const live = weather.getSharedOperationalWeatherState();
  assert.strictEqual(providerCalls, 1, 'Dashboard must issue one deterministic provider request.');
  assert.strictEqual(live.result?.source, 'live');
  assert.strictEqual(live.snapshot.status.kind, 'live');
  assert.strictEqual(live.snapshot.status.loading, false);
  assert.strictEqual(live.snapshot.provider.name, 'OpenWeather One Call 3.0');
  assert.strictEqual(live.snapshot.fetchedAt, '2026-07-15T12:00:00.000Z');
  assert.strictEqual(live.snapshot.status.timestampMs, FIXED_NOW_MS);
  assert.strictEqual(live.snapshot.normalized.forecast.length, 1);

  const readiness = createTypeScriptLoader({
    '../../lib/consumablesStore': { consumablesStore: { get: () => null } },
    '../../lib/activeVehicleContext': {
      getActiveVehicleContext: () => ({
        activeVehicleId: null,
        resourceProfile: {
          currentFuelGallons: 0,
          currentWaterGallons: 0,
          currentFuelPercent: null,
        },
        loadout: null,
        loadoutItemCount: 0,
        accessoryInstalledCount: 0,
        accessoryPlannedCount: 0,
      }),
    },
    '../../lib/missionStore': { missionExpeditionStore: { getActive: () => null } },
    '../../lib/remotenessStore': { remotenessStore: { get: () => null } },
    '../../lib/routeStore': { routeStore: { getActive: () => null } },
    '../../lib/readiness/expeditionReadinessStore': {
      expeditionReadinessStore: { getSnapshot: () => null },
    },
  }).load(path.join(ROOT, 'components', 'dashboard', 'widgetReadiness.ts'));
  const livePresentation = readiness.getDashboardWidgetReadiness('weather', {
    widgetData: { weatherSnapshot: live.snapshot },
  });
  assert.strictEqual(livePresentation.status, 'live');
  assert.strictEqual(livePresentation.badgeLabel, 'LIVE WEATHER');
  const livePanel = renderMountedWeatherIntelPanel(live.snapshot);
  assert.match(
    collectPresentationText(livePanel).join(' '),
    /74.*clear/i,
    'The mounted Dashboard weather detail must visibly render the normalized live conditions.',
  );
  const liveSourceControl = livePanel.find(node => node.type === 'SourceTruthInspectorTrigger');
  assert(liveSourceControl, 'The mounted weather detail must expose its source-truth control.');
  assert.strictEqual(liveSourceControl.props.source.provider, 'OpenWeather One Call 3.0');
  assert.strictEqual(
    liveSourceControl.props.source.observedAt,
    '2026-07-15T12:00:00.000Z',
    'The mounted source-truth control must retain the provider forecast timestamp.',
  );
  const sourceTruthPresentation = createTypeScriptLoader().load(
    path.join(ROOT, 'lib', 'sourceTruthPresentation.ts'),
  );
  const sourceInspectorModel = sourceTruthPresentation.buildSourceTruthInspectorModel({
    source: liveSourceControl.props.source,
    sources: liveSourceControl.props.sources,
    policyKey: liveSourceControl.props.policyKey,
    dependencies: liveSourceControl.props.dependencies,
    now: FIXED_NOW_MS,
  });
  assert(
    sourceInspectorModel.sourceRows.some(row => (
      (row.label === 'Provider' || row.label === 'Source / authority')
      && row.value === 'OpenWeather One Call 3.0'
    )),
    'The production source inspector presentation must expose the live weather provider.',
  );
  assert(
    sourceInspectorModel.timingRows.some(row => (
      row.id === 'observed' && row.value !== 'Unknown'
    )),
    'The production source inspector presentation must expose the forecast observation timestamp.',
  );

  unmountDashboardConsumer();

  weather.setSharedOperationalWeatherConsumer('dashboard_cached_transition', {
    enabled: true,
    gps: { lat: 36, lng: -120, hasFix: true, accuracyM: 8 },
  });
  await waitUntil(
    () => weather.getSharedOperationalWeatherState().asyncState.status === 'degraded',
    'dashboard_weather_cached_fallback_timeout',
  );
  const degraded = weather.getSharedOperationalWeatherState();
  assert.strictEqual(providerCalls, 2, 'A material location change must issue one new provider request.');
  assert.strictEqual(degraded.snapshot.status.loading, false);
  assert.match(degraded.result?.source ?? '', /^cache_(fresh|stale)$/);
  assert.match(degraded.snapshot.status.label ?? '', /cached|stale/i);
  assert.strictEqual(degraded.snapshot.current.temp, 74, 'Last-good weather must remain visible.');
  const cachedPresentation = readiness.getDashboardWidgetReadiness('weather', {
    widgetData: { weatherSnapshot: degraded.snapshot },
  });
  assert.strictEqual(cachedPresentation.status, 'fallback');
  assert.match(cachedPresentation.badgeLabel, /CACHED|STALE/);
  const cachedPanel = renderMountedWeatherIntelPanel(degraded.snapshot);
  const cachedSourceControl = cachedPanel.find(node => node.type === 'SourceTruthInspectorTrigger');
  assert(cachedSourceControl, 'Retained cached weather must keep the mounted source-truth control.');
  assert.strictEqual(
    cachedSourceControl.props.source.origin,
    'cached',
    'The mounted weather detail must retain the cached source classification.',
  );
  weather.removeSharedOperationalWeatherConsumer('dashboard_cached_transition');
}

function verifyTerrainRiskScenario() {
  const loader = createTypeScriptLoader();
  const commandProfile = loader.load(path.join(ROOT, 'lib', 'terrainRiskCommandProfile.ts'));
  const presentation = loader.load(path.join(ROOT, 'lib', 'terrainRiskDashboardPresentation.ts'));
  const elevationSamples = [
    { lat: 39, lng: -120, elevationFeet: 4_200 },
    { lat: 39.02, lng: -120.02, elevationFeet: 4_860 },
    { lat: 39.04, lng: -120.04, elevationFeet: 4_380 },
  ];
  const route = commandProfile.buildTerrainRiskCommandRoute({
    active: true,
    routeId: 'runtime-terrain-route',
    routeName: 'Runtime Terrain Route',
    routePoints: elevationSamples,
    totalDistanceMiles: 6,
    sourceLabel: 'Canonical guidance route elevation samples',
  });
  assert(route, 'Elevation samples must produce a deterministic terrain route.');
  assert.deepStrictEqual(
    route.profile.map(point => point.elevationFeet),
    elevationSamples.map(point => point.elevationFeet),
    'Graph points must derive from route elevation samples.',
  );

  const model = presentation.buildTerrainRiskDashboardPresentation({
    active: true,
    route,
    routeIdentity: { id: route.id, name: route.name },
    completedDistanceMiles: 3,
    source: {
      label: 'Canonical guidance route elevation samples',
      origin: 'live',
      freshness: 'live',
      confidence: 'medium',
      coverage: 'complete',
      observedAt: '2026-07-15T12:00:00.000Z',
      provider: 'Navigate trail guidance',
    },
  });
  assert.strictEqual(model.status, 'ready');
  assert.strictEqual(model.currentProgressDistanceMiles, 3);
  assert.strictEqual(model.completedProfile.at(-1).distanceMiles, 3);
  assert.strictEqual(model.remainingProfile[0].distanceMiles, 3);
  const chart = presentation.buildTerrainRiskChartSeries(model.profile, 24);
  assert(chart.length >= 2);
  assert(chart.every(point => model.profile.includes(point)), 'Chart downsampling must not invent graph points.');

  const react = createReactPresentationHarness();
  const sideProfile = createTypeScriptLoader({
    react,
    'react-native': {
      PanResponder: { create: () => ({ panHandlers: {} }) },
      Platform: { OS: 'web', select: values => values?.web ?? values?.default },
      StyleSheet: { create: styles => styles },
      TouchableOpacity: 'TouchableOpacity',
      View: 'View',
    },
    'react-native-svg': {
      __esModule: true,
      default: 'Svg',
      Circle: 'Circle',
      Defs: 'Defs',
      G: 'G',
      LinearGradient: 'LinearGradient',
      Line: 'Line',
      Path: 'Path',
      Rect: 'Rect',
      Stop: 'Stop',
      Text: 'SvgText',
    },
  }).load(path.join(ROOT, 'components', 'dashboard', 'TerrainRiskSideProfile.tsx'));
  const renderedProfile = collectPresentationTree(sideProfile.default({
    profile: model.profile,
    totalDistanceMiles: route.totalDistanceMiles,
    completedDistanceMiles: model.currentProgressDistanceMiles,
    unit: 'mi',
  }));
  const routeLine = renderedProfile.find(node => (
    node.type === 'Path' && node.props?.stroke === 'rgba(255,255,255,0.34)'
  ));
  assert(routeLine, 'The mounted terrain profile must render a route-derived SVG line.');
  const renderedPoints = [...routeLine.props.d.matchAll(/[ML]\s+([\d.]+)\s+([\d.]+)/g)]
    .map(match => ({ x: Number(match[1]), y: Number(match[2]) }));
  assert.strictEqual(renderedPoints.length, model.profile.length);
  const rawElevations = model.profile.map(point => point.elevationFeet);
  const rawMinElevation = Math.min(...rawElevations);
  const rawMaxElevation = Math.max(...rawElevations);
  const elevationRange = Math.max(120, rawMaxElevation - rawMinElevation);
  const elevationPadding = Math.max(80, elevationRange * 0.16);
  const expectedBounds = {
    minElevationFeet: rawMinElevation - elevationPadding,
    maxElevationFeet: rawMaxElevation + elevationPadding,
  };
  renderedPoints.forEach((renderedPoint, index) => {
    const profilePoint = model.profile[index];
    const expectedX = sideProfile.scaleTerrainDistanceToX(
      profilePoint.distanceMiles,
      route.totalDistanceMiles,
    );
    const expectedY = sideProfile.scaleTerrainElevationToY(
      profilePoint.elevationFeet,
      expectedBounds,
    );
    assert(
      Math.abs(renderedPoint.x - expectedX) <= 0.051,
      `Terrain sample ${index} must preserve its route distance on the rendered x axis.`,
    );
    assert(
      Math.abs(renderedPoint.y - expectedY) <= 0.051,
      `Terrain sample ${index} must preserve its route elevation on the rendered y axis.`,
    );
  });
  const peakIndex = model.profile.reduce(
    (current, point, index, points) => (
      point.elevationFeet > points[current].elevationFeet ? index : current
    ),
    0,
  );
  assert.strictEqual(
    renderedPoints[peakIndex].y,
    Math.min(...renderedPoints.map(point => point.y)),
    'The highest route elevation sample must render as the graph peak.',
  );
  assert(renderedProfile.some(node => (
    node.type === 'G' && node.props?.accessibilityLabel === 'Current GPS position on terrain profile'
  )), 'Current route progress must render on the mounted graph.');
  assert(renderedProfile.some(node => (
    node.type === 'Path' && node.props?.stroke === 'rgba(141,151,158,0.78)'
  )), 'Completed terrain progress must render separately from the remaining profile.');

  const unavailable = presentation.buildTerrainRiskDashboardPresentation({
    active: true,
    routeIdentity: { id: 'runtime-geometry-only', name: 'Geometry Only' },
    route: null,
    requestStatus: 'empty',
    missingDataReason: 'elevation_samples_unavailable',
  });
  assert.strictEqual(unavailable.status, 'empty');
  assert.strictEqual(unavailable.missingDataReason, 'elevation_samples_unavailable');
  assert.deepStrictEqual(unavailable.profile, [], 'Guidance presence must not fabricate a mountain graph.');
  const unavailableTree = collectPresentationTree(sideProfile.default({
    profile: unavailable.profile,
    totalDistanceMiles: 6,
    completedDistanceMiles: 3,
    unit: 'mi',
  }));
  assert(!unavailableTree.some(node => node.type === 'Svg'), 'Missing elevation must not render a fake SVG profile.');
  assert.match(
    presentation.getTerrainRiskDashboardPresentationTitle(unavailable),
    /elevation profile unavailable/i,
    'The mounted Dashboard presentation must visibly report the unavailable profile.',
  );
  assert.match(
    presentation.getTerrainRiskDashboardPresentationDetail(unavailable),
    /route presence alone cannot produce a mountain graph/i,
    'The mounted Dashboard presentation must explain why no graph is rendered.',
  );
}

function createMapRendererLoader() {
  const reactNative = {
    ActivityIndicator() { return null; },
    Image() { return null; },
    Platform: { OS: 'web', select: values => values?.web ?? values?.default },
    Pressable() { return null; },
    StyleSheet: {
      absoluteFillObject: {},
      hairlineWidth: 1,
      create: styles => styles,
    },
    Text() { return null; },
    View() { return null; },
  };
  return createTypeScriptLoader({
    'react-native': reactNative,
    'react-native-webview': { WebView() { return null; } },
    'expo-constants': { default: { expoConfig: { extra: {} }, manifest: { extra: {} } } },
    './supabase': { supabase: null },
    './ecsIssueReporter': { reportRecoverableFailure() {} },
    '../../lib/ecsLogger': { ecsLog: { dev() {}, warn() {}, error() {} } },
    '../../lib/features/featureVisibilityRegistry': { isECSDevelopmentDiagnosticEnabled: () => false },
    '../../lib/performance/ecsPerformanceDiagnostics': {
      recordECSPerformanceRender() {},
      startECSPerformanceSpan: () => ({ end() {} }),
    },
    '../ECSButton': { ECSButton() { return null; } },
    './MapFallbackSurface': { __esModule: true, default() { return null; } },
  });
}

function addDraftPoint(builder, draft, latitude, longitude) {
  return builder.addAnchorToDraft(draft, {
    coordinate: { latitude, longitude },
    availableSegments: [],
  }).draft;
}

function verifyDrawRouteScenario() {
  const builder = createTypeScriptLoader().load(path.join(ROOT, 'lib', 'navigatePointRouteBuilder.ts'));
  const mapRenderer = createMapRendererLoader().load(
    path.join(ROOT, 'components', 'navigate', 'MapRenderer.tsx'),
  );

  const empty = builder.createNavigateRouteDraft();
  const pointA = addDraftPoint(builder, empty, 40, -120);
  const pointB = addDraftPoint(builder, pointA, 40.1, -120.1);
  const twoPointSegments = builder.buildRouteBuilderPresentationSegmentsFromDraft(pointB);
  assert.strictEqual(twoPointSegments.length, 1);
  assert.deepStrictEqual(twoPointSegments[0].coordinates, [[-120, 40], [-120.1, 40.1]]);
  assert.strictEqual(twoPointSegments[0].geometryRole, 'raw_user_draft');

  const drawingPayload = mapRenderer.buildWebPayload({
    mapboxToken: 'pk.runtime-regression-fixture',
    routeBuilderActive: true,
    routeBuilderMode: 'anchor_trace',
    routeBuilderSegments: twoPointSegments,
    routeBuilderAnchors: pointB.anchors,
  });
  assert.deepStrictEqual(drawingPayload.routeCoords, [], 'Preview geometry must not be required.');
  assert.strictEqual(drawingPayload.routeBuilderSegments.length, 1);
  assert.strictEqual(
    mapRenderer.buildRouteBuilderFallbackOverlay(drawingPayload).segments.length,
    1,
    'The visible fallback projection must receive draft geometry before preview.',
  );

  let history = builder.createNavigateRouteDraftHistory(empty);
  history = builder.recordNavigateRouteDraft(history, pointA);
  history = builder.recordNavigateRouteDraft(history, pointB);
  const pointC = addDraftPoint(builder, pointB, 40.2, -120.2);
  history = builder.recordNavigateRouteDraft(history, pointC);
  const threePointSegments = builder.buildRouteBuilderPresentationSegmentsFromDraft(pointC);
  const threePointPayload = mapRenderer.buildWebPayload({
    mapboxToken: 'pk.runtime-regression-fixture',
    routeBuilderActive: true,
    routeBuilderMode: 'anchor_trace',
    routeBuilderSegments: threePointSegments,
    routeBuilderAnchors: pointC.anchors,
  });
  const threePointCoordinates = threePointPayload.routeBuilderSegments.flatMap(
    (segment, index) => index === 0 ? segment.coordinates : segment.coordinates.slice(1),
  );
  assert.deepStrictEqual(
    threePointCoordinates,
    [[-120, 40], [-120.1, 40.1], [-120.2, 40.2]],
    'A new draft point must update the visible MapRenderer payload immediately.',
  );
  const undone = builder.undoNavigateRouteDraftHistory(history);
  const undoneSegments = builder.buildRouteBuilderPresentationSegmentsFromDraft(undone.present);
  const undoPayload = mapRenderer.buildWebPayload({
    mapboxToken: 'pk.runtime-regression-fixture',
    routeBuilderActive: true,
    routeBuilderMode: 'anchor_trace',
    routeBuilderSegments: undoneSegments,
    routeBuilderAnchors: undone.present.anchors,
  });
  assert.strictEqual(undoPayload.routeBuilderSegments.length, 1, 'Undo must update visible draft geometry.');
  assert.deepStrictEqual(
    undoPayload.routeBuilderSegments[0].coordinates,
    [[-120, 40], [-120.1, 40.1]],
    'Undo must remove the latest visible coordinate from the MapRenderer payload.',
  );
  assert.notDeepStrictEqual(
    undoPayload.routeBuilderSegments,
    threePointPayload.routeBuilderSegments,
    'Undo must produce a new visible draft presentation.',
  );

  const cancelledDraft = builder.clearNavigateRouteDraft(pointC);
  const cancelPayload = mapRenderer.buildWebPayload({
    mapboxToken: 'pk.runtime-regression-fixture',
    routeBuilderActive: false,
    routeBuilderMode: 'anchor_trace',
    routeBuilderSegments: builder.buildRouteBuilderPresentationSegmentsFromDraft(cancelledDraft),
    routeBuilderAnchors: cancelledDraft.anchors,
  });
  assert.deepStrictEqual(cancelPayload.routeBuilderSegments, []);
  assert.deepStrictEqual(cancelPayload.routeBuilderAnchors, []);
  assert.deepStrictEqual(
    mapRenderer.buildRouteBuilderFallbackOverlay(cancelPayload).segments,
    [],
    'Cancel must clear the visible fallback draft overlay.',
  );
}

function verifyGuidanceSnappingScenario() {
  const projection = createTypeScriptLoader().load(
    path.join(ROOT, 'lib', 'navigation', 'guidanceRouteProjection.ts'),
  );
  const originLat = 38;
  const originLng = -121;
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLng = metersPerDegreeLat * Math.cos((originLat * Math.PI) / 180);
  const point = (eastMeters, northMeters) => ({
    lat: originLat + northMeters / metersPerDegreeLat,
    lng: originLng + eastMeters / metersPerDegreeLng,
  });
  const route = [point(0, 0), point(1_000, 0)];

  const near = projection.resolveGuidanceRouteProgress({
    rawPosition: point(250, 12),
    routeGeometry: route,
    context: 'road',
    accuracyM: 6,
  });
  assert.strictEqual(near.status, 'snapped');
  assert(near.snappedPosition);
  assert.notDeepStrictEqual(near.rawPosition, near.snappedPosition, 'Raw GPS must remain unsnapped.');
  assert(Math.abs(near.snappedPosition.lat - originLat) < 1e-8, 'Progress must lie on canonical geometry.');
  assert(near.completedGeometry.length >= 2);
  assert(near.remainingGeometry.length >= 2);
  assert.deepStrictEqual(
    near.completedGeometry.at(-1),
    near.remainingGeometry[0],
    'Completed and remaining route lines must share the projected boundary.',
  );

  const outside = projection.resolveGuidanceRouteProgress({
    rawPosition: point(250, 120),
    routeGeometry: route,
    context: 'road',
    accuracyM: 5,
  });
  assert.strictEqual(outside.status, 'off_route');
  assert.strictEqual(outside.snappedPosition, null);
  assert.deepStrictEqual(outside.completedGeometry, []);
  assert.deepStrictEqual(outside.remainingGeometry, route);
}

function beginSurface(asyncState, state, fingerprint, now) {
  return asyncState.beginECSAsyncSurfaceRequest(state, {
    requestFingerprint: fingerprint,
    provider: 'route-geometry-segments',
    now,
  });
}

function settleSurface(asyncState, state, status, options = {}) {
  return asyncState.settleECSAsyncSurfaceRequest(state, {
    requestId: state.requestId,
    generation: state.generation,
    requestFingerprint: state.requestFingerprint,
    status,
    data: options.data,
    resultCount: options.resultCount,
    source: options.source ?? (status === 'ready' || status === 'empty' ? 'live' : 'unavailable'),
    freshness: options.freshness ?? (status === 'ready' || status === 'empty' ? 'live' : 'unavailable'),
    safeErrorCode: options.safeErrorCode,
    retryEligible: options.retryEligible,
    providerStatus: options.providerStatus,
    now: options.now ?? ((state.startedAt ?? 0) + 10),
  }).state;
}

function scheduleLayer(coordinator, layer, fingerprint, bounds, now) {
  const plan = coordinator.plan({
    layer,
    enabled: true,
    zoomEligible: true,
    online: true,
    viewportFingerprint: fingerprint,
    bounds,
    debounceMs: 0,
    now,
  });
  assert.strictEqual(plan.kind, 'scheduled');
  const request = coordinator.consumeDue(layer, now);
  assert(request);
  return request;
}

async function verifyMvumAndRouteGeometryScenario() {
  const noOpLogger = { dev() {}, warn() {}, info() {}, error() {} };
  const loader = createTypeScriptLoader({
    '../ecsLogger': { ecsLog: noOpLogger },
  });
  const asyncState = loader.load(path.join(ROOT, 'lib', 'state', 'asyncSurfaceState.ts'));
  const asyncPresentation = loader.load(
    path.join(ROOT, 'lib', 'state', 'asyncSurfacePresentation.ts'),
  );
  const { NavigateMapLayerCoordinator } = loader.load(
    path.join(ROOT, 'lib', 'map', 'navigateMapLayerCoordinator.ts'),
  );
  const mvum = loader.load(path.join(ROOT, 'src', 'features', 'navigate', 'mvum', 'index.ts'));
  const viewport = loader.load(path.join(ROOT, 'lib', 'routeGeometryViewport.ts'));
  const bounds = { west: -121, south: 38, east: -120, north: 39 };
  const bbox = {
    minLatitude: bounds.south,
    minLongitude: bounds.west,
    maxLatitude: bounds.north,
    maxLongitude: bounds.east,
  };
  const clientBbox = {
    minLat: bounds.south,
    minLng: bounds.west,
    maxLat: bounds.north,
    maxLng: bounds.east,
  };

  const plan = mvum.planNavigateMvumViewportFetch({
    enabled: true,
    bbox,
    zoom: 12,
    online: true,
  });
  assert.strictEqual(plan.status, 'fetch_viewport');

  const rawViewportResponse = {
    ok: true,
    segments: [{
      id: 'runtime-segment',
      name: 'Runtime Segment',
      sourceKind: 'route_catalog',
      sourceId: 'runtime-segment',
      sourceLabel: 'USFS MVUM',
      dataState: 'live',
      confidence: 'high',
      legalityStatus: 'legal_verified',
      publicAccessStatus: 'open',
      warnings: [],
      geometry: {
        type: 'LineString',
        coordinates: [[-120.6, 39.2], [-120.5, 39.3]],
      },
    }],
    meta: {
      candidateCount: 1,
      cappedCount: 0,
      skippedMissingGeometryCount: 0,
      skippedClosedCount: 0,
      bboxFilterApplied: true,
    },
  };
  const normalized = viewport.normalizeRouteGeometryViewportResponse(rawViewportResponse);
  assert.strictEqual(normalized.segments.length, 1);

  let mvumClientRequest = null;
  const mvumClient = createTypeScriptLoader({
    '../../../../lib/routeGeometryViewportClient': {
      fetchRouteGeometryViewportSegments: async request => {
        mvumClientRequest = request;
        return normalized;
      },
    },
    '../../../../lib/supabase': {
      supabase: { functions: { invoke: async () => ({ data: null, error: null }) } },
    },
  }).load(path.join(ROOT, 'src', 'features', 'navigate', 'mvum', 'client.ts'));
  const mvumAbortController = new AbortController();
  const fetchedMvum = await mvumClient.fetchNavigateMvumViewportSegments({
    bbox: clientBbox,
    zoom: 12,
    limit: 240,
    signal: mvumAbortController.signal,
  });
  assert.strictEqual(fetchedMvum.segments.length, 1);
  assert.strictEqual(mvumClientRequest.sourceProviderPrefix, mvum.MVUM_SOURCE_PROVIDER_PREFIX);
  assert.strictEqual(mvumClientRequest.includeReferenceGeometry, true);
  assert.strictEqual(mvumClientRequest.signal, mvumAbortController.signal);

  const successfulViewportClient = createTypeScriptLoader({
    './supabase': {
      EDGE_FUNCTION_UNAVAILABLE_CODE: 'EDGE_FUNCTION_UNAVAILABLE',
      SUPABASE_CONFIG_UNAVAILABLE_CODE: 'SUPABASE_CONFIG_UNAVAILABLE',
      isDeployedEdgeFunction: () => true,
      isSupabaseConfigured: true,
      supabase: {
        functions: {
          invoke: async () => ({ data: rawViewportResponse, error: null }),
        },
      },
    },
  }).load(path.join(ROOT, 'lib', 'routeGeometryViewportClient.ts'));
  const fetchedRouteGeometry = await successfulViewportClient.fetchRouteGeometryViewportSegments({
    bbox: clientBbox,
    zoom: 12,
    timeoutMs: 250,
  });
  assert.strictEqual(
    fetchedRouteGeometry.segments.length,
    1,
    'The mounted Route Geometry provider client must normalize a successful fixture.',
  );

  let mvumState = asyncState.createECSAsyncSurfaceState({
    surfaceId: 'navigate_mvum_segments',
    provider: 'route-geometry-segments',
    now: 1_000,
  });
  mvumState = beginSurface(asyncState, mvumState, 'mvum-viewport-a', 1_010);
  mvumState = settleSurface(asyncState, mvumState, 'ready', {
    data: normalized,
    resultCount: normalized.segments.length,
    now: 1_020,
  });
  assert.strictEqual(mvumState.status, 'ready');
  assert.strictEqual(mvumState.resultCount, 1);

  let routeState = asyncState.createECSAsyncSurfaceState({
    surfaceId: 'navigate_route_geometry',
    provider: 'route-geometry-segments',
    now: 1_000,
  });
  routeState = beginSurface(asyncState, routeState, 'route-viewport-a', 1_010);
  routeState = settleSurface(asyncState, routeState, 'empty', {
    data: { ...normalized, segments: [] },
    resultCount: 0,
    now: 1_020,
  });
  assert.strictEqual(routeState.status, 'empty');
  assert.strictEqual(routeState.resultCount, 0);

  let mvumFailure = asyncState.createECSAsyncSurfaceState({
    surfaceId: 'navigate_mvum_segments',
    provider: 'route-geometry-segments',
    now: 2_000,
  });
  mvumFailure = beginSurface(asyncState, mvumFailure, 'mvum-provider-error', 2_010);
  mvumFailure = settleSurface(asyncState, mvumFailure, 'error', {
    resultCount: 0,
    safeErrorCode: 'MVUM_PROVIDER_UNAVAILABLE',
    retryEligible: true,
    providerStatus: 'unavailable',
    now: 2_020,
  });
  assert.strictEqual(mvumFailure.status, 'error');
  assert.strictEqual(mvumFailure.retryEligible, true);

  let routeFailure = asyncState.createECSAsyncSurfaceState({
    surfaceId: 'navigate_route_geometry',
    provider: 'route-geometry-segments',
    now: 2_000,
  });
  routeFailure = beginSurface(asyncState, routeFailure, 'route-provider-error', 2_010);
  routeFailure = settleSurface(asyncState, routeFailure, 'error', {
    resultCount: 0,
    safeErrorCode: 'ROUTE_GEOMETRY_PROVIDER_UNAVAILABLE',
    retryEligible: true,
    providerStatus: 'unavailable',
    now: 2_020,
  });
  assert.strictEqual(routeFailure.status, 'error');

  const presentations = [
    asyncPresentation.resolveECSAsyncSurfacePresentation(mvumState, { subject: 'MVUM segments' }),
    asyncPresentation.resolveECSAsyncSurfacePresentation(routeState, { subject: 'ECS route geometry' }),
    asyncPresentation.resolveECSAsyncSurfacePresentation(mvumFailure, { subject: 'MVUM segments' }),
    asyncPresentation.resolveECSAsyncSurfacePresentation(routeFailure, { subject: 'ECS route geometry' }),
  ];
  assert.deepStrictEqual(
    presentations.map(entry => entry.kind),
    ['ready', 'empty', 'provider_unavailable', 'provider_unavailable'],
  );
  assert(
    presentations.every(entry => entry.terminal && !entry.showSpinner),
    'Ready, empty, and provider failures must all remove the layer spinner.',
  );

  const coordinator = new NavigateMapLayerCoordinator();
  const oldRequest = scheduleLayer(coordinator, 'mvum', 'viewport-old', bounds, 3_000);
  const routeRequest = scheduleLayer(coordinator, 'route_geometry', 'viewport-route', bounds, 3_000);
  assert.strictEqual(coordinator.activeRequestCount, 2, 'The layer requests must remain independent.');
  const replacement = scheduleLayer(coordinator, 'mvum', 'viewport-new', bounds, 3_001);
  assert.strictEqual(oldRequest.signal.aborted, true, 'A new viewport must abort stale MVUM work.');
  assert.strictEqual(
    coordinator.complete(oldRequest, { itemCount: 99, sourceState: 'live', updatedAt: 3_002 }),
    false,
    'A stale viewport result must be rejected.',
  );
  assert.strictEqual(coordinator.complete(replacement, { itemCount: 1, sourceState: 'live', updatedAt: 3_003 }), true);
  assert.strictEqual(coordinator.complete(routeRequest, { itemCount: 0, sourceState: 'live', updatedAt: 3_003 }), true);
  assert.strictEqual(coordinator.getState('mvum').loading, false);
  assert.strictEqual(coordinator.getState('mvum').itemCount, 1);
  assert.strictEqual(coordinator.getState('route_geometry').loading, false);
  assert.strictEqual(coordinator.getState('route_geometry').itemCount, 0);
  assert.strictEqual(coordinator.getDiagnostics().staleResponseCount, 1);

  let providerSignal = null;
  const providerLoader = createTypeScriptLoader({
    './supabase': {
      EDGE_FUNCTION_UNAVAILABLE_CODE: 'EDGE_FUNCTION_UNAVAILABLE',
      SUPABASE_CONFIG_UNAVAILABLE_CODE: 'SUPABASE_CONFIG_UNAVAILABLE',
      isDeployedEdgeFunction: () => true,
      isSupabaseConfigured: true,
      supabase: {
        functions: {
          invoke(_name, options) {
            providerSignal = options.signal;
            return new Promise(() => {});
          },
        },
      },
    },
  });
  const viewportClient = providerLoader.load(
    path.join(ROOT, 'lib', 'routeGeometryViewportClient.ts'),
  );
  const timeoutRequest = scheduleLayer(
    coordinator,
    'route_geometry',
    'viewport-timeout',
    bounds,
    4_000,
  );
  let timeoutError = null;
  try {
    await viewportClient.fetchRouteGeometryViewportSegments({
      bbox: { minLng: -121, minLat: 38, maxLng: -120, maxLat: 39 },
      zoom: 12,
      timeoutMs: 15,
    });
  } catch (error) {
    timeoutError = error;
  }
  assert.strictEqual(
    timeoutError?.name,
    'RouteGeometryViewportTimeoutError',
    'A non-settling layer provider must fail through the bounded timeout path.',
  );
  assert.strictEqual(
    coordinator.fail(timeoutRequest, timeoutError, {
      sourceState: 'unavailable',
      retainItemCount: false,
    }),
    true,
  );
  assert.strictEqual(coordinator.getState('route_geometry').loading, false);
  assert.strictEqual(coordinator.getState('route_geometry').sourceState, 'unavailable');
  assert.strictEqual(providerSignal?.aborted, true, 'Provider timeout must abort its transport signal.');
}

const SCENARIOS = Object.freeze([
  {
    scenario: 'dashboard_weather',
    qualifiedTestIdentity: 'ecs.runtime.fast.dashboard_weather.live_and_cached',
    sourceFixtureProvider: 'fixture:openweather_one_call_normalized',
    failureSafeCode: 'dashboard_weather_behavior_failed',
    deviceEvidenceStillRequired: [
      'configured_provider_mobile_request',
      'dashboard_provider_timestamp_visual_evidence',
      'offline_transition_evidence',
    ],
    run: verifyDashboardWeatherScenario,
  },
  {
    scenario: 'terrain_risk',
    qualifiedTestIdentity: 'ecs.runtime.fast.terrain_risk.profile_and_missing_elevation',
    sourceFixtureProvider: 'fixture:canonical_guidance_elevation_profile',
    failureSafeCode: 'terrain_risk_behavior_failed',
    deviceEvidenceStillRequired: [
      'dashboard_svg_profile_phone_landscape_evidence',
    ],
    run: verifyTerrainRiskScenario,
  },
  {
    scenario: 'draw_route',
    qualifiedTestIdentity: 'ecs.runtime.fast.draw_route.pre_preview_draft_lifecycle',
    sourceFixtureProvider: 'fixture:route_builder_anchor_trace',
    failureSafeCode: 'draw_route_behavior_failed',
    deviceEvidenceStillRequired: [
      'mapbox_native_draft_pre_preview_evidence',
      'orientation_map_style_reload_evidence',
    ],
    run: verifyDrawRouteScenario,
  },
  {
    scenario: 'guidance_snapping',
    qualifiedTestIdentity: 'ecs.runtime.fast.guidance_snapping.canonical_projection',
    sourceFixtureProvider: 'fixture:canonical_route_projection',
    failureSafeCode: 'guidance_snapping_behavior_failed',
    deviceEvidenceStillRequired: [
      'device_gps_canonical_route_trace',
      'field_off_route_behavior',
    ],
    run: verifyGuidanceSnappingScenario,
  },
  {
    scenario: 'mvum_and_route_geometry',
    qualifiedTestIdentity: 'ecs.runtime.fast.navigate_layers.independent_terminals_and_stale_viewport',
    sourceFixtureProvider: 'fixture:route_geometry_segments_normalized',
    failureSafeCode: 'navigate_layers_behavior_failed',
    deviceEvidenceStillRequired: [
      'mapbox_source_layer_rendering_evidence',
      'android_pan_zoom_cancellation_request_count',
      'configured_supabase_provider_evidence',
    ],
    run: verifyMvumAndRouteGeometryScenario,
  },
]);

async function runScenario(definition, options) {
  const startedAt = performance.now();
  try {
    await runWithTimeout(
      () => withFixedClock(definition.run),
      options.timeoutMs,
      `${definition.scenario}_timeout`,
    );
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
    if (process.env.ECS_RUNTIME_REGRESSION_DEBUG === '1') {
      process.stderr.write(`${error?.stack ?? String(error)}\n`);
    }
    return {
      scenario: definition.scenario,
      status: error?.isScenarioTimeout ? 'timed_out' : 'failed',
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      sourceFixtureProvider: definition.sourceFixtureProvider,
      failureSafeCode: error?.safeCode || definition.failureSafeCode,
      deviceEvidenceStillRequired: definition.deviceEvidenceStillRequired,
      qualifiedTestIdentity: definition.qualifiedTestIdentity,
    };
  }
}

async function runFastCoreScenarios(options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? Math.max(50, Math.trunc(options.timeoutMs))
    : DEFAULT_SCENARIO_TIMEOUT_MS;
  const startedAt = performance.now();
  const results = [];
  const previousDev = global.__DEV__;
  global.__DEV__ = false;
  try {
    for (const definition of SCENARIOS) {
      results.push(await runScenario(definition, { timeoutMs }));
    }
  } finally {
    if (typeof previousDev === 'undefined') delete global.__DEV__;
    else global.__DEV__ = previousDev;
  }
  const failed = results.filter(result => result.status !== 'passed').length;
  return {
    lane: 'runtime-regression:fast:core',
    generatedAt: new Date(FIXED_NOW_MS).toISOString(),
    summary: {
      passed: results.length - failed,
      failed,
      total: results.length,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    },
    results,
  };
}

module.exports = {
  FAST_CORE_SCENARIO_IDS,
  runFastCoreScenarios,
};

if (require.main === module) {
  const json = process.argv.includes('--json');
  runFastCoreScenarios()
    .then(report => {
      if (json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      } else {
        for (const result of report.results) {
          process.stdout.write(`${result.status.toUpperCase()} ${result.scenario} (${result.durationMs}ms)\n`);
        }
      }
      if (report.summary.failed > 0) process.exitCode = 1;
    })
    .catch(() => {
      process.stderr.write('Runtime regression core runner failed before producing results.\n');
      process.exitCode = 1;
    });
}
