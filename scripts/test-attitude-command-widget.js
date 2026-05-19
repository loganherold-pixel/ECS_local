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
  useEffect() {
    return undefined;
  },
  useMemo(factory) {
    return factory();
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

const svgStub = {
  __esModule: true,
  default: 'Svg',
  Circle: 'Circle',
  G: 'G',
  Line: 'Line',
  Path: 'Path',
};

const reanimatedStub = {
  __esModule: true,
  default: {
    createAnimatedComponent(component) {
      return component;
    },
  },
  useAnimatedProps(factory) {
    return factory();
  },
  useEffect() {
    return undefined;
  },
  useSharedValue(initialValue) {
    return { value: initialValue };
  },
  withTiming(value) {
    return value;
  },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react') return reactStub;
  if (request === 'react-native') return reactNativeStub;
  if (request === 'react-native-reanimated') return reanimatedStub;
  if (request === 'react-native-svg') return svgStub;
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

function flattenStyle(style) {
  if (!style) return {};
  if (Array.isArray(style)) {
    return style.reduce((acc, entry) => ({ ...acc, ...flattenStyle(entry) }), {});
  }
  if (typeof style === 'object') return style;
  return {};
}

function textContent(node) {
  return childrenOf(node).join('');
}

const {
  default: AttitudeCommandWidget,
  getContainedAttitudeCommandStageSize,
} = loadTypeScriptModule('src/components/attitudeCommand/AttitudeCommandWidget.tsx');

assert.deepStrictEqual(
  getContainedAttitudeCommandStageSize({ width: 960, height: 720 }),
  { width: 960, height: 720 },
  'Desktop landscape should use the full 4:3 frame.',
);
assert.deepStrictEqual(
  getContainedAttitudeCommandStageSize({ width: 760, height: 570 }),
  { width: 760, height: 570 },
  'Tablet landscape should use the full 4:3 frame.',
);
assert.deepStrictEqual(
  getContainedAttitudeCommandStageSize({ width: 360, height: 640 }),
  { width: 360, height: 270 },
  'Phone portrait should fit by width and letterbox vertically.',
);
assert.deepStrictEqual(
  getContainedAttitudeCommandStageSize({ width: 640, height: 360 }),
  { width: 480, height: 360 },
  'Phone landscape should fit by height and letterbox horizontally.',
);
assert.strictEqual(
  getContainedAttitudeCommandStageSize({ width: 0, height: 640 }),
  null,
  'Unmeasured frames should use the default aspect-ratio style until layout is known.',
);

const tree = AttitudeCommandWidget({
  backdropSrc: 'assets/vehicles/attitude/clean/Jeep_Wrangler.png',
  pitchDeg: 6.432,
  rollDeg: -3.21,
  activeVehicleName: 'Jeep Wrangler',
});

const rootNode = findOne(tree, byTestID('attitude-command-widget'), 'Widget root should render.');
assert.ok(
  rootNode.node.props.accessibilityLabel.includes('Jeep Wrangler'),
  'Active vehicle name should be included in the accessible label.',
);
assert.ok(
  rootNode.node.props.accessibilityLabel.includes('Attitude Command for Jeep Wrangler: pitch +6.4 degrees, roll -3.2 degrees'),
  'Widget should expose a natural screen-reader summary with signed pitch and roll degrees.',
);

const stage = findOne(tree, byTestID('attitude-command-stage'), 'Stage should render.');
const stageStyle = flattenStyle(stage.node.props.style);
assert.strictEqual(stageStyle.aspectRatio, 4 / 3, 'Stage should preserve the fixed 4:3 backdrop template.');
assert.strictEqual(stageStyle.maxWidth, '100%', 'Stage should avoid horizontal overflow.');
assert.strictEqual(stageStyle.maxHeight, '100%', 'Stage should avoid vertical overflow.');

const backdrop = findOne(tree, byTestID('attitude-command-backdrop'), 'Backdrop should render.');
assert.deepStrictEqual(
  backdrop.node.props.source,
  { uri: 'assets/vehicles/attitude/clean/Jeep_Wrangler.png' },
  'Backdrop should use the provided prop, not a hardcoded vehicle image.',
);
assert.strictEqual(backdrop.node.props.resizeMode, 'contain', 'Backdrop should use contain behavior.');
assert.strictEqual(backdrop.node.props.accessible, false, 'Backdrop should be decorative for screen readers.');
assert.strictEqual(backdrop.node.props.accessibilityElementsHidden, true, 'Backdrop should be hidden from accessibility traversal.');
assert.strictEqual(backdrop.node.props.importantForAccessibility, 'no-hide-descendants', 'Backdrop descendants should not be exposed to accessibility.');

assert.throws(
  () => findOne(tree, byTestID('attitude-command-title')),
  /Expected node to exist/,
  'Attitude Command title should remain accessible through the summary label, not visible inside the widget.',
);
assert.strictEqual(textContent(findOne(tree, byTestID('attitude-command-pitch-dial-meter-degree-readout')).node), '+6°');
assert.strictEqual(textContent(findOne(tree, byTestID('attitude-command-roll-dial-meter-degree-readout')).node), '-3°');
assert.strictEqual(textContent(findOne(tree, (node) => childrenOf(node).includes('PITCH'), 'Pitch dial label should render.').node), 'PITCH');
assert.strictEqual(textContent(findOne(tree, (node) => childrenOf(node).includes('ROLL'), 'Roll dial label should render.').node), 'ROLL');

assert.deepStrictEqual(
  flattenStyle(findOne(tree, byTestID('attitude-command-pitch-gauge-slot')).node.props.style),
  { position: 'absolute', overflow: 'visible', alignItems: 'center', justifyContent: 'center', left: '8%', top: '17%', width: 118, height: 118 },
  'Pitch gauge should use normalized template positioning.',
);
assert.deepStrictEqual(
  flattenStyle(findOne(tree, byTestID('attitude-command-roll-gauge-slot')).node.props.style),
  { position: 'absolute', overflow: 'visible', alignItems: 'center', justifyContent: 'center', left: '53%', top: '17%', width: 118, height: 118 },
  'Roll gauge should use normalized template positioning.',
);
assert.throws(
  () => findOne(tree, byTestID('attitude-command-pitch-readout-slot')),
  /Expected node to exist/,
  'The native dial should own the centered pitch readout.',
);
assert.throws(
  () => findOne(tree, byTestID('attitude-command-roll-readout-slot')),
  /Expected node to exist/,
  'The native dial should own the centered roll readout.',
);

const widgetSource = fs.readFileSync(
  path.join(root, 'src', 'components', 'attitudeCommand', 'AttitudeCommandWidget.tsx'),
  'utf8',
);
assert.ok(!widgetSource.includes('Ram_2500_3500'), 'Widget must not hardcode the Ram reference image.');
assert.ok(!widgetSource.includes('Rive'), 'Widget must not use Rive.');
assert.ok(widgetSource.includes("import AttitudeDial from '../../features/attitude/components/AttitudeDial'"), 'Widget should use the native attitude dial.');
assert.ok(widgetSource.includes('backdropSrc'), 'Widget should be driven by the backdropSrc prop.');
assert.ok(widgetSource.includes('getContainedAttitudeCommandStageSize'), 'Widget should compute a contained 4:3 stage from measured bounds.');
assert.ok(widgetSource.includes('onLayout={handleLayout}'), 'Widget should respond to portrait and landscape layout changes.');
assert.ok(widgetSource.includes("maxHeight: '100%'"), 'Widget should cap stage height to its parent.');
assert.ok(widgetSource.includes('minWidth: 0'), 'Widget should avoid portrait horizontal overflow.');

const previewSource = fs.readFileSync(
  path.join(root, 'app', 'dev', 'attitude-command-widget-preview.tsx'),
  'utf8',
);
assert.ok(
  previewSource.includes('Desktop Landscape') &&
    previewSource.includes('Tablet Landscape') &&
    previewSource.includes('Phone Portrait') &&
    previewSource.includes('Phone Landscape') &&
    previewSource.includes('Static Ram-like Backdrop') &&
    previewSource.includes('Static Jeep-like Backdrop') &&
    previewSource.includes('Active Vehicle Switching') &&
    previewSource.includes('Live Simulated Telemetry') &&
    previewSource.includes('Clamp Check') &&
    previewSource.includes('setInterval') &&
    previewSource.includes('Switch Vehicle') &&
    previewSource.includes('pitchDeg={22}') &&
    previewSource.includes('rollDeg={-22}') &&
    previewSource.includes('AttitudeCommandWidget'),
  'Dev preview should include static vehicles, switching, simulated telemetry, clamping, and responsive states.',
);

console.log('AttitudeCommandWidget presentation checks passed.');
