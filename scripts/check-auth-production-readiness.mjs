import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const RESULT_RELATIVE_PATH = path.join('.smoke', 'auth-production-readiness-result.json');
const EVIDENCE_RELATIVE_PATH = path.join('.smoke', 'auth-production-evidence.json');

function relPath(root, filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/');
}

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function readJsonIfExists(filePath) {
  try {
    return JSON.parse(readIfExists(filePath));
  } catch {
    return null;
  }
}

function normalize(source) {
  return source.replace(/\r\n/g, '\n');
}

function check(id, label, passed, evidence = [], remediation = []) {
  return {
    id,
    label,
    passed: Boolean(passed),
    evidence,
    remediation,
  };
}

function evidenceTrue(evidence, key) {
  return evidence?.[key] === true;
}

function accepted(value) {
  return String(value ?? '').trim().toLowerCase() === 'accepted';
}

export function buildAuthProductionReadinessResult(options = {}) {
  const root = options.rootDir ?? process.cwd();
  const paths = {
    result: path.join(root, RESULT_RELATIVE_PATH),
    evidence: path.join(root, EVIDENCE_RELATIVE_PATH),
    layout: path.join(root, 'app', '_layout.tsx'),
    index: path.join(root, 'app', 'index.tsx'),
    login: path.join(root, 'app', 'login.tsx'),
    appContext: path.join(root, 'context', 'AppContext.tsx'),
    auth: path.join(root, 'lib', 'auth.ts'),
    authLogRedaction: path.join(root, 'lib', 'auth', 'authLogRedaction.ts'),
    distributionEntryResolver: path.join(root, 'lib', 'auth', 'distributionEntryResolver.ts'),
    offlineAccessPolicy: path.join(root, 'lib', 'auth', 'offlineAccessPolicy.ts'),
    subscriptionAccess: path.join(root, 'lib', 'subscriptionAccess.ts'),
    ecsProPurchase: path.join(root, 'lib', 'ecsProPurchase.ts'),
  };

  const evidence = readJsonIfExists(paths.evidence);
  const layout = readIfExists(paths.layout);
  const index = readIfExists(paths.index);
  const login = readIfExists(paths.login);
  const appContext = readIfExists(paths.appContext);
  const auth = readIfExists(paths.auth);
  const authLogRedaction = readIfExists(paths.authLogRedaction);
  const distributionEntryResolver = readIfExists(paths.distributionEntryResolver);
  const offlineAccessPolicy = readIfExists(paths.offlineAccessPolicy);
  const subscriptionAccess = readIfExists(paths.subscriptionAccess);
  const ecsProPurchase = readIfExists(paths.ecsProPurchase);
  const normalizedAppContext = normalize(appContext);

  const checks = [
    check(
      'startup_loading_is_bounded_and_diagnostic',
      'Startup/auth loading has bounded fallbacks, route readiness timeouts, and dev diagnostics instead of indefinite loading.',
      index.includes("import LoadingTransitionVideo from '../components/LoadingTransitionVideo';") &&
        index.includes('return <LoadingTransitionVideo />;') &&
        layout.includes('const MIN_LOADING_MS = 3000;') &&
        layout.includes('const STARTUP_ROUTE_READINESS_TIMEOUT_MS = 8000;') &&
        layout.includes('const DASHBOARD_SHELL_READINESS_TIMEOUT_MS = 5000;') &&
        layout.includes('STARTUP DIAGNOSTICS') &&
        appContext.includes('const STARTUP_REQUIRED_READINESS_TIMEOUT_MS = 8000;') &&
        appContext.includes('const STARTUP_AUTH_RESTORE_TIMEOUT_MS = 10000;') &&
        appContext.includes('startupAuthInitializationStartedRef') &&
        appContext.includes("markStartupPhase('auth_restore_start'") &&
        appContext.includes("markStartupPhase('auth_restore_done'") &&
        appContext.includes("fallback: hasValidStoredSession ? 'remembered_offline_shell' : 'signed_out_shell'"),
      [relPath(root, paths.index), relPath(root, paths.layout), relPath(root, paths.appContext)],
      ['Keep startup/auth restoration bounded, instrumented, and able to fall back honestly for remembered offline or signed-out shells.'],
    ),
    check(
      'login_requests_are_single_flight_and_redacted',
      'Login requests are guarded against rapid repeats and auth telemetry does not expose raw credentials or identifiers.',
      login.includes('const loginSubmitInFlightRef = useRef(false);') &&
        login.includes('if (loginSubmitInFlightRef.current) {') &&
        login.includes('email: maskAuthEmail(trimmedEmail)') &&
        !login.includes('passwordLength') &&
        !login.includes('email: trimmedEmail.toLowerCase()') &&
        normalizedAppContext.includes('const signInAttemptRef = useRef<Promise<SignInResult> | null>(null);') &&
        normalizedAppContext.includes('if (signInAttemptRef.current) {\n      return signInAttemptRef.current;\n    }') &&
        normalizedAppContext.includes('signInAttemptRef.current = attempt;') &&
        normalizedAppContext.includes('signInAttemptRef.current = null;') &&
        normalizedAppContext.includes('emailHash: hashAuthIdentifier(loginEmail)') &&
        !normalizedAppContext.includes('email: loginEmail') &&
        !normalizedAppContext.includes('userId: data.user.id'),
      [relPath(root, paths.login), relPath(root, paths.appContext)],
      ['Keep login submit and provider sign-in single-flight, with raw emails/password metadata/user IDs redacted from telemetry.'],
    ),
    check(
      'auth_logs_and_audits_are_sanitized',
      'Auth logs, optional audits, and error payloads are sanitized and optional audit failures stay non-blocking.',
      authLogRedaction.includes('export function maskAuthEmail') &&
        authLogRedaction.includes('export function hashAuthIdentifier') &&
        authLogRedaction.includes('export function redactAuthUserId') &&
        authLogRedaction.includes('export function sanitizeAuthLogPayload') &&
        auth.includes('function logOptionalAuditFailure') &&
        auth.includes('console.debug(label, sanitizeAuthLogPayload(error));') &&
        auth.includes('metadata: sanitizeAuthLogPayload(metadata || {})') &&
        auth.includes('metadata: sanitizeAuthLogPayload({ email })') &&
        appContext.includes('logLoginFailed(email).catch(() => {});') &&
        appContext.includes('return { error: sanitizeAuthError(error.message) };'),
      [relPath(root, paths.authLogRedaction), relPath(root, paths.auth), relPath(root, paths.appContext)],
      ['Keep auth audit logging fire-and-forget, sanitized, and non-blocking for user login/startup paths.'],
    ),
    check(
      'distribution_entry_and_offline_restore_are_explicit',
      'Distribution entry routing explicitly handles signed-out, setup, dashboard, saved shell restore, and offline remembered access.',
      distributionEntryResolver.includes('export function resolveDistributionEntryState') &&
        distributionEntryResolver.includes('restorableShellRoute') &&
        distributionEntryResolver.includes('routeRestoreRejected') &&
        distributionEntryResolver.includes('rememberedOfflineAccess') &&
        distributionEntryResolver.includes('guestOfflineAccess') &&
        layout.includes('resolveDistributionEntryState') &&
        layout.includes('const restorableShellRoute = getStoredShellRoute();') &&
        layout.includes('toRestorableShellRoute'),
      [relPath(root, paths.distributionEntryResolver), relPath(root, paths.layout)],
      ['Keep startup route selection deterministic and explicit for signed-out, setup, authenticated, guest-offline, and remembered-offline states.'],
    ),
    check(
      'subscription_and_access_fallbacks_are_non_privileged',
      'Subscription/access fallbacks are non-privileged and standard Pro access requires fresh entitlement verification.',
      auth.includes('function buildSafeFallbackAccessState()') &&
        !auth.includes("buildSharedAccountAccessState({ email, role: 'user', status: 'active' })") &&
        !auth.includes("buildSharedAccountAccessState({ role: 'user', status: 'active' })") &&
        subscriptionAccess.includes('const ENTITLEMENT_VERIFICATION_MAX_AGE_MS') &&
        subscriptionAccess.includes('isEntitlementVerificationFresh') &&
        offlineAccessPolicy.includes('function hasReusableCachedAccess') &&
        offlineAccessPolicy.includes('return null;') &&
        offlineAccessPolicy.includes("snapshot.last_verified_at.trim().length > 0") &&
        !ecsProPurchase.includes('}) || purchases[0]') &&
        appContext.includes('AppState.addEventListener') &&
        appContext.includes('canReuseOperatorInfoSnapshot'),
      [relPath(root, paths.auth), relPath(root, paths.subscriptionAccess), relPath(root, paths.offlineAccessPolicy), relPath(root, paths.ecsProPurchase), relPath(root, paths.appContext)],
      ['Keep failed network/provider entitlement refreshes from granting privileged access or using unrelated purchases.'],
    ),
    check(
      'real_provider_signup_signin_signout_evidence_present',
      'Real auth provider signup/signin/signout evidence is recorded.',
      evidenceTrue(evidence, 'realProviderSignupSigninSignoutPassed'),
      [relPath(root, paths.evidence)],
      ['Run signup, signin, signout, failed-login, and session refresh against the approved auth provider and record screenshots/log evidence.'],
    ),
    check(
      'android_cold_warm_offline_startup_evidence_present',
      'Android cold/warm/offline startup and restored-shell evidence is recorded.',
      evidenceTrue(evidence, 'androidColdWarmOfflineStartupPassed'),
      [relPath(root, paths.evidence)],
      ['Validate cold start, warm resume, remembered offline shell, signed-out shell, setup incomplete, and route restore on Android.'],
    ),
    check(
      'password_reset_activation_evidence_present',
      'Password reset and activation/deep-link evidence is recorded.',
      evidenceTrue(evidence, 'passwordResetActivationPassed'),
      [relPath(root, paths.evidence)],
      ['Exercise password reset, activation, expired/invalid link, and recovery-mode routing with real provider links.'],
    ),
    check(
      'subscription_entitlement_provider_evidence_present',
      'Real subscription entitlement provider and purchase restore evidence is recorded.',
      evidenceTrue(evidence, 'subscriptionEntitlementProviderPassed'),
      [relPath(root, paths.evidence)],
      ['Validate entitlement refresh, stale entitlement downgrade, restore purchase, no-unrelated-purchase fallback, and app-foreground refresh with provider evidence.'],
    ),
    check(
      'production_owner_decision_accepted',
      'Production owner decision is accepted for auth/session/subscription access.',
      accepted(evidence?.productionDecision),
      [relPath(root, paths.evidence)],
      ['Record product, engineering, privacy/security, QA, and support acceptance after real auth/provider/device evidence is complete.'],
    ),
  ];

  const failed = checks.filter((item) => !item.passed);
  return {
    passed: failed.length === 0,
    status: failed.length === 0 ? 'production_ready' : 'blocked',
    statusLabel: failed.length === 0 ? 'Production ready' : 'Blocked for production',
    checkedAt: new Date().toISOString(),
    system: 'auth_session_subscription_access',
    checks,
    blockers: failed.map((item) => item.id),
    remediation: failed.flatMap((item) => item.remediation),
    notes: [
      'This gate separates auth/session/subscription code readiness from real provider and Android evidence.',
      'Auth and entitlement failures must fail closed or fall back to an explicitly non-privileged/offline shell state.',
      'Auth diagnostics must remain redacted and optional audit logging must never block startup or login.',
    ],
  };
}

export function writeAuthProductionReadinessResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const resultPath = path.join(root, RESULT_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return resultPath;
}

export function formatAuthProductionReadinessResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const lines = [
    `Auth/session production readiness: ${result.statusLabel}`,
    `Result file: ${relPath(root, path.join(root, RESULT_RELATIVE_PATH))}`,
    `Checked at: ${result.checkedAt}`,
    `Production ready: ${result.passed ? 'yes' : 'no'}`,
    '',
    'Checks:',
  ];
  for (const item of result.checks) lines.push(`- ${item.label}: ${item.passed ? 'pass' : 'blocked'}`);
  if (result.blockers.length > 0) {
    lines.push('', 'Active blockers:');
    for (const blocker of result.blockers) lines.push(`- ${blocker}`);
  }
  if (result.remediation.length > 0) {
    lines.push('', 'Next actions:');
    for (const item of Array.from(new Set(result.remediation))) lines.push(`- ${item}`);
  }
  lines.push('', 'Notes:');
  for (const note of result.notes) lines.push(`- ${note}`);
  return `${lines.join('\n')}\n`;
}

async function main() {
  const jsonOnly = process.argv.includes('--json');
  const result = buildAuthProductionReadinessResult();
  writeAuthProductionReadinessResult(result);
  if (jsonOnly) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else process.stdout.write(formatAuthProductionReadinessResult(result));
  return result.passed ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
