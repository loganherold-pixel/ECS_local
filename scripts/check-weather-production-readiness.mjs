import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const RESULT_RELATIVE_PATH = path.join('.smoke', 'weather-production-readiness-result.json');
const EVIDENCE_RELATIVE_PATH = path.join('.smoke', 'weather-production-evidence.json');

function relPath(root, filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/');
}

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function readJsonIfExists(filePath) {
  try {
    return JSON.parse(readIfExists(filePath));
  } catch {
    return null;
  }
}

function walkFiles(dir, matcher, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(fullPath, matcher, out);
    else if (matcher(fullPath)) out.push(fullPath);
  }
  return out;
}

function check(id, label, passed, evidence = [], remediation = []) {
  return {
    id,
    label,
    passed: Boolean(passed),
    evidence,
    remediation,
  };
}

function evidenceTrue(evidence, key) {
  return evidence?.[key] === true;
}

function accepted(value) {
  return String(value ?? '').trim().toLowerCase() === 'accepted';
}

function directWeatherEdgeInvocations(root) {
  const files = [
    ...walkFiles(path.join(root, 'app'), (file) => /\.(ts|tsx)$/.test(file)),
    ...walkFiles(path.join(root, 'components'), (file) => /\.(ts|tsx)$/.test(file)),
    ...walkFiles(path.join(root, 'lib'), (file) => /\.(ts|tsx)$/.test(file)),
  ];
  return files
    .filter((file) => !/[\\/]lib[\\/]weather(Store|Service|EdgeFunctionSpec)\.ts$/.test(file))
    .filter((file) => readIfExists(file).includes("supabase.functions.invoke('get-weather'"))
    .map((file) => relPath(root, file));
}

export function buildWeatherProductionReadinessResult(options = {}) {
  const root = options.rootDir ?? process.cwd();
  const paths = {
    result: path.join(root, RESULT_RELATIVE_PATH),
    evidence: path.join(root, EVIDENCE_RELATIVE_PATH),
    weatherService: path.join(root, 'lib', 'weatherService.ts'),
    weatherStore: path.join(root, 'lib', 'weatherStore.ts'),
    useOperationalWeather: path.join(root, 'lib', 'useOperationalWeather.ts'),
    weatherFreshness: path.join(root, 'lib', 'weatherFreshness.ts'),
    ecsWeather: path.join(root, 'lib', 'ecsWeather.ts'),
    weatherDiagnostics: path.join(root, 'lib', 'weatherDiagnostics.ts'),
    weatherBriefPublisher: path.join(root, 'lib', 'weatherBriefPublisher.ts'),
    dispatchLiveAggregator: path.join(root, 'lib', 'dispatchLiveAggregator.ts'),
    navigate: path.join(root, 'app', '(tabs)', 'navigate.tsx'),
    weatherIntelPanel: path.join(root, 'components', 'weather', 'WeatherIntelPanel.tsx'),
    routeCorridorWeather: path.join(root, 'components', 'navigate', 'RouteCorridorWeather.tsx'),
    widgetRenderers: path.join(root, 'components', 'dashboard', 'WidgetRenderers.tsx'),
    weatherEdgeFunction: path.join(root, 'supabase', 'functions', 'get-weather', 'index.ts'),
  };

  const evidence = readJsonIfExists(paths.evidence);
  const weatherService = readIfExists(paths.weatherService);
  const weatherStore = readIfExists(paths.weatherStore);
  const useOperationalWeather = readIfExists(paths.useOperationalWeather);
  const weatherFreshness = readIfExists(paths.weatherFreshness);
  const ecsWeather = readIfExists(paths.ecsWeather);
  const weatherDiagnostics = readIfExists(paths.weatherDiagnostics);
  const weatherBriefPublisher = readIfExists(paths.weatherBriefPublisher);
  const dispatchLiveAggregator = readIfExists(paths.dispatchLiveAggregator);
  const navigate = readIfExists(paths.navigate);
  const weatherIntelPanel = readIfExists(paths.weatherIntelPanel);
  const routeCorridorWeather = readIfExists(paths.routeCorridorWeather);
  const widgetRenderers = readIfExists(paths.widgetRenderers);
  const weatherEdgeFunction = readIfExists(paths.weatherEdgeFunction);
  const directInvocations = directWeatherEdgeInvocations(root);

  const checks = [
    check(
      'coordinate_first_shared_weather_source_of_truth',
      'Weather surfaces use a shared coordinate-first source of truth rather than direct provider calls.',
      weatherService.includes('export async function fetchSharedWeatherForCoordinates') &&
        weatherService.includes('resolveECSWeatherTarget') &&
        weatherService.includes('normalizeWeatherCoordinates') &&
        weatherStore.includes("supabase.functions.invoke('get-weather'") &&
        useOperationalWeather.includes('fetchSharedWeatherForCoordinates') &&
        weatherIntelPanel.includes('fetchSharedWeatherForCoordinates') &&
        routeCorridorWeather.includes('fetchSharedWeatherForCoordinates') &&
        directInvocations.length === 0,
      [
        relPath(root, paths.weatherService),
        relPath(root, paths.weatherStore),
        relPath(root, paths.useOperationalWeather),
        ...directInvocations,
      ],
      ['Keep OpenWeather/NWS/provider invocation behind the shared service/store facade only.'],
    ),
    check(
      'freshness_stale_cache_and_permission_states_are_explicit',
      'Weather freshness, stale cache, missing data, and permission-required states are explicit.',
      weatherFreshness.includes('export function getWeatherFreshness') &&
      weatherFreshness.includes("'fresh'") &&
        weatherFreshness.includes("'stale'") &&
        weatherFreshness.includes("'missing'") &&
        ecsWeather.includes('kind: statusKind') &&
        ecsWeather.includes("'permission_required'") &&
        ecsWeather.includes("'stale'") &&
        widgetRenderers.includes("'Enable location for live forecast.'") &&
        widgetRenderers.includes("'Using cached forecast.'") &&
        widgetRenderers.includes("'Forecast unavailable.'") &&
        widgetRenderers.includes("'Set location to enable forecast.'"),
      [relPath(root, paths.weatherFreshness), relPath(root, paths.ecsWeather), relPath(root, paths.widgetRenderers)],
      ['Do not present stale, cached, missing, or permission-blocked weather as live.'],
    ),
    check(
      'operational_weather_dedupes_requests_and_retains_last_good_state',
      'Operational weather dedupes request loops, shares consumers, and retains last-good state through transitions.',
      useOperationalWeather.includes('operationalWeatherHookRequests') &&
        useOperationalWeather.includes('lastRequestedRequestKeyRef') &&
        useOperationalWeather.includes('inFlightRequestKeyRef') &&
        useOperationalWeather.includes('subscribeSharedOperationalWeather') &&
        useOperationalWeather.includes('SHARED_NO_CONSUMER_GRACE_MS') &&
        useOperationalWeather.includes("logWeatherRetention('last_good_weather_retained'") &&
        useOperationalWeather.includes('WEATHER_EXPIRED_WARNING_THROTTLE_MS') &&
        !useOperationalWeather.includes('fetchWeatherForLocation('),
      [relPath(root, paths.useOperationalWeather)],
      ['Keep weather fetch loops coalesced and route transitions from clearing useful last-good data.'],
    ),
    check(
      'dispatch_and_command_brief_weather_updates_are_deduped_and_freshness_labeled',
      'Dispatch/CAD and ECS Brief weather advisories are deduped and include freshness/source context.',
      weatherBriefPublisher.includes('SHARED_WEATHER_BRIEF_COOLDOWN_MS') &&
        weatherBriefPublisher.includes('publishSharedWeatherBriefAdvisories') &&
        dispatchLiveAggregator.includes('buildWeatherEvents') &&
        dispatchLiveAggregator.includes('dedupeWeatherEvents') &&
        dispatchLiveAggregator.includes('Source freshness: ${freshnessLabel}.') &&
        dispatchLiveAggregator.includes('capStaleWeatherSeverity') &&
        navigate.includes('weatherSeveritySummary') &&
        navigate.includes('routeCorridorWeather.source') &&
        navigate.includes('routeCorridorWeather.lastFetchAt'),
      [
        relPath(root, paths.weatherBriefPublisher),
        relPath(root, paths.dispatchLiveAggregator),
        relPath(root, paths.navigate),
      ],
      ['Keep repeated weather advisories suppressed and stale weather severity capped/labeled.'],
    ),
    check(
      'route_weather_hazard_toasts_require_current_or_fresh_source',
      'Route-corridor weather hazard haptics/toasts require live or fresh-cache weather, while stale/fallback weather remains visual/reference only.',
      routeCorridorWeather.includes('function shouldEmitRouteWeatherHazardToast') &&
        routeCorridorWeather.includes("return source === 'live' || source === 'cache_fresh';") &&
        routeCorridorWeather.includes('emitToasts && shouldEmitRouteWeatherHazardToast(result.source) && newHazards.length > 0') &&
        routeCorridorWeather.includes("if (source === 'cache_stale') return 'Offline • last known route weather';") &&
        routeCorridorWeather.includes("if (source === 'fallback') return 'Route weather unavailable';"),
      [relPath(root, paths.routeCorridorWeather)],
      ['Do not haptic/toast stale or fallback route-weather hazards as if they are current live warnings.'],
    ),
    check(
      'dev_diagnostics_redact_provider_endpoints_and_secrets',
      'Weather diagnostics redact provider endpoints/secrets and remain dev-gated.',
      weatherDiagnostics.includes('sanitizeWeatherProviderEndpoint') &&
        weatherDiagnostics.includes('DEFAULT_WEATHER_PROVIDER_ENDPOINT') &&
        weatherDiagnostics.includes('devOnly') &&
        weatherDiagnostics.includes('WEATHER_DIAGNOSTICS_DEBUG_FLAG') &&
        !weatherDiagnostics.includes('appid=secret-key') &&
        weatherEdgeFunction.includes('OPENWEATHER_API_KEY') &&
        !weatherService.includes('OPENWEATHER_API_KEY') &&
        !navigate.includes('OPENWEATHER_API_KEY'),
      [relPath(root, paths.weatherDiagnostics), relPath(root, paths.weatherEdgeFunction)],
      ['Keep weather provider keys server-side and redact URLs/tokens in diagnostics.'],
    ),
    check(
      'real_provider_source_freshness_evidence_present',
      'Real provider source, coverage, freshness, stale, and error-rate evidence is recorded.',
      evidenceTrue(evidence, 'realProviderSourceFreshnessValidated'),
      [relPath(root, paths.evidence)],
      ['Run weather provider validation against real upstream outputs and record coverage/freshness/error evidence.'],
    ),
    check(
      'android_route_weather_visual_evidence_present',
      'Android route weather overlays/detail panels are verified with real route context.',
      evidenceTrue(evidence, 'androidRouteWeatherVisualQaPassed'),
      [relPath(root, paths.evidence)],
      ['Capture Navigate route weather timeline, detail modal, and active-guidance non-overlap on Android.'],
    ),
    check(
      'weather_alert_dispatch_brief_e2e_evidence_present',
      'Weather alert to Dispatch/CAD/ECS Brief dedupe behavior is verified end to end.',
      evidenceTrue(evidence, 'weatherAlertDispatchBriefE2ePassed'),
      [relPath(root, paths.evidence)],
      ['Exercise a real or approved staging alert and verify brief/CAD dedupe and freshness labels.'],
    ),
    check(
      'offline_stale_weather_device_evidence_present',
      'Offline/stale weather labeling is verified on device.',
      evidenceTrue(evidence, 'offlineStaleWeatherDeviceQaPassed'),
      [relPath(root, paths.evidence)],
      ['Capture cached/stale/no-provider weather states on Android without presenting them as live.'],
    ),
    check(
      'production_owner_decision_accepted',
      'Production owner decision is accepted for weather and route hazard intelligence.',
      accepted(evidence?.productionDecision),
      [relPath(root, paths.evidence)],
      ['Record product, engineering, field-ops, and QA acceptance after provider and Android evidence are complete.'],
    ),
  ];

  const failed = checks.filter((item) => !item.passed);
  return {
    passed: failed.length === 0,
    status: failed.length === 0 ? 'production_ready' : 'blocked',
    statusLabel: failed.length === 0 ? 'Production ready' : 'Blocked for production',
    checkedAt: new Date().toISOString(),
    system: 'weather_route_hazard_intelligence',
    checks,
    blockers: failed.map((item) => item.id),
    remediation: failed.flatMap((item) => item.remediation),
    notes: [
      'This gate separates weather/hazard code readiness from real provider and Android field evidence.',
      'Weather may inform safety-critical UI only when source, freshness, and stale/cache labels remain visible.',
      'Provider keys must remain server-side and diagnostics must redact provider endpoint secrets.',
    ],
  };
}

export function writeWeatherProductionReadinessResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const resultPath = path.join(root, RESULT_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return resultPath;
}

export function formatWeatherProductionReadinessResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const lines = [
    `Weather production readiness: ${result.statusLabel}`,
    `Result file: ${relPath(root, path.join(root, RESULT_RELATIVE_PATH))}`,
    `Checked at: ${result.checkedAt}`,
    `Production ready: ${result.passed ? 'yes' : 'no'}`,
    '',
    'Checks:',
  ];
  for (const item of result.checks) lines.push(`- ${item.label}: ${item.passed ? 'pass' : 'blocked'}`);
  if (result.blockers.length > 0) {
    lines.push('', 'Active blockers:');
    for (const blocker of result.blockers) lines.push(`- ${blocker}`);
  }
  if (result.remediation.length > 0) {
    lines.push('', 'Next actions:');
    for (const item of Array.from(new Set(result.remediation))) lines.push(`- ${item}`);
  }
  lines.push('', 'Notes:');
  for (const note of result.notes) lines.push(`- ${note}`);
  return `${lines.join('\n')}\n`;
}

async function main() {
  const jsonOnly = process.argv.includes('--json');
  const result = buildWeatherProductionReadinessResult();
  writeWeatherProductionReadinessResult(result);
  if (jsonOnly) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else process.stdout.write(formatWeatherProductionReadinessResult(result));
  return result.passed ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
