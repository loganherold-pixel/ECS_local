import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const requireForTs = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT_DIR = path.join(root, '.smoke', 'offline-failure-drill-android-evidence');
const PROFILES = ['available', 'partial', 'stale', 'unavailable', 'manual_fallback'];

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasArg(name) {
  return process.argv.includes(`--${name}`);
}

function loadTsModule(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filePath,
  }).outputText;
  const module = { exports: {} };
  const localRequire = (request) => {
    if (request.startsWith('.')) {
      const resolved = path.join(path.dirname(filePath), request.endsWith('.ts') ? request : `${request}.ts`);
      return loadTsModule(resolved);
    }
    return requireForTs(request);
  };
  const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', output);
  fn(module.exports, localRequire, module, filePath, path.dirname(filePath));
  return module.exports;
}

function resolveMaybe(filePath) {
  if (!filePath) return null;
  return path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
}

function print(lines) {
  process.stdout.write(`${lines.join('\n')}\n`);
}

async function main() {
  const profile = argValue('profile', 'available');
  const outDir = resolveMaybe(argValue('out', DEFAULT_OUT_DIR));
  if (!PROFILES.includes(profile)) {
    throw new Error(`Unsupported cacheFixtureProfile "${profile}". Expected one of: ${PROFILES.join(', ')}`);
  }

  const fixturePath = path.join(root, 'fixtures', 'offline-failure-drill', `${profile}.json`);
  const screenshotPaths = process.argv
    .filter((arg) => arg.startsWith('--screenshot='))
    .map((arg) => resolveMaybe(arg.slice('--screenshot='.length)))
    .filter(Boolean);
  const logPaths = process.argv
    .filter((arg) => arg.startsWith('--log='))
    .map((arg) => resolveMaybe(arg.slice('--log='.length)))
    .filter(Boolean);
  const cacheManifestPath = resolveMaybe(argValue('cache-manifest', fixturePath));
  const drillResultPath = resolveMaybe(argValue('drill-result', path.join(outDir, 'drill-result.json')));
  const manifestPath = path.join(outDir, 'manifest.json');
  const checkedAt = new Date().toISOString();

  fs.mkdirSync(outDir, { recursive: true });

  const manifest = {
    evidenceId: argValue('evidence-id', `offline-failure-drill-${profile}-${Date.now()}`),
    evidenceKind: argValue('evidence-kind', 'android_no_network_emulator'),
    evidenceSource: hasArg('real') ? 'real' : 'fixture',
    generatedAt: checkedAt,
    app: {
      appBuildId: argValue('app-build-id'),
      appVersion: argValue('app-version'),
      gitSha: argValue('git-sha'),
      bundleId: argValue('bundle-id'),
    },
    platform: {
      os: 'android',
      deviceName: argValue('device-name'),
      emulatorName: argValue('emulator-name'),
      osVersion: argValue('os-version'),
      apiLevel: argValue('api-level'),
    },
    networkState: {
      appObservedOffline: hasArg('app-observed-offline'),
      systemNetworkDisabled: hasArg('system-network-disabled'),
      checkedAt,
      runtimeNetworkProbe: argValue('runtime-network-probe', 'unknown'),
      notes: [
        hasArg('app-observed-offline')
          ? 'App/runtime offline assertion supplied by operator.'
          : 'App/runtime offline assertion missing. Do not fabricate Android evidence.',
      ],
    },
    cacheFixtureProfile: profile,
    cacheManifestPath,
    drillResultPath,
    screenshotPaths,
    logPaths,
    remoteAttemptSummary: {
      providerUpdateAttempted: hasArg('provider-update-attempted'),
      providerUpdateSucceeded: hasArg('provider-update-succeeded'),
      liveSyncAttempted: hasArg('live-sync-attempted'),
      liveSyncSucceeded: hasArg('live-sync-succeeded'),
      dispatchReplayAttempted: hasArg('dispatch-replay-attempted'),
      dispatchReplaySucceeded: hasArg('dispatch-replay-succeeded'),
      dispatchReplayLocalOnly: hasArg('dispatch-replay-local-only'),
      weatherRefreshAttempted: hasArg('weather-refresh-attempted'),
      weatherRefreshSucceeded: hasArg('weather-refresh-succeeded'),
      teamSyncAttempted: hasArg('team-sync-attempted'),
      teamSyncSucceeded: hasArg('team-sync-succeeded'),
    },
    resultSummary: {
      capabilityCount: Number(argValue('capability-count', '0')),
      statuses: {},
      productionReadiness: 'blocked',
    },
    ownerAcceptance: {
      accepted: hasArg('owner-accepted'),
      acceptedBy: argValue('accepted-by'),
      acceptedAt: hasArg('owner-accepted') ? checkedAt : undefined,
      notes: [
        hasArg('owner-accepted')
          ? 'Owner acceptance supplied by operator.'
          : 'Owner acceptance missing; production must remain blocked.',
      ],
    },
    artifacts: {
      directory: outDir,
      manifestPath,
    },
    validationNotes: [
      'Generated by the Offline Failure Drill Android evidence harness.',
      'Do not fake Android evidence. Screenshots, logs, runtime offline assertion, and owner acceptance must come from a real no-network run.',
    ],
  };

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const {
    validateOfflineFailureDrillAndroidEvidenceManifest,
  } = loadTsModule(path.join(root, 'lib', 'offlineFailureDrillEvidence.ts'));
  const validation = validateOfflineFailureDrillAndroidEvidenceManifest(manifest, {
    rootDir: root,
    artifactExists: fs.existsSync,
  });

  print([
    `Offline Failure Drill Android evidence manifest: ${manifestPath}`,
    `cacheFixtureProfile: ${profile}`,
    `appObservedOffline: ${manifest.networkState.appObservedOffline}`,
    `systemNetworkDisabled: ${manifest.networkState.systemNetworkDisabled}`,
    `runtimeNetworkProbe: ${manifest.networkState.runtimeNetworkProbe}`,
    `Validation: ${validation.productionEligible ? 'accepted' : validation.structurallyValid ? 'valid but blocked' : 'incomplete'}`,
    ...(validation.blockers.length ? [`Blockers: ${validation.blockers.join(', ')}`] : []),
    ...(validation.failedRules.length ? [`Failed rules: ${validation.failedRules.join(', ')}`] : []),
    ...(validation.missingArtifacts.length ? [`Missing artifacts: ${validation.missingArtifacts.join(', ')}`] : []),
  ]);

  process.exitCode = validation.productionEligible ? 0 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
