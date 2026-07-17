const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { Pressable, Text, View } = require('react-native-web');
const ts = require('typescript');

const root = path.join(__dirname, '..');

function compileTypeScript(mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  });
  mod._compile(output.outputText, filename);
}

require.extensions['.ts'] = compileTypeScript;
require.extensions['.tsx'] = compileTypeScript;

const {
  selectConvoyCommandActiveContext,
  selectConvoyCommandContextForOwner,
  selectScopedConvoyCommandLastGoodContext,
  selectConvoyCommandWorkspacePresentation,
} = require(path.join(root, 'lib', 'convoy', 'convoyCommandSelectors.ts'));
const DispatchConvoyWorkspaceSlot = require(path.join(
  root,
  'components',
  'dispatch',
  'DispatchConvoyWorkspaceSlot.tsx',
)).default;

const idleData = {
  dataState: 'setupNeeded',
  convoySize: 0,
  members: [],
  isOffline: false,
};
const plannedData = {
  dataState: 'planned',
  convoySize: 2,
  members: [{ id: 'lead' }, { id: 'sweep' }],
  isOffline: false,
};
const cachedOfflineData = {
  dataState: 'offline',
  convoySize: 2,
  members: [{ id: 'lead' }, { id: 'sweep' }],
  isOffline: true,
};

function select(overrides = {}) {
  return selectConvoyCommandWorkspacePresentation({
    activeConvoyId: null,
    commandData: idleData,
    membershipAvailability: 'ready',
    presentation: 'feed',
    ...overrides,
  });
}

function assertExclusive(result, expectedPrimary, message) {
  assert.equal(result.primarySurface, expectedPrimary, message);
  assert.equal(
    Number(result.showStandbySurface) + Number(result.primarySurface === 'active'),
    expectedPrimary === 'none' ? 0 : 1,
    `${message}: exactly one primary workspace should be selected`,
  );
  if (expectedPrimary === 'active') {
    assert.equal(result.showStandbySurface, false, `${message}: standby must be unmounted`);
    assert.equal(result.showSignalSurface || result.showCommandSurface, true, `${message}: active content must render`);
  } else if (expectedPrimary === 'standby') {
    assert.equal(result.showStandbySurface, true, `${message}: standby must render`);
    assert.equal(result.showSignalSurface, false, `${message}: signal surface must be unmounted`);
    assert.equal(result.showCommandSurface, false, `${message}: command surface must be unmounted`);
  }
}

function mountedSurface(testID, label, controlTestID) {
  return React.createElement(
    View,
    { testID, accessibilityLabel: label },
    React.createElement(
      Pressable,
      {
        testID: controlTestID,
        accessibilityRole: 'button',
        accessibilityLabel: `${label} control`,
      },
      React.createElement(Text, null, label),
    ),
  );
}

function renderWorkspace(result, viewport = null) {
  const workspace = React.createElement(DispatchConvoyWorkspaceSlot, {
    presentation: result,
    signalSurface: mountedSurface(
      result.showCommandSurface ? 'dispatch-convoy-signal-status' : 'dispatch-convoy-active-workspace',
      'Active convoy signals',
      'dispatch-convoy-signal-control',
    ),
    commandSurface: mountedSurface(
      'dispatch-convoy-active-workspace',
      'Dispatch convoy command',
      'dispatch-convoy-command-control',
    ),
    standbySurface: mountedSurface(
      'dispatch-convoy-standby-panel',
      `Convoy tracking ${result.standbyReason}`,
      'dispatch-convoy-standby-control',
    ),
  });
  return renderToStaticMarkup(viewport
    ? React.createElement(View, {
        style: { width: viewport.width, height: viewport.height },
        testID: `dispatch-viewport-${viewport.id}`,
      }, workspace)
    : workspace);
}

function assertMountedWorkspace(result, expectedPrimary, message, viewport = null) {
  const markup = renderWorkspace(result, viewport);
  const hasStandby = markup.includes('data-testid="dispatch-convoy-standby-panel"');
  const hasActive = markup.includes('data-testid="dispatch-convoy-active-workspace"');
  const hasStandbyFocus = markup.includes('data-testid="dispatch-convoy-standby-control"');
  const hasActiveFocus = markup.includes('data-testid="dispatch-convoy-command-control"') ||
    markup.includes('data-testid="dispatch-convoy-signal-control"');

  assert.equal(hasStandby, expectedPrimary === 'standby', `${message}: mounted standby subtree`);
  assert.equal(hasStandbyFocus, expectedPrimary === 'standby', `${message}: standby focus target`);
  assert.equal(hasActive, expectedPrimary === 'active', `${message}: mounted active subtree`);
  assert.equal(hasActiveFocus, expectedPrimary === 'active', `${message}: active focus target`);
  assert.equal(hasStandby && hasActive, false, `${message}: standby and active cannot coexist`);
  return markup;
}

for (const presentation of ['full', 'feed', 'signals']) {
  const result = select({ presentation });
  assertExclusive(
    result,
    'standby',
    `idle ${presentation} presentation`,
  );
  assertMountedWorkspace(result, 'standby', `idle ${presentation} presentation`);
}

const idleSummary = select({ presentation: 'summary' });
assertExclusive(
  idleSummary,
  'none',
  'idle landscape summary presentation',
);
assert.equal(renderWorkspace(idleSummary), '');

for (const presentation of ['full', 'feed']) {
  const result = select({
    activeConvoyId: 'convoy-1',
    presentation,
  });
  assertExclusive(result, 'active', `active membership ${presentation} presentation`);
  assert.equal(result.activeSource, 'membership');
  assert.equal(result.showSignalSurface, true);
  assert.equal(result.showCommandSurface, true);
  assertMountedWorkspace(result, 'active', `active membership ${presentation} presentation`);
}

const plannedWithoutMembership = select({ commandData: plannedData });
assertExclusive(plannedWithoutMembership, 'active', 'planned command data before membership hydration');
assert.equal(plannedWithoutMembership.activeSource, 'command_data');
assertMountedWorkspace(plannedWithoutMembership, 'active', 'planned command data before membership hydration');

const cachedOffline = select({ commandData: cachedOfflineData });
assertExclusive(cachedOffline, 'active', 'offline last-good command data');
assert.equal(cachedOffline.activeSource, 'command_data');
assertMountedWorkspace(cachedOffline, 'active', 'offline last-good command data');

const unavailable = select({ membershipAvailability: 'unavailable' });
assertExclusive(unavailable, 'standby', 'membership provider unavailable');
assert.equal(unavailable.standbyReason, 'unavailable');
assert.match(assertMountedWorkspace(unavailable, 'standby', 'membership provider unavailable'), /Convoy tracking unavailable/);

const disconnected = select({
  commandData: { ...idleData, isOffline: true },
});
assertExclusive(disconnected, 'standby', 'offline without cached convoy data');
assert.equal(disconnected.standbyReason, 'disconnected');
assert.match(assertMountedWorkspace(disconnected, 'standby', 'offline without cached convoy data'), /Convoy tracking disconnected/);

const pendingWithoutCache = select({ membershipAvailability: 'pending' });
assertExclusive(pendingWithoutCache, 'none', 'membership hydration pending without cached context');
assert.equal(renderWorkspace(pendingWithoutCache), '');

const activeSummary = select({
  activeConvoyId: 'convoy-1',
  presentation: 'summary',
});
assertExclusive(activeSummary, 'active', 'active landscape summary');
assert.equal(activeSummary.showSignalSurface, false);
assert.equal(activeSummary.showCommandSurface, true);
const activeSummaryMarkup = assertMountedWorkspace(activeSummary, 'active', 'active landscape summary');
assert.equal(activeSummaryMarkup.includes('dispatch-convoy-signal-status'), false);

const activeSignals = select({
  commandData: plannedData,
  presentation: 'signals',
});
assertExclusive(activeSignals, 'active', 'active landscape signal workspace');
assert.equal(activeSignals.showSignalSurface, true);
assert.equal(activeSignals.showCommandSurface, false);
const activeSignalsMarkup = assertMountedWorkspace(activeSignals, 'active', 'active landscape signal workspace');
assert.equal(activeSignalsMarkup.includes('dispatch-convoy-command-control'), false);

const transition = [
  select(),
  select({ commandData: plannedData }),
  select(),
];
assert.deepEqual(transition.map((result) => result.primarySurface), ['standby', 'active', 'standby']);
assertMountedWorkspace(transition[0], 'standby', 'transition starts idle');
assertMountedWorkspace(transition[1], 'active', 'transition becomes active');
assertMountedWorkspace(transition[2], 'standby', 'transition returns idle');

for (const viewport of [
  { id: 'portrait', width: 390, height: 844 },
  { id: 'landscape', width: 844, height: 390 },
  { id: 'narrow', width: 320, height: 568 },
]) {
  const idleMarkup = assertMountedWorkspace(
    select(),
    'standby',
    `${viewport.id} idle layout contract`,
    viewport,
  );
  assert.match(idleMarkup, new RegExp(`dispatch-viewport-${viewport.id}`));
  assertMountedWorkspace(
    select({ activeConvoyId: 'convoy-responsive' }),
    'active',
    `${viewport.id} active layout contract`,
    viewport,
  );
}

const cachedContext = { convoyId: 'cached-convoy', memberId: 'cached-member' };
const parentContext = { convoyId: 'verified-convoy', memberId: 'verified-member' };
const replacementContext = { convoyId: 'replacement-convoy', memberId: 'replacement-member' };
const ownerAContext = { ...cachedContext, ownerId: 'operator-a' };
assert.equal(
  selectConvoyCommandContextForOwner(ownerAContext, 'operator-a'),
  ownerAContext,
  'a matching UI owner should accept its service context',
);
assert.equal(
  selectConvoyCommandContextForOwner(ownerAContext, 'operator-b'),
  null,
  'an account-B surface must reject a raced account-A service context',
);
assert.equal(
  selectConvoyCommandContextForOwner(ownerAContext, null),
  null,
  'a signed-out surface must reject a raced authenticated service context',
);
assert.equal(
  selectConvoyCommandActiveContext({
    parentContext: null,
    parentAuthority: 'pending',
    hydratedContext: cachedContext,
  }),
  cachedContext,
  'pending parent verification should permit the independently hydrated context',
);
assert.equal(
  selectConvoyCommandActiveContext({
    parentContext: null,
    parentAuthority: 'unavailable',
    hydratedContext: cachedContext,
  }),
  cachedContext,
  'provider unavailability should preserve valid saved convoy context',
);
assert.equal(
  selectConvoyCommandActiveContext({
    parentContext,
    parentAuthority: 'resolved',
    hydratedContext: cachedContext,
  }),
  parentContext,
  'verified parent context should remain authoritative',
);
assert.equal(
  selectConvoyCommandActiveContext({
    parentContext: null,
    parentAuthority: 'resolved',
    hydratedContext: cachedContext,
  }),
  null,
  'confirmed inactive membership should reject stale hydrated context',
);
assert.equal(
  selectScopedConvoyCommandLastGoodContext({
    lastGoodContext: cachedContext,
    observedContext: cachedContext,
    lastGoodOwnerId: 'operator-a',
    currentOwnerId: 'operator-a',
  }),
  cachedContext,
  'provider failure should preserve matching last-good context for the same owner',
);
assert.equal(
  selectScopedConvoyCommandLastGoodContext({
    lastGoodContext: cachedContext,
    observedContext: replacementContext,
    lastGoodOwnerId: 'operator-a',
    currentOwnerId: 'operator-a',
  }),
  null,
  'an observed A-to-B convoy replacement must reject the prior last-good context',
);
assert.equal(
  selectScopedConvoyCommandLastGoodContext({
    lastGoodContext: cachedContext,
    observedContext: null,
    lastGoodOwnerId: 'operator-a',
    currentOwnerId: 'operator-b',
  }),
  null,
  'an account switch must reject another owner\'s last-good convoy context',
);

const unavailableReplacement = selectConvoyCommandActiveContext({
  parentContext: replacementContext,
  parentAuthority: 'unavailable',
  hydratedContext: cachedContext,
});
assert.equal(unavailableReplacement, replacementContext);
assertMountedWorkspace(
  select({
    activeConvoyId: unavailableReplacement.convoyId,
    membershipAvailability: 'unavailable',
  }),
  'active',
  'provider failure after A-to-B replacement uses observed B context',
);

const authorityTransition = [
  selectConvoyCommandActiveContext({
    parentContext: null,
    parentAuthority: 'pending',
    hydratedContext: cachedContext,
  }),
  selectConvoyCommandActiveContext({
    parentContext,
    parentAuthority: 'resolved',
    hydratedContext: cachedContext,
  }),
  selectConvoyCommandActiveContext({
    parentContext: null,
    parentAuthority: 'resolved',
    hydratedContext: cachedContext,
  }),
].map((context) => select({ activeConvoyId: context?.convoyId ?? null }));
assertMountedWorkspace(authorityTransition[0], 'active', 'pending parent with cached active context');
assertMountedWorkspace(authorityTransition[1], 'active', 'parent verifies active context');
assertMountedWorkspace(authorityTransition[2], 'standby', 'parent verifies inactive context');

const panelSource = fs.readFileSync(
  path.join(root, 'components', 'dispatch', 'DispatchConvoyCommandPanel.tsx'),
  'utf8',
);
const commandCenterSource = fs.readFileSync(
  path.join(root, 'components', 'dispatch', 'DispatchCadCommandCenter.tsx'),
  'utf8',
);
assert.match(panelSource, /selectConvoyCommandWorkspacePresentation/);
assert.match(panelSource, /selectConvoyCommandContextForOwner/);
assert.match(panelSource, /<DispatchConvoyWorkspaceSlot/);
assert.match(panelSource, /activeContextOwnerKeyRef\.current === activeConvoyContextOwnerKey/);
assert.match(panelSource, /testID="dispatch-convoy-standby-panel"/);
assert.match(panelSource, /testID="dispatch-convoy-active-workspace"/);
assert.match(commandCenterSource, /const showLandscapeConvoySummary = Boolean\(/);
assert.match(commandCenterSource, /selectConvoyCommandContextForOwner\(returnedContext, ownerId\)/);
assert.match(commandCenterSource, /missionCommandView !== 'team'/);
assert.match(commandCenterSource, /\{showLandscapeConvoySummary \? \(/);
assert.match(commandCenterSource, /const activeConvoyOwnerMatchesCurrentUser = activeConvoyControlOwnerRef\.current === \(user\?\.id \?\? null\)/);
assert.match(commandCenterSource, /activeConvoyControl\?\.activeContext \?\? observedActiveConvoyContext/);
assert.match(commandCenterSource, /activeConvoyContext=\{dispatchConvoyPresentationContext\}/);
assert.match(commandCenterSource, /activeConvoyContextAuthority=\{activeConvoyContextAuthority\}/);
assert.match(commandCenterSource, /accessibilityLabel="Create recovery report"/);
assert.match(commandCenterSource, /!missionCommandEnabled \? convoyFeedSurface/);

console.log('Dispatch convoy workspace layout behavior checks passed.');
