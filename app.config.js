const { execSync } = require('node:child_process');
const baseConfig = require('./app.json');
const { applyRouteDiscoveryQaNetworkIsolation } = require('./lib/explore/routeDiscoveryQaNetworkIsolation');

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

function resolveRouteDiscoveryQa(profile, env = process.env) {
  const requested = env.EXPO_PUBLIC_ECS_ROUTE_DISCOVERY_QA_TRANSPORT === 'true';
  const enabled = profile === 'route-discovery-qa' && requested;
  if (requested && profile !== 'route-discovery-qa') {
    throw new Error('Route-discovery QA transport requires the route-discovery-qa build profile.');
  }
  return {
    enabled,
    label: enabled ? 'ROUTE DISCOVERY QA — SYNTHETIC NON-PRODUCTION' : null,
    transportId: enabled ? 'route-discovery-qa-v1' : null,
    remoteActivation: false,
  };
}

module.exports = () => {
  const supabaseNetworkDisabled = applyRouteDiscoveryQaNetworkIsolation(process.env);
  const expo = JSON.parse(JSON.stringify(baseConfig.expo));
  const profile = resolveProfile();
  const routeDiscoveryQa = resolveRouteDiscoveryQa(profile);
  const updates = { ...(expo.updates ?? {}) };

  if (
    profile === 'fieldtest' ||
    profile === 'route-discovery-qa' ||
    process.env.EXPO_PUBLIC_ECS_FIELD_TEST_BUILD === 'true'
  ) {
    updates.enabled = false;
    updates.checkAutomatically = 'NEVER';
  }

  expo.updates = updates;
  expo.extra = {
    ...(expo.extra ?? {}),
    buildFingerprint: buildFingerprint(profile),
    routeDiscoveryQa: { ...routeDiscoveryQa, supabaseNetworkDisabled },
  };

  return expo;
};

module.exports.resolveRouteDiscoveryQa = resolveRouteDiscoveryQa;
