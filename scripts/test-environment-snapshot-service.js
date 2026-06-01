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

function loadTypeScriptModule(relPath) {
  const fullPath = path.join(process.cwd(), relPath);
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  const source = fs.readFileSync(fullPath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: fullPath,
  });
  mod._compile(output.outputText, fullPath);
  return mod.exports;
}

const {
  buildEnvironmentSnapshot,
  formatEnvironmentDiagnostics,
  formatEnvironmentTime,
  formatSunlightCountdownValue,
  formatSunlightRemaining,
  getEnvironmentCoordinateKey,
  getSunlightCountdownLabel,
  getSunlightSourceLabel,
  hasMeaningfulEnvironmentCoordinateChange,
  getTimeZoneOffsetMinutes,
} = loadTypeScriptModule('lib/environmentSnapshotService.ts');
const { estimateHoursUntilSunset } = loadTypeScriptModule('lib/assistantIntelligenceEngine.ts');

const moab = { latitude: 38.5733, longitude: -109.5498 };
const summerNoonUtc = Date.parse('2026-06-21T18:00:00.000Z');

const utahFromPacificDevice = buildEnvironmentSnapshot({
  coordinate: {
    ...moab,
    accuracyM: 12,
    altitudeFt: 4026,
    source: 'gps',
    updatedAt: summerNoonUtc,
  },
  deviceTimezoneId: 'America/Los_Angeles',
  nowMs: summerNoonUtc,
});

assert.strictEqual(
  utahFromPacificDevice.timezone.id,
  'America/Denver',
  'Utah coordinates should resolve Mountain time, not the device Pacific timezone.',
);
assert.strictEqual(utahFromPacificDevice.timezone.source, 'calculated');
assert.strictEqual(
  utahFromPacificDevice.timezone.offsetMinutes,
  getTimeZoneOffsetMinutes('America/Denver', new Date(summerNoonUtc)),
);
assert.notStrictEqual(
  utahFromPacificDevice.timezone.offsetMinutes,
  getTimeZoneOffsetMinutes('America/Los_Angeles', new Date(summerNoonUtc)),
);
assert.strictEqual(utahFromPacificDevice.sunlight.timezoneId, 'America/Denver');
assert.strictEqual(utahFromPacificDevice.elevation.feet, 4026);
assert.strictEqual(Math.round(utahFromPacificDevice.elevation.meters), 1227);
assert(
  typeof utahFromPacificDevice.sunlight.remainingMinutes === 'number' &&
    utahFromPacificDevice.sunlight.remainingMinutes > 0,
  'Coordinate daylight model should produce daylight remaining for a valid coordinate.',
);
assert(
  formatSunlightRemaining(utahFromPacificDevice.sunlight).includes('daylight remaining'),
  'Remaining Sunlight copy should use compact daylight remaining text.',
);
assert.strictEqual(
  getSunlightSourceLabel(utahFromPacificDevice.sunlight),
  'Sunlight estimate degraded',
  'Calculated solar estimates should be visibly degraded.',
);

const rocklin = { latitude: 38.7907, longitude: -121.2358 };
const rocklinFromPacificDevice = buildEnvironmentSnapshot({
  coordinate: {
    ...rocklin,
    accuracyM: 10,
    source: 'gps',
    updatedAt: summerNoonUtc,
  },
  deviceTimezoneId: 'America/Los_Angeles',
  nowMs: summerNoonUtc,
});
assert.strictEqual(
  rocklinFromPacificDevice.timezone.id,
  'America/Los_Angeles',
  'Coordinates in the same zone as the device should keep the coordinate timezone.',
);
assert.strictEqual(
  rocklinFromPacificDevice.timezone.offsetMinutes,
  getTimeZoneOffsetMinutes('America/Los_Angeles', new Date(summerNoonUtc)),
);

const staleProviderLabel = buildEnvironmentSnapshot({
  coordinate: {
    ...moab,
    source: 'gps',
    updatedAt: summerNoonUtc,
  },
  regionLabel: 'Sacramento, CA',
  regionSource: 'weather_provider',
  regionConfidence: 'medium',
  nowMs: summerNoonUtc,
});
assert.strictEqual(
  staleProviderLabel.region.label,
  '38.57, -109.55',
  'Medium-confidence provider labels should not override a fresh coordinate and create a stale city label.',
);

const highConfidenceProviderLabel = buildEnvironmentSnapshot({
  coordinate: {
    ...moab,
    source: 'gps',
    updatedAt: summerNoonUtc,
  },
  regionLabel: 'Moab, UT',
  regionSource: 'weather_provider',
  regionConfidence: 'high',
  nowMs: summerNoonUtc,
});
assert.strictEqual(
  highConfidenceProviderLabel.region.label,
  'Moab, UT',
  'High-confidence provider labels may be used as display labels.',
);

const providerSunsetUtc = Date.parse('2026-06-22T02:30:00.000Z');
const providerSolar = buildEnvironmentSnapshot({
  coordinate: moab,
  deviceTimezoneId: 'America/Los_Angeles',
  nowMs: summerNoonUtc,
  solarTimes: {
    sunrise: Date.parse('2026-06-21T11:55:00.000Z') / 1000,
    sunset: providerSunsetUtc / 1000,
    source: 'weather_provider',
  },
});
assert.strictEqual(providerSolar.sunlight.source, 'weather_provider');
assert.strictEqual(
  formatEnvironmentTime(providerSolar.sunlight.sunsetIso, providerSolar.timezone.id),
  '8:30 PM',
  'Provider solar timestamps should be displayed in the coordinate timezone.',
);

const noCoordinate = buildEnvironmentSnapshot({
  deviceTimezoneId: 'America/Los_Angeles',
  nowMs: summerNoonUtc,
});
assert.strictEqual(noCoordinate.timezone.source, 'device_fallback');
assert.strictEqual(noCoordinate.sunlight.status, 'unavailable');
assert.strictEqual(noCoordinate.elevation.feet, null);
assert.strictEqual(noCoordinate.elevation.meters, null);
assert.strictEqual(
  formatSunlightRemaining(noCoordinate.sunlight),
  'Sunlight unavailable',
  'GPS denied/unavailable should produce an unavailable sunlight state.',
);
assert(noCoordinate.warnings.includes('coordinate_unavailable'));
assert(noCoordinate.warnings.includes('elevation_unavailable'));

const staleLastKnown = buildEnvironmentSnapshot({
  coordinate: {
    ...moab,
    source: 'last_known',
    updatedAt: Date.parse('2026-06-20T18:00:00.000Z'),
  },
  deviceTimezoneId: 'America/Los_Angeles',
  nowMs: summerNoonUtc,
});
assert.strictEqual(staleLastKnown.coordinate.source, 'last_known');
assert.strictEqual(staleLastKnown.sunlight.timezoneId, 'America/Denver');

const afterSunset = buildEnvironmentSnapshot({
  coordinate: {
    ...moab,
    source: 'gps',
    updatedAt: Date.parse('2026-06-22T04:00:00.000Z'),
  },
  deviceTimezoneId: 'America/Los_Angeles',
  nowMs: Date.parse('2026-06-22T04:00:00.000Z'),
});
assert.strictEqual(afterSunset.sunlight.status, 'after_sunset');
assert.strictEqual(afterSunset.sunlight.nextEvent, 'sunrise');
assert.strictEqual(
  getSunlightCountdownLabel(afterSunset.sunlight),
  'Time until sunrise',
  'After sunset should switch the Remaining Sunlight module to the next sunrise countdown.',
);
assert.strictEqual(
  formatSunlightRemaining(afterSunset.sunlight),
  `${formatSunlightCountdownValue(afterSunset.sunlight)} until sunrise`,
  'Foreground resume after sunset should render time until sunrise, not stale daylight.',
);

const beforeSunrise = buildEnvironmentSnapshot({
  coordinate: {
    ...moab,
    source: 'gps',
    updatedAt: Date.parse('2026-06-21T10:30:00.000Z'),
  },
  deviceTimezoneId: 'America/Los_Angeles',
  nowMs: Date.parse('2026-06-21T10:30:00.000Z'),
});
assert.strictEqual(beforeSunrise.sunlight.status, 'before_sunrise');
assert.strictEqual(beforeSunrise.sunlight.nextEvent, 'sunrise');
assert.strictEqual(getSunlightCountdownLabel(beforeSunrise.sunlight), 'Time until sunrise');
assert(
  formatSunlightRemaining(beforeSunrise.sunlight).includes('until sunrise'),
  'Before sunrise should count down to sunrise instead of reporting daylight remaining.',
);

const exactSunrise = buildEnvironmentSnapshot({
  coordinate: moab,
  deviceTimezoneId: 'America/Los_Angeles',
  nowMs: Date.parse('2026-06-21T11:55:00.000Z'),
  solarTimes: {
    sunrise: Date.parse('2026-06-21T11:55:00.000Z') / 1000,
    sunset: Date.parse('2026-06-22T02:30:00.000Z') / 1000,
    source: 'weather_provider',
  },
});
assert.strictEqual(exactSunrise.sunlight.nextEvent, 'sunset');
assert.strictEqual(getSunlightCountdownLabel(exactSunrise.sunlight), 'Daylight remaining');
assert(
  formatSunlightRemaining(exactSunrise.sunlight).includes('daylight remaining'),
  'At sunrise the module should switch to daylight remaining.',
);

const exactSunset = buildEnvironmentSnapshot({
  coordinate: moab,
  deviceTimezoneId: 'America/Los_Angeles',
  nowMs: Date.parse('2026-06-22T02:30:00.000Z'),
  solarTimes: {
    sunrise: Date.parse('2026-06-21T11:55:00.000Z') / 1000,
    sunset: Date.parse('2026-06-22T02:30:00.000Z') / 1000,
    source: 'weather_provider',
  },
});
assert.strictEqual(exactSunset.sunlight.status, 'after_sunset');
assert.strictEqual(exactSunset.sunlight.nextEvent, 'sunrise');
assert.strictEqual(getSunlightCountdownLabel(exactSunset.sunlight), 'Time until sunrise');

const providerFailedRemoteness = buildEnvironmentSnapshot({
  coordinate: moab,
  remoteness: {
    isActive: true,
    score: 92,
    level: 'Extreme',
    proximity: {
      nearestPavedRoad: { distanceMi: null, confidence: 'estimated', source: 'awaiting live lookup', sourceState: 'unavailable' },
      nearestTown: { distanceMi: null, confidence: 'estimated', source: 'awaiting live lookup', sourceState: 'unavailable' },
      nearestFuelStation: { distanceMi: null, confidence: 'estimated', source: 'awaiting live lookup', sourceState: 'unavailable' },
    },
    connectivity: { signal: 'unknown' },
  },
  nowMs: summerNoonUtc,
});
assert.strictEqual(providerFailedRemoteness.remoteness.score, null);
assert.strictEqual(providerFailedRemoteness.remoteness.label, 'Unknown');
assert.strictEqual(providerFailedRemoteness.remoteness.source, 'unavailable');
assert(providerFailedRemoteness.warnings.includes('remoteness_unknown'));

const liveRemoteness = buildEnvironmentSnapshot({
  coordinate: moab,
  remoteness: {
    isActive: true,
    score: 64,
    level: 'Remote',
    proximity: {
      nearestPavedRoad: { distanceMi: 14, confidence: 'high', source: 'provider', sourceState: 'live' },
      nearestTown: { distanceMi: 28, confidence: 'high', source: 'provider', sourceState: 'live', label: 'Moab' },
      nearestFuelStation: { distanceMi: 31, confidence: 'high', source: 'provider', sourceState: 'live' },
    },
    connectivity: { signal: 'weak' },
  },
  nowMs: summerNoonUtc,
});
assert.strictEqual(liveRemoteness.remoteness.score, 64);
assert.strictEqual(liveRemoteness.remoteness.nearestTown, 'Moab');
assert.strictEqual(liveRemoteness.remoteness.source, 'remoteness_provider');

assert.strictEqual(
  estimateHoursUntilSunset(moab.latitude, null, summerNoonUtc, 'America/Los_Angeles'),
  null,
  'Assistant daylight helper should refuse latitude-only estimates.',
);
assert.strictEqual(
  typeof estimateHoursUntilSunset(moab.latitude, moab.longitude, summerNoonUtc, 'America/Los_Angeles'),
  'number',
  'Assistant daylight helper should use the shared coordinate-aware environment snapshot.',
);

assert.strictEqual(
  getEnvironmentCoordinateKey({ latitude: 38.57334, longitude: -109.54982 }),
  getEnvironmentCoordinateKey({ latitude: 38.57336, longitude: -109.54984 }),
  'Sub-meter GPS jitter should collapse to the same environment coordinate key.',
);
assert.strictEqual(
  hasMeaningfulEnvironmentCoordinateChange(
    { latitude: 38.57334, longitude: -109.54982 },
    { latitude: 38.57336, longitude: -109.54984 },
  ),
  false,
  'Sub-meter GPS jitter should not be treated as a meaningful environment coordinate change.',
);
assert.strictEqual(
  hasMeaningfulEnvironmentCoordinateChange(
    { latitude: 38.5733, longitude: -109.5498 },
    { latitude: 40.7608, longitude: -111.8910 },
  ),
  true,
  'Meaningful regional movement should invalidate the previous environment coordinate key.',
);

const diagnostics = formatEnvironmentDiagnostics(utahFromPacificDevice);
assert(diagnostics.includes('timezone=America/Denver'));
assert(diagnostics.includes('deviceTimezone=America/Los_Angeles'));
assert(!diagnostics.includes('api_key'));

const rendererSource = fs.readFileSync(
  path.join(process.cwd(), 'components', 'dashboard', 'WidgetRenderers.tsx'),
  'utf8',
);
const remotenessWidgetSource = fs.readFileSync(
  path.join(process.cwd(), 'components', 'dashboard', 'RemotenessIndexWidget.tsx'),
  'utf8',
);
const environmentalIntelSource = fs.readFileSync(
  path.join(process.cwd(), 'components', 'intel', 'EnvironmentalIntel.tsx'),
  'utf8',
);
const elevationSource = fs.readFileSync(
  path.join(process.cwd(), 'lib', 'dashboardElevationTerrain.ts'),
  'utf8',
);
const widgetBridgeSource = fs.readFileSync(
  path.join(process.cwd(), 'lib', 'ecsWidgetBridge.ts'),
  'utf8',
);
assert(
  rendererSource.includes('buildEnvironmentSnapshot({'),
  'Dashboard daylight rendering should use the shared EnvironmentSnapshotService.',
);
assert(
  rendererSource.includes('formatSunlightRemaining(environment.sunlight)'),
  'Remaining Sunlight widget should use compact live environment sunlight copy.',
);
assert(
  rendererSource.includes('getSunlightCountdownLabel(environment.sunlight)') &&
    rendererSource.includes('formatSunlightCountdownValue(environment.sunlight)'),
  'Remaining Sunlight widget should switch labels and values based on the next solar event.',
);
assert(
  !rendererSource.includes('getTimezoneOffset()'),
  'Dashboard daylight rendering should not use device timezone offset for coordinate sunlight.',
);
assert(
  !rendererSource.includes('Sinusoidal approx'),
  'Dashboard daylight detail should not present the old latitude-only approximation.',
);
assert(
  remotenessWidgetSource.includes('buildRemotenessEnvironment(index)') &&
    remotenessWidgetSource.includes('Remoteness unknown') &&
    remotenessWidgetSource.includes('ECS will not infer isolation from an empty provider result.'),
  'Remoteness UI should normalize unresolved provider output to Unknown.',
);
assert(
  environmentalIntelSource.includes('formatEnvironmentTime(environment.sunlight.sunsetIso, environment.timezone.id)') &&
    environmentalIntelSource.includes('formatSunlightRemaining(environment.sunlight)') &&
    environmentalIntelSource.includes('Remoteness unknown'),
  'Environmental Intel should use the shared coordinate-timezone environment snapshot.',
);
assert(
  elevationSource.includes('currentElevationM: number | null;') &&
    rendererSource.includes('environment.elevation.meters'),
  'Elevation UI should keep meters internally available and avoid fake zero values.',
);
assert(
  widgetBridgeSource.includes('GPS coordinate + resolved coordinate timezone'),
  'Widget bridge metadata should not describe daylight as device-timezone based.',
);

console.log('Environment snapshot service checks passed.');
