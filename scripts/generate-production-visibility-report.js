const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');

require.extensions['.ts'] = function compileTypeScript(module, filename) {
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
  buildECSProductionVisibilityReport,
  createRuntimeFeatureVisibilityContext,
} = require(path.join(root, 'lib', 'features', 'featureVisibilityRegistry.ts'));

function argumentValue(name, args) {
  const prefix = `--${name}=`;
  const match = args.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function parseApprovalSet(value) {
  return new Set(
    String(value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function buildProductionReport(options = {}) {
  const env = options.env ?? process.env;
  const context = createRuntimeFeatureVisibilityContext({
    environment: 'production',
    env,
    online: true,
    authenticated: true,
    hasFullAccess: true,
    isAdmin: false,
    backends: {
      supabase: env.EXPO_PUBLIC_SUPABASE_URL && env.EXPO_PUBLIC_SUPABASE_ANON_KEY
        ? 'available'
        : 'unavailable',
    },
    providers: {
      weather: 'unknown',
      established_campgrounds: 'unknown',
      dispersed_camping: 'unknown',
    },
    hardware: {
      bluetooth: 'unknown',
      gps: 'unknown',
    },
    permissions: {
      bluetooth: 'unknown',
      location: 'unknown',
    },
    privacyApprovals: parseApprovalSet(env.ECS_APPROVED_PRIVACY_CONTROLS),
    productionEvidence: parseApprovalSet(env.ECS_ACCEPTED_PRODUCTION_EVIDENCE),
  });
  const report = buildECSProductionVisibilityReport({
    context,
    generatedAt: options.generatedAt,
  });
  const checks = [
    {
      id: 'registry_valid',
      passed: report.registryValid,
    },
    {
      id: 'development_controls_hidden_in_production',
      passed: report.features
        .filter((feature) => feature.maturity === 'development')
        .every((feature) => feature.visible === false),
    },
    {
      id: 'nonproduction_maturity_not_production_approved',
      passed: report.features
        .filter((feature) => feature.maturity !== 'production')
        .every((feature) => feature.productionApproved === false),
    },
    {
      id: 'sensitive_systems_fail_closed',
      passed: ['dispatch_team_position_sharing', 'dispatch_external_integrations', 'ai_assist', 'campops_telemetry', 'community_publishing']
        .every((featureId) => report.features.find((feature) => feature.featureId === featureId)?.visible === false),
    },
  ];
  return {
    ...report,
    guardChecks: checks,
    guardPassed: checks.every((check) => check.passed),
    notes: [
      'Implementation availability and production approval are independent fields.',
      'Missing provider, hardware, privacy, and evidence inputs remain unknown or unavailable; this report does not infer approval.',
      'Environment variable values and provider credentials are never included.',
    ],
  };
}

function writeProductionReport(report, outputPath) {
  const absolute = path.resolve(root, outputPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return absolute;
}

async function runCli(args = process.argv.slice(2)) {
  const jsonOnly = args.includes('--json');
  const output = argumentValue('output', args) ?? path.join('.smoke', 'production-visibility-report.json');
  const report = buildProductionReport();
  const outputPath = writeProductionReport(report, output);
  if (jsonOnly) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`Production visibility guard: ${report.guardPassed ? 'PASS' : 'BLOCKED'}\n`);
    process.stdout.write(`Report: ${path.relative(root, outputPath)}\n`);
    for (const check of report.guardChecks) {
      process.stdout.write(`- ${check.id}: ${check.passed ? 'passed' : 'failed'}\n`);
    }
  }
  if (process.env.ECS_VERIFICATION_RESULT_FILE) {
    const {
      EVIDENCE_SAFE_CODES,
      VERIFICATION_OUTCOMES,
      writeEvidenceCheckResultForLane,
    } = await import(pathToFileURL(path.join(__dirname, 'verification', 'evidence-result.mjs')).href);
    return writeEvidenceCheckResultForLane({
      checkId: 'production-visibility-report',
      status: report.guardPassed ? VERIFICATION_OUTCOMES.PASSED : VERIFICATION_OUTCOMES.FAILED,
      safeCode: report.guardPassed ? EVIDENCE_SAFE_CODES.VERIFIED : EVIDENCE_SAFE_CODES.CHECK_FAILED,
      blockerIds: [],
      summary: report.guardPassed
        ? 'Production visibility report is valid; it does not grant production approval.'
        : 'Production visibility report guard failed.',
      evidence: report,
      diagnostics: {
        artifactId: 'production-visibility-report',
        guardPassed: report.guardPassed,
        resultCount: report.guardChecks.length,
        failedCount: report.guardChecks.filter((check) => !check.passed).length,
      },
    });
  }
  return report.guardPassed ? 0 : 1;
}

if (require.main === module) {
  runCli()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}

module.exports = {
  buildProductionReport,
  runCli,
  writeProductionReport,
};
