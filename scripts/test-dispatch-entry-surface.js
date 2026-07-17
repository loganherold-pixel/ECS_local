const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.join(__dirname, '..');

function compileTypeScript(mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  mod._compile(output.outputText, filename);
}

require.extensions['.ts'] = compileTypeScript;
require.extensions['.tsx'] = compileTypeScript;

const routeManifest = require(path.join(root, 'lib', 'routeManifest.ts'));
const featureRegistry = require(path.join(root, 'lib', 'features', 'featureVisibilityRegistry.ts'));
const dispatchRollout = require(path.join(root, 'lib', 'dispatchRolloutConfig.ts'));
const easConfig = JSON.parse(fs.readFileSync(path.join(root, 'eas.json'), 'utf8'));

assert.equal(routeManifest.ECS_CANONICAL_DISPATCH_ROUTE, '/alert');
assert.equal(routeManifest.getPrimaryTabById('dispatch').route, '/alert');
assert.equal(routeManifest.getPrimaryTabForPath('/alert?missionCommandId=command-1')?.id, 'dispatch');
assert.equal(routeManifest.getRestorableShellRouteForPath('/alert?missionCommandId=command-1'), '/alert');

for (const [route, purpose] of [
  ['/alert', 'primary_dispatch_landing'],
  ['/convoy-command', 'convoy_command_surface'],
  ['/expedition-dispatch', 'expedition_dispatch_command_surface'],
]) {
  assert.equal(routeManifest.getDispatchRouteRelationship(route)?.purpose, purpose);
  assert.equal(routeManifest.getPrimaryTabForPath(route)?.id, 'dispatch');
}

function visibilityContext(environment, env = {}) {
  return featureRegistry.createRuntimeFeatureVisibilityContext({
    environment,
    env,
    online: true,
  });
}

function withReleaseRuntimeEnv(env, callback) {
  const keys = Array.from(new Set([
    'EXPO_PUBLIC_APP_ENV',
    'EXPO_PUBLIC_ECS_MISSION_COMMAND',
    'EXPO_PUBLIC_ECS_KILL_MISSION_COMMAND',
    'EXPO_PUBLIC_ECS_KILL_DISPATCH_TAB',
    ...Object.keys(env),
  ]));
  const previousValues = new Map(keys.map((key) => [key, process.env[key]]));
  const previousDev = global.__DEV__;
  try {
    for (const key of keys) delete process.env[key];
    Object.assign(process.env, env);
    global.__DEV__ = false;
    return callback();
  } finally {
    for (const [key, value] of previousValues) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
    if (previousDev === undefined) delete global.__DEV__;
    else global.__DEV__ = previousDev;
  }
}

function assertMissionCommandRollout() {
  assert.equal(
    dispatchRollout.resolveDispatchRolloutConfig({}, visibilityContext('development')).missionCommand,
    true,
    'Mission Command should be the development flagship without requiring a local env-file override.',
  );
  assert.equal(
    dispatchRollout.resolveDispatchRolloutConfig({}, visibilityContext('test')).missionCommand,
    true,
    'Mission Command should be enabled in the deterministic test environment.',
  );
  assert.equal(
    dispatchRollout.resolveDispatchRolloutConfig(
      {},
      visibilityContext('development', { EXPO_PUBLIC_ECS_MISSION_COMMAND: 'false' }),
    ).missionCommand,
    false,
    'An explicit development rollout disable must show the approved unavailable state.',
  );
  assert.equal(
    dispatchRollout.resolveDispatchRolloutConfig(
      {},
      visibilityContext('development', { EXPO_PUBLIC_ECS_KILL_MISSION_COMMAND: 'true' }),
    ).missionCommand,
    false,
    'The Mission Command kill switch must override the development default.',
  );
  assert.equal(
    dispatchRollout.resolveDispatchRolloutConfig({}, visibilityContext('internal')).missionCommand,
    false,
    'Internal builds should remain approval-gated when the rollout flag is absent.',
  );
  assert.equal(
    dispatchRollout.resolveDispatchRolloutConfig(
      {},
      visibilityContext('internal', { EXPO_PUBLIC_ECS_MISSION_COMMAND: 'true' }),
    ).missionCommand,
    true,
    'Approved internal builds should enable Mission Command from the canonical registry flag.',
  );
  assert.equal(
    dispatchRollout.resolveDispatchRolloutConfig(
      {},
      visibilityContext('production', { EXPO_PUBLIC_ECS_MISSION_COMMAND: 'true' }),
    ).missionCommand,
    false,
    'Mission Command must remain fail-closed in production.',
  );

  const fieldtestContext = withReleaseRuntimeEnv(
    easConfig.build.fieldtest.env,
    () => featureRegistry.createRuntimeFeatureVisibilityContext(),
  );
  const fieldtestRollout = dispatchRollout.resolveDispatchRolloutConfig({}, fieldtestContext);
  assert.equal(fieldtestContext.environment, 'internal');
  assert.equal(
    fieldtestRollout.missionCommand,
    true,
    'The approved release-style fieldtest profile should activate Mission Command through the central registry.',
  );
  for (const sensitiveFeature of [
    'teamPositionSharing',
    'convoyRegroupPlanner',
    'canonicalBackendPersistence',
    'missionCommandCanonicalPersistence',
    'agencyDataIngestion',
    'externalDispatchIntegration',
    'publicHazardPublishing',
    'automatedSosTransmission',
    'liveRadioNetworkIntegrations',
  ]) {
    assert.equal(
      fieldtestRollout[sensitiveFeature],
      false,
      `${sensitiveFeature} must remain separately disabled in the Mission Command fieldtest rollout.`,
    );
  }

  const killedFieldtestContext = withReleaseRuntimeEnv(
    {
      ...easConfig.build.fieldtest.env,
      EXPO_PUBLIC_ECS_KILL_MISSION_COMMAND: 'true',
    },
    () => featureRegistry.createRuntimeFeatureVisibilityContext(),
  );
  const killedFieldtestDecision = featureRegistry.resolveECSFeatureVisibility(
    'dispatch_mission_command',
    killedFieldtestContext,
  );
  assert.equal(killedFieldtestDecision.visible, false);
  assert.equal(killedFieldtestDecision.reason, 'kill_switch');

  const dispatchKilledContext = withReleaseRuntimeEnv(
    {
      ...easConfig.build.fieldtest.env,
      EXPO_PUBLIC_ECS_KILL_DISPATCH_TAB: 'true',
    },
    () => featureRegistry.createRuntimeFeatureVisibilityContext(),
  );
  assert.equal(
    featureRegistry.resolveECSFeatureVisibility('dispatch_mission_command', dispatchKilledContext).reason,
    'feature_dependency_unavailable',
  );

  const staleDisabledConfig = dispatchRollout.resolveDispatchRolloutConfig(
    {},
    visibilityContext('internal', { EXPO_PUBLIC_ECS_MISSION_COMMAND: 'false' }),
  );
  const currentInternalConfig = dispatchRollout.resolveDispatchRolloutConfig({}, fieldtestContext);
  assert.equal(staleDisabledConfig.missionCommand, false);
  assert.equal(
    currentInternalConfig.missionCommand,
    true,
    'A prior disabled resolution must not override the current immutable fieldtest build configuration.',
  );

  const productionContext = withReleaseRuntimeEnv(
    easConfig.build.production.env,
    () => featureRegistry.createRuntimeFeatureVisibilityContext(),
  );
  assert.equal(productionContext.environment, 'production');
  assert.equal(dispatchRollout.resolveDispatchRolloutConfig({}, productionContext).missionCommand, false);
}

const reactStub = {
  Component: class Component {
    constructor(props) {
      this.props = props;
    }

    setState(nextState) {
      const patch = typeof nextState === 'function' ? nextState(this.state, this.props) : nextState;
      this.state = { ...this.state, ...patch };
    }
  },
  createElement(type, props, ...children) {
    return {
      type,
      props: {
        ...(props || {}),
        children: children.length <= 1 ? children[0] : children,
      },
    };
  },
  useMemo(factory) {
    return factory();
  },
};
reactStub.default = reactStub;

let dimensions = { width: 390, height: 844 };
function CanonicalDispatchMarker() {
  return reactStub.createElement('CanonicalDispatchMarker', { testID: 'dispatch-canonical-command-center' });
}
function DirectCadImportMarker() {
  return reactStub.createElement('DirectCadImportMarker');
}

const passthroughComponent = (name) => function PassthroughComponent(props) {
  return reactStub.createElement(name, props, props.children);
};
const originalLoad = Module._load;
const originalDev = global.__DEV__;
global.__DEV__ = false;

Module._load = function loadDispatchRouteDependency(request, parent, isMain) {
  if (request === 'react') return reactStub;
  if (request === 'react-native') {
    return {
      ScrollView: 'ScrollView',
      Text: 'Text',
      TouchableOpacity: 'TouchableOpacity',
      View: 'View',
      AccessibilityInfo: { announceForAccessibility() {} },
      Platform: { OS: 'web' },
      StyleSheet: { create: (styles) => styles },
      useWindowDimensions: () => dimensions,
    };
  }
  if (request === 'react-native-safe-area-context') {
    return { useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
  }
  if (request === '../../components/dispatch/DispatchCommandCenter') {
    return { __esModule: true, default: CanonicalDispatchMarker };
  }
  if (request === '../../components/dispatch/DispatchCadCommandCenter') {
    return { __esModule: true, default: DirectCadImportMarker };
  }
  if (
    request === './DispatchCadCommandCenter'
    && parent?.filename?.endsWith(path.join('components', 'dispatch', 'DispatchCommandCenter.tsx'))
  ) {
    return { __esModule: true, default: DirectCadImportMarker };
  }
  if (request === '../../components/Header') {
    return { __esModule: true, default: passthroughComponent('Header') };
  }
  if (request === '../../components/TabErrorBoundary') {
    return { __esModule: true, default: passthroughComponent('TabErrorBoundary') };
  }
  if (request === '../../components/TopoBackground') {
    return { __esModule: true, default: passthroughComponent('TopoBackground') };
  }
  if (request === '../../lib/shellLayout') {
    return { getShellBottomClearance: (bottom, extra) => bottom + extra };
  }
  if (request === './SafeIcon') {
    return { SafeIcon: passthroughComponent('SafeIcon') };
  }
  if (request === '../lib/ecsIssueIntelligence') {
    return { reportFatalIssue() {} };
  }
  if (request === '../lib/accessibility/ecsOperationalAccessibility') {
    return { buildECSOperationalAnnouncement: () => ({ message: 'Dispatch render failed.' }) };
  }
  if (request === '../lib/ecsLogger') {
    return { ecsLog: { captureFailure() {} } };
  }
  return originalLoad(request, parent, isMain);
};

function collectElementTypes(node, types = new Set()) {
  if (node == null || typeof node === 'boolean') return types;
  if (Array.isArray(node)) {
    node.forEach((child) => collectElementTypes(child, types));
    return types;
  }
  if (typeof node !== 'object' || !('type' in node)) return types;

  types.add(node.type);
  if (typeof node.type === 'function' && node.type !== CanonicalDispatchMarker && node.type !== DirectCadImportMarker) {
    collectElementTypes(node.type(node.props || {}), types);
  }
  collectElementTypes(node.props?.children, types);
  return types;
}

try {
  const alertRoutePath = path.join(root, 'app', '(tabs)', 'alert.tsx');
  delete require.cache[require.resolve(alertRoutePath)];
  const AlertScreen = require(alertRoutePath).default;

  for (const nextDimensions of [
    { width: 390, height: 844 },
    { width: 390, height: 720 },
    { width: 844, height: 390 },
  ]) {
    dimensions = nextDimensions;
    const mountedTypes = collectElementTypes(AlertScreen());
    assert.equal(
      mountedTypes.has(CanonicalDispatchMarker),
      true,
      `The registered Dispatch route must mount the canonical entry at ${nextDimensions.width}x${nextDimensions.height}.`,
    );
    assert.equal(
      mountedTypes.has(DirectCadImportMarker),
      false,
      'The route must not bypass the canonical Dispatch entry and import its implementation directly.',
    );
  }

  const compatibilityEntryPath = path.join(root, 'components', 'dispatch', 'DispatchCommandCenter.tsx');
  delete require.cache[require.resolve(compatibilityEntryPath)];
  const compatibilityEntry = require(compatibilityEntryPath);
  assert.equal(
    compatibilityEntry.default,
    DirectCadImportMarker,
    'Legacy Dispatch imports must resolve to the same canonical implementation module.',
  );

  const errorBoundaryPath = path.join(root, 'components', 'TabErrorBoundary.tsx');
  delete require.cache[require.resolve(errorBoundaryPath)];
  const errorBoundaryModule = require(errorBoundaryPath);
  assert.equal(errorBoundaryModule.mapTabToArea('DISPATCH'), 'alert');
  const boundary = new errorBoundaryModule.default({
    tabName: 'DISPATCH',
    children: reactStub.createElement(CanonicalDispatchMarker),
  });
  assert.equal(boundary.render().type, CanonicalDispatchMarker);
  boundary.state = {
    ...boundary.state,
    ...errorBoundaryModule.default.getDerivedStateFromError(new Error('dispatch render failed')),
  };
  assert.notEqual(boundary.render().type, CanonicalDispatchMarker, 'A render error must show the terminal boundary, not legacy Dispatch.');
  boundary.handleRetry();
  assert.equal(boundary.render().type, CanonicalDispatchMarker, 'Retry should remount the same canonical Dispatch child.');
} finally {
  Module._load = originalLoad;
  if (originalDev === undefined) delete global.__DEV__;
  else global.__DEV__ = originalDev;
}

assertMissionCommandRollout();

const canonicalCommandCenterSource = fs.readFileSync(
  path.join(root, 'components', 'dispatch', 'DispatchCadCommandCenter.tsx'),
  'utf8',
);
assert.equal(
  (canonicalCommandCenterSource.match(/<DispatchMissionCommandBoard\b/g) ?? []).length,
  1,
  'The canonical Dispatch implementation should contain one Mission Command board mount.',
);
assert.match(
  canonicalCommandCenterSource,
  /!missionCommandEnabled \? convoyFeedSurface/,
  'Local Dispatch CAD and convoy controls must remain mounted when Mission Command is unavailable.',
);

console.log('Dispatch registered-route and canonical entry checks passed.');
