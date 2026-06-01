const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const { performance } = require('perf_hooks');
const ts = require('typescript');

function compileTypeScriptModule(mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  mod._compile(output.outputText, filename);
}

function loadTypeScriptModule(relPath) {
  const fullPath = path.join(process.cwd(), relPath);
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  compileTypeScriptModule(mod, fullPath);
  return mod.exports;
}

require.extensions['.ts'] = compileTypeScriptModule;

const engineSource = fs.readFileSync(path.join(process.cwd(), 'lib/remote/remoteEngine.ts'), 'utf8');
const constantsSource = fs.readFileSync(path.join(process.cwd(), 'lib/remote/constants.ts'), 'utf8');
const typesSource = fs.readFileSync(path.join(process.cwd(), 'lib/remote/types.ts'), 'utf8');
const {
  computeRouteConfidence,
  labelForSegmentScore,
  scoreSegment,
} = loadTypeScriptModule('lib/remote/remoteEngine.ts');
const { DEFAULT_WEIGHTS } = loadTypeScriptModule('lib/remote/constants.ts');

assert.deepStrictEqual(DEFAULT_WEIGHTS, {
  noSignal: 0.30,
  road: 0.20,
  town: 0.20,
  elev: 0.10,
  wildland: 0.15,
  poi: 0.05,
});

for (const snippet of [
  'export type SegmentInputs',
  'export type SegmentScore',
  'export type RouteConfidence',
  "label: 'A' | 'B' | 'C' | 'D'",
  "status: RouteConfidenceStatus",
]) {
  assert.ok(typesSource.includes(snippet), `Remote engine types must include ${snippet}.`);
}

assert.ok(!engineSource.includes('fetch('), 'Remote engine must not call network fetch.');
assert.ok(!engineSource.includes('await '), 'Remote engine must not use async/await.');
assert.ok(!engineSource.includes('useState') && !engineSource.includes('react'), 'Remote engine must not depend on UI/React.');
assert.ok(constantsSource.includes('DEFAULT_WEIGHTS'), 'Remote constants must define DEFAULT_WEIGHTS.');

const allZeros = scoreSegment({
  noSignalIdx: 0,
  roadKm: 0,
  townKm: 0,
  elevRelief: 0,
  wildland: 0,
  poiDensity: 0,
});
assert.deepStrictEqual(allZeros, { score: 5, label: 'D' });
assert.deepStrictEqual(
  scoreSegment({
    noSignalIdx: 0,
    roadKm: 0,
    townKm: 0,
    elevRelief: 0,
    wildland: 0,
    poiDensity: 10,
  }),
  { score: 0, label: 'D' },
);

const maxRemote = scoreSegment({
  noSignalIdx: 1,
  roadKm: 999,
  townKm: 999,
  elevRelief: 9999,
  wildland: 1,
  poiDensity: 0,
});
assert.deepStrictEqual(maxRemote, { score: 100, label: 'A' });

assert.strictEqual(labelForSegmentScore(0), 'D');
assert.strictEqual(labelForSegmentScore(25), 'D');
assert.strictEqual(labelForSegmentScore(26), 'C');
assert.strictEqual(labelForSegmentScore(50), 'C');
assert.strictEqual(labelForSegmentScore(51), 'B');
assert.strictEqual(labelForSegmentScore(75), 'B');
assert.strictEqual(labelForSegmentScore(76), 'A');
assert.strictEqual(labelForSegmentScore(100), 'A');

assert.deepStrictEqual(
  computeRouteConfidence({
    avgRemote: 0,
    cacheReady: true,
    powerHours: 9,
    weatherRisk: 0,
    teamCount: 2,
    nextSignalMi: 3,
  }),
  { confidence: 100, nextSignalMi: 3, status: 'green' },
);

assert.deepStrictEqual(
  computeRouteConfidence({
    avgRemote: 100,
    cacheReady: false,
    powerHours: 0,
    weatherRisk: 1,
    teamCount: 1,
  }),
  { confidence: 30, nextSignalMi: undefined, status: 'red' },
);

assert.deepStrictEqual(
  computeRouteConfidence({
    avgRemote: 95,
    cacheReady: true,
    powerHours: 9,
    weatherRisk: 0.8,
    teamCount: 2,
  }),
  { confidence: 63, nextSignalMi: undefined, status: 'amber' },
);

const stableA = scoreSegment({
  noSignalIdx: 0.7,
  roadKm: 24,
  townKm: 63,
  elevRelief: 720,
  wildland: 0.8,
  poiDensity: 1.5,
});
const stableB = scoreSegment({
  noSignalIdx: 0.7,
  roadKm: 24,
  townKm: 63,
  elevRelief: 720,
  wildland: 0.8,
  poiDensity: 1.5,
});
assert.deepStrictEqual(stableA, stableB, 'Segment scoring must be stable across runs.');

const sample = {
  noSignalIdx: 0.5,
  roadKm: 20,
  townKm: 40,
  elevRelief: 600,
  wildland: 0.4,
  poiDensity: 2,
};
const iterations = 10000;
const start = performance.now();
for (let index = 0; index < iterations; index += 1) {
  scoreSegment(sample);
}
const elapsedMs = performance.now() - start;
assert.ok(elapsedMs / iterations < 1, `Segment scoring must stay under 1ms per computation; got ${elapsedMs / iterations}ms.`);

console.log('Remote engine checks passed.');
