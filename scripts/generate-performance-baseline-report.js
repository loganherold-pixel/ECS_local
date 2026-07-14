const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

function compileTypescript(module, filename) {
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
}

require.extensions['.ts'] = compileTypescript;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function emptySnapshot() {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    enabled: false,
    spans: [],
    counters: [],
    activeSpanCount: 0,
    outstandingAsyncJobs: 0,
    peakOutstandingAsyncJobs: 0,
    activeSubscriptionCount: 0,
  };
}

function parseArgs(argv) {
  const result = { input: null, output: null, failOnRegression: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--input') result.input = argv[++index] ?? null;
    else if (argv[index] === '--output') result.output = argv[++index] ?? null;
    else if (argv[index] === '--fail-on-regression') result.failOnRegression = true;
  }
  return result;
}

const args = parseArgs(process.argv.slice(2));
const baseline = readJson(path.join(root, 'config', 'performance-baseline.json'));
const snapshot = args.input ? readJson(path.resolve(root, args.input)) : emptySnapshot();
const { buildECSPerformanceReport } = require(path.join(root, 'lib', 'performance', 'performanceReport.ts'));
const report = buildECSPerformanceReport(snapshot, baseline);
const output = `${JSON.stringify(report, null, 2)}\n`;

if (args.output) {
  const outputPath = path.resolve(root, args.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output, 'utf8');
}
process.stdout.write(output);
if (args.failOnRegression && (report.status === 'failed' || report.measuredWorkflowCount === 0)) {
  process.exitCode = 1;
}
