/* global __dirname */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');

function compileTypeScriptModule(relativePath, stubs = {}) {
  const fullPath = path.join(root, relativePath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: fullPath,
  });
  const compiled = new Module(fullPath, module);
  compiled.filename = fullPath;
  compiled.paths = Module._nodeModulePaths(path.dirname(fullPath));
  compiled.require = request => {
    if (Object.prototype.hasOwnProperty.call(stubs, request)) {
      return stubs[request];
    }
    return Module._load(request, compiled);
  };
  compiled._compile(output.outputText, fullPath);
  return compiled.exports;
}

const locationResolver = compileTypeScriptModule('lib/weatherLocationResolver.ts');
const weatherService = compileTypeScriptModule('lib/weatherService.ts', {
  './ecsWeather': { buildECSWeatherSnapshot() { throw new Error('not used'); } },
  './weatherStore': {
    getAnyCachedWeather() { return null; },
    getCachedWeatherResult() { return null; },
    hasUsableWeatherFetchResult() { return false; },
  },
  './weatherBroker': {
    fetchWeatherThroughBroker() { throw new Error('not used'); },
  },
  './weatherLocationResolver': locationResolver,
});

const firstConsumer = weatherService.resolveECSWeatherTarget({
  selectedCoordinate: {
    lat: 38.5816,
    lng: -121.4944,
    label: 'Sacramento',
  },
});

const independentConsumer = weatherService.resolveECSWeatherTarget({
  currentGps: {
    lat: 38.7907,
    lng: -121.2358,
    label: 'Rocklin',
    accuracyM: 20,
  },
});

assert.strictEqual(firstConsumer.location.source, 'selected_coordinate');
assert.strictEqual(independentConsumer.location.source, 'current_gps');
assert.strictEqual(
  independentConsumer.location.distanceFromPreviousMiles,
  null,
  'A second weather consumer must not inherit another consumer\'s location history.',
);
assert.strictEqual(
  independentConsumer.location.shouldRefreshWeather,
  false,
  'Cross-consumer location history must not force a refresh.',
);

const explicitlyContinuedConsumer = weatherService.resolveECSWeatherTarget({
  currentGps: {
    lat: 38.7907,
    lng: -121.2358,
    accuracyM: 20,
  },
  previousLocation: firstConsumer.location,
});

assert.ok(
  explicitlyContinuedConsumer.location.distanceFromPreviousMiles > 5,
  'A caller-owned previous location should still drive movement policy.',
);
assert.strictEqual(explicitlyContinuedConsumer.location.shouldRefreshWeather, true);
assert.strictEqual(explicitlyContinuedConsumer.location.forceRefreshWeather, true);

const serviceSource = fs.readFileSync(path.join(root, 'lib/weatherService.ts'), 'utf8');
assert.ok(
  !serviceSource.includes('lastResolvedWeatherLocation'),
  'Weather service must not own cross-consumer location history.',
);
assert.ok(
  serviceSource.includes('previousLocation: input.previousLocation'),
  'Weather target continuity must remain an explicit caller-owned contract.',
);

console.log('Weather location ownership checks passed.');
