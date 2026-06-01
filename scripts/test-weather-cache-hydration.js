const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const weatherStore = fs
  .readFileSync(path.join(root, 'lib', 'weatherStore.ts'), 'utf8')
  .replace(/\r\n/g, '\n');
const useOperationalWeather = fs
  .readFileSync(path.join(root, 'lib', 'useOperationalWeather.ts'), 'utf8')
  .replace(/\r\n/g, '\n');
const weatherPanel = fs
  .readFileSync(path.join(root, 'components', 'weather', 'WeatherIntelPanel.tsx'), 'utf8')
  .replace(/\r\n/g, '\n');

function assertIncludes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

assertIncludes(
  weatherStore,
  'function getValidatedCached(',
  'Weather store should validate cached weather before presenting it to UI consumers.',
);
assertIncludes(
  weatherStore,
  'if (cached.data.units !== units) return null;',
  'Weather cache hydration should reject cache entries for the wrong unit system.',
);
assertIncludes(
  weatherStore,
  'if (!hasUsableWeatherResponse(cached.data)) return null;',
  'Weather cache hydration should reject empty/unusable cached payloads.',
);
assertIncludes(
  weatherStore,
  "source: isWeatherStale(cached.cachedAt) ? 'cache_stale' : 'cache_fresh'",
  'Weather cache hydration should preserve fresh versus stale cache source.',
);
assertIncludes(
  weatherStore,
  'export function getCachedWeatherResult(',
  'Weather store should expose a reusable cached WeatherFetchResult hydrator.',
);

assertIncludes(
  useOperationalWeather,
  'const initialCachedResultRef = useRef<WeatherFetchResult | null>(',
  'Operational weather hook should synchronously hydrate from cache before first render.',
);
assertIncludes(
  useOperationalWeather,
  'useState<WeatherFetchResult | null>(() => initialCachedResultRef.current)',
  'Operational weather hook should seed state from cached weather.',
);
assertIncludes(
  useOperationalWeather,
  "if (!force && cached?.source === 'cache_fresh')",
  'Shared operational weather should skip live fetches when fresh cache satisfies the request.',
);
assertIncludes(
  useOperationalWeather,
  "setSharedWeatherState(cached, cached.source !== 'cache_fresh', target, freshnessWindowMs);",
  'Shared operational weather consumers should receive cached weather immediately while marking stale cache as loading.',
);
assertIncludes(
  useOperationalWeather,
  'function normalizeOperationalWeatherCacheSource(',
  'Operational weather should reclassify cache freshness against its own freshness window.',
);
assertIncludes(
  useOperationalWeather,
  "source = ageMs != null && ageMs <= freshnessWindowMs\n    ? 'cache_fresh'\n    : 'cache_stale'",
  'Operational weather should only label cache_fresh when cache age is within the active freshness window.',
);

assertIncludes(
  weatherPanel,
  'const initialCachedWeatherRef = useRef<WeatherFetchResult | null>(',
  'Weather detail panel should synchronously hydrate cached weather before first render.',
);
assertIncludes(
  weatherPanel,
  '() => initialCachedWeatherRef.current?.data.results ?? null',
  'Weather detail panel should seed weatherData from cache.',
);
assertIncludes(
  weatherPanel,
  '() => initialCachedWeatherRef.current?.source ?? null',
  'Weather detail panel should seed dataSource from cache.',
);
assertIncludes(
  weatherPanel,
  "if (cached.source === 'cache_fresh') {\n        return;",
  'Weather detail panel should not fetch when fresh cache already satisfies the request.',
);
assertIncludes(
  weatherPanel,
  'cachedSource: cached?.source ?? null',
  'Weather detail panel debug logs should report cache hydration state during auto-fetch checks.',
);
assertIncludes(
  weatherPanel,
  'const weatherPanelFetchMemory = new Map<string',
  'Weather detail panel should remember known fetch keys across harmless remounts.',
);
assertIncludes(
  weatherPanel,
  'function buildWeatherPanelFetchKey(',
  'Weather detail panel should use one stable fetch key for coordinates and units.',
);
assertIncludes(
  weatherPanel,
  'const initialRememberedCoords = getRememberedWeatherPanelCoords(initialFetchKey);',
  'Weather detail panel should seed coordinate memory from prior mounts.',
);
assertIncludes(
  weatherPanel,
  "const effectiveCoordsAreNew = cached?.source === 'cache_fresh'\n      ? false",
  'Fresh cached weather should prevent the same route coordinates from being treated as new.',
);
assertIncludes(
  weatherPanel,
  "const effectiveFirstTimeForKey = cached?.source === 'cache_fresh'\n      ? false",
  'Fresh cached weather should prevent the same fetch key from being treated as first-time.',
);
assertIncludes(
  weatherPanel,
  "if (effectiveCoordsAreNew || effectiveFirstTimeForKey || !hasWeatherData || cached?.source === 'cache_stale')",
  'Stale cached weather should still trigger a refresh attempt.',
);

console.log('weather cache hydration checks passed');
