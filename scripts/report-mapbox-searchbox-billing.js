const fs = require('fs');
const path = require('path');
const process = require('process');
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

const {
  buildMapboxSearchBillingCostReport,
  formatMapboxSearchBillingCostReport,
} = require(path.join(root, 'lib', 'mapboxSearchBillingGuard.ts'));

function valuesFor(args, flag) {
  const prefix = `--${flag}=`;
  return args
    .filter((arg) => arg.startsWith(prefix))
    .map((arg) => arg.slice(prefix.length))
    .filter(Boolean);
}

function valueFor(args, flag, fallback = null) {
  return valuesFor(args, flag)[0] ?? fallback;
}

function hasFlag(args, flag) {
  return args.includes(`--${flag}`);
}

function numericValue(args, flag) {
  const value = valueFor(args, flag);
  if (value == null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid --${flag} value: ${value}`);
  }
  return parsed;
}

function readJson(filePath) {
  const resolved = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function eventsFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.events)) return payload.events;
  if (Array.isArray(payload?.billingEvents)) return payload.billingEvents;
  throw new Error('Expected events JSON to be an array or an object with events/billingEvents.');
}

function flowBudgetsFromArgs(args) {
  const maxSearchBoxSessionUnits = numericValue(args, 'max-searchbox-sessions-per-flow');
  const maxSearchBoxRequestCount = numericValue(args, 'max-searchbox-requests-per-flow');
  const maxForwardGeocodeRequestUnits = numericValue(args, 'max-forward-geocode-fallbacks-per-flow');
  const budget = {};
  if (maxSearchBoxSessionUnits != null) budget.maxSearchBoxSessionUnits = maxSearchBoxSessionUnits;
  if (maxSearchBoxRequestCount != null) budget.maxSearchBoxRequestCount = maxSearchBoxRequestCount;
  if (maxForwardGeocodeRequestUnits != null) budget.maxForwardGeocodeRequestUnits = maxForwardGeocodeRequestUnits;
  if (Object.keys(budget).length === 0) return {};

  return {
    navigate_destination_search: budget,
    trip_builder_itinerary_search: budget,
    trip_builder_route_context_places: budget,
    trip_builder_smart_resupply: budget,
  };
}

function run(argv = process.argv.slice(2)) {
  const eventsPath = valueFor(argv, 'events');
  if (!eventsPath) {
    throw new Error('Missing --events=<billing-events.json>. Export sanitized Mapbox Search billing events before running this report.');
  }

  const report = buildMapboxSearchBillingCostReport(eventsFromPayload(readJson(eventsPath)), {
    invoicePeriod: valueFor(argv, 'invoice-period'),
    rates: {
      currency: valueFor(argv, 'currency', 'USD'),
      searchBoxSessionUnitCost: numericValue(argv, 'searchbox-session-unit-cost'),
      forwardGeocodeRequestUnitCost: numericValue(argv, 'forward-geocode-unit-cost'),
    },
    flowBudgets: flowBudgetsFromArgs(argv),
  });

  const outPath = valueFor(argv, 'out');
  if (outPath) {
    const resolvedOut = path.isAbsolute(outPath) ? outPath : path.join(root, outPath);
    fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
    fs.writeFileSync(resolvedOut, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  if (hasFlag(argv, 'json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatMapboxSearchBillingCostReport(report));
  }

  return report.status === 'fail' ? 1 : 0;
}

if (require.main === module) {
  try {
    process.exitCode = run();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

module.exports = { run };
