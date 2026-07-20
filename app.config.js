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

function describeMapboxTokenShape(value) {
  const token = typeof value === 'string' ? value.trim() : '';
  if (!token) return 'missing';
  const normalized = token.toLowerCase();
  if (normalized === 'undefined' || normalized === 'null' || normalized === 'your_token_here') return 'placeholder';
  if (token.startsWith('pk.')) return 'pk.*';
  if (token.startsWith('sk.')) return 'sk.*';
  return 'other';
}

function isPublicRuntimeMapboxToken(value) {
  const token = typeof value === 'string' ? value.trim() : '';
  return token.length >= 10 && token.startsWith('pk.');
}

function assertFieldtestRuntimeMapboxToken(profile) {
  const isFieldtest = profile === 'fieldtest' || process.env.EXPO_PUBLIC_ECS_FIELD_TEST_BUILD === 'true';
  if (!isFieldtest) return;

  const runtimeToken = firstNonEmpty(process.env.EXPO_PUBLIC_MAPBOX_TOKEN);
  const runtimeAliasToken = firstNonEmpty(process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN);
  const downloadsToken = firstNonEmpty(process.env.MAPBOX_DOWNLOADS_TOKEN);
  const shouldRequireRuntimeToken =
    process.env.EAS_BUILD === 'true' ||
    process.env.ECS_REQUIRE_FIELDTEST_MAPBOX_TOKEN === 'true';

  if (!runtimeToken) {
    if (shouldRequireRuntimeToken) {
      throw new Error(
        '[Fieldtest Mapbox] EXPO_PUBLIC_MAPBOX_TOKEN is required and must be a public pk.* runtime token.',
      );
    }
    return;
  }

  if (!isPublicRuntimeMapboxToken(runtimeToken)) {
    throw new Error(
      `[Fieldtest Mapbox] EXPO_PUBLIC_MAPBOX_TOKEN must be a public pk.* runtime token; runtimeTokenShape=${describeMapboxTokenShape(runtimeToken)}.`,
    );
  }

  if (runtimeAliasToken && !isPublicRuntimeMapboxToken(runtimeAliasToken)) {
    throw new Error(
      `[Fieldtest Mapbox] EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN must be a public pk.* runtime token when set; runtimeAliasTokenShape=${describeMapboxTokenShape(runtimeAliasToken)}.`,
    );
  }

  if (downloadsToken && runtimeToken.trim() === downloadsToken.trim()) {
    throw new Error('[Fieldtest Mapbox] EXPO_PUBLIC_MAPBOX_TOKEN must not match MAPBOX_DOWNLOADS_TOKEN.');
  }
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

function resolveScopeBSmartResupplyQaAcceptance(profile, env = process.env) {
  const requestedFixture = firstNonEmpty(env.EXPO_PUBLIC_ECS_QA_SMART_RESUPPLY_PROVIDER_FIXTURE);
  const authorized =
    profile === 'scope-b-qa' &&
    env.ECS_SCOPE_B_QA_ACCEPTANCE_BUILD === '1';

  if (requestedFixture && !authorized) {
    throw new Error(
      '[Scope B QA] Smart Resupply provider fixtures require the scope-b-qa profile and ECS_SCOPE_B_QA_ACCEPTANCE_BUILD=1.',
    );
  }
  if (requestedFixture && requestedFixture !== 'qualified_empty') {
    throw new Error(`[Scope B QA] Unsupported Smart Resupply provider fixture: ${requestedFixture}.`);
  }

  const diagnosticsApproved =
    authorized &&
    env.ECS_SUPPORT_DIAGNOSTICS_ENABLED === '1' &&
    env.ECS_SUPPORT_DIAGNOSTICS_APPROVED === '1';

  return {
    authorized,
    diagnosticsApproved,
    fixture: authorized && requestedFixture === 'qualified_empty' ? 'qualified_empty' : null,
    consoleCapture: diagnosticsApproved && env.ECS_SCOPE_B_QA_CONSOLE_CAPTURE === '1',
  };
}

function createExpoConfig() {
  const expo = JSON.parse(JSON.stringify(baseConfig.expo));
  const profile = resolveProfile();
  assertFieldtestRuntimeMapboxToken(profile);
  const scopeBSmartResupplyQa = resolveScopeBSmartResupplyQaAcceptance(profile);

  const updates = { ...(expo.updates ?? {}) };

  if (
    profile === 'fieldtest' ||
    process.env.EXPO_PUBLIC_ECS_FIELD_TEST_BUILD === 'true' ||
    scopeBSmartResupplyQa.authorized
  ) {
    updates.enabled = false;
    updates.checkAutomatically = 'NEVER';
  }

  expo.updates = updates;
  expo.extra = {
    ...(expo.extra ?? {}),
    buildFingerprint: buildFingerprint(profile),
    scopeBSmartResupplyQa,
  };

  return expo;
}

module.exports = createExpoConfig;
module.exports.resolveScopeBSmartResupplyQaAcceptance = resolveScopeBSmartResupplyQaAcceptance;
