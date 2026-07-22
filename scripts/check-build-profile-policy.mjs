#!/usr/bin/env node

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const {
  PRODUCTION_APPLICATION_ID,
  applyUpdatesPolicy,
  formatInvariantIssues,
  resolveAndroidApplicationId,
  resolveEasBuildProfile,
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
const applicationId = resolveAndroidApplicationId(appConfig.expo?.android?.package, env);
const updates = applyUpdatesPolicy(appConfig.expo?.updates, env.ECS_UPDATES_POLICY);
const issues = validateSourceBuildPolicy({
  applicationId,
  profileName,
  env,
  sourceProfile,
  updates,
});

if (issues.length > 0) {
  for (const line of formatInvariantIssues(issues)) console.error(line);
  process.exit(1);
}

const applicationClass = applicationId === PRODUCTION_APPLICATION_ID ? 'production' : 'non-production';
const providerClass = applicationClass === 'production' ? 'live' : 'non-production';
console.log(
  `ECS build-profile policy passed: profile=${profileName}; applicationClass=${applicationClass}; providerClass=${providerClass}; updatesPolicy=${env.ECS_UPDATES_POLICY || 'profile-default'}.`,
);
