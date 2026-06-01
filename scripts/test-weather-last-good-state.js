const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

function loadTypeScriptModule(relPath) {
  const fullPath = path.join(process.cwd(), relPath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: fullPath,
  });
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  mod._compile(output.outputText, fullPath);
  return mod.exports;
}

const { resolveWeatherLastGoodUpdate } = loadTypeScriptModule('lib/weatherLastGoodState.ts');

const validLive = { source: 'live', current: { tempF: 72 }, forecast: [1, 2, 3] };
const emptyIncoming = { source: 'fallback', current: null, forecast: [] };
const newerValidCache = { source: 'cache_fresh', current: { tempF: 70 }, forecast: [1] };

const first = resolveWeatherLastGoodUpdate(validLive, null, true);
assert.strictEqual(first.value, validLive);
assert.strictEqual(first.lastGood, validLive);
assert.strictEqual(first.retainedLastGood, false);
assert.strictEqual(first.ignoredEmptyUpdate, false);

const emptyAfterValid = resolveWeatherLastGoodUpdate(emptyIncoming, first.lastGood, false);
assert.strictEqual(emptyAfterValid.value, validLive);
assert.strictEqual(emptyAfterValid.lastGood, validLive);
assert.strictEqual(emptyAfterValid.retainedLastGood, true);
assert.strictEqual(emptyAfterValid.ignoredEmptyUpdate, true);

const nullAfterValid = resolveWeatherLastGoodUpdate(null, first.lastGood, false);
assert.strictEqual(nullAfterValid.value, validLive);
assert.strictEqual(nullAfterValid.retainedLastGood, true);
assert.strictEqual(nullAfterValid.ignoredEmptyUpdate, true);

const validReplacesValid = resolveWeatherLastGoodUpdate(newerValidCache, first.lastGood, true);
assert.strictEqual(validReplacesValid.value, newerValidCache);
assert.strictEqual(validReplacesValid.lastGood, newerValidCache);
assert.strictEqual(validReplacesValid.retainedLastGood, false);

const emptyWithoutLastGood = resolveWeatherLastGoodUpdate(emptyIncoming, null, false);
assert.strictEqual(emptyWithoutLastGood.value, emptyIncoming);
assert.strictEqual(emptyWithoutLastGood.lastGood, null);
assert.strictEqual(emptyWithoutLastGood.retainedLastGood, false);

const explicitClear = resolveWeatherLastGoodUpdate(null, first.lastGood, false, { explicitClear: true });
assert.strictEqual(explicitClear.value, null);
assert.strictEqual(explicitClear.lastGood, null);
assert.strictEqual(explicitClear.clearedExplicitly, true);

console.log('Weather last-good state checks passed.');
