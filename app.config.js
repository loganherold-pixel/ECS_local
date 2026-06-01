const { execSync } = require('node:child_process');
const baseConfig = require('./app.json');

function readGitValue(command) {
  try {
    return execSync(command, {
      cwd: __dirname,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch (_error) {
    return '';
  }
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function resolveDirtyState() {
  const explicit = firstNonEmpty(process.env.ECS_BUILD_DIRTY, process.env.EAS_BUILD_GIT_STATUS);
  if (explicit) {
    const normalized = explicit.toLowerCase();
    if (['0', 'false', 'clean'].includes(normalized)) return 'clean';
    if (['1', 'true', 'dirty'].includes(normalized)) return 'dirty';
    return normalized;
  }

  return readGitValue('git status --porcelain').length > 0 ? 'dirty' : 'clean';
}

function resolveProfile() {
  return firstNonEmpty(
    process.env.ECS_BUILD_PROFILE,
    process.env.EAS_BUILD_PROFILE,
    process.env.EXPO_PUBLIC_ECS_BUILD_PROFILE,
    process.env.NODE_ENV,
  ) ?? 'development';
}

function buildFingerprint(profile) {
  const commitSha =
    firstNonEmpty(
      process.env.ECS_BUILD_COMMIT_SHA,
      process.env.EAS_BUILD_GIT_COMMIT_HASH,
      process.env.GIT_COMMIT_SHA,
      readGitValue('git rev-parse HEAD'),
    ) ?? 'unknown';
  const dirtyState = resolveDirtyState();
  const buildTime = firstNonEmpty(process.env.ECS_BUILD_TIME, process.env.EAS_BUILD_TIME) ?? new Date().toISOString();

  return {
    commitSha,
    commitShortSha: commitSha === 'unknown' ? 'unknown' : commitSha.slice(0, 12),
    buildTime,
    dirtyState,
    isDirty: dirtyState !== 'clean',
    profile,
    channel: profile === 'fieldtest' ? 'fieldtest' : process.env.EAS_UPDATE_CHANNEL ?? profile,
    source: 'expo_config',
  };
}

module.exports = () => {
  const expo = JSON.parse(JSON.stringify(baseConfig.expo));
  const profile = resolveProfile();
  const updates = { ...(expo.updates ?? {}) };

  if (profile === 'fieldtest' || process.env.EXPO_PUBLIC_ECS_FIELD_TEST_BUILD === 'true') {
    updates.enabled = false;
    updates.checkAutomatically = 'NEVER';
  }

  expo.updates = updates;
  expo.extra = {
    ...(expo.extra ?? {}),
    buildFingerprint: buildFingerprint(profile),
  };

  return expo;
};
