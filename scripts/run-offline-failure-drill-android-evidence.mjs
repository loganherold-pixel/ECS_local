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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return filePath;
}

function artifactSize(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return null;
  }
}

function readArtifact(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function normalizeSystemNetworkAssertion(bundle, systemNetworkDisabled) {
  if (!systemNetworkDisabled) return bundle;
  const offlineAssertions = bundle.offlineAssertions ?? {};
  if (offlineAssertions.systemNetworkDisabled === true) return bundle;
  return {
    ...bundle,
    offlineAssertions: {
      ...offlineAssertions,
      systemNetworkDisabled: true,
      notes: [
        ...(Array.isArray(offlineAssertions.notes) ? offlineAssertions.notes : []),
        'System network disabled confirmation was supplied by the Android evidence harness.',
      ],
    },
  };
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
  const explicitCacheManifestPath = argValue('cache-manifest');
  const cacheManifestPath = resolveMaybe(explicitCacheManifestPath ?? path.join(outDir, 'cache-manifest.json'));
  const drillResultPath = resolveMaybe(argValue('drill-result', path.join(outDir, 'drill-result.json')));
  const offlineAssertionsPath = resolveMaybe(argValue('offline-assertions', path.join(outDir, 'offline-assertions.json')));
  const readinessMetadataPath = resolveMaybe(argValue('readiness-metadata', path.join(outDir, 'readiness-metadata.json')));
  const captureBundleArtifactPath = resolveMaybe(argValue('capture-bundle-artifact', path.join(outDir, 'capture-bundle.json')));
  const captureBundleInputPath = resolveMaybe(argValue('capture-bundle'));
  const manifestPath = path.join(outDir, 'manifest.json');
  const checkedAt = new Date().toISOString();

  fs.mkdirSync(outDir, { recursive: true });

  const {
    buildOfflineFailureDrillFromCacheFixture,
  } = loadTsModule(path.join(root, 'lib', 'offlineFailureDrillService.ts'));
  const {
    buildOfflineFailureDrillEvidenceCaptureBundle,
    buildOfflineFailureDrillAndroidManifestFromCapture,
    buildOfflineFailureDrillCaptureArtifactPayloads,
  } = loadTsModule(path.join(root, 'lib', 'offlineFailureDrillEvidenceCapture.ts'));

  const fixture = readJson(fixturePath);
  const sourceBundle = captureBundleInputPath
    ? readJson(captureBundleInputPath)
    : buildOfflineFailureDrillEvidenceCaptureBundle({
      captureId: argValue('evidence-id', `offline-failure-drill-${profile}-${Date.now()}`),
      capturedAt: checkedAt,
      source: 'fixture_harness',
      evidenceSource: 'fixture',
      cacheFixtureProfile: profile,
      systemNetworkDisabled: hasArg('system-network-disabled'),
      drillResult: buildOfflineFailureDrillFromCacheFixture(fixture, {
        now: checkedAt,
        noNetworkModeVerified: hasArg('app-observed-offline') && argValue('runtime-network-probe', 'unknown') === 'offline',
      }),
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
      validationNotes: [
        'Generated from cache fixture profile by the Offline Failure Drill Android evidence harness.',
        'Do not fabricate Android evidence; fixture harness output remains blocked until real Android artifacts are supplied.',
      ],
    });
  const bundle = normalizeSystemNetworkAssertion(sourceBundle, hasArg('system-network-disabled'));

  const payloads = buildOfflineFailureDrillCaptureArtifactPayloads(bundle, { artifactDir: outDir });
  writeJson(captureBundleArtifactPath, JSON.parse(payloads.captureBundle.body));
  writeJson(drillResultPath, JSON.parse(payloads.drillResult.body));
  writeJson(offlineAssertionsPath, JSON.parse(payloads.offlineAssertions.body));
  writeJson(readinessMetadataPath, JSON.parse(payloads.readinessMetadata.body));

  if (!explicitCacheManifestPath && !hasArg('real')) {
    writeJson(cacheManifestPath, fixture);
  }

  const manifest = buildOfflineFailureDrillAndroidManifestFromCapture(bundle, {
    artifactDir: outDir,
    manifestPath,
    evidenceId: argValue('evidence-id', bundle.captureId),
    evidenceKind: argValue('evidence-kind', 'android_no_network_emulator'),
    evidenceSource: hasArg('real') ? 'real' : 'fixture',
    cacheManifestPath,
    captureBundlePath: captureBundleArtifactPath,
    drillResultPath,
    offlineAssertionsPath,
    readinessMetadataPath,
    screenshotPaths,
    logPaths,
    systemNetworkDisabled: hasArg('system-network-disabled') || bundle.offlineAssertions?.systemNetworkDisabled === true,
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
    app: {
      appBuildId: argValue('app-build-id') ?? undefined,
      appVersion: argValue('app-version') ?? undefined,
      gitSha: argValue('git-sha') ?? undefined,
      bundleId: argValue('bundle-id') ?? undefined,
    },
    platform: {
      deviceName: argValue('device-name') ?? undefined,
      emulatorName: argValue('emulator-name') ?? undefined,
      osVersion: argValue('os-version') ?? undefined,
      apiLevel: argValue('api-level') ?? undefined,
    },
  });

  writeJson(manifestPath, manifest);

  const {
    validateOfflineFailureDrillAndroidEvidenceManifest,
  } = loadTsModule(path.join(root, 'lib', 'offlineFailureDrillEvidence.ts'));
  const validation = validateOfflineFailureDrillAndroidEvidenceManifest(manifest, {
    rootDir: root,
    artifactExists: fs.existsSync,
    artifactRead: readArtifact,
    artifactSize,
  });

  print([
    `Offline Failure Drill Android evidence manifest: ${manifestPath}`,
    `cacheFixtureProfile: ${profile}`,
    `appObservedOffline: ${manifest.networkState.appObservedOffline}`,
    `systemNetworkDisabled: ${manifest.networkState.systemNetworkDisabled}`,
    `runtimeNetworkProbe: ${manifest.networkState.runtimeNetworkProbe}`,
    `drillResultPath: ${manifest.drillResultPath}`,
    `offlineAssertionsPath: ${manifest.offlineAssertionsPath}`,
    `readinessMetadataPath: ${manifest.readinessMetadataPath}`,
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
