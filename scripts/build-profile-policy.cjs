const PRODUCTION_APPLICATION_ID = 'com.expeditioncommand.planningofflinesync';
const APPROVED_UPDATES_POLICY = 'disabled';
const APPROVED_PRODUCTION_SIGNING_POLICY = 'approved-remote';
const APPROVED_PRODUCTION_SIGNING_CERT_SHA256 =
  'C564902A06F8440845BF4D63D59ADC64950B1B60B13187E2DF77E9115BE0FB5B';

const INVARIANTS = Object.freeze({
  QA_REQUIRES_NON_PRODUCTION_ID: 'qa_features_require_non_production_application_id',
  PRODUCTION_REQUIRES_LIVE_PROVIDER: 'production_id_requires_live_provider_mode',
  PRODUCTION_REQUIRES_FIXTURES_OFF: 'production_id_requires_qa_fixtures_disabled',
  PRODUCTION_REQUIRES_ROUTE_DISCOVERY_OFF:
    'production_id_requires_route_discovery_transport_disabled',
  PRODUCTION_REQUIRES_QA_OVERLAY_OFF: 'production_id_requires_qa_acceptance_overlay_disabled',
  PRODUCTION_REQUIRES_DIAGNOSTICS_OFF: 'production_id_requires_qa_diagnostics_disabled',
  PRODUCTION_REQUIRES_APPROVED_UPDATES: 'production_id_requires_approved_updates_policy',
  PRODUCTION_REQUIRES_REMOTE_SIGNING: 'production_id_requires_remote_signing_credentials',
  PRODUCTION_REQUIRES_APPROVED_SIGNING: 'production_id_requires_approved_signing_policy',
  PRODUCTION_REQUIRES_PINNED_SIGNING_CERT:
    'production_id_requires_pinned_signing_certificate',
  POSTBUILD_APPLICATION_ID_MISMATCH: 'postbuild_application_id_mismatch',
  POSTBUILD_UPDATES_ENABLED_MISMATCH: 'postbuild_updates_enabled_mismatch',
  POSTBUILD_UPDATES_CHECK_MISMATCH: 'postbuild_updates_check_policy_mismatch',
  POSTBUILD_SIGNING_CERT_MISMATCH: 'postbuild_signing_certificate_mismatch',
});

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on', 'enabled']);
const INACTIVE_VALUES = new Set(['', '0', 'false', 'no', 'off', 'disabled', 'none', 'null', 'undefined']);

function normalized(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

function isEnabled(value) {
  if (value === true || value === 1) return true;
  return typeof value === 'string' && TRUE_VALUES.has(normalized(value));
}

function isActiveValue(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value == null) return false;
  if (typeof value !== 'string') return false;
  return !INACTIVE_VALUES.has(normalized(value));
}

function normalizeCertificateSha256(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[^a-fA-F0-9]/g, '').toUpperCase();
}

function mergeProfile(base, override) {
  const result = { ...(base ?? {}) };
  for (const [key, value] of Object.entries(override ?? {})) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      result[key] &&
      typeof result[key] === 'object' &&
      !Array.isArray(result[key])
    ) {
      result[key] = mergeProfile(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function resolveEasBuildProfile(easConfig, profileName, stack = []) {
  const profile = easConfig?.build?.[profileName];
  if (!profile) return null;
  if (stack.includes(profileName)) {
    throw new Error('EAS build-profile inheritance contains a cycle.');
  }
  if (!profile.extends) return mergeProfile({}, profile);
  const parent = resolveEasBuildProfile(easConfig, profile.extends, [...stack, profileName]);
  if (!parent) throw new Error('EAS build-profile inheritance references a missing profile.');
  return mergeProfile(parent, profile);
}

function resolveAndroidApplicationId(baseApplicationId, env = process.env) {
  const override = typeof env.ECS_ANDROID_APPLICATION_ID === 'string'
    ? env.ECS_ANDROID_APPLICATION_ID.trim()
    : '';
  return override || baseApplicationId;
}

function applyUpdatesPolicy(updates, policy) {
  const next = { ...(updates ?? {}) };
  if (normalized(policy) === APPROVED_UPDATES_POLICY) {
    next.enabled = false;
    next.checkAutomatically = 'NEVER';
  }
  return next;
}

function collectQaSignals(profileName, env = {}) {
  const activeEcsEntries = Object.entries(env).filter(([key, value]) =>
    (key.startsWith('ECS_') || key.startsWith('EXPO_PUBLIC_ECS_')) && isActiveValue(value),
  );
  const namedQaFeature = activeEcsEntries.some(([key]) => /(?:^|_)QA(?:_|$)/.test(key));
  const namedFixture = activeEcsEntries.some(([key]) => /(?:^|_)FIXTURES?(?:_|$)/.test(key));
  const namedAcceptanceOverlay = activeEcsEntries.some(([key]) =>
    /(?:ACCEPTANCE.*OVERLAY|OVERLAY.*ACCEPTANCE)/.test(key),
  );
  const namedInternalDiagnostics = activeEcsEntries.some(([key]) =>
    /(?:^|_)DIAGNOSTICS?(?:_|$)/.test(key) && key !== 'ECS_PRODUCTION_DIAGNOSTICS_POLICY',
  );
  const providerMode = normalized(env.ECS_PROVIDER_MODE ?? env.EXPO_PUBLIC_ECS_PROVIDER_MODE ?? '');
  const routeDiscovery =
    isEnabled(env.EXPO_PUBLIC_ECS_ROUTE_DISCOVERY_QA_TRANSPORT) ||
    isEnabled(env.ECS_ROUTE_DISCOVERY_QA_TRANSPORT) ||
    isEnabled(env.ECS_DETERMINISTIC_ROUTE_DISCOVERY_TRANSPORT);
  const deterministicProvider =
    ['deterministic', 'fixture', 'synthetic', 'qa'].includes(providerMode) ||
    isEnabled(env.ECS_DETERMINISTIC_PROVIDER_TRANSPORT) ||
    isEnabled(env.EXPO_PUBLIC_ECS_DETERMINISTIC_PROVIDER_TRANSPORT);
  const fixtures =
    isActiveValue(env.EXPO_PUBLIC_ECS_QA_SMART_RESUPPLY_PROVIDER_FIXTURE) ||
    isEnabled(env.ECS_QA_FIXTURES_ENABLED) ||
    isEnabled(env.EXPO_PUBLIC_ECS_QA_FIXTURES_ENABLED) ||
    namedFixture;
  const acceptanceOverlay =
    isEnabled(env.ECS_SCOPE_B_QA_ACCEPTANCE_BUILD) ||
    isEnabled(env.ECS_QA_ACCEPTANCE_OVERLAY_ENABLED) ||
    isEnabled(env.EXPO_PUBLIC_ECS_QA_ACCEPTANCE_OVERLAY) ||
    namedAcceptanceOverlay ||
    profileName === 'scope-b-qa' ||
    profileName === 'route-discovery-qa';
  const diagnostics =
    isEnabled(env.ECS_SUPPORT_DIAGNOSTICS_ENABLED) ||
    isEnabled(env.ECS_SUPPORT_DIAGNOSTICS_APPROVED) ||
    isEnabled(env.ECS_SCOPE_B_QA_CONSOLE_CAPTURE) ||
    isEnabled(env.ECS_INTERNAL_DIAGNOSTICS_ENABLED) ||
    isEnabled(env.EXPO_PUBLIC_ECS_QA_DIAGNOSTICS) ||
    namedInternalDiagnostics;

  return {
    routeDiscovery,
    deterministicProvider,
    fixtures,
    acceptanceOverlay,
    diagnostics,
    any:
      routeDiscovery ||
      deterministicProvider ||
      fixtures ||
      acceptanceOverlay ||
      diagnostics ||
      namedQaFeature,
  };
}

function issue(invariant, message) {
  return { invariant, message };
}

function validateSourceBuildPolicy({
  applicationId,
  profileName,
  env = {},
  sourceProfile = {},
  updates = {},
}) {
  const issues = [];
  const qa = collectQaSignals(profileName, env);
  const isProductionApplicationId = applicationId === PRODUCTION_APPLICATION_ID;

  if (isProductionApplicationId && qa.any) {
    issues.push(issue(
      INVARIANTS.QA_REQUIRES_NON_PRODUCTION_ID,
      'Deterministic transports, QA fixtures, QA overlays, and QA diagnostics require a non-production application ID.',
    ));
  }

  if (!isProductionApplicationId) return issues;

  const providerMode = normalized(env.ECS_PROVIDER_MODE ?? env.EXPO_PUBLIC_ECS_PROVIDER_MODE ?? '');
  if (providerMode !== 'live') {
    issues.push(issue(
      INVARIANTS.PRODUCTION_REQUIRES_LIVE_PROVIDER,
      'The production application ID requires explicitly selected live provider mode.',
    ));
  }
  if (qa.fixtures || qa.deterministicProvider) {
    issues.push(issue(
      INVARIANTS.PRODUCTION_REQUIRES_FIXTURES_OFF,
      'The production application ID requires QA fixtures and deterministic provider transport to be disabled.',
    ));
  }
  if (qa.routeDiscovery) {
    issues.push(issue(
      INVARIANTS.PRODUCTION_REQUIRES_ROUTE_DISCOVERY_OFF,
      'The production application ID requires deterministic route-discovery transport to be disabled.',
    ));
  }
  if (qa.acceptanceOverlay) {
    issues.push(issue(
      INVARIANTS.PRODUCTION_REQUIRES_QA_OVERLAY_OFF,
      'The production application ID requires QA acceptance overlays to be disabled.',
    ));
  }
  if (qa.diagnostics) {
    issues.push(issue(
      INVARIANTS.PRODUCTION_REQUIRES_DIAGNOSTICS_OFF,
      'The production application ID requires QA and internal acceptance diagnostics to be disabled.',
    ));
  }

  const updatesPolicy = normalized(env.ECS_UPDATES_POLICY ?? '');
  if (
    updatesPolicy !== APPROVED_UPDATES_POLICY ||
    updates.enabled !== false ||
    normalized(updates.checkAutomatically) !== 'never'
  ) {
    issues.push(issue(
      INVARIANTS.PRODUCTION_REQUIRES_APPROVED_UPDATES,
      'The production application ID requires the explicitly approved disabled/NEVER updates policy.',
    ));
  }

  if (sourceProfile.credentialsSource !== 'remote') {
    issues.push(issue(
      INVARIANTS.PRODUCTION_REQUIRES_REMOTE_SIGNING,
      'The production application ID requires EAS-managed remote signing credentials.',
    ));
  }
  if (normalized(env.ECS_PRODUCTION_SIGNING_POLICY) !== APPROVED_PRODUCTION_SIGNING_POLICY) {
    issues.push(issue(
      INVARIANTS.PRODUCTION_REQUIRES_APPROVED_SIGNING,
      'The production application ID requires the approved production signing policy.',
    ));
  }
  if (
    normalizeCertificateSha256(env.ECS_PRODUCTION_SIGNING_CERT_SHA256) !==
    APPROVED_PRODUCTION_SIGNING_CERT_SHA256
  ) {
    issues.push(issue(
      INVARIANTS.PRODUCTION_REQUIRES_PINNED_SIGNING_CERT,
      'The production application ID requires the approved signing-certificate fingerprint.',
    ));
  }

  return issues;
}

function parseAndroidManifestPolicy(manifestText) {
  const text = typeof manifestText === 'string' ? manifestText : '';
  const manifestTag = text.match(/<manifest\b[^>]*>/i)?.[0] ?? '';
  const applicationId = manifestTag.match(/\bpackage\s*=\s*["']([^"']+)["']/i)?.[1] ?? null;
  const metadata = new Map();
  for (const tag of text.match(/<meta-data\b[^>]*>/gi) ?? []) {
    const name = tag.match(/(?:android:)?name\s*=\s*["']([^"']+)["']/i)?.[1];
    const value = tag.match(/(?:android:)?value\s*=\s*["']([^"']+)["']/i)?.[1];
    if (name && value != null) metadata.set(name, value);
  }
  const enabledRaw = metadata.get('expo.modules.updates.ENABLED');
  const checkAutomatically = metadata.get('expo.modules.updates.EXPO_UPDATES_CHECK_ON_LAUNCH') ?? null;
  return {
    applicationId,
    updatesEnabled:
      enabledRaw == null ? null : isEnabled(enabledRaw),
    checkAutomatically,
  };
}

function validateNativeBuildPolicy({
  sourceApplicationId,
  sourceUpdatesPolicy,
  nativeApplicationId,
  nativeUpdatesEnabled,
  nativeCheckAutomatically,
  expectedSigningCertificateSha256,
  nativeSigningCertificateSha256,
}) {
  const issues = [];
  if (!nativeApplicationId || nativeApplicationId !== sourceApplicationId) {
    issues.push(issue(
      INVARIANTS.POSTBUILD_APPLICATION_ID_MISMATCH,
      'The native artifact application ID does not match the validated source application ID.',
    ));
  }

  if (normalized(sourceUpdatesPolicy) === APPROVED_UPDATES_POLICY) {
    if (nativeUpdatesEnabled !== false) {
      issues.push(issue(
        INVARIANTS.POSTBUILD_UPDATES_ENABLED_MISMATCH,
        'Source requires updates disabled, but the native artifact does not report updates disabled.',
      ));
    }
    if (normalized(nativeCheckAutomatically) !== 'never') {
      issues.push(issue(
        INVARIANTS.POSTBUILD_UPDATES_CHECK_MISMATCH,
        'Source requires updates check-on-launch NEVER, but the native artifact reports a different policy.',
      ));
    }
  }

  if (sourceApplicationId === PRODUCTION_APPLICATION_ID) {
    const expected = normalizeCertificateSha256(expectedSigningCertificateSha256);
    const actual = normalizeCertificateSha256(nativeSigningCertificateSha256);
    if (!expected || !actual || actual !== expected) {
      issues.push(issue(
        INVARIANTS.POSTBUILD_SIGNING_CERT_MISMATCH,
        'The native artifact signing certificate does not match the approved production certificate.',
      ));
    }
  }

  return issues;
}

function formatInvariantIssues(issues) {
  return issues.map(({ invariant, message }) => `[ECS_BUILD_PROFILE_INVARIANT] ${invariant}: ${message}`);
}

function assertSourceBuildPolicy(input) {
  const issues = validateSourceBuildPolicy(input);
  if (issues.length === 0) return;
  const error = new Error(formatInvariantIssues(issues).join('\n'));
  error.name = 'EcsBuildProfileInvariantError';
  error.issues = issues;
  throw error;
}

module.exports = {
  APPROVED_PRODUCTION_SIGNING_CERT_SHA256,
  APPROVED_PRODUCTION_SIGNING_POLICY,
  APPROVED_UPDATES_POLICY,
  INVARIANTS,
  PRODUCTION_APPLICATION_ID,
  applyUpdatesPolicy,
  assertSourceBuildPolicy,
  collectQaSignals,
  formatInvariantIssues,
  normalizeCertificateSha256,
  parseAndroidManifestPolicy,
  resolveAndroidApplicationId,
  resolveEasBuildProfile,
  validateNativeBuildPolicy,
  validateSourceBuildPolicy,
};
