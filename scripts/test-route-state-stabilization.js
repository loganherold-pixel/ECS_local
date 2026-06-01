const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function assertIncludes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function assertNotIncludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

function blockBetween(source, startFragment, endFragment) {
  const start = source.indexOf(startFragment);
  assert.notStrictEqual(start, -1, `Expected source to include ${startFragment}`);
  const end = source.indexOf(endFragment, start);
  assert.notStrictEqual(end, -1, `Expected source to include ${endFragment}`);
  return source.slice(start, end);
}

const useRoadNavigation = read('lib/useRoadNavigation.ts');
const navigate = read('app/(tabs)/navigate.tsx');
const sessionStore = read('lib/navigateRouteSessionStore.ts');
const routeLifecycleState = read('lib/routeLifecycleState.ts');

assertIncludes(
  useRoadNavigation,
  'const sessionRef = useRef(session);',
  'Road navigation should keep a session ref for callbacks/effects that must not depend on whole session object identity.',
);
assertIncludes(
  useRoadNavigation,
  'sessionRef.current = session;',
  'Road navigation should keep the session ref synchronized after state updates.',
);
assertIncludes(
  useRoadNavigation,
  'const routeRequestSeqRef = useRef(0);',
  'Road route requests should have a monotonic sequence for stale async result rejection.',
);
assertIncludes(
  useRoadNavigation,
  'const ROUTE_REQUEST_TIMEOUT_MS = 20000;',
  'Road route requests should have a bounded timeout so loading cannot remain active indefinitely.',
);
assertIncludes(
  useRoadNavigation,
  'withRouteRequestTimeout(\n          fetchRoadRoute({',
  'Road route fetches should be wrapped in the route timeout guard.',
);
assertIncludes(
  useRoadNavigation,
  'routeRequestSeqRef.current !== requestSeq',
  'Older route fetches must not be allowed to overwrite the latest route selection.',
);
assertIncludes(
  useRoadNavigation,
  'inFlightRouteKeyRef.current !== routeKey',
  'Route fetch completion should verify it still owns the active route key before applying.',
);
assertIncludes(
  useRoadNavigation,
  'if (inFlightRouteKeyRef.current === routeKey) {\n          inFlightRouteKeyRef.current = null;\n          setPreviewLoading(false);\n        }',
  'Preview loading should be cleared only by the current route request.',
);
const clearDestinationBlock = blockBetween(
  useRoadNavigation,
  'const clearDestination = useCallback(async () => {',
  'const endNavigation = useCallback',
);
assertIncludes(
  clearDestinationBlock,
  'routeRequestSeqRef.current += 1;',
  'Clearing/canceling a route should invalidate pending route requests.',
);
assertIncludes(
  clearDestinationBlock,
  'inFlightRouteKeyRef.current = null;',
  'Clearing/canceling a route should release the in-flight route key.',
);
assertIncludes(
  clearDestinationBlock,
  'setPreviewLoading(false);',
  'Clearing/canceling a route should immediately exit preview loading.',
);

const progressEffect = blockBetween(
  useRoadNavigation,
  'useEffect(() => {\n    const activeSession = sessionRef.current;',
  'const startNavigation = useCallback',
);
assertIncludes(
  progressEffect,
  'session.route,\n    session.routeConfidenceState,\n    session.status,',
  'Road progress effect should depend on scalar route lifecycle fields.',
);
assertNotIncludes(
  progressEffect,
  '    session,\n',
  'Road progress effect should not depend on the whole session object.',
);

assertIncludes(
  navigate,
  'const clearRoadDestination = roadNavigation.clearDestination;\n  const previewRoadDestination = roadNavigation.previewDestination;\n  const previewRoadRoute = roadNavigation.previewRoute;',
  'Navigate should bind stable road navigation actions for route lifecycle handoffs.',
);
assertIncludes(
  navigate,
  "import { normalizeRouteLifecycle } from '../../lib/routeLifecycleState';",
  'Navigate should consume the centralized route lifecycle normalizer.',
);
assertIncludes(
  navigate,
  'const routeLifecycleState = useMemo(',
  'Navigate should normalize competing route sources into one lifecycle state.',
);
assertIncludes(
  routeLifecycleState,
  "| 'idle'\n  | 'building'\n  | 'preview'\n  | 'ready'\n  | 'navigating'\n  | 'paused'\n  | 'completed'\n  | 'failed'",
  'Route lifecycle model should expose the ECS route phase vocabulary.',
);
const handoffBlock = blockBetween(
  navigate,
  'const applyExploreNavigationPayload = useCallback',
  'useFocusEffect(',
);
assertIncludes(
  handoffBlock,
  'await clearRoadDestination();',
  'Explore/trail handoffs should clear road route state through the stable action binding.',
);
assertIncludes(
  handoffBlock,
  "await previewRoadDestination(roadDestination, 'explore_handoff');",
  'Explore road handoffs should preview through the stable action binding.',
);
assertNotIncludes(
  handoffBlock,
  'roadNavigation,',
  'Explore route handoff callback should not depend on the whole roadNavigation object.',
);

assertIncludes(
  sessionStore,
  'snapshotSignature(currentSnapshot) === snapshotSignature(normalized)',
  'Navigate route session store should suppress duplicate route lifecycle snapshots.',
);
assertIncludes(
  sessionStore,
  "return setSnapshot({ ...inactiveSnapshot, updatedAt: new Date().toISOString() });",
  'Route session clear should go through the centralized deduped snapshot setter.',
);

console.log('Route state stabilization checks passed.');
