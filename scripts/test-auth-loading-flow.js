/* global __dirname */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const indexSource = fs.readFileSync(path.join(root, 'app', 'index.tsx'), 'utf8');
const layoutSource = fs.readFileSync(path.join(root, 'app', '_layout.tsx'), 'utf8');
const tabsLayoutSource = fs.readFileSync(path.join(root, 'app', '(tabs)', '_layout.tsx'), 'utf8');
const appContextSource = fs.readFileSync(path.join(root, 'context', 'AppContext.tsx'), 'utf8');
const distributionEntrySource = fs.readFileSync(path.join(root, 'lib', 'auth', 'distributionEntryResolver.ts'), 'utf8');
const authCopySource = fs.readFileSync(path.join(root, 'lib', 'auth', 'authCopy.ts'), 'utf8');
const videoSource = fs.readFileSync(path.join(root, 'components', 'LoadingTransitionVideo.tsx'), 'utf8');

function normalize(source) {
  return source.replace(/\r\n/g, '\n');
}

function assertIncludes(source, fragment, message) {
  assert.ok(normalize(source).includes(normalize(fragment)), message);
}

function assertNotIncludes(source, fragment, message) {
  assert.ok(!normalize(source).includes(normalize(fragment)), message);
}

function blockBetween(source, startFragment, endFragment) {
  const normalizedSource = normalize(source);
  const start = normalizedSource.indexOf(normalize(startFragment));
  assert.notStrictEqual(start, -1, `Expected source to include ${startFragment}`);
  const end = normalizedSource.indexOf(normalize(endFragment), start);
  assert.notStrictEqual(end, -1, `Expected source to include ${endFragment}`);
  return normalizedSource.slice(start, end);
}

assertIncludes(
  indexSource,
  "import LoadingTransitionVideo from '../components/LoadingTransitionVideo';",
  'The root entry route should use the approved loading video.',
);
assertIncludes(
  indexSource,
  'return <LoadingTransitionVideo />;',
  'The root entry route should render the approved loading video directly.',
);
assertNotIncludes(
  indexSource,
  'Checking secure session',
  'The unauthorized secure-session text must not be rendered by the root route.',
);
assertNotIncludes(
  indexSource,
  'AUTH_COPY.session.checking',
  'The root route must not render the old session-check copy.',
);
assertNotIncludes(
  indexSource,
  '<AuthBrandLockup',
  'The root route must not render the unauthorized ECS brand/session screen.',
);
assertNotIncludes(
  authCopySource,
  'Checking secure session',
  'Obsolete secure-session loading copy should not remain in auth copy.',
);

assertIncludes(
  layoutSource,
  'const MIN_LOADING_MS = 3000;',
  'Auth loading should enforce the 3 second minimum display duration.',
);
assertNotIncludes(
  layoutSource,
  'const AUTH_LOADING_MINIMUM_MS = 2000;',
  'The old 2 second auth loading duration should not remain.',
);
assertIncludes(
  layoutSource,
  'const [minimumLoadingElapsed, setMinimumLoadingElapsed] = useState(false);',
  'AuthGate should track the minimum loading timer.',
);
assertIncludes(
  appContextSource,
  'const startupAuthInitializationStartedRef = useRef(false);',
  'Startup auth restore should be guarded per provider instance, not by stale module state across remounts.',
);
assertIncludes(
  appContextSource,
  'const shouldRunStartupSessionRestore = !startupAuthInitializationStartedRef.current;',
  'A remounted AppProvider should be able to run session restore instead of staying authLoading forever.',
);
assertIncludes(
  appContextSource,
  'let connectivityIntelInitializedForAppSession = false;',
  'Connectivity Intelligence initialization should have an app-session singleton guard.',
);
assertIncludes(
  appContextSource,
  'const STARTUP_REQUIRED_READINESS_TIMEOUT_MS = 8000;',
  'Required startup readiness should have a bounded fallback so root loading cannot hang forever.',
);
assertIncludes(
  appContextSource,
  'const STARTUP_AUTH_RESTORE_TIMEOUT_MS = 10000;',
  'Auth restore should have a bounded fallback so session checks cannot hang root loading forever.',
);
assertIncludes(
  appContextSource,
  "markStartupPhase('stores_hydration_start');",
  'Startup diagnostics should track store hydration start.',
);
assertIncludes(
  appContextSource,
  "markStartupPhase('auth_restore_start'",
  'Startup diagnostics should track auth restore start.',
);
assertIncludes(
  appContextSource,
  "markStartupPhase('auth_restore_done'",
  'Startup diagnostics should track auth restore completion.',
);
assertIncludes(
  appContextSource,
  "fallback: hasValidStoredSession ? 'remembered_offline_shell' : 'signed_out_shell'",
  'Auth restore timeout should choose a safe shell fallback instead of forcing logout.',
);
assertIncludes(
  appContextSource,
  'void withStartupTimeout(\n        \'optional dashboard/expedition hydration\',',
  'Dashboard and expedition hydration should continue as optional background startup work.',
);
assertIncludes(
  appContextSource,
  "logStartupDebug('startup shell readiness resolved'",
  'AppProvider should log shell readiness without implying optional IndexedDB is required on native.',
);
assertIncludes(
  appContextSource,
  'indexedDbReady: startupHydrationResult.indexedDbReady',
  'Startup readiness diagnostics should report IndexedDB separately from required storage readiness.',
);
assertIncludes(
  appContextSource,
  'localPersistenceFallbackActive: !startupHydrationResult.indexedDbReady',
  'Startup readiness diagnostics should make local fallback mode explicit.',
);
assertIncludes(
  appContextSource,
  'if (!connectivityIntelInitializedForAppSession) {\n        connectivityIntelService.initialize();',
  'Connectivity Intelligence should initialize only once per app session.',
);
assertIncludes(
  layoutSource,
  "import { stageNavigationFlow } from '../lib/ecsNavigationFlow';",
  'AuthGate should stage legacy Fleet setup redirects for the current Fleet modal flow.',
);
assertIncludes(
  layoutSource,
  'const dashboardReady =',
  'AuthGate should track dashboard/app readiness separately from the timer.',
);
assertIncludes(
  layoutSource,
  'const startupGatePending =\n    authPhase === \'restoring\' ||\n    authPhase === \'signing_in\' ||',
  'AuthGate loading should be driven by required startup/auth checks first.',
);
assertIncludes(
  layoutSource,
  'const postAuthBootstrapPending =\n    !startupGatePending &&\n    !inSetup &&',
  'Post-auth loading should be separated from core startup readiness.',
);
assertIncludes(
  layoutSource,
  'const STARTUP_ROUTE_READINESS_TIMEOUT_MS = 8000;',
  'AuthGate route readiness should have a bounded fallback.',
);
assertIncludes(
  layoutSource,
  'const DASHBOARD_SHELL_READINESS_TIMEOUT_MS = 5000;',
  'Dashboard shell hydration should not block post-auth routing indefinitely.',
);
assertIncludes(
  layoutSource,
  'const STARTUP_LOADING_STALL_DIAGNOSTIC_MS = 12000;',
  'AuthGate should report a startup stall before users can sit in loading indefinitely.',
);
assertIncludes(
  layoutSource,
  "markStartupPhase('initial_route_chosen'",
  'Startup diagnostics should track initial route resolution.',
);
assertIncludes(
  layoutSource,
  "markStartupPhase('app_rendered_main'",
  'Startup diagnostics should track main app rendering.',
);
assertIncludes(
  layoutSource,
  "markStartupPhase('app_rendered_sign_in'",
  'Startup diagnostics should track sign-in rendering.',
);
assertIncludes(
  layoutSource,
  "markStartupPhase('app_rendered_setup'",
  'Startup diagnostics should track setup rendering.',
);
assertIncludes(
  layoutSource,
  "logStartupStall({\n        currentPhase,",
  'AuthGate should log unresolved startup flags when loading stalls.',
);
assertIncludes(
  layoutSource,
  'STARTUP DIAGNOSTICS',
  'AuthGate should expose a dev-only startup diagnostic panel on fallback recovery.',
);
assertNotIncludes(
  layoutSource,
  '!themeReady;',
  'Theme readiness should use fallback palette instead of keeping root startup loading.',
);
assertNotIncludes(
  appContextSource,
  "(!offlineMode && connectivity.isOnline() && accessState?.accessState === 'unknown')",
  'Unknown optional entitlement/access refresh state should not keep AppProvider in signed_in_bootstrapping forever.',
);
assertIncludes(
  layoutSource,
  'const postAuthLoadingNavigationRef = useRef<string | null>(null);',
  'AuthGate should guard against duplicate post-login navigation.',
);
assertIncludes(
  tabsLayoutSource,
  "import { Slot } from 'expo-router';",
  'Shell route layout should render the active tab group child directly.',
);
assertIncludes(
  tabsLayoutSource,
  '<Slot />',
  'Shell route layout should avoid hidden native tab screens during Android tab switches.',
);
assertNotIncludes(
  tabsLayoutSource,
  "import { Tabs } from 'expo-router';",
  'Shell route layout must not reintroduce the hidden native Tabs wrapper.',
);
assertNotIncludes(
  tabsLayoutSource,
  '<Tabs',
  'Shell route layout must not mount hidden tab screens that can reparent native views on Android.',
);
assertIncludes(
  tabsLayoutSource,
  'avoids Android/Fabric native tab reparenting faults',
  'Shell route layout should document why native Tabs are intentionally avoided.',
);
assertIncludes(
  layoutSource,
  "return '/fleet';",
  'Zero-vehicle authenticated startup should prefer Fleet so the current Vehicle Command Center empty state is shown.',
);
assertIncludes(
  layoutSource,
  "const legacyFleetSetupRoute =\n    normalizedPathname === '/setup' &&\n    (setupRouteMode === 'fleet-add' || setupRouteMode === 'fleet-edit');",
  'Legacy fleet-add/fleet-edit setup routes should be detected before redirecting to Fleet.',
);
assertIncludes(
  layoutSource,
  "setupRouteMode === 'guest-entry'",
  'Only guest-entry should preserve the legacy setup route.',
);
assertNotIncludes(
  layoutSource,
  "routeParams.mode === 'fleet-add' ||",
  'Fleet-add setup routes must not be preserved in the legacy setup screen.',
);
assertIncludes(
  layoutSource,
  "intent: setupRouteMode === 'fleet-edit' ? 'fleet_edit_vehicle' : 'fleet_add_vehicle'",
  'Legacy Fleet setup routes should stage a current Fleet modal intent.',
);
assertIncludes(
  distributionEntrySource,
  "target: setupRecoveryRequired ? '/fleet' : '/setup'",
  'Incomplete account setup should resolve to setup, while vehicle recovery resolves to Fleet.',
);
assertIncludes(
  distributionEntrySource,
  "destinationSource: setupRecoveryRequired ? 'vehicle_recovery' : 'setup'",
  'Incomplete account setup should keep setup and vehicle-recovery destinations distinct.',
);
assertIncludes(
  distributionEntrySource,
  "redirectTarget: '/fleet',\n        loadingLabel",
  'Authenticated setup recovery should redirect to Fleet instead of leaving users on /setup.',
);
assertIncludes(
  distributionEntrySource,
  "destinationSource: 'vehicle_recovery'",
  'Vehicle recovery routing should be explicit when zero-vehicle users are sent to Fleet.',
);

const timerEffect = blockBetween(
  layoutSource,
  'useEffect(() => {\n    postAuthLoadingNavigationRef.current = null;\n    setMinimumLoadingElapsed(false);',
  'const handleAccessAction = useCallback(',
);
assertIncludes(
  timerEffect,
  'setTimeout(() => {\n      setMinimumLoadingElapsed(true);\n    }, MIN_LOADING_MS)',
  'The minimum loading timer should use the centralized 3000ms constant.',
);
assertIncludes(
  timerEffect,
  'clearTimeout(minimumLoadingTimer);',
  'The loading timer should be cleaned up on unmount or gate changes.',
);

const redirectEffect = blockBetween(
  layoutSource,
  'useEffect(() => {\n    if (isLoading || suppressRedirect) return;',
  '\n  if (shouldShowAccessGate) {',
);
assertNotIncludes(
  redirectEffect,
  "router.replace('/' as any);",
  'Post-login routing should not visibly bounce through the root route before the final shell route.',
);
assertIncludes(
  layoutSource,
  'const postAuthRedirectHoldingScreenActive =',
  'AuthGate should hold authenticated auth-screen redirects behind the loading surface.',
);
assertIncludes(
  layoutSource,
  "if (postAuthRedirectHoldingScreenActive && normalizedPathname === '/') {\n    return <LoadingTransitionVideo />;\n  }",
  'Root authenticated redirects should render the loading video while auth-screen redirects keep the shell stack mounted.',
);
assertIncludes(
  redirectEffect,
  'if (!minimumLoadingElapsed || !dashboardReady) {\n          return;\n        }',
  'Final dashboard routing should wait for both the timer and app readiness.',
);
assertIncludes(
  redirectEffect,
  'if (postAuthLoadingNavigationRef.current === navigationKey) return;',
  'Final dashboard routing should be guarded against duplicate replaces.',
);
assertIncludes(
  redirectEffect,
  'router.replace(toExpoRouterShellTarget(target) as any);',
  'AuthGate should use route replacement for the final dashboard transition.',
);

assertIncludes(
  videoSource,
  'videoPlayer.loop = true;',
  'The approved loading video should keep looping while dashboard data is not ready.',
);
assertIncludes(
  videoSource,
  'export const LOADING_VIDEO_CYCLE_MS = 5000;',
  'The approved loading video should use the 5 second cycle duration.',
);
assertIncludes(
  videoSource,
  "setInterval(() => {\n      safePlaybackAction('replay');\n      safePlaybackAction('play');\n    }, LOADING_VIDEO_CYCLE_MS)",
  'The approved loading video should replay safely every 5 seconds while mounted.',
);
assertIncludes(
  videoSource,
  'if (!isMountedRef.current) return;',
  'The approved loading video should not call player methods after unmount.',
);
assertIncludes(
  videoSource,
  'clearInterval(cycleTimer);',
  'The loading video cycle timer should be cleaned up on unmount.',
);

console.log('Auth loading flow regression checks passed.');
