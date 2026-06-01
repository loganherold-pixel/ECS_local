const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

Module._extensions['.ts'] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function loadTypeScriptModule(relativePath) {
  const fullPath = path.join(root, relativePath);
  return require(fullPath);
}

function assertIncludes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

const {
  resolveWeatherLocation,
  resolveWeatherLocationWithReverseGeocode,
  WEATHER_LOCATION_UNAVAILABLE,
} = loadTypeScriptModule('lib/weatherLocationResolver.ts');
const { buildECSWeatherSnapshot } = loadTypeScriptModule('lib/ecsWeather.ts');
const {
  createWeatherDiagnostics,
  sanitizeWeatherProviderEndpoint,
  DEFAULT_WEATHER_PROVIDER_ENDPOINT,
} = loadTypeScriptModule('lib/weatherDiagnostics.ts');
const {
  publishSharedWeatherBriefAdvisories,
  resetSharedWeatherBriefPublisherForTests,
  SHARED_WEATHER_BRIEF_COOLDOWN_MS,
} = loadTypeScriptModule('lib/weatherBriefPublisher.ts');
const { briefCadLogStore } = loadTypeScriptModule('lib/briefCadLogStore.ts');

const rocklin = { lat: 38.7907, lng: -121.2358 };
const sacramento = { lat: 38.5816, lng: -121.4944 };
const routePoint = { lat: 39.1123, lng: -121.2022 };
const campPoint = { lat: 39.2455, lng: -120.9021 };

function makeWeatherFetchResult(overrides = {}) {
  const nowIso = new Date().toISOString();
  return {
    source: 'live',
    cachedAt: Date.parse(nowIso),
    error: null,
    data: {
      fetched_at: nowIso,
      units: 'imperial',
      results: [{
        lat: rocklin.lat,
        lng: rocklin.lng,
        label: '38.79, -121.24',
        error: null,
        current: {
          temp: 72,
          feels_like: 72,
          temp_min: 61,
          temp_max: 78,
          humidity: 20,
          pressure: 1010,
          visibility: 10000,
          wind_speed: 8,
          wind_deg: 180,
          wind_gust: null,
          clouds: 0,
          weather_id: 800,
          weather_main: 'Clear',
          weather_description: 'clear sky',
          weather_icon: '01d',
          rain_1h: null,
          rain_3h: null,
          snow_1h: null,
          snow_3h: null,
          sunrise: null,
          sunset: null,
          location_name: 'Sacramento',
          dt: Date.parse(nowIso) / 1000,
        },
        forecast: [],
        alerts: [],
        trail_conditions: null,
      }],
    },
    ...overrides,
  };
}

async function run() {
  const gpsOverFallback = resolveWeatherLocation({
    currentGps: {
      coordinate: rocklin,
      label: 'Rocklin',
      labelSource: 'reverse_geocode',
      hasFix: true,
      accuracyM: 18,
    },
    manualFallback: {
      coordinate: sacramento,
      label: 'Manual Sacramento',
      labelSource: 'manual',
      explicitlySelected: true,
    },
    lastKnown: {
      coordinate: sacramento,
      label: 'Last Known Sacramento',
      cachedAt: Date.now(),
    },
  });
  assert.strictEqual(gpsOverFallback.source, 'current_gps', 'GPS should win over manual and last-known fallback weather coordinates.');
  assert.strictEqual(gpsOverFallback.displayLabel, 'Rocklin');
  assert.strictEqual(gpsOverFallback.labelConfidence, 'high');

  const selectedCampOverFallback = resolveWeatherLocation({
    selectedCoordinate: {
      coordinate: campPoint,
      label: 'Camp Weather Point',
      labelSource: 'selected',
    },
    activeRoute: {
      coordinate: routePoint,
      label: 'Route Weather Point',
      labelSource: 'route',
    },
    manualFallback: {
      coordinate: sacramento,
      label: 'Manual Sacramento',
      labelSource: 'manual',
      explicitlySelected: true,
    },
  });
  assert.strictEqual(selectedCampOverFallback.source, 'active_route', 'Route forecast context should win over selected camp when route-specific weather is requested.');

  const selectedCampWhenNoRoute = resolveWeatherLocation({
    selectedCoordinate: {
      coordinate: campPoint,
      label: 'Camp Weather Point',
      labelSource: 'selected',
    },
    manualFallback: {
      coordinate: sacramento,
      label: 'Manual Sacramento',
      labelSource: 'manual',
      explicitlySelected: true,
    },
  });
  assert.strictEqual(selectedCampWhenNoRoute.source, 'selected_coordinate', 'Selected camp/map coordinates should win over fallback when no active route is being forecast.');
  assert.strictEqual(selectedCampWhenNoRoute.displayLabel, 'Camp Weather Point');

  const deniedPermission = resolveWeatherLocation({
    currentGpsPermissionDenied: true,
  });
  assert.strictEqual(deniedPermission.status, 'unavailable');
  assert.strictEqual(deniedPermission.displayLabel, WEATHER_LOCATION_UNAVAILABLE);
  assert.match(deniedPermission.unavailableReason || '', /permission/i, 'Denied location permission should be explicit.');

  const permissionSnapshot = buildECSWeatherSnapshot({
    result: null,
    permissionBlocked: true,
    locationResolution: deniedPermission,
  });
  assert.strictEqual(permissionSnapshot.status.kind, 'permission_required', 'Denied permission should produce a permission_required UI state.');

  const reverseGeocodeNull = await resolveWeatherLocationWithReverseGeocode({
    currentGps: {
      coordinate: rocklin,
      hasFix: true,
      accuracyM: 20,
    },
  }, async () => null);
  assert.strictEqual(reverseGeocodeNull.displayLabel, '38.79, -121.24', 'Reverse geocode miss should fall back to coordinates.');
  assert.notStrictEqual(reverseGeocodeNull.displayLabel, 'Sacramento', 'Reverse geocode miss must not invent a city.');

  const reverseGeocodeFailure = await resolveWeatherLocationWithReverseGeocode({
    currentGps: {
      coordinate: rocklin,
      hasFix: true,
      accuracyM: 20,
    },
  }, async () => {
    throw new Error('reverse geocoder offline');
  });
  assert.strictEqual(reverseGeocodeFailure.displayLabel, '38.79, -121.24', 'Reverse geocode failure should still use a coordinate label.');

  const previousSacramento = resolveWeatherLocation({
    selectedCoordinate: {
      coordinate: sacramento,
      label: 'Sacramento',
      labelSource: 'reverse_geocode',
    },
  });
  const movedToRocklin = resolveWeatherLocation({
    currentGps: {
      coordinate: rocklin,
      hasFix: true,
      accuracyM: 22,
    },
    previousLocation: previousSacramento,
  });
  assert.strictEqual(movedToRocklin.shouldInvalidateLabel, true, 'Meaningful coordinate changes should invalidate stale place labels.');
  assert.strictEqual(movedToRocklin.shouldRefreshWeather, true, 'Meaningful coordinate changes should request a forecast refresh.');
  assert.notStrictEqual(movedToRocklin.displayLabel, 'Sacramento');

  const liveSnapshot = buildECSWeatherSnapshot({
    result: makeWeatherFetchResult(),
    sourceType: 'current_location',
    locationResolution: movedToRocklin,
  });
  assert.strictEqual(liveSnapshot.locationName, '38.79, -121.24', 'Provider city names should not override resolver labels.');
  assert.strictEqual(liveSnapshot.status.kind, 'live');

  const staleSnapshot = buildECSWeatherSnapshot({
    result: makeWeatherFetchResult({
      source: 'cache_stale',
      cachedAt: Date.now() - 3 * 60 * 60 * 1000,
      error: 'Provider unavailable; using stale cache',
    }),
    sourceType: 'current_location',
    locationResolution: movedToRocklin,
  });
  assert.strictEqual(staleSnapshot.status.kind, 'stale', 'Stale cached weather should be labeled stale.');
  assert.strictEqual(staleSnapshot.status.stale, true);

  assert.doesNotThrow(() => buildECSWeatherSnapshot({
    result: makeWeatherFetchResult({
      data: {
        fetched_at: '2026-05-05T16:00:00.000Z',
        units: 'imperial',
        results: [{
          lat: rocklin.lat,
          lng: rocklin.lng,
          label: 'Partial Forecast Point',
          current: {
            temp: 64,
            weather_main: 'Clouds',
            weather_description: 'cloudy',
          },
        }],
      },
    }),
    sourceType: 'current_location',
    locationResolution: movedToRocklin,
  }), 'Dashboard Weather widget snapshot creation should tolerate partial provider data.');

  const diagnostics = createWeatherDiagnostics({
    location: movedToRocklin,
    snapshot: staleSnapshot,
    result: makeWeatherFetchResult({ source: 'cache_stale', error: 'provider timeout' }),
    providerEndpoint: 'https://api.openweathermap.org/data/3.0/onecall?lat=38.79&lon=-121.24&appid=secret-key',
    nowMs: Date.now(),
  });
  assert.strictEqual(diagnostics.devOnly, true);
  assert.strictEqual(diagnostics.selectedCoordinateSource, 'current_gps');
  assert.strictEqual(diagnostics.lat, rocklin.lat);
  assert.strictEqual(diagnostics.lon, rocklin.lng);
  assert.strictEqual(diagnostics.accuracyMeters, 22);
  assert.strictEqual(diagnostics.resolvedPlaceLabel, '38.79, -121.24');
  assert.strictEqual(diagnostics.weatherState, 'stale');
  assert.strictEqual(diagnostics.lastProviderError, 'provider timeout');
  assert.strictEqual(diagnostics.diagnosticHint, 'provider_error');
  assert(!diagnostics.providerEndpoint.includes('secret-key'), 'Weather diagnostics must not expose API keys.');
  assert.strictEqual(sanitizeWeatherProviderEndpoint(null), DEFAULT_WEATHER_PROVIDER_ENDPOINT);
  assert(!sanitizeWeatherProviderEndpoint('get-weather?token=abc123').includes('abc123'), 'Token-like provider endpoint values should be redacted.');

  const weatherStoreSource = read('lib/weatherStore.ts');
  assertIncludes(weatherStoreSource, "invokeWeatherEdgeFunction({ coordinates, units })", 'Forecast fetches should use coordinate arrays for route/shared weather.');
  assertIncludes(weatherStoreSource, "invokeWeatherEdgeFunction({ lat, lon, units })", 'Single-location weather fetches should send lat/lon, not city names.');

  const weatherServiceSource = read('lib/weatherService.ts');
  assertIncludes(weatherServiceSource, 'const fallbackSnapshots = hasUsableWeatherFetchResult(result)', 'Shared weather service should keep recent valid snapshots for provider failure fallback.');
  assertIncludes(weatherServiceSource, 'getRecentValidSnapshots(requestCoordinates, units)', 'Provider failure should use recent coordinate-keyed weather cache when available.');

  const operationalWeatherSource = read('lib/useOperationalWeather.ts');
  assertIncludes(operationalWeatherSource, 'lastRequestedRequestKeyRef', 'Weather hook should guard repeated requests across rerenders.');
  assertIncludes(operationalWeatherSource, 'inFlightRequestKeyRef', 'Weather hook should avoid duplicate in-flight fetches.');
  assertIncludes(operationalWeatherSource, 'logWeatherDiagnostics({', 'Shared operational weather should emit debug-gated diagnostics.');

  const diagnosticsSource = read('lib/weatherDiagnostics.ts');
  assertIncludes(diagnosticsSource, "debugFlag: WEATHER_DIAGNOSTICS_DEBUG_FLAG", 'Weather diagnostics logs should be gated behind the explicit weather debug flag.');
  assertIncludes(diagnosticsSource, "tag: WEATHER_DIAGNOSTICS_TAG", 'Weather diagnostics logs should be easy to filter in dev consoles.');

  const dashboardSource = read('components/dashboard/WidgetRenderers.tsx');
  assertIncludes(dashboardSource, "'Enable location for live forecast.'", 'Dashboard Weather widget should handle permission-required state.');
  assertIncludes(dashboardSource, "'Using cached forecast.'", 'Dashboard Weather widget should handle provider error with cache.');
  assertIncludes(dashboardSource, "'Forecast unavailable.'", 'Dashboard Weather widget should handle provider error without cache.');
  assertIncludes(dashboardSource, "'Set location to enable forecast.'", 'Dashboard Weather widget should handle unresolved location.');
  assertIncludes(dashboardSource, '<WeatherIntelPanel', 'Dashboard Weather detail popup should use the shared weather detail panel.');

  const weatherPanelSource = read('components/weather/WeatherIntelPanel.tsx');
  assertIncludes(weatherPanelSource, 'weatherSnapshot?.status.kind', 'Weather detail panel should render by shared weather state.');
  assertIncludes(weatherPanelSource, 'stalenessInfo', 'Weather detail panel should expose cached/stale age.');
  assertIncludes(dashboardSource, 'formatDashboardWeatherLocationConfidence(snapshot)', 'Dashboard Weather detail popup should expose location confidence.');

  const navigateSource = read('app/(tabs)/navigate.tsx');
  assertIncludes(navigateSource, 'const hideWeatherTopOverlays = !topStatusOverlaysVisible || topRouteSurfaceVisible', 'Navigate weather overlays should stay out of active/preview guidance.');
  assertIncludes(navigateSource, "const mapToastAttachedToGuidance = navigationOverlayMode === 'active'", 'Navigate weather notifications should attach below active guidance.');
  assertIncludes(navigateSource, 'zIndex={mapToastAttachedToGuidance ? 84 : undefined}', 'Navigate weather toasts should not cover active guidance.');

  resetSharedWeatherBriefPublisherForTests();
  briefCadLogStore.clear();
  const advisorySnapshot = buildECSWeatherSnapshot({
    result: makeWeatherFetchResult({
      data: {
        fetched_at: '2026-05-05T16:00:00.000Z',
        units: 'imperial',
        results: [{
          lat: rocklin.lat,
          lng: rocklin.lng,
          label: 'Storm Point',
          current: {
            temp: 36,
            feels_like: 34,
            visibility: 600,
            wind_speed: 42,
            wind_gust: 48,
            weather_main: 'Thunderstorm',
            weather_description: 'Thunderstorm with high wind',
          },
          forecast: [],
          alerts: [{
            event: 'Severe Thunderstorm Warning',
            sender_name: 'Provider',
            start: Date.parse('2026-05-05T16:00:00.000Z') / 1000,
            end: Date.parse('2026-05-05T18:00:00.000Z') / 1000,
            description: 'Severe storms possible.',
            tags: ['Thunderstorm'],
          }],
        }],
      },
    }),
    sourceType: 'current_location',
    locationResolution: movedToRocklin,
  });
  const firstPublish = publishSharedWeatherBriefAdvisories(advisorySnapshot, { now: 1_000_000 });
  const secondPublish = publishSharedWeatherBriefAdvisories(advisorySnapshot, { now: 1_000_000 + 30_000 });
  assert(firstPublish.emitted > 0, 'Meaningful Dispatch/ECS Brief weather advisories should publish once.');
  assert.strictEqual(secondPublish.emitted, 0, 'Dispatch/ECS Brief weather advisories should dedupe repeated alerts inside cooldown.');
  assert.strictEqual(briefCadLogStore.getEntries().length, firstPublish.emitted, 'Deduped weather advisories should not add repeated CAD/ECS Brief entries.');
  const thirdPublish = publishSharedWeatherBriefAdvisories(advisorySnapshot, {
    now: 1_000_000 + SHARED_WEATHER_BRIEF_COOLDOWN_MS + 1,
  });
  assert(thirdPublish.emitted > 0, 'Dispatch weather advisories should be eligible again after cooldown.');

  const packageJson = JSON.parse(read('package.json'));
  assert.strictEqual(
    packageJson.scripts['test:weather-live-readiness'],
    'node ./scripts/test-weather-live-readiness-diagnostics.js',
    'Weather live-readiness diagnostics test should be available from package scripts.',
  );

  console.log('Weather live-readiness diagnostics checks passed.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
