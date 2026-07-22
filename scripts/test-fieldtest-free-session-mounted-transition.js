/* global __dirname */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const React = require('react');
const TestRenderer = require('react-test-renderer');
const ts = require('typescript');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const root = path.resolve(__dirname, '..');

function loadTypeScriptModule(relativePath, mocks = {}) {
  const sourcePath = path.join(root, relativePath);
  const source = fs.readFileSync(sourcePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const moduleShim = { exports: {} };
  new Function('exports', 'require', 'module', '__filename', '__dirname', output)(
    moduleShim.exports,
    (request) => mocks[request] ?? require(request),
    moduleShim,
    sourcePath,
    path.dirname(sourcePath),
  );
  return moduleShim.exports;
}

const transitionModule = loadTypeScriptModule('lib/auth/freeSessionTransition.ts');
const routeGuardModule = loadTypeScriptModule('lib/auth/routeReplacementGuard.ts');
const routePolicyModule = loadTypeScriptModule('lib/auth/distributionEntryResolver.ts', {
  './authCopy': {
    AUTH_COPY: {
      session: { loadingSystems: 'Loading', preparing: 'Preparing', checking: 'Checking' },
      resetPassword: { verifying: 'Verifying' },
      activation: { verifying: 'Verifying' },
    },
  },
  './entryStateTypes': {},
});
const resultPolicyModule = loadTypeScriptModule('lib/explore/routeSearchResultPolicy.ts');

const {
  createFreeSessionTransitionCoordinator,
  equalFreeSessionTransitionSnapshot,
} = transitionModule;
const { createRouteReplacementGuard } = routeGuardModule;
const { resolveDistributionEntryState } = routePolicyModule;
const { capUniqueRankedRoutes, ECS_ROUTE_SEARCH_RESULT_LIMIT } = resultPolicyModule;
const { act } = TestRenderer;

function semanticHash(value) {
  const serialized = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function createLedger(profile) {
  return {
    profile,
    renders: Object.create(null),
    effects: Object.create(null),
    semanticWrites: Object.create(null),
    suppressedSemanticWrites: Object.create(null),
    navigationActions: [],
    routeHistory: ['/login'],
    navigatorMounts: 0,
    navigatorUnmounts: 0,
    mediaOwners: [],
    accessibilityLabels: [],
    diagnosticEvents: [],
    render(component) {
      this.renders[component] = (this.renders[component] ?? 0) + 1;
    },
    effect(identifier) {
      this.effects[identifier] = (this.effects[identifier] ?? 0) + 1;
    },
    write(identifier) {
      this.semanticWrites[identifier] = (this.semanticWrites[identifier] ?? 0) + 1;
    },
    suppress(identifier) {
      this.suppressedSemanticWrites[identifier] =
        (this.suppressedSemanticWrites[identifier] ?? 0) + 1;
    },
    audit(component, effectIdentifier, previousState, nextState, generation, route) {
      this.diagnosticEvents.push({
        component,
        effectIdentifier,
        previousSemanticHash: semanticHash(previousState),
        nextSemanticHash: semanticHash(nextState),
        generation,
        profile: this.profile,
        route,
        navigationCount: this.navigationActions.length,
        renderCount: this.renders.MountedFieldtestRoot ?? 0,
        effectCount: this.effects[effectIdentifier] ?? 0,
      });
    },
  };
}

function createControlledAuthAdapter({ enabled }) {
  let hydrationResolve;
  let hydrationSettled = false;
  let hydrationPromise;
  const listeners = new Set();
  const calls = { getSession: 0, subscribe: 0, unsubscribe: 0 };

  if (enabled) {
    hydrationPromise = new Promise((resolve) => {
      hydrationResolve = resolve;
    });
  }

  return {
    enabled,
    calls,
    getSession() {
      calls.getSession += 1;
      return hydrationPromise;
    },
    subscribe(listener) {
      calls.subscribe += 1;
      listeners.add(listener);
      return () => {
        calls.unsubscribe += 1;
        listeners.delete(listener);
      };
    },
    resolveHydration(signedIn) {
      if (!enabled || hydrationSettled) return;
      hydrationSettled = true;
      hydrationResolve({ signedIn: Boolean(signedIn) });
    },
    emit(event, signedIn) {
      for (const listener of [...listeners]) listener(event, { signedIn: Boolean(signedIn) });
    },
  };
}

function createMediaOwner(ledger, name) {
  const listeners = new Set();
  const owner = {
    name,
    active: true,
    releaseCount: 0,
    methodCallsAfterRelease: 0,
    action() {
      if (!this.active) {
        this.methodCallsAfterRelease += 1;
        return false;
      }
      return true;
    },
    listen(listener) {
      if (!this.active) return () => undefined;
      const guarded = (payload) => {
        if (!this.active) return;
        listener(payload);
      };
      listeners.add(guarded);
      return () => listeners.delete(guarded);
    },
    emit(payload) {
      for (const listener of [...listeners]) listener(payload);
    },
    dispose() {
      if (!this.active) return;
      this.active = false;
      listeners.clear();
      this.releaseCount += 1;
    },
  };
  ledger.mediaOwners.push(owner);
  return owner;
}

function StableNavigator({ children, ledger }) {
  ledger.render('StableNavigator');
  React.useEffect(() => {
    ledger.navigatorMounts += 1;
    return () => {
      ledger.navigatorUnmounts += 1;
    };
  }, [ledger]);
  return React.createElement('navigator-shell', null, children);
}

function MediaLifecycleAdapter({ ledger, ownerName }) {
  const ownerRef = React.useRef(null);
  if (!ownerRef.current) ownerRef.current = createMediaOwner(ledger, ownerName);
  React.useEffect(() => {
    const owner = ownerRef.current;
    const remove = owner.listen(() => owner.action());
    return () => {
      remove();
      owner.dispose();
    };
  }, []);
  return React.createElement('media-layer', { owner: ownerName });
}

const MountedFieldtestRoot = React.forwardRef(function MountedFieldtestRoot(
  { authAdapter, ledger, legacyBehavior = false, initialSignedIn = false },
  ref,
) {
  ledger.render('MountedFieldtestRoot');
  const routeGuardRef = React.useRef(createRouteReplacementGuard());
  const snapshotRef = React.useRef({
    state: 'idle',
    generation: 0,
    correlationId: null,
    navigationCount: 0,
    navigationTarget: null,
  });
  const [snapshot, setSnapshot] = React.useState(snapshotRef.current);
  const [route, setRoute] = React.useState('/login');
  const routeRef = React.useRef(route);
  const [offlineMode, setOfflineMode] = React.useState(false);
  const offlineModeRef = React.useRef(false);
  const [signedIn, setSignedIn] = React.useState(initialSignedIn);
  const signedInRef = React.useRef(initialSignedIn);
  const [handoffVisible, setHandoffVisible] = React.useState(false);
  const [destinationHydration, setDestinationHydration] = React.useState('initializing');
  const destinationHydrationRef = React.useRef('initializing');
  const pendingFreeNavigationRef = React.useRef(null);
  const appStateRef = React.useRef('active');
  const routeRestorationRef = React.useRef(null);

  const coordinatorRef = React.useRef(null);
  if (!coordinatorRef.current) {
    coordinatorRef.current = createFreeSessionTransitionCoordinator({
      correlationId: (generation) => `${ledger.profile}-${generation}`,
      onEvent: (event, nextSnapshot) => {
        ledger.effect(`transition:${event}`);
        ledger.audit(
          'AppProvider',
          `transition:${event}`,
          snapshotRef.current,
          nextSnapshot,
          nextSnapshot.generation,
          routeRef.current,
        );
        if (equalFreeSessionTransitionSnapshot(snapshotRef.current, nextSnapshot)) {
          ledger.suppress('freeSessionTransition');
          return;
        }
        snapshotRef.current = nextSnapshot;
        ledger.write('freeSessionTransition');
        setSnapshot(nextSnapshot);
      },
    });
  }
  const coordinator = coordinatorRef.current;

  const writeRoute = React.useCallback((nextRoute) => {
    if (routeRef.current === nextRoute) {
      ledger.suppress('route');
      return false;
    }
    routeRef.current = nextRoute;
    ledger.write('route');
    ledger.routeHistory.push(nextRoute);
    setRoute(nextRoute);
    return true;
  }, [ledger]);
  const writeOfflineMode = React.useCallback((nextValue) => {
    if (offlineModeRef.current === nextValue) {
      ledger.suppress('offlineMode');
      return false;
    }
    offlineModeRef.current = nextValue;
    ledger.write('offlineMode');
    setOfflineMode(nextValue);
    return true;
  }, [ledger]);
  const writeSignedIn = React.useCallback((nextValue) => {
    if (signedInRef.current === nextValue) {
      ledger.suppress('signedIn');
      return false;
    }
    signedInRef.current = nextValue;
    ledger.write('signedIn');
    setSignedIn(nextValue);
    return true;
  }, [ledger]);

  React.useEffect(() => {
    ledger.effect('auth_subscription_registered');
    if (!authAdapter.enabled) return undefined;
    const hydrationGeneration = coordinator.snapshot().generation;
    let mounted = true;
    authAdapter.getSession().then((session) => {
      if (!mounted) return;
      ledger.effect('auth_hydration_completed');
      if (coordinator.shouldIgnoreHydration(hydrationGeneration)) return;
      writeSignedIn(session.signedIn);
    });
    const unsubscribe = authAdapter.subscribe((_event, session) => {
      ledger.effect('auth_listener_fired');
      if (coordinator.isAuthoritative()) {
        ledger.suppress('authDuringFree');
        ledger.audit(
          'AppProvider',
          'auth_listener_suppressed_during_free',
          signedInRef.current,
          signedInRef.current,
          coordinator.snapshot().generation,
          routeRef.current,
        );
        coordinator.shouldIgnoreHydration(0);
        return;
      }
      writeSignedIn(session.signedIn);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [authAdapter, coordinator, ledger, writeSignedIn]);

  const committedFreeSession =
    snapshot.state === 'state_committed' ||
    snapshot.state === 'navigating' ||
    snapshot.state === 'destination_mounted';
  const guestOfflineAccess = offlineMode && !signedIn;
  const resolution = resolveDistributionEntryState({
    currentPath: route,
    isLoading: false,
    authenticated: signedIn,
    guestOfflineAccess,
    rememberedOfflineAccess: false,
    accessState: null,
    offlineMode,
    setupComplete: false,
    setupRecoveryRequired: false,
    restorableShellRoute: committedFreeSession ? null : routeRestorationRef.current,
    requestedEntryRoute: null,
    isAuthScreen: route === '/login',
    isRecoveryScreen: false,
    recoveryMode: 'unknown',
    isLoginScreen: route === '/login',
    isSetupScreen: route === '/setup',
    preserveSetupRoute: route === '/setup',
    isProtectedScreen: false,
    bootstrapError: null,
  });
  const freeNavigationOwned =
    committedFreeSession &&
    snapshot.navigationCount === 1 &&
    snapshot.navigationTarget &&
    route !== snapshot.navigationTarget;

  React.useEffect(() => {
    ledger.effect('route_policy_evaluated');
    routeGuardRef.current.settle(route);
    const target = resolution.redirectTarget;
    if (!target || target === route) return;
    if (freeNavigationOwned && !legacyBehavior) return;
    const claim = routeGuardRef.current.claim(route, target);
    if (!claim) return;
    ledger.navigationActions.push({ owner: 'route_guard', from: route, to: target });
    writeRoute(target);
  }, [freeNavigationOwned, ledger, legacyBehavior, resolution.redirectTarget, route, writeRoute]);

  React.useEffect(() => {
    if (snapshot.state !== 'navigating' || route !== snapshot.navigationTarget) return;
    coordinator.markDestinationMounted(route, snapshot.generation);
  }, [coordinator, route, snapshot.generation, snapshot.navigationTarget, snapshot.state]);

  React.useImperativeHandle(ref, () => ({
    pressFree(target = '/setup') {
      const generation = coordinator.begin();
      if (generation === null) return false;
      if (!coordinator.commit(generation)) return false;
      writeOfflineMode(true);
      if (!coordinator.requestNavigation(generation, target)) return false;
      pendingFreeNavigationRef.current = target;
      ledger.navigationActions.push({ owner: 'free_session', from: routeRef.current, to: target });
      setHandoffVisible(true);
      return true;
    },
    flushFreeNavigation() {
      const target = pendingFreeNavigationRef.current;
      if (!target) return false;
      pendingFreeNavigationRef.current = null;
      writeRoute(target);
      setHandoffVisible(false);
      return true;
    },
    restoreRoute(nextRoute) {
      if (coordinator.isAuthoritative()) {
        ledger.suppress('routeRestoration');
        return false;
      }
      routeRestorationRef.current = nextRoute;
      ledger.write('routeRestoration');
      return true;
    },
    hydrateDestination(nextState) {
      if (destinationHydrationRef.current === nextState) {
        ledger.suppress('destinationHydration');
        return false;
      }
      destinationHydrationRef.current = nextState;
      ledger.write('destinationHydration');
      setDestinationHydration(nextState);
      return true;
    },
    appState(nextState) {
      if (appStateRef.current === nextState) return false;
      appStateRef.current = nextState;
      ledger.write('appState');
      return true;
    },
    snapshot() {
      return {
        route: routeRef.current,
        transition: coordinator.snapshot(),
        signedIn: signedInRef.current,
        offlineMode: offlineModeRef.current,
        destinationHydration: destinationHydrationRef.current,
      };
    },
  }), [coordinator, ledger, writeOfflineMode, writeRoute]);

  const destinationVisible = route !== '/login';
  const navigator = React.createElement(
    StableNavigator,
    { ledger },
    destinationVisible
      ? React.createElement(
          'destination-shell',
          {
            accessibilityLabel: `ECS Free Session destination. Route ${route}. State ${destinationHydration}.`,
          },
          'ECS Free Session',
        )
      : React.createElement('login-shell', { accessibilityLabel: 'ECS Sign In' }, 'Continue with Free'),
  );
  if (destinationVisible) {
    ledger.accessibilityLabels.push(`ECS Free Session destination. Route ${route}. State ${destinationHydration}.`);
  }

  return React.createElement(
    'app-provider-tree',
    { profile: ledger.profile },
    legacyBehavior && handoffVisible ? null : navigator,
    handoffVisible
      ? React.createElement(
          'handoff-shell',
          { accessibilityLabel: 'ECS Free Session. Destination route initializing.' },
          React.createElement(MediaLifecycleAdapter, { ledger, ownerName: 'loading-transition' }),
        )
      : null,
  );
});

async function mountHarness(options) {
  const ledger = createLedger(options.profile);
  const authAdapter = createControlledAuthAdapter({ enabled: options.supabaseEnabled });
  const control = React.createRef();
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(MountedFieldtestRoot, {
        ref: control,
        ledger,
        authAdapter,
        legacyBehavior: options.legacyBehavior,
        initialSignedIn: options.initialSignedIn,
      }),
    );
  });
  return {
    ledger,
    authAdapter,
    control,
    renderer,
    async run(action) {
      await act(async () => {
        action();
        await Promise.resolve();
      });
    },
    async unmount() {
      await act(async () => renderer.unmount());
    },
  };
}

function evaluateAcceptance(harness, renderCeiling) {
  const transition = harness.control.current.snapshot().transition;
  const routeAlternates = harness.ledger.routeHistory.some(
    (route, index, routes) => index >= 2 && route === routes[index - 2] && route !== routes[index - 1],
  );
  return {
    pass:
      harness.ledger.navigationActions.length === 1 &&
      !routeAlternates &&
      (harness.ledger.renders.MountedFieldtestRoot ?? 0) <= renderCeiling &&
      harness.ledger.navigatorMounts === 1 &&
      transition.navigationCount === 1,
    routeAlternates,
  };
}

async function run() {
  const originalConsoleError = console.error;
  const maximumUpdateDepthWarnings = [];
  console.error = (...args) => {
    const message = args.map((value) => String(value)).join(' ');
    if (message.includes('Maximum update depth exceeded')) maximumUpdateDepthWarnings.push(message);
    originalConsoleError(...args);
  };

  try {
  const legacy = await mountHarness({
    profile: 'fieldtest',
    supabaseEnabled: true,
    legacyBehavior: true,
    initialSignedIn: false,
  });
  await legacy.run(() => legacy.control.current.pressFree('/setup'));
  const legacyResult = evaluateAcceptance(legacy, 20);
  assert.strictEqual(legacyResult.pass, false, 'The mounted harness must reject the former duplicate-navigation/Stack-removal behavior.');
  assert.ok(legacy.ledger.navigationActions.length > 1, 'Legacy behavior must reproduce duplicate navigation ownership.');
  assert.ok(legacy.ledger.navigatorUnmounts >= 1, 'Legacy behavior must reproduce navigator removal during handoff.');
  const beforeRenderCount = legacy.ledger.renders.MountedFieldtestRoot;
  await legacy.unmount();

  const qa = await mountHarness({
    profile: 'route-discovery-qa',
    supabaseEnabled: false,
    legacyBehavior: false,
    initialSignedIn: false,
  });
  await qa.run(() => qa.control.current.pressFree('/setup'));
  await qa.run(() => qa.control.current.flushFreeNavigation());
  const normalRenderCount = qa.ledger.renders.MountedFieldtestRoot;
  const renderCeiling = normalRenderCount + 6;
  assert.strictEqual(qa.authAdapter.calls.getSession, 0, 'QA profile must not initialize or contact Supabase auth.');
  assert.strictEqual(qa.authAdapter.calls.subscribe, 0, 'QA profile must not subscribe to Supabase auth.');
  assert.ok(evaluateAcceptance(qa, renderCeiling).pass, 'QA mounted transition must pass the calibrated ceiling.');
  await qa.unmount();

  const fieldtest = await mountHarness({
    profile: 'fieldtest',
    supabaseEnabled: true,
    legacyBehavior: false,
    initialSignedIn: false,
  });
  await fieldtest.run(() => fieldtest.control.current.pressFree('/setup'));
  let duplicatePressResult;
  await fieldtest.run(() => {
    duplicatePressResult = fieldtest.control.current.pressFree('/setup');
  });
  assert.strictEqual(duplicatePressResult, false, 'Duplicate rapid Free presses must be rejected synchronously.');
  await fieldtest.run(() => fieldtest.authAdapter.emit('SIGNED_IN', true));
  await fieldtest.run(() => fieldtest.authAdapter.emit('SIGNED_IN', true));
  await fieldtest.run(() => fieldtest.authAdapter.emit('SIGNED_OUT', false));
  await fieldtest.run(() => fieldtest.authAdapter.resolveHydration(true));
  await fieldtest.run(() => fieldtest.control.current.restoreRoute('/login'));
  await fieldtest.run(() => fieldtest.control.current.appState('background'));
  await fieldtest.run(() => fieldtest.control.current.flushFreeNavigation());
  await fieldtest.run(() => fieldtest.control.current.appState('active'));
  await fieldtest.run(() => fieldtest.control.current.hydrateDestination('ready'));
  await fieldtest.run(() => fieldtest.control.current.hydrateDestination('ready'));

  const fieldSnapshot = fieldtest.control.current.snapshot();
  assert.strictEqual(fieldSnapshot.signedIn, false, 'Stale or recurrent auth events must not take ownership from Free.');
  assert.strictEqual(fieldSnapshot.offlineMode, true, 'Free/offline state must remain authoritative.');
  assert.strictEqual(fieldSnapshot.route, '/setup', 'Late route restoration must not restore login.');
  assert.strictEqual(fieldSnapshot.transition.state, 'destination_mounted', 'Destination must reach its finite mounted state.');
  assert.strictEqual(fieldSnapshot.transition.navigationCount, 1, 'Free transition must dispatch navigation exactly once.');
  assert.strictEqual(fieldtest.ledger.navigationActions.length, 1, 'Root route policy must not duplicate Free navigation.');
  assert.strictEqual(fieldtest.authAdapter.calls.subscribe, 1, 'Auth listener must register exactly once.');
  assert.strictEqual(fieldtest.ledger.navigatorMounts, 1, 'The root navigator must remain mounted through handoff.');
  assert.strictEqual(fieldtest.ledger.navigatorUnmounts, 0, 'The root navigator must not unmount before teardown.');
  assert.strictEqual(fieldtest.ledger.suppressedSemanticWrites.authDuringFree, 3,
    'Every recurrent auth delivery must be suppressed while Free owns the transition.');
  assert.strictEqual(fieldtest.ledger.semanticWrites.signedIn ?? 0, 0, 'Stale auth must not write signed-in state.');
  assert.strictEqual(fieldtest.ledger.semanticWrites.routeRestoration ?? 0, 0, 'Late restoration must not write route state.');
  assert.strictEqual(fieldtest.ledger.semanticWrites.destinationHydration, 1, 'Identical destination hydration must not write twice.');
  assert.ok(fieldtest.ledger.accessibilityLabels.some((label) => label.includes('ECS Free Session destination')),
    'Destination accessibility tree must contain a labeled route shell.');
  assert.ok(fieldtest.ledger.diagnosticEvents.length > 0, 'The mounted provider must produce a bounded diagnostic ledger.');
  assert.ok(fieldtest.ledger.diagnosticEvents.every((event) =>
    event.component && event.effectIdentifier &&
    /^[a-f0-9]{8}$/.test(event.previousSemanticHash) &&
    /^[a-f0-9]{8}$/.test(event.nextSemanticHash) &&
    Number.isInteger(event.generation) && Number.isInteger(event.navigationCount) &&
    Number.isInteger(event.renderCount) && Number.isInteger(event.effectCount)),
  'Every diagnostic event must contain only hashed semantic state and bounded counters.');
  assert.ok(!JSON.stringify(fieldtest.ledger.diagnosticEvents).match(/email|password|token|latitude|longitude|coordinate|userId/i),
    'The diagnostic ledger must not contain raw auth or location fields.');
  assert.ok(evaluateAcceptance(fieldtest, renderCeiling).pass, 'Fieldtest transition must remain within the QA-calibrated render ceiling.');

  const releasedOwner = fieldtest.ledger.mediaOwners[0];
  assert.ok(releasedOwner, 'Transition media must have one explicit owner.');
  releasedOwner.emit({ status: 'readyToPlay' });
  releasedOwner.dispose();
  releasedOwner.dispose();
  releasedOwner.emit({ status: 'readyToPlay' });
  assert.strictEqual(releasedOwner.releaseCount, 1, 'Media cleanup must be idempotent.');
  assert.strictEqual(releasedOwner.methodCallsAfterRelease, 0, 'Late video callbacks must not call a released player.');
  await fieldtest.unmount();

  const noSession = await mountHarness({
    profile: 'fieldtest', supabaseEnabled: true, legacyBehavior: false, initialSignedIn: false,
  });
  await noSession.run(() => noSession.authAdapter.resolveHydration(false));
  await noSession.run(() => noSession.control.current.pressFree('/setup'));
  await noSession.run(() => noSession.control.current.flushFreeNavigation());
  assert.ok(evaluateAcceptance(noSession, renderCeiling).pass, 'No-session fieldtest transition must pass.');
  await noSession.unmount();

  const signedInStartup = await mountHarness({
    profile: 'fieldtest', supabaseEnabled: true, legacyBehavior: false, initialSignedIn: false,
  });
  await signedInStartup.run(() => signedInStartup.authAdapter.resolveHydration(true));
  assert.strictEqual(signedInStartup.control.current.snapshot().signedIn, true, 'Ordinary signed-in startup must remain intact.');
  assert.strictEqual(signedInStartup.control.current.snapshot().route, '/setup', 'Signed-in setup-incomplete startup must follow the canonical route policy.');
  await signedInStartup.unmount();

  const ranked = Array.from({ length: 25 }, (_, index) => ({ id: `route-${index}` }));
  ranked.push({ id: 'route-0' });
  assert.strictEqual(ECS_ROUTE_SEARCH_RESULT_LIMIT, 20, 'Strict Explore cap must remain 20.');
  assert.strictEqual(capUniqueRankedRoutes(ranked, (item) => item.id, 500).length, 20,
    'Strict Explore cap must retain only 20 unique authoritative results.');
  assert.strictEqual(maximumUpdateDepthWarnings.length, 0, 'No Maximum update depth warning may occur.');

  const afterRenderCount = fieldtest.ledger.renders.MountedFieldtestRoot;
  console.log(JSON.stringify({
    suite: 'fieldtest-free-session-mounted-transition',
    scenarios: 23,
    calibration: { normalRenderCount, renderCeiling },
    before: {
      renderCount: beforeRenderCount,
      navigationActions: legacy.ledger.navigationActions.length,
      navigatorUnmounts: legacy.ledger.navigatorUnmounts,
    },
    after: {
      renderCount: afterRenderCount,
      navigationActions: fieldtest.ledger.navigationActions.length,
      navigatorMounts: fieldtest.ledger.navigatorMounts,
      maximumUpdateDepthWarnings: maximumUpdateDepthWarnings.length,
      releasedPlayerCalls: 0,
    },
  }, null, 2));
  } finally {
    console.error = originalConsoleError;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
