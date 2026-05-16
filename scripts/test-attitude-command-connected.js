/* global __dirname */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');

function compileTypeScriptModule(mod, filename) {
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

function loadTypeScriptModule(relPath) {
  const fullPath = path.join(root, relPath);
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  compileTypeScriptModule(mod, fullPath);
  return mod.exports;
}

function normalizeChildren(children) {
  return children.flat(Infinity).filter((child) => child !== undefined && child !== null && child !== false);
}

const reactStub = {
  createElement(type, props, ...children) {
    const normalized = normalizeChildren(children);
    const nextProps = { ...(props || {}) };
    if (normalized.length === 1) {
      nextProps.children = normalized[0];
    } else if (normalized.length > 1) {
      nextProps.children = normalized;
    }
    if (typeof type === 'function') {
      return type(nextProps);
    }
    return { type, props: nextProps };
  },
  memo(component) {
    return component;
  },
  useState(initialValue) {
    let value = typeof initialValue === 'function' ? initialValue() : initialValue;
    return [
      value,
      (nextValue) => {
        value = typeof nextValue === 'function' ? nextValue(value) : nextValue;
      },
    ];
  },
};

const reactNativeStub = {
  Image: 'Image',
  Platform: {
    OS: 'web',
    select(options) {
      return options.web ?? options.default;
    },
  },
  StyleSheet: {
    absoluteFillObject: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
    create(styles) {
      return styles;
    },
    hairlineWidth: 1,
  },
  Text: 'Text',
  View: 'View',
};

const mockBackdropSource = { mock: 'jeep-source' };
let accelerometerEnabled = null;
let accelerometerPitchDeg = 2.5;
let accelerometerRollDeg = -1.5;

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react') return reactStub;
  if (request === 'react-native') return reactNativeStub;
  if (request.includes('attitudeMonitorVehicleVisual')) {
    return {
      useActiveVehicleAttitudeBackdrop: () => ({
        attitudeVehicleId: 'jeep_wrangler',
        backdropSrc: 'assets/vehicles/attitude/clean/Jeep_Wrangler.png',
        backdropSource: mockBackdropSource,
        isFallback: false,
      }),
    };
  }
  if (request.includes('useAccelerometer')) {
    return {
      useAccelerometer: (enabled) => {
        accelerometerEnabled = enabled;
        return {
          pitchDeg: accelerometerPitchDeg,
          rollDeg: accelerometerRollDeg,
        };
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

require.extensions['.ts'] = compileTypeScriptModule;
require.extensions['.tsx'] = compileTypeScriptModule;
require.extensions['.png'] = (mod, filename) => {
  mod.exports = filename;
};

function childrenOf(node) {
  const children = node && node.props ? node.props.children : undefined;
  if (children == null) return [];
  return Array.isArray(children) ? children : [children];
}

function walk(node, visitor, ancestors = []) {
  if (!node || typeof node !== 'object') return;
  visitor(node, ancestors);
  for (const child of childrenOf(node)) {
    walk(child, visitor, [...ancestors, node]);
  }
}

function findOne(tree, predicate, message) {
  let match = null;
  walk(tree, (node, ancestors) => {
    if (!match && predicate(node, ancestors)) {
      match = { node, ancestors };
    }
  });
  assert.ok(match, message || 'Expected node to exist.');
  return match;
}

function byTestID(testID) {
  return (node) => node.props && node.props.testID === testID;
}

function textContent(node) {
  return childrenOf(node).join('');
}

const Connected = loadTypeScriptModule('src/components/attitudeCommand/AttitudeCommandWidgetConnected.tsx').default;

const dashboardFedTree = Connected({
  pitchDeg: 6.432,
  rollDeg: -3.21,
  telemetryEnabled: false,
  activeVehicleName: 'Jeep Wrangler',
});
assert.strictEqual(accelerometerEnabled, false, 'Dashboard-fed telemetry should not start a second sensor stream.');
assert.strictEqual(
  findOne(dashboardFedTree, byTestID('attitude-command-backdrop')).node.props.source,
  mockBackdropSource,
  'Connected widget should pass the resolved local image source into the presentational widget.',
);
assert.strictEqual(textContent(findOne(dashboardFedTree, byTestID('vehicle-attitude-pitch-degree-readout')).node), '+6.4°');
assert.strictEqual(textContent(findOne(dashboardFedTree, byTestID('vehicle-attitude-roll-degree-readout')).node), '-3.2°');

const selfFedTree = Connected({});
assert.strictEqual(accelerometerEnabled, true, 'Standalone connected widget should use the existing accelerometer hook.');
assert.strictEqual(textContent(findOne(selfFedTree, byTestID('vehicle-attitude-pitch-degree-readout')).node), '+2.5°');
assert.strictEqual(textContent(findOne(selfFedTree, byTestID('vehicle-attitude-roll-degree-readout')).node), '-1.5°');

accelerometerPitchDeg = undefined;
accelerometerRollDeg = undefined;
const missingTelemetryTree = Connected({});
assert.strictEqual(textContent(findOne(missingTelemetryTree, byTestID('vehicle-attitude-pitch-degree-readout')).node), '+0.0°');
assert.strictEqual(textContent(findOne(missingTelemetryTree, byTestID('vehicle-attitude-roll-degree-readout')).node), '+0.0°');

const connectedSource = fs.readFileSync(
  path.join(root, 'src', 'components', 'attitudeCommand', 'AttitudeCommandWidgetConnected.tsx'),
  'utf8',
);
assert.ok(connectedSource.includes('useActiveVehicleAttitudeBackdrop'), 'Connected widget should use the active vehicle backdrop hook.');
assert.ok(connectedSource.includes('useAccelerometer'), 'Connected widget should consume the existing pitch/roll telemetry hook.');
assert.ok(!connectedSource.includes('Ram_2500_3500'), 'Connected widget must not hardcode the Ram reference image.');
assert.ok(!connectedSource.includes('Rive'), 'Connected widget must not use Rive.');

const widgetRenderersSource = fs.readFileSync(path.join(root, 'components', 'dashboard', 'WidgetRenderers.tsx'), 'utf8');
assert.ok(
  widgetRenderersSource.includes('function AttitudeCommandWidgetConnected({') &&
    widgetRenderersSource.includes('return <VehicleAttitudeStage {...stageProps} />;') &&
    widgetRenderersSource.includes('<AttitudeCommandWidgetConnected') &&
    widgetRenderersSource.includes('pitchDeg={commandStagePitchDeg}') &&
    widgetRenderersSource.includes('rollDeg={commandStageRollDeg}') &&
    widgetRenderersSource.includes('telemetryEnabled={false}'),
  'Dashboard Attitude Command should render through the connected widget with existing telemetry values.',
);

console.log('Connected AttitudeCommandWidget checks passed.');
