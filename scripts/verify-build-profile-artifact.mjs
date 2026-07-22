#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const {
  APPROVED_PRODUCTION_SIGNING_CERT_SHA256,
  applyUpdatesPolicy,
  formatInvariantIssues,
  normalizeCertificateSha256,
  parseAndroidManifestPolicy,
  resolveAndroidApplicationId,
  resolveEasBuildProfile,
  validateNativeBuildPolicy,
  validateSourceBuildPolicy,
} = require('./build-profile-policy.cjs');

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');

function optionValue(name) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), 'utf8'));
}

function executableCandidates(name) {
  const extension = process.platform === 'win32' ? '.bat' : '';
  const candidates = [name, `${name}${extension}`];
  const sdkRoots = [process.env.ANDROID_SDK_ROOT, process.env.ANDROID_HOME].filter(Boolean);
  for (const sdkRoot of sdkRoots) {
    if (name === 'apkanalyzer') {
      candidates.push(path.join(sdkRoot, 'cmdline-tools', 'latest', 'bin', `apkanalyzer${extension}`));
      candidates.push(path.join(sdkRoot, 'tools', 'bin', `apkanalyzer${extension}`));
    }
    if (name === 'apksigner') {
      const buildToolsRoot = path.join(sdkRoot, 'build-tools');
      if (fs.existsSync(buildToolsRoot)) {
        const versions = fs.readdirSync(buildToolsRoot).sort().reverse();
        for (const version of versions) {
          candidates.push(path.join(buildToolsRoot, version, `apksigner${extension}`));
        }
      }
    }
  }
  return [...new Set(candidates)];
}

function runFirst(candidates, args) {
  for (const command of candidates) {
    const result = spawnSync(command, args, {
      cwd: projectRoot,
      encoding: 'utf8',
      shell: process.platform === 'win32' && command.toLowerCase().endsWith('.bat'),
      windowsHide: true,
    });
    if (!result.error && result.status === 0 && result.stdout) return result.stdout;
  }
  return null;
}

function readNativeManifest(artifactPath) {
  if (path.extname(artifactPath).toLowerCase() !== '.apk') {
    return fs.readFileSync(artifactPath, 'utf8');
  }
  return runFirst(executableCandidates('apkanalyzer'), ['manifest', 'print', artifactPath]);
}

function readSigningCertificateSha256(artifactPath) {
  if (path.extname(artifactPath).toLowerCase() !== '.apk') {
    return optionValue('--signing-certificate-sha256') || '';
  }
  const output = runFirst(executableCandidates('apksigner'), ['verify', '--print-certs', artifactPath]);
  return output?.match(/certificate SHA-256 digest:\s*([A-Fa-f0-9:]+)/i)?.[1] ?? '';
}

const artifactArg = optionValue('--artifact');
if (!artifactArg) {
  console.error(
    '[ECS_BUILD_PROFILE_INVARIANT] postbuild_artifact_required: Pass --artifact with an APK or extracted native AndroidManifest.xml.',
  );
  process.exit(1);
}

const artifactPath = path.resolve(projectRoot, artifactArg);
if (!fs.existsSync(artifactPath)) {
  console.error(
    '[ECS_BUILD_PROFILE_INVARIANT] postbuild_artifact_unreadable: The requested artifact does not exist.',
  );
  process.exit(1);
}

const profileName =
  optionValue('--profile') ||
  process.env.ECS_BUILD_PROFILE ||
  process.env.EAS_BUILD_PROFILE ||
  'production';
const easConfig = readJson('eas.json');
const appConfig = readJson('app.json');
const sourceProfile = resolveEasBuildProfile(easConfig, profileName);
if (!sourceProfile) {
  console.error(
    '[ECS_BUILD_PROFILE_INVARIANT] build_profile_must_exist: The selected EAS build profile does not exist.',
  );
  process.exit(1);
}

const env = {
  ...(sourceProfile.env ?? {}),
  ...(sourceProfile.android?.env ?? {}),
  ...process.env,
};
const sourceApplicationId = resolveAndroidApplicationId(appConfig.expo?.android?.package, env);
const sourceUpdates = applyUpdatesPolicy(appConfig.expo?.updates, env.ECS_UPDATES_POLICY);
const sourceIssues = validateSourceBuildPolicy({
  applicationId: sourceApplicationId,
  profileName,
  env,
  sourceProfile,
  updates: sourceUpdates,
});
if (sourceIssues.length > 0) {
  for (const line of formatInvariantIssues(sourceIssues)) console.error(line);
  process.exit(1);
}

const manifestText = readNativeManifest(artifactPath);
if (!manifestText) {
  console.error(
    '[ECS_BUILD_PROFILE_INVARIANT] postbuild_native_manifest_unreadable: Native manifest inspection tooling could not read the artifact.',
  );
  process.exit(1);
}

const native = parseAndroidManifestPolicy(manifestText);
const nativeSigningCertificateSha256 = readSigningCertificateSha256(artifactPath);
const issues = validateNativeBuildPolicy({
  sourceApplicationId,
  sourceUpdatesPolicy: env.ECS_UPDATES_POLICY,
  nativeApplicationId: native.applicationId,
  nativeUpdatesEnabled: native.updatesEnabled,
  nativeCheckAutomatically: native.checkAutomatically,
  expectedSigningCertificateSha256:
    normalizeCertificateSha256(env.ECS_PRODUCTION_SIGNING_CERT_SHA256) ||
    APPROVED_PRODUCTION_SIGNING_CERT_SHA256,
  nativeSigningCertificateSha256,
});

if (issues.length > 0) {
  for (const line of formatInvariantIssues(issues)) console.error(line);
  process.exit(1);
}

console.log(
  `ECS post-build profile verification passed: profile=${profileName}; applicationId=${sourceApplicationId}; updatesPolicy=${env.ECS_UPDATES_POLICY || 'profile-default'}.`,
);
