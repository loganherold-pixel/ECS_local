const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const source = fs
  .readFileSync(path.join(root, 'lib', 'useOperationalWeather.ts'), 'utf8')
  .replace(/\r\n/g, '\n');

function assertIncludes(fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function assertNotIncludes(fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

assertIncludes(
  'function weatherResultSignature(',
  'Operational weather should compare result signatures before writing React state.',
);
assertIncludes(
  'let sharedWeatherStateSignature',
  'Shared operational weather should dedupe identical store notifications.',
);
assertIncludes(
  'let sharedWeatherNoConsumerClearLogged = false;',
  'Shared operational weather should remember no-consumer cleanup so startup remounts do not spam clears.',
);
assertIncludes(
  'let sharedWeatherLastNoConsumerClearSignature: string | null = null;',
  'Shared operational weather should remember the last no-consumer clear signature across remount windows.',
);
assertIncludes(
  'function weatherConsumerSignature(',
  'Shared operational weather consumers should be compared by stable scalar inputs.',
);
assertIncludes(
  'function roundedCoordSignature(',
  'Operational weather consumer signatures should round coordinates to stable primitive request keys.',
);
assertIncludes(
  'const previousSignature = previous ? weatherConsumerSignature(previous) : null;',
  'Repeated vehicle display weather consumer registrations should be detected.',
);
assertIncludes(
  'const setResultIfChanged = useCallback(',
  'Operational weather hook should guard setResult with a stable helper.',
);
assertIncludes(
  'const resultRef = useRef<WeatherFetchResult | null>',
  'Operational weather hook should read the latest result from a ref inside effects/callbacks.',
);
assertIncludes(
  'const operationalWeatherHookRequests = new Map<string, Promise<WeatherFetchResult>>();',
  'Operational weather hooks should share in-flight requests before reaching the weather service dedupe layer.',
);
assertIncludes(
  'const existing = operationalWeatherHookRequests.get(requestKey);\n  if (existing) {',
  'Operational weather should join same-key in-flight requests even for concurrent forced refreshes.',
);
assertIncludes(
  'operationalWeatherHookRequests.set(requestKey, request);\n\n  fetchSharedWeatherForCoordinates(',
  'Operational weather should register the shared in-flight promise before invoking the shared weather service.',
);
assertNotIncludes(
  'fetchWeatherForLocation(',
  'Operational weather should not bypass the shared weather service facade.',
);
assertIncludes(
  'function buildOperationalWeatherRequestKey(',
  'Operational weather should build stable primitive request keys for hook-level dedupe.',
);
assertIncludes(
  'if (!force && inFlightRequestKeyRef.current === requestKey)',
  'Each operational weather hook should avoid re-requesting the same in-flight key.',
);
assertIncludes(
  'lastRequestedRequestKeyRef.current === requestKey',
  'Each operational weather hook should remember its last requested key to suppress rapid duplicate effects.',
);
assertIncludes(
  "setSharedWeatherState(cachedResult, cachedResult.source !== 'cache_fresh', target, freshnessWindowMs);",
  'Cached hook weather should publish into shared operational weather for Dispatch consumers without treating stale cache as fresh.',
);
assertIncludes(
  'setSharedWeatherState(decision.value, false, target, freshnessWindowMs);',
  'Live hook weather success should publish into shared operational weather for Dispatch consumers with the active freshness window.',
);
assertIncludes(
  'setSharedOperationalWeatherConsumer(consumerId, sharedConsumerOptions);',
  'Operational weather hooks should register with the shared weather consumer registry instead of isolated component fetch loops.',
);
assertIncludes(
  'subscribeSharedOperationalWeather(() =>',
  'Operational weather hooks should consume shared normalized weather state updates.',
);
assertIncludes(
  "const reason = sharedWeatherState.result\n    ? 'no_active_consumers_current_retained'\n    : 'no_active_consumers_no_current_value';",
  'Shared operational weather should retain last-good data when consumers unmount so Dispatch can use cached normalized weather.',
);
assertIncludes(
  'function handleNoActiveWeatherConsumers(): void {',
  'Shared operational weather should centralize idempotent no-consumer cleanup.',
);
assertIncludes(
  'sharedWeatherLastNoConsumerClearSignature !== clearSignature',
  'Shared operational weather should skip duplicate no-consumer cleanup logs with the same semantic signature.',
);
assertIncludes(
  "if (sharedWeatherState.result) {\n    logWeatherRetention('last_good_weather_retained'",
  'No-consumer cleanup should retain last-good normalized weather instead of clearing Dispatch-visible state.',
);
assertIncludes(
  'const SHARED_NO_CONSUMER_GRACE_MS = 2500;',
  'Shared operational weather should have a route-transition grace window before no-consumer cleanup.',
);
assertIncludes(
  'function scheduleNoConsumerCleanup(): void {',
  'No-consumer cleanup should be scheduled so normal route transitions can remount consumers first.',
);
assertIncludes(
  'function cancelNoConsumerCleanup(): void {',
  'New consumers should cancel pending no-consumer cleanup.',
);
assertIncludes(
  "logWeatherRetention('active_consumer_count_changed'",
  'Weather logs should distinguish active consumer changes from weather value clears.',
);
assertIncludes(
  "logWeatherRetention('current_weather_value_cleared'",
  'Weather logs should explicitly identify true current value clears.',
);
assertIncludes(
  "reason === 'explicit_clear'",
  'Only explicit current-value clears should be emitted as weather clear warnings.',
);
assertIncludes(
  "logWeatherRetention('no_active_weather_consumer_idle'",
  'No-current no-consumer lifecycle cleanup should use a debug-only idle event.',
);
assertIncludes(
  "logWeatherRetention('weather_data_expired'",
  'Weather logs should explicitly identify expired data.',
);
assertIncludes(
  'const WEATHER_EXPIRED_WARNING_THROTTLE_MS = 5 * 60 * 1000;',
  'Expired weather warnings should be rate-limited so render loops do not spam the console.',
);
assertIncludes(
  'const weatherExpiredWarningState = new Map<string, number>();',
  'Expired weather warning dedupe should be tracked per shared weather cache key.',
);
assertIncludes(
  'function logWeatherDataExpired(params:',
  'Expired weather warnings should flow through a dedicated cache-key aware logger.',
);
assertIncludes(
  'if (previous != null && now - previous < WEATHER_EXPIRED_WARNING_THROTTLE_MS) {\n    return;\n  }',
  'Expired weather warning logger should suppress duplicate warnings within the throttle window.',
);
assertIncludes(
  "force || isStale || cached?.source === 'cache_stale'",
  'Expired or stale cached weather should force a refresh attempt instead of being satisfied by stale cache.',
);
assertNotIncludes(
  "logWeatherRetention('weather_cleared_explicitly', {\n      scope: 'shared_operational_weather'",
  'No-consumer cleanup should not log as an explicit weather clear.',
);
assertNotIncludes(
  'sharedWeatherNoConsumerClearLogged = false;\n  sharedWeatherRefreshHandler = () =>',
  'Registering a new consumer should not reset the no-consumer log guard and re-enable startup log spam.',
);
assertIncludes(
  'gps?.hasFix,\n      gps?.lat,\n      gps?.lng,\n      gps?.permissionDenied,',
  'Operational weather target memoization should depend on GPS scalars, not GPS object identity.',
);
assertNotIncludes(
  'resolveTarget(gps, routeCoordinate), [gps, routeCoordinate]',
  'Operational weather target memoization must not depend on unstable object identities.',
);
assertNotIncludes(
  '    result,\n    target.lat,',
  'runFetch dependencies should not include result, which can retrigger fetch after setResult.',
);

console.log('operational weather loop guard checks passed');
