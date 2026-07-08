import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_NAVIGATE_PROVIDER_ANDROID_MANIFEST,
  buildNavigateProviderAndroidEvidenceManifest,
  validateNavigateProviderAndroidEvidenceManifest,
  writeNavigateProviderAndroidEvidenceManifest,
} from './lib/navigate-provider-android-evidence.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STRICT_FLAG = '--strict';

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

function readArtifact(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function formatResult(manifest, validation, outputPath) {
  const lines = [
    `Navigate provider Android evidence: ${validation.repeatableSweepReady ? 'READY FOR HANDOFF REVIEW' : 'BLOCKED'}`,
    `Manifest: ${path.relative(root, outputPath)}`,
    `Evidence source: ${manifest.evidenceSource}`,
    `Provider candidate evidence: ${manifest.providerBackedCandidateEvidence.status}`,
    `Candidate/action artifacts: ${manifest.androidArtifacts.candidatePinsActions.length}`,
    `Active route-line artifacts: ${manifest.androidArtifacts.activeRouteLineContext.length}`,
    `Search freeze/standby artifacts: ${manifest.androidArtifacts.searchFreezeStandby.length}`,
    `Production accepted: no`,
  ];

  if (validation.blockers.length > 0) {
    lines.push('', 'Blockers:');
    for (const blocker of validation.blockers) lines.push(`- ${blocker}`);
  }

  if (validation.missingArtifacts.length > 0) {
    lines.push('', 'Missing artifacts:');
    for (const artifact of validation.missingArtifacts) lines.push(`- ${artifact}`);
  }

  lines.push(
    '',
    'Not claimed:',
    '- Provider influence approval',
    '- Owner or production acceptance',
    '- Raw provider payload review',
    '- Precise private coordinate capture',
  );

  return `${lines.join('\n')}\n`;
}

export function runNavigateProviderAndroidEvidenceCli(options = {}) {
  const args = options.args ?? process.argv.slice(2);
  const stdout = options.stdout ?? process.stdout;
  const jsonOnly = hasFlag(args, 'json');
  const strict = args.includes(STRICT_FLAG);
  const output = valueFor(args, 'out', DEFAULT_NAVIGATE_PROVIDER_ANDROID_MANIFEST);
  const manifestPath = path.isAbsolute(output) ? output : path.join(root, output);
  const providerSummaryPath = valueFor(args, 'provider-summary');
  const evidenceSource = valueFor(
    args,
    'evidence-source',
    providerSummaryPath || hasFlag(args, 'real') ? 'real_android_provider_sweep' : 'existing_android_partial',
  );

  const manifest = buildNavigateProviderAndroidEvidenceManifest({
    rootDir: root,
    manifestPath,
    evidenceSource,
    providerSummaryPath,
    candidatePinScreenshots: valuesFor(args, 'candidate-pin-screenshot'),
    activeRouteLineScreenshots: valuesFor(args, 'active-route-line-screenshot'),
    searchFreezeArtifacts: valuesFor(args, 'search-freeze-artifact'),
    logs: valuesFor(args, 'log'),
  });

  const outputPath = writeNavigateProviderAndroidEvidenceManifest(manifest, { rootDir: root });
  const validation = validateNavigateProviderAndroidEvidenceManifest(manifest, {
    rootDir: root,
    artifactExists: fs.existsSync,
    artifactRead: readArtifact,
  });

  if (jsonOnly) stdout.write(`${JSON.stringify({ manifest, validation }, null, 2)}\n`);
  else stdout.write(formatResult(manifest, validation, outputPath));

  return strict && !validation.repeatableSweepReady ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = runNavigateProviderAndroidEvidenceCli();
}
