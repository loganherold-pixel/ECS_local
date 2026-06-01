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

const { ecsLog } = loadTypeScriptModule('lib/ecsLogger.ts');

function captureConsole(callback) {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  const logs = [];
  const warns = [];
  const errors = [];
  console.log = (...args) => logs.push(args);
  console.warn = (...args) => warns.push(args);
  console.error = (...args) => errors.push(args);
  try {
    callback();
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }
  return { logs, warns, errors };
}

ecsLog.clear();
delete globalThis.ECS_DEBUG_WEATHER;
delete globalThis.__ECS_DEBUG_WEATHER;

let captured = captureConsole(() => {
  ecsLog.dev('WEATHER', 'active_consumer_count_changed', { activeConsumers: 1 }, {
    tag: '[WEATHER]',
    debugFlag: 'ECS_DEBUG_WEATHER',
    nowMs: 1_000,
  });
});
assert.strictEqual(captured.logs.length, 0, 'High-frequency weather lifecycle logs should be hidden unless explicitly enabled.');

globalThis.ECS_DEBUG_WEATHER = true;
ecsLog.clear();
captured = captureConsole(() => {
  ecsLog.dev('WEATHER', 'active_consumer_count_changed', { activeConsumers: 1 }, {
    tag: '[WEATHER]',
    debugFlag: 'ECS_DEBUG_WEATHER',
    fingerprint: 'same-transition',
    nowMs: 1_000,
    throttleMs: 2_500,
    aggregateWindowMs: 10_000,
  });
  ecsLog.dev('WEATHER', 'active_consumer_count_changed', { activeConsumers: 1 }, {
    tag: '[WEATHER]',
    debugFlag: 'ECS_DEBUG_WEATHER',
    fingerprint: 'same-transition',
    nowMs: 1_200,
    throttleMs: 2_500,
    aggregateWindowMs: 10_000,
  });
  ecsLog.dev('WEATHER', 'active_consumer_count_changed', { activeConsumers: 1 }, {
    tag: '[WEATHER]',
    debugFlag: 'ECS_DEBUG_WEATHER',
    fingerprint: 'same-transition',
    nowMs: 1_400,
    throttleMs: 2_500,
    aggregateWindowMs: 10_000,
  });
  ecsLog.dev('WEATHER', 'active_consumer_count_changed', { activeConsumers: 1 }, {
    tag: '[WEATHER]',
    debugFlag: 'ECS_DEBUG_WEATHER',
    fingerprint: 'same-transition',
    nowMs: 4_000,
    throttleMs: 2_500,
    aggregateWindowMs: 10_000,
  });
});
assert.strictEqual(captured.logs.length, 3, 'First occurrence, aggregate summary, and post-throttle occurrence should print.');
assert.strictEqual(captured.logs[0][0], '[WEATHER]', 'Weather dev logs should preserve their searchable tag.');
assert.strictEqual(captured.logs[0][1], 'active_consumer_count_changed', 'First meaningful transition should be visible when debug is enabled.');
assert.ok(
  captured.logs[1][1].includes('active_consumer_count_changed repeated 2x in 3s'),
  'Repeated identical lifecycle logs should aggregate with count and elapsed window.',
);

captured = captureConsole(() => {
  ecsLog.warn('WEATHER', 'request_failure', { reason: 'provider unavailable' });
  ecsLog.error('DEDUPE', 'impossible_state', new Error('count below zero'), { activeConsumers: -1 });
});
assert.strictEqual(captured.warns.length, 1, 'Warnings must remain visible.');
assert.strictEqual(captured.errors.length, 1, 'Errors must remain visible.');
assert.strictEqual(captured.logs.length, 0, 'Warnings/errors should not be downgraded into debug logs.');

delete globalThis.ECS_DEBUG_WEATHER;
ecsLog.clear();
console.log('ECS logger hygiene checks passed.');
