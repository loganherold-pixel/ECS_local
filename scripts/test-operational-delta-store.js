/* eslint-disable no-undef */
const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const storePath = path.join(root, 'lib', 'readiness', 'operationalDeltaStore.ts');
const enginePath = path.join(root, 'lib', 'readiness', 'operationalDeltaBrief.ts');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web', select: (values) => values?.web ?? values?.default } };
  }
  return originalLoad.call(this, request, parent, isMain);
};

require.extensions['.ts'] = function compileTs(module, filename) {
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

const {
  OPERATIONAL_DELTA_STORE_STATE_KEY,
  createOperationalDeltaBriefStore,
  operationalDeltaContextKey,
} = require(storePath);
const {
  OPERATIONAL_DELTA_SCHEMA_VERSION,
  buildOperationalDeltaResult,
} = require(enginePath);

function memoryStorage(seed = {}) {
  const values = { ...seed };
  return {
    values,
    get(key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
    set(key, value) { values[key] = value; },
    delete(key) { delete values[key]; },
    waitForHydration() { return Promise.resolve(); },
    flush() { return Promise.resolve(); },
  };
}

function source(overrides = {}) {
  return {
    id: overrides.id ?? 'manual-fuel',
    origin: overrides.origin ?? 'manual',
    authority: overrides.authority ?? 'Operator entry',
    provider: overrides.provider ?? null,
    observedAt: overrides.observedAt ?? '2026-07-12T17:00:00.000Z',
    fetchedAt: null,
    expiresAt: null,
    confidence: overrides.confidence ?? 'medium',
    coverage: 'complete',
    availability: 'usable',
    conflict: false,
    warningCodes: [],
  };
}

function snapshot(id, capturedAt, fuelMargin, extraFacts = []) {
  return {
    id,
    schemaVersion: OPERATIONAL_DELTA_SCHEMA_VERSION,
    expeditionId: 'trip-store-test',
    routeId: 'route-store-test',
    capturedAt,
    baselineKind: null,
    label: id,
    facts: [
      {
        id: 'fuel:margin',
        domain: 'fuel',
        label: 'Fuel margin',
        kind: 'metric',
        value: fuelMargin,
        unit: 'mi',
        thresholdKey: 'fuel_margin_miles',
        direction: 'higher_is_better',
        rank: null,
        required: true,
        severityOnWorsen: 'caution',
        severityOnMissing: 'caution',
        blockerSeverity: 'critical',
        recommendedAction: null,
        sourceTruth: source({ observedAt: capturedAt }),
        freshnessPolicyKey: 'manual_user_state',
        dependencies: ['Fuel posture'],
      },
      ...extraFacts,
    ],
  };
}

(async () => {
  const storage = memoryStorage();
  const store = createOperationalDeltaBriefStore(storage);
  await store.hydrate();
  assert.strictEqual(store.getSnapshot().hydrated, true);

  const departure = snapshot('departure-snapshot', '2026-07-12T17:00:00.000Z', 20);
  const laterDeparture = snapshot('late-departure-snapshot', '2026-07-12T17:05:00.000Z', 22);
  await store.captureBaseline('departure', departure, { select: true });
  await store.captureBaseline('departure', laterDeparture, { overwrite: false });
  assert.strictEqual(
    store.getBaseline(departure, 'departure').id,
    'departure-snapshot',
    'Departure baseline should be capture-once unless overwrite is explicit.',
  );

  const stop = snapshot('stop-snapshot', '2026-07-12T17:30:00.000Z', 15);
  await store.markLastStop(stop);
  let context = store.getContext(stop);
  assert.strictEqual(context.selectedBaseline, 'last_stop');
  assert.strictEqual(context.baselines.last_stop.id, 'stop-snapshot');

  const current = snapshot('current-snapshot', '2026-07-12T18:00:00.000Z', 25);
  const result = buildOperationalDeltaResult({
    baseline: context.baselines.last_stop,
    current,
    baselineKind: 'last_stop',
  });
  assert.strictEqual(result.deltas.length, 1);
  assert.strictEqual(result.deltas[0].category, 'improved_condition');

  await store.dismissDelta(current, result.deltas[0].fingerprint);
  assert.ok(
    store.getSuppressedFingerprints(current).includes(result.deltas[0].fingerprint),
    'Dismissal should persist the exact stable fingerprint.',
  );

  await store.acknowledge(result, current);
  context = store.getContext(current);
  assert.strictEqual(context.selectedBaseline, 'last_acknowledgment');
  assert.strictEqual(context.baselines.last_acknowledgment.id, 'current-snapshot');
  assert.ok(context.acknowledgedFingerprints[result.deltas[0].fingerprint]);

  const secretFact = {
    id: 'source:diagnostic',
    domain: 'source',
    label: 'Provider token sk-test-do-not-store',
    kind: 'identity',
    value: 'Authorization: Bearer secret-token-value',
    unit: null,
    thresholdKey: null,
    direction: 'neutral',
    rank: null,
    required: false,
    severityOnWorsen: 'watch',
    severityOnMissing: 'unknown',
    blockerSeverity: 'critical',
    recommendedAction: null,
    sourceTruth: source({ provider: 'api_key=super-secret-value' }),
    freshnessPolicyKey: 'default',
    dependencies: ['Raw response must never persist'],
  };
  const coordinateFact = {
    ...secretFact,
    id: 'convoy:precise_location:latitude',
    label: 'Restricted member latitude',
    value: 37.123456,
  };
  await store.markLastStop(snapshot(
    'privacy-snapshot',
    '2026-07-12T18:30:00.000Z',
    24,
    [secretFact, coordinateFact],
  ));

  const raw = storage.values[OPERATIONAL_DELTA_STORE_STATE_KEY];
  assert.ok(raw, 'Store should persist a local JSON snapshot.');
  assert.ok(!raw.includes('sk-test-do-not-store'));
  assert.ok(!raw.includes('secret-token-value'));
  assert.ok(!raw.includes('super-secret-value'));
  assert.ok(!raw.includes('37.123456'), 'Precise coordinate facts must be omitted from persistence.');

  const restored = createOperationalDeltaBriefStore(memoryStorage({
    [OPERATIONAL_DELTA_STORE_STATE_KEY]: raw,
  }));
  await restored.hydrate();
  const restoredContext = restored.getContext(current);
  assert.ok(restoredContext, 'Persisted context should hydrate offline.');
  assert.strictEqual(restoredContext.baselines.last_acknowledgment.id, 'current-snapshot');
  assert.strictEqual(
    operationalDeltaContextKey(current),
    'expedition:trip-store-test',
    'Expedition identity should own the local baseline context.',
  );

  await restored.clearContext(current);
  assert.strictEqual(restored.getContext(current), null);

  console.log('Operational Delta Brief persistence tests passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
