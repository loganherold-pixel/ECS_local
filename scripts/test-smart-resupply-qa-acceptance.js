const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const DIAGNOSTICS_ENABLED_ENV = 'ECS_SUPPORT_DIAGNOSTICS_ENABLED';
const DIAGNOSTICS_APPROVED_ENV = 'ECS_SUPPORT_DIAGNOSTICS_APPROVED';

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(transpiled.outputText, filename);
};

const originalModuleLoad = Module._load;
Module._load = function loadWithExpoConstantsStub(request, parent, isMain) {
  if (request === 'expo-constants') {
    return { __esModule: true, default: { expoConfig: { extra: {} } } };
  }
  return originalModuleLoad.call(this, request, parent, isMain);
};

const qa = require(path.join(root, 'lib', 'tripBuilder', 'smartResupplyQaAcceptance.ts'));
const { ecsLog } = require(path.join(root, 'lib', 'ecsLogger.ts'));
const {
  evaluateApproachResupplyOptions,
} = require(path.join(root, 'lib', 'tripBuilder', 'approachResupplyPlanner.ts'));

function clearDiagnosticEnvironment() {
  delete process.env[DIAGNOSTICS_ENABLED_ENV];
  delete process.env[DIAGNOSTICS_APPROVED_ENV];
  qa.clearSmartResupplyQaRuntimeApprovalForTest();
  ecsLog.clear();
}

function setRuntimeConfig(config) {
  global.__ECS_SMART_RESUPPLY_QA_CONFIG__ = config;
}

function runDefaultMode() {
  assert.strictEqual(process.env[DIAGNOSTICS_ENABLED_ENV], undefined);
  assert.strictEqual(process.env[DIAGNOSTICS_APPROVED_ENV], undefined);
  clearDiagnosticEnvironment();
  setRuntimeConfig({
    authorized: true,
    diagnosticsApproved: false,
    fixture: null,
    consoleCapture: true,
  });
  const emitted = qa.emitSmartResupplyQaCountDiagnostic('smart_evaluation_completed', {
    evaluationId: '00000000-0000-4000-8000-000000000001',
    category: 'fuel',
    plannerRankedCount: 3,
    uiAdaptedCount: null,
    mountedRowCount: null,
    terminalState: 'ready',
    partialProvider: false,
  });
  assert.strictEqual(emitted, false, 'Default mode must suppress approved Smart Resupply diagnostics.');
  assert.strictEqual(ecsLog.getLogsByCategory('ROUTE_CONTEXT').length, 0);
  clearDiagnosticEnvironment();
}

function parseCapture(line) {
  const marker = '[ECS_SCOPE_B_QA_DIAGNOSTIC] ';
  assert.ok(line.startsWith(marker), 'Approved console evidence must use the QA-only marker.');
  return JSON.parse(line.slice(marker.length));
}

function runApprovedMode() {
  assert.strictEqual(process.env[DIAGNOSTICS_ENABLED_ENV], '1');
  assert.strictEqual(process.env[DIAGNOSTICS_APPROVED_ENV], '1');
  clearDiagnosticEnvironment();
  process.env[DIAGNOSTICS_ENABLED_ENV] = '1';
  process.env[DIAGNOSTICS_APPROVED_ENV] = '1';
  setRuntimeConfig({
    authorized: true,
    diagnosticsApproved: true,
    fixture: 'qualified_empty',
    consoleCapture: true,
  });

  const captured = [];
  const originalInfo = console.info;
  console.info = (...parts) => captured.push(parts.join(' '));
  try {
    const evaluationId = '00000000-0000-4000-8000-000000000002';
    const stages = [
      ['smart_evaluation_completed', 3, null, null],
      ['smart_ui_adapter_completed', 3, 3, null],
      ['smart_rows_mounted', 3, 3, 3],
    ];
    for (const [event, plannerRankedCount, uiAdaptedCount, mountedRowCount] of stages) {
      assert.strictEqual(qa.emitSmartResupplyQaCountDiagnostic(event, {
        evaluationId,
        category: 'fuel',
        plannerRankedCount,
        uiAdaptedCount,
        mountedRowCount,
        terminalState: 'ready',
        partialProvider: false,
      }), true);
    }

    const itinerary = [
      { id: 'private-origin-id', role: 'origin', sourceStopId: null, coordinate: { latitude: 38.123456, longitude: -110.654321 } },
      { id: 'private-resupply-id', role: 'resupply', sourceStopId: 'provider-private-stop-id', coordinate: { latitude: 38.223456, longitude: -110.554321 } },
      { id: 'private-trailhead-id', role: 'trailhead', sourceStopId: null, coordinate: { latitude: 38.323456, longitude: -110.454321 } },
      { id: 'private-destination-id', role: 'destination', sourceStopId: null, coordinate: { latitude: 38.423456, longitude: -110.354321 } },
    ];
    const canonical = qa.buildSmartResupplyQaCanonicalEvent({
      correlationId: evaluationId,
      itinerary,
    });
    assert.deepStrictEqual(canonical.orderedSemanticStopRoles, [
      'origin',
      'resupply',
      'trailhead',
      'destination',
    ]);
    assert.strictEqual(canonical.selectedResupplyIndex, 1);
    assert.strictEqual(canonical.trailheadStartIndex, 2);
    assert.strictEqual(canonical.selectedResupplyOccurrenceCount, 1);
    assert.ok(canonical.stopIdHashes.every((value) => /^stop_[a-f0-9]+$/.test(value)));
    assert.strictEqual(qa.emitSmartResupplyQaCanonicalDiagnostic(canonical), true);
  } finally {
    console.info = originalInfo;
  }

  const events = captured.map(parseCapture);
  assert.strictEqual(events.length, 4);
  assert.deepStrictEqual(events.slice(0, 3).map((event) => event.event), [
    'smart_evaluation_completed',
    'smart_ui_adapter_completed',
    'smart_rows_mounted',
  ]);
  assert.ok(events.slice(0, 3).every((event) => event.evaluationId === events[0].evaluationId));
  assert.deepStrictEqual(
    [events[2].plannerRankedCount, events[2].uiAdaptedCount, events[2].mountedRowCount],
    [3, 3, 3],
  );
  const canonicalEvent = events[3];
  assert.strictEqual(canonicalEvent.event, 'smart_canonical_output_created');
  assert.ok(canonicalEvent.selectedResupplyIndex < canonicalEvent.trailheadStartIndex);
  assert.strictEqual(canonicalEvent.selectedResupplyOccurrenceCount, 1);

  const serialized = JSON.stringify(events);
  for (const privateValue of [
    '38.123456',
    '-110.654321',
    'provider-private-stop-id',
    'private-origin-id',
    'private-resupply-id',
    'private-trailhead-id',
    'private-destination-id',
    'access-token-secret',
    'https://private.example.test',
  ]) {
    assert.ok(!serialized.includes(privateValue), `Approved diagnostics must omit ${privateValue}.`);
  }
  clearDiagnosticEnvironment();
}

function runFixtureAndContractChecks() {
  const appConfig = require(path.join(root, 'app.config.js'));
  const resolveConfig = appConfig.resolveScopeBSmartResupplyQaAcceptance;
  assert.deepStrictEqual(resolveConfig('production', {}), {
    authorized: false,
    diagnosticsApproved: false,
    fixture: null,
    consoleCapture: false,
  });
  assert.throws(
    () => resolveConfig('production', {
      EXPO_PUBLIC_ECS_QA_SMART_RESUPPLY_PROVIDER_FIXTURE: 'qualified_empty',
    }),
    /require the scope-b-qa profile/,
  );
  assert.deepStrictEqual(resolveConfig('scope-b-qa', {
    ECS_SCOPE_B_QA_ACCEPTANCE_BUILD: '1',
    ECS_SUPPORT_DIAGNOSTICS_ENABLED: '1',
    ECS_SUPPORT_DIAGNOSTICS_APPROVED: '1',
    ECS_SCOPE_B_QA_CONSOLE_CAPTURE: '1',
    EXPO_PUBLIC_ECS_QA_SMART_RESUPPLY_PROVIDER_FIXTURE: 'qualified_empty',
  }), {
    authorized: true,
    diagnosticsApproved: true,
    fixture: 'qualified_empty',
    consoleCapture: true,
  });

  setRuntimeConfig({
    authorized: true,
    diagnosticsApproved: false,
    fixture: 'qualified_empty',
    consoleCapture: false,
  });
  assert.strictEqual(qa.qualifiedEmptySmartResupplySuggestions('fuel'), null);
  const suggestions = qa.qualifiedEmptySmartResupplySuggestions('food_supplies');
  assert.strictEqual(suggestions.length, 3, 'QA transport should return successful synthetic supply suggestions.');
  const destinations = suggestions.map(qa.qualifiedEmptySmartResupplyDestination);
  assert.ok(destinations.every(Boolean), 'Every QA suggestion should pass through destination normalization.');
  const physicalKeys = new Set(destinations.map((destination) => (
    `${destination.coordinate.lat.toFixed(6)}:${destination.coordinate.lng.toFixed(6)}`
  )));
  assert.strictEqual(physicalKeys.size, 2, 'The fixture should exercise physical-place deduplication.');

  const candidates = [...physicalKeys].map((key, index) => {
    const [latitude, longitude] = key.split(':').map(Number);
    return {
      id: `qa-supply-${index + 1}`,
      title: `Synthetic supply ${index + 1}`,
      category: 'food_supplies',
      categoryCoverage: ['food_supplies'],
      coordinate: { latitude, longitude },
      confidence: 'medium',
      operatingStatus: 'open',
      accessStatus: 'accessible',
      categoryUsefulness: 'category_match',
      detourDistanceMiles: 0.1,
      detourDurationMinutes: 1,
    };
  });
  const inventory = evaluateApproachResupplyOptions({
    category: 'food_supplies',
    origin: { latitude: 0, longitude: 0 },
    trailhead: { latitude: 1, longitude: 0 },
    approachRoute: [
      { latitude: 0, longitude: 0 },
      { latitude: 1, longitude: 0 },
    ],
    candidates,
    maxCorridorOffsetMiles: 0.2,
    requireRoutedAccess: true,
    limit: 3,
  });
  assert.strictEqual(inventory.ranked.length, 0, 'The real planner must produce the qualified-empty result.');
  assert.strictEqual(inventory.excluded.length, 2);
  assert.ok(inventory.excluded.every((candidate) => (
    candidate.exclusionReasons.includes('excessive_corridor_offset')
  )));

  const screen = fs.readFileSync(path.join(root, 'app', 'explore-trip-builder.tsx'), 'utf8');
  assert.ok(screen.includes('qualifiedEmptySmartResupplySuggestions(params.category)'));
  assert.ok(screen.includes('qualifiedEmptySmartResupplyDestination(suggestion)'));
  assert.ok(screen.includes('trip-builder-smart-resupply-qa-fixture'));
  assert.ok(screen.includes('trip-builder-smart-resupply-supply-empty-qualified'));
  assert.ok(screen.includes("emitSmartResupplyQaCountSnapshot('smart_evaluation_completed'"));
  assert.ok(screen.includes("emitSmartResupplyQaCountSnapshot('smart_ui_adapter_completed'"));
  assert.ok(screen.includes("emitSmartResupplyQaCountSnapshot('smart_rows_mounted'"));
  assert.ok(screen.includes('buildSmartResupplyQaCanonicalEvent({'));
  clearDiagnosticEnvironment();
}

function runIsolatedMode(mode) {
  const env = { ...process.env };
  delete env[DIAGNOSTICS_ENABLED_ENV];
  delete env[DIAGNOSTICS_APPROVED_ENV];
  if (mode === 'approved') {
    env[DIAGNOSTICS_ENABLED_ENV] = '1';
    env[DIAGNOSTICS_APPROVED_ENV] = '1';
  }
  const child = spawnSync(process.execPath, [__filename, `--diagnostics-mode=${mode}`], {
    cwd: root,
    env,
    encoding: 'utf8',
  });
  if (child.status !== 0) {
    process.stderr.write(child.stdout || '');
    process.stderr.write(child.stderr || '');
  }
  assert.strictEqual(child.status, 0, `${mode} diagnostics subprocess should pass.`);
}

const modeArgument = process.argv.find((argument) => argument.startsWith('--diagnostics-mode='));
if (modeArgument) {
  const mode = modeArgument.slice('--diagnostics-mode='.length);
  assert.ok(['default', 'approved'].includes(mode));
  if (mode === 'approved') runApprovedMode();
  else runDefaultMode();
  console.log(`Smart Resupply QA ${mode} diagnostic checks passed.`);
} else {
  runFixtureAndContractChecks();
  runIsolatedMode('default');
  runIsolatedMode('approved');
  console.log('Smart Resupply QA acceptance checks passed.');
}
