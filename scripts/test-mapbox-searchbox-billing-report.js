const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

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

const billingGuardPath = path.join(root, 'lib', 'mapboxSearchBillingGuard.ts');
const {
  buildMapboxSearchBillingCostReport,
  formatMapboxSearchBillingCostReport,
} = require(billingGuardPath);

function event(flow, operation, overrides = {}) {
  return {
    flow,
    surface: flow.startsWith('navigate') ? 'Navigate' : 'Trip Builder',
    operatorAction: `${flow} ${operation}`,
    operation,
    outcome: 'success',
    sessionToken: `${flow}-token`,
    requestSignature: `${flow}:${operation}`,
    resultCount: 1,
    capturedAt: '2026-07-01T12:00:00.000Z',
    ...overrides,
  };
}

function currentFlowEvents() {
  return [
    event('navigate_destination_search', 'searchbox_suggest', {
      sessionToken: 'nav-session-1',
      requestSignature: 'moab|38.573,-109.550|no-bbox|limit:5',
      resultCount: 4,
    }),
    event('navigate_destination_search', 'searchbox_retrieve', {
      sessionToken: 'nav-session-1',
      suggestionId: 'place.nav',
    }),
    event('trip_builder_itinerary_search', 'searchbox_suggest', {
      sessionToken: 'itinerary-session-1',
      requestSignature: 'water stop|38.570,-109.550|no-bbox|limit:5',
      resultCount: 0,
      outcome: 'empty',
    }),
    event('trip_builder_itinerary_search', 'forward_geocode_fallback', {
      sessionToken: 'itinerary-session-1',
      requestSignature: 'water stop|38.570,-109.550|no-bbox|limit:5',
      reason: 'searchbox_empty',
    }),
    event('trip_builder_itinerary_search', 'coordinate_reuse', {
      sessionToken: 'itinerary-session-1',
      suggestionId: 'fallback-water',
      reason: 'forward_geocode',
    }),
    event('trip_builder_smart_resupply', 'searchbox_suggest', {
      sessionToken: 'smart-session-1',
      requestSignature: 'gas station fuel diesel|38.570,-109.550|bbox-a|limit:5',
      resultCount: 5,
    }),
    event('trip_builder_smart_resupply', 'searchbox_suggest', {
      sessionToken: 'smart-session-1',
      requestSignature: 'grocery store supermarket supplies|38.580,-109.560|bbox-b|limit:5',
      resultCount: 4,
    }),
    event('trip_builder_smart_resupply', 'searchbox_retrieve', {
      sessionToken: 'smart-session-1',
      suggestionId: 'place.fuel',
    }),
    event('trip_builder_smart_resupply', 'searchbox_retrieve', {
      sessionToken: 'smart-session-1',
      suggestionId: 'place.grocery',
    }),
    event('trip_builder_route_context_places', 'searchbox_suggest', {
      sessionToken: 'route-context-session-1',
      requestSignature: 'fuel stop|38.570,-109.550|no-bbox|limit:5',
      resultCount: 2,
    }),
    event('trip_builder_route_context_places', 'searchbox_retrieve', {
      sessionToken: 'route-context-session-1',
      suggestionId: 'place.route-context',
    }),
  ];
}

function runPerFlowCostReportRegression() {
  const report = buildMapboxSearchBillingCostReport(currentFlowEvents(), {
    invoicePeriod: '2026-07 invoice dry run',
    rates: {
      currency: 'USD',
      searchBoxSessionUnitCost: 0.05,
      forwardGeocodeRequestUnitCost: 0.002,
    },
  });

  assert.strictEqual(report.status, 'pass');
  assert.strictEqual(report.totals.searchBoxSessionUnits, 4);
  assert.strictEqual(report.totals.forwardGeocodeRequestUnits, 1);
  assert.strictEqual(report.totals.coordinateReuseCount, 1);
  assert.strictEqual(report.totals.estimatedTotalCost, 0.202);
  assert.deepStrictEqual(
    report.flowSummaries.map((summary) => summary.flow),
    [
      'navigate_destination_search',
      'trip_builder_itinerary_search',
      'trip_builder_route_context_places',
      'trip_builder_smart_resupply',
    ],
  );

  const itinerary = report.flowSummaries.find((summary) => summary.flow === 'trip_builder_itinerary_search');
  assert.ok(itinerary, 'Trip Builder itinerary search should be attributed as a real ECS flow.');
  assert.strictEqual(itinerary.searchBoxSessionUnits, 1);
  assert.strictEqual(itinerary.forwardGeocodeRequestUnits, 1);
  assert.strictEqual(itinerary.coordinateReuseCount, 1);
  assert.strictEqual(itinerary.estimatedTotalCost, 0.052);
  assert.match(
    itinerary.notes.join('\n'),
    /Forward geocode fallback is reported separately from Search Box sessions/,
  );

  const formatted = formatMapboxSearchBillingCostReport(report);
  assert.match(formatted, /Mapbox Search billing cost report: PASS/);
  assert.match(formatted, /navigate_destination_search/);
  assert.match(formatted, /trip_builder_smart_resupply/);
  assert.match(formatted, /Estimated total: USD 0\.2020/);
}

function runRiskAndSpikeRegression() {
  const riskyEvents = [
    event('navigate_destination_search', 'searchbox_suggest', { sessionToken: 'nav-1' }),
    event('navigate_destination_search', 'searchbox_suggest', { sessionToken: 'nav-2' }),
    event('navigate_destination_search', 'searchbox_suggest', { sessionToken: 'nav-3' }),
    event('unlabeled_mapbox_search', 'searchbox_suggest', { sessionToken: 'unlabeled-1' }),
    event('unknown_partner_search', 'searchbox_suggest', { sessionToken: 'unknown-1' }),
    event('trip_builder_itinerary_search', 'searchbox_suggest', { sessionToken: null }),
    event('trip_builder_itinerary_search', 'forward_geocode_fallback', {
      sessionToken: 'itinerary-fallback',
      reason: 'quota_limited',
    }),
    event('trip_builder_itinerary_search', 'searchbox_retrieve', {
      sessionToken: 'itinerary-fallback',
      suggestionId: 'fallback-should-not-retrieve',
    }),
  ];
  const report = buildMapboxSearchBillingCostReport(riskyEvents, {
    flowBudgets: {
      navigate_destination_search: { maxSearchBoxSessionUnits: 2 },
    },
  });

  assert.strictEqual(report.status, 'fail');
  assert.ok(report.risks.some((risk) => /lacks a billing flow label/i.test(risk.message)));
  assert.ok(report.risks.some((risk) => /Unexpected Mapbox search billing flow/i.test(risk.message)));
  assert.ok(report.risks.some((risk) => /exceeded the configured Search Box session budget/i.test(risk.message)));
  assert.ok(report.risks.some((risk) => /missing a Search Box session token/i.test(risk.message)));
  assert.ok(report.risks.some((risk) => /retrieve after quota fallback/i.test(risk.message)));
}

function runReportScriptContract() {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.strictEqual(
    packageJson.scripts['report:mapbox-searchbox-billing'],
    'node scripts/report-mapbox-searchbox-billing.js',
    'package.json should expose a rerunnable Mapbox Search billing report script.',
  );
  assert.strictEqual(
    packageJson.scripts['test:mapbox-searchbox-billing-report'],
    'node ./scripts/test-mapbox-searchbox-billing-report.js',
    'package.json should expose focused Mapbox Search billing report regression coverage.',
  );
  assert.ok(
    fs.existsSync(path.join(root, 'scripts', 'report-mapbox-searchbox-billing.js')),
    'The billing report script should exist.',
  );
  const readinessGateSource = fs.readFileSync(
    path.join(root, 'scripts', 'check-mapbox-searchbox-billing-readiness.mjs'),
    'utf8',
  );
  assert.ok(
    readinessGateSource.includes('buildMapboxSearchBillingCostReport') &&
      readinessGateSource.includes('report-mapbox-searchbox-billing.js'),
    'The Mapbox billing readiness gate should protect the concrete per-flow cost report lane.',
  );

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecs-mapbox-billing-report-'));
  const eventsPath = path.join(tempDir, 'events.json');
  fs.writeFileSync(eventsPath, JSON.stringify({ events: currentFlowEvents() }, null, 2), 'utf8');
  const result = spawnSync(
    process.execPath,
    [
      path.join(root, 'scripts', 'report-mapbox-searchbox-billing.js'),
      `--events=${eventsPath}`,
      '--json',
      '--invoice-period=2026-07 invoice dry run',
      '--searchbox-session-unit-cost=0.05',
      '--forward-geocode-unit-cost=0.002',
    ],
    { cwd: root, encoding: 'utf8' },
  );
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.strictEqual(parsed.status, 'pass');
  assert.strictEqual(parsed.totals.searchBoxSessionUnits, 4);

  const riskyPath = path.join(tempDir, 'risky-events.json');
  fs.writeFileSync(
    riskyPath,
    JSON.stringify({ events: [event('unlabeled_mapbox_search', 'searchbox_suggest')] }, null, 2),
    'utf8',
  );
  const risky = spawnSync(
    process.execPath,
    [path.join(root, 'scripts', 'report-mapbox-searchbox-billing.js'), `--events=${riskyPath}`],
    { cwd: root, encoding: 'utf8' },
  );
  assert.strictEqual(risky.status, 1, 'Risky report input should fail the report gate.');
  assert.match(risky.stdout, /unlabeled_mapbox_search/);
}

runPerFlowCostReportRegression();
runRiskAndSpikeRegression();
runReportScriptContract();
console.log('Mapbox Search Box billing cost report regression passed.');
