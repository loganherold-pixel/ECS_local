const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');
let reducedMotion = false;

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
  useRef(initialValue) {
    return { current: initialValue };
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

class AnimatedValue {
  constructor(value) {
    this.value = value;
  }
  setValue(value) {
    this.value = value;
  }
  interpolate() {
    return 'interpolated';
  }
}

function makeAnimation() {
  return {
    start(callback) {
      if (callback) callback({ finished: true });
    },
    stop() {},
  };
}

const reactNativeStub = {
  Animated: {
    Value: AnimatedValue,
    View: 'Animated.View',
    Text: 'Animated.Text',
    timing: makeAnimation,
    delay: makeAnimation,
    sequence: makeAnimation,
    parallel: makeAnimation,
    loop: makeAnimation,
  },
  Easing: {
    in: () => 'ease-in',
    out: () => 'ease-out',
    inOut: () => 'ease-in-out',
    quad: 'quad',
  },
  Image: 'Image',
  Platform: {
    OS: 'web',
    select(options) {
      return options.web ?? options.default;
    },
  },
  Pressable: 'Pressable',
  StyleSheet: {
    absoluteFillObject: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
    create(styles) {
      return styles;
    },
  },
  Text: 'Text',
  useWindowDimensions() {
    return { width: 390, height: 844 };
  },
  View: 'View',
};

const svgStub = {
  __esModule: true,
  default: 'Svg',
  Circle: 'Circle',
  Defs: 'Defs',
  FeDropShadow: 'FeDropShadow',
  Filter: 'Filter',
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
  useAnimatedStyle(factory) {
    return factory();
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
  if (request.includes('ecsAnimations')) return { useReducedMotion: () => reducedMotion };
  if (request.includes('haptics')) return { hapticMicro: () => undefined };
  return originalLoad.call(this, request, parent, isMain);
};

require.extensions['.ts'] = compileTypeScriptModule;
require.extensions['.tsx'] = compileTypeScriptModule;
require.extensions['.png'] = (mod, filename) => {
  mod.exports = filename;
};

const vehicleAttitudeStageModule = loadTypeScriptModule('src/features/attitude/components/VehicleAttitudeStage.tsx');
const VehicleAttitudeStage = vehicleAttitudeStageModule.default;
const {
  ATTITUDE_COMMAND_IMAGE_SNAP_ASPECT_RATIO,
  COMMAND_ATTITUDE_AXIS_X_NUDGE,
} = vehicleAttitudeStageModule;
const {
  VEHICLE_ATTITUDE_ASSETS,
  DEFAULT_ATTITUDE_GEOMETRY,
  ATTITUDE_READOUT_ANCHORS,
  ZERO_BUTTON_NUDGE_X,
} = loadTypeScriptModule('src/features/attitude/vehicleAttitudeAssets.ts');
const {
  DEFAULT_INDICATOR_TRAVEL_Y,
  HORIZON_Y,
  PITCH_FRONT_UI_SIGN,
  PITCH_REAR_UI_SIGN,
  ROLL_LEFT_UI_SIGN,
  ROLL_RIGHT_UI_SIGN,
} = loadTypeScriptModule('src/features/attitude/vehicleAttitudeTuning.ts');
const {
  LIVE_HASH_TRACKS,
  getTrackPoint,
} = loadTypeScriptModule('src/features/attitude/components/AttitudeLiveHashOverlay.tsx');
const {
  mapAttitudeInputForTelemetryFrame,
  mapScreenAttitudeToVehicleAttitude,
} = loadTypeScriptModule('src/features/attitude/attitudeOrientation.ts');

const previewSource = fs.readFileSync(path.join(root, 'app', 'dev', 'attitude-vehicle-stage-preview.tsx'), 'utf8');
assert.ok(
  previewSource.includes('Object.values(VEHICLE_ATTITUDE_ASSETS)') &&
    previewSource.includes('[-30, -20, -10, 0, 10, 20, 30]') &&
    previewSource.includes('mode="monitor"') &&
    previewSource.includes('mode="command"') &&
    previewSource.includes('previewPanelNarrow') &&
    previewSource.includes('pitchDeg={pitchDeg}') &&
    previewSource.includes('rollDeg={rollDeg}'),
  'Internal dev preview should show all 21 vehicles, pitch/roll sweeps, monitor mode, command mode, and narrow mode.',
);

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

function findAll(tree, predicate) {
  const matches = [];
  walk(tree, (node, ancestors) => {
    if (predicate(node, ancestors)) matches.push({ node, ancestors });
  });
  return matches;
}

function findOne(tree, predicate, message) {
  const matches = findAll(tree, predicate);
  assert.ok(matches.length > 0, message || 'Expected node to exist.');
  return matches[0];
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

function renderStage(props) {
  return VehicleAttitudeStage({
    vehicleId: 'toyota_tacoma',
    pitchDeg: 0,
    rollDeg: 0,
    ...props,
  });
}

function hashPoints(tree) {
  return findAll(
    tree,
    (node) => node.type === 'G' && String(node.props && node.props.testID || '').startsWith('vehicle-attitude-live-hash-'),
  ).map(({ node }) => {
    const match = String(node.props.transform || '').match(/translate\(([^ ]+) ([^)]+)\)/);
    assert.ok(match, 'Live hash indicator should expose a translated track point.');
    return {
      id: node.props.testID.replace('vehicle-attitude-live-hash-', ''),
      x: Number(match[1]),
      y: Number(match[2]),
    };
  });
}

function assertNear(actual, expected, label, tolerance = 0.75) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label} expected ${expected}, received ${actual}`);
}

const baseTree = renderStage({ vehicleId: 'toyota_tacoma', pitchDeg: 4.2, rollDeg: -3 });
const baseAsset = VEHICLE_ATTITUDE_ASSETS.toyota_tacoma;
const image = findOne(baseTree, byTestID('vehicle-attitude-stage-image'), 'Stage image should render.');
assert.strictEqual(image.node.props.source, baseAsset.attitudeImageSource, 'Stage should render the registry image for the vehicleId.');
assert.ok(String(image.node.props.source).endsWith(path.join('assets', 'vehicles', 'attitude', 'clean', baseAsset.sourceFilename)));
assert.strictEqual(image.node.props.resizeMode, 'contain', 'Stage image must use aspect-fit image behavior.');
findOne(baseTree, byTestID('vehicle-attitude-stage-gauge-overlay'), 'Stage should render the native gauge overlay.');
findOne(baseTree, byTestID('vehicle-attitude-monitor'), 'Stage should render the paired native attitude monitor.');
for (const axis of ['pitch', 'roll']) {
  findOne(baseTree, byTestID(`vehicle-attitude-${axis}-dial-meter`), `${axis} native dial meter should render.`);
  findOne(baseTree, byTestID(`vehicle-attitude-${axis}-dial-meter-degree-readout`), `${axis} native dial should render its centered degree readout.`);
  assert.throws(
    () => findOne(baseTree, byTestID(`vehicle-attitude-${axis}-gauge-ticks`)),
    /Expected node to exist/,
    `${axis} native dial should replace the old reusable tick asset.`,
  );
  assert.throws(
    () => findOne(baseTree, byTestID(`vehicle-attitude-${axis}-gauge-indicator`)),
    /Expected node to exist/,
    `${axis} native dial should replace the old needle indicator asset.`,
  );
  assert.throws(
    () => findOne(baseTree, byTestID(`vehicle-attitude-${axis}-gauge-indicator-pivot`)),
    /Expected node to exist/,
    `${axis} native dial should replace the old needle pivot.`,
  );
  assert.throws(
    () => findOne(baseTree, byTestID(`vehicle-attitude-${axis}-gauge-numbers`)),
    /Expected node to exist/,
    `${axis} gauge should not render numeric tick labels.`,
  );
}

for (const [vehicleId, asset] of Object.entries(VEHICLE_ATTITUDE_ASSETS)) {
  const tree = renderStage({ vehicleId });
  const vehicleImage = findOne(tree, byTestID('vehicle-attitude-stage-image'), `${vehicleId} should render an image.`);
  assert.strictEqual(vehicleImage.node.props.source, asset.attitudeImageSource, `${vehicleId} should use its exact registry image source.`);
  assert.ok(String(vehicleImage.node.props.source).endsWith(path.join('assets', 'vehicles', 'attitude', 'clean', asset.sourceFilename)));
}

const stageWidth = 420;
const stageHeight = stageWidth / baseAsset.aspectRatio;
const COMMAND_READOUT_Y_OFFSET = 44;
const stageRoot = findOne(baseTree, byTestID('vehicle-attitude-stage'), 'Stage root should render.');
const stageRootStyle = flattenStyle(stageRoot.node.props.style);
assert.strictEqual(stageRoot.node.props.pointerEvents, 'box-none', 'Stage root should not block widget controls.');
assert.strictEqual(stageRootStyle.alignItems, 'center', 'Stage root should center the fitted image horizontally.');
assert.strictEqual(stageRootStyle.justifyContent, 'center', 'Stage root should center the fitted image vertically.');
assert.strictEqual(stageRootStyle.overflow, 'hidden', 'Stage root should clip cover-fitted command artwork without distorting it.');
const fittedStage = findOne(baseTree, byTestID('vehicle-attitude-stage-viewbox'), 'Fitted image stage should render.');
const fittedStageStyle = flattenStyle(fittedStage.node.props.style);
assert.strictEqual(fittedStage.node.props.pointerEvents, 'box-none', 'Fitted stage should allow child controls to remain interactive.');
assert.strictEqual(fittedStageStyle.overflow, 'hidden', 'Fitted image stage should crop overlay layers to the vehicle artwork.');
assertNear(fittedStageStyle.width, stageWidth, 'Default fitted stage should preserve full image width.');
assertNear(fittedStageStyle.height, stageHeight, 'Default fitted stage should preserve the image aspect ratio.');

const commandWidthTree = renderStage({ mode: 'command', fitMode: 'containWidth' });
const commandWidthStage = findOne(commandWidthTree, byTestID('vehicle-attitude-stage-viewbox'), 'Command width-fitted stage should render.');
const commandWidthStyle = flattenStyle(commandWidthStage.node.props.style);
const baseMonitorStyle = flattenStyle(findOne(baseTree, byTestID('vehicle-attitude-monitor')).node.props.style);
const commandMonitorStyle = flattenStyle(findOne(commandWidthTree, byTestID('vehicle-attitude-monitor')).node.props.style);
assert.strictEqual(
  ATTITUDE_COMMAND_IMAGE_SNAP_ASPECT_RATIO,
  1448 / 1086,
  'Command full-width stage should use the actual clean PNG aspect ratio.',
);
assertNear(commandWidthStyle.width, stageWidth, 'Command width-fitted stage should snap to the available container width.');
assertNear(
  commandWidthStyle.height,
  stageWidth / ATTITUDE_COMMAND_IMAGE_SNAP_ASPECT_RATIO,
  'Command width-fitted stage should grow from the real vehicle image aspect ratio without stretching.',
);
assertNear(
  commandMonitorStyle.height,
  baseMonitorStyle.height * 2,
  'Portrait command gauge should be approximately 100% larger than the default monitor gauge.',
  1,
);
assert.ok(
  commandMonitorStyle.top < baseMonitorStyle.top,
  'Portrait command gauge should move upward to keep a clean buffer over the vehicle image.',
);

const svgOverlay = findOne(
  baseTree,
  (node) => node.type === 'Svg' && node.props && node.props.testID === 'vehicle-attitude-live-hash-overlay',
  'SVG live hash overlay should render.',
);
assert.strictEqual(svgOverlay.node.props.preserveAspectRatio, 'xMidYMid meet', 'SVG overlay must aspect-fit with the baked image.');

assert.strictEqual(
  findAll(baseTree, byTestID('vehicle-attitude-command-chrome-overlay')).length,
  0,
  'Monitor mode should not render the Attitude Command-specific chrome overlay.',
);

const commandTree = renderStage({ mode: 'command', pitchDeg: 999, rollDeg: -999 });
assert.strictEqual(
  findAll(commandTree, byTestID('vehicle-attitude-command-chrome-overlay')).length,
  0,
  'Command mode should not render the removed separate meter chrome overlay.',
);
assert.strictEqual(
  findAll(commandTree, byTestID('vehicle-attitude-command-pitch-panel')).length,
  0,
  'Command mode should not render a redundant PITCH panel over the baked image.',
);
assert.strictEqual(
  findAll(commandTree, byTestID('vehicle-attitude-command-roll-panel')).length,
  0,
  'Command mode should not render a redundant ROLL panel over the baked image.',
);
assert.strictEqual(
  findAll(commandTree, byTestID('vehicle-attitude-pitch-live-tick')).length,
  0,
  'Command mode should not render the removed separate pitch meter tick.',
);
assert.strictEqual(
  findAll(commandTree, byTestID('vehicle-attitude-roll-live-tick')).length,
  0,
  'Command mode should not render the removed separate roll meter tick.',
);
findOne(commandTree, byTestID('vehicle-attitude-stage-hash-overlay'), 'Command mode should keep the baked-image-aligned live hash overlay.');
const commandLevelReadout = findOne(commandTree, byTestID('vehicle-attitude-stage-level-readout'), 'Command mode should render level state in the image bottom banner.');
const commandLevelReadoutStyle = flattenStyle(commandLevelReadout.node.props.style);
assertNear(
  commandLevelReadoutStyle.top + commandLevelReadoutStyle.height / 2,
  (948 / DEFAULT_ATTITUDE_GEOMETRY.viewBox.height) * stageHeight,
  'Command mode level/downhill readout should sit low on the baked vehicle monitor border.',
);
assert.ok(
  commandLevelReadoutStyle.top + commandLevelReadoutStyle.height <= stageHeight,
  'Command mode level/downhill readout should stay inside the fitted attitude image bounds.',
);

const pitchReadout = findOne(baseTree, byTestID('vehicle-attitude-pitch-degree-readout'), 'Pitch readout should render.');
const pitchReadoutStyle = flattenStyle(pitchReadout.ancestors[pitchReadout.ancestors.length - 1].props.style);
assert.strictEqual(textContent(pitchReadout.node), '+4.2°');
assertNear(
  pitchReadoutStyle.left + pitchReadoutStyle.width / 2,
  (ATTITUDE_READOUT_ANCHORS.pitch.x / DEFAULT_ATTITUDE_GEOMETRY.viewBox.width) * stageWidth,
  'Pitch readout should sit centered below the side-profile vehicle.',
);
assertNear(
  pitchReadoutStyle.top + pitchReadoutStyle.height / 2,
  ((ATTITUDE_READOUT_ANCHORS.pitch.y + COMMAND_READOUT_Y_OFFSET) / DEFAULT_ATTITUDE_GEOMETRY.viewBox.height) * stageHeight,
  'Pitch readout should sit just below the baked Pitch label inside the image stage.',
);

const rollReadout = findOne(baseTree, byTestID('vehicle-attitude-roll-degree-readout'), 'Roll readout should render.');
const rollReadoutStyle = flattenStyle(rollReadout.ancestors[rollReadout.ancestors.length - 1].props.style);
assert.strictEqual(textContent(rollReadout.node), '-3.0°');
assertNear(
  rollReadoutStyle.left + rollReadoutStyle.width / 2,
  (ATTITUDE_READOUT_ANCHORS.roll.x / DEFAULT_ATTITUDE_GEOMETRY.viewBox.width) * stageWidth,
  'Roll readout should sit centered below the rear-profile vehicle.',
);
assertNear(
  rollReadoutStyle.top + rollReadoutStyle.height / 2,
  ((ATTITUDE_READOUT_ANCHORS.roll.y + COMMAND_READOUT_Y_OFFSET) / DEFAULT_ATTITUDE_GEOMETRY.viewBox.height) * stageHeight,
  'Roll readout should sit just below the baked Roll label inside the image stage.',
);

const commandPitchReadout = findOne(commandTree, byTestID('vehicle-attitude-pitch-degree-readout'), 'Command pitch readout should render.');
const commandRollReadout = findOne(commandTree, byTestID('vehicle-attitude-roll-degree-readout'), 'Command roll readout should render.');
const commandPitchReadoutStyle = flattenStyle(commandPitchReadout.ancestors[commandPitchReadout.ancestors.length - 1].props.style);
const commandRollReadoutStyle = flattenStyle(commandRollReadout.ancestors[commandRollReadout.ancestors.length - 1].props.style);
const commandPitchReadoutTextStyle = flattenStyle(commandPitchReadout.node.props.style);
const commandRollReadoutTextStyle = flattenStyle(commandRollReadout.node.props.style);
assert.ok(commandPitchReadoutTextStyle.fontSize <= 15, 'Command pitch degree readout should use a smaller overlay font.');
assert.ok(commandRollReadoutTextStyle.fontSize <= 15, 'Command roll degree readout should use a smaller overlay font.');
assertNear(
  commandPitchReadoutStyle.left + commandPitchReadoutStyle.width / 2,
  ((ATTITUDE_READOUT_ANCHORS.pitch.x + COMMAND_ATTITUDE_AXIS_X_NUDGE.pitch) / DEFAULT_ATTITUDE_GEOMETRY.viewBox.width) * stageWidth,
  'Command pitch readout should nudge right to sit over the side-profile vehicle.',
);
assertNear(
  commandRollReadoutStyle.left + commandRollReadoutStyle.width / 2,
  ((ATTITUDE_READOUT_ANCHORS.roll.x + COMMAND_ATTITUDE_AXIS_X_NUDGE.roll) / DEFAULT_ATTITUDE_GEOMETRY.viewBox.width) * stageWidth,
  'Command roll readout should nudge right to sit over the rear-profile vehicle.',
);

const pitchPositive = hashPoints(renderStage({ pitchDeg: 10, rollDeg: 0 }));
const pitchNegative = hashPoints(renderStage({ pitchDeg: -10, rollDeg: 0 }));
assert.strictEqual(pitchPositive.length, 4, 'Stage should render four live hash indicators.');
const expectedPitchFrontPositive = getTrackPoint(
  LIVE_HASH_TRACKS.pitchFrontLeft,
  HORIZON_Y + (10 / 30) * PITCH_FRONT_UI_SIGN * DEFAULT_INDICATOR_TRAVEL_Y,
);
const expectedPitchRearPositive = getTrackPoint(
  LIVE_HASH_TRACKS.pitchRearRight,
  HORIZON_Y + (10 / 30) * PITCH_REAR_UI_SIGN * DEFAULT_INDICATOR_TRAVEL_Y,
);
assertNear(pitchPositive[0].x, expectedPitchFrontPositive.x, 'Positive pitch should place the front side-profile hash on its curved track.');
assertNear(pitchPositive[0].y, expectedPitchFrontPositive.y, 'Positive pitch should move the front side-profile hash vertically.');
assertNear(pitchPositive[1].x, expectedPitchRearPositive.x, 'Positive pitch should place the rear side-profile hash on its curved track.');
assertNear(pitchPositive[1].y, expectedPitchRearPositive.y, 'Positive pitch should move the rear side-profile hash vertically.');
assert.ok(pitchPositive[0].y < HORIZON_Y && pitchPositive[1].y > HORIZON_Y, 'Positive pitch should move front and rear hashes opposite each other.');
assert.ok(pitchNegative[0].y > HORIZON_Y && pitchNegative[1].y < HORIZON_Y, 'Negative pitch should reverse the front/rear hash direction.');
assertNear(pitchPositive[2].y, HORIZON_Y, 'Pitch-only changes should not move the left rear-profile roll hash.');
assertNear(pitchPositive[3].y, HORIZON_Y, 'Pitch-only changes should not move the right rear-profile roll hash.');

const rollPositive = hashPoints(renderStage({ pitchDeg: 0, rollDeg: 12 }));
const rollNegative = hashPoints(renderStage({ pitchDeg: 0, rollDeg: -12 }));
const expectedRollLeftPositive = getTrackPoint(
  LIVE_HASH_TRACKS.rollLeft,
  HORIZON_Y + (12 / 30) * ROLL_LEFT_UI_SIGN * DEFAULT_INDICATOR_TRAVEL_Y,
);
const expectedRollRightPositive = getTrackPoint(
  LIVE_HASH_TRACKS.rollRight,
  HORIZON_Y + (12 / 30) * ROLL_RIGHT_UI_SIGN * DEFAULT_INDICATOR_TRAVEL_Y,
);
assertNear(rollPositive[2].x, expectedRollLeftPositive.x, 'Positive roll should place the left rear-profile hash on its curved track.');
assertNear(rollPositive[2].y, expectedRollLeftPositive.y, 'Positive roll should move the left rear-profile hash vertically.');
assertNear(rollPositive[3].x, expectedRollRightPositive.x, 'Positive roll should place the right rear-profile hash on its curved track.');
assertNear(rollPositive[3].y, expectedRollRightPositive.y, 'Positive roll should move the right rear-profile hash vertically.');
assert.ok(rollPositive[2].y < HORIZON_Y && rollPositive[3].y > HORIZON_Y, 'Positive roll should move left and right hashes opposite each other.');
assert.ok(rollNegative[2].y > HORIZON_Y && rollNegative[3].y < HORIZON_Y, 'Negative roll should reverse the left/right hash direction.');
assertNear(rollPositive[0].y, HORIZON_Y, 'Roll-only changes should not move the front side-profile pitch hash.');
assertNear(rollPositive[1].y, HORIZON_Y, 'Roll-only changes should not move the rear side-profile pitch hash.');

const pitchChangedRollFixedA = hashPoints(renderStage({ pitchDeg: 15, rollDeg: 7 }));
const pitchChangedRollFixedB = hashPoints(renderStage({ pitchDeg: -15, rollDeg: 7 }));
assertNear(pitchChangedRollFixedA[2].y, pitchChangedRollFixedB[2].y, 'Pitch changes should not alter left roll hash transform.');
assertNear(pitchChangedRollFixedA[3].y, pitchChangedRollFixedB[3].y, 'Pitch changes should not alter right roll hash transform.');

const rollChangedPitchFixedA = hashPoints(renderStage({ pitchDeg: 6, rollDeg: 20 }));
const rollChangedPitchFixedB = hashPoints(renderStage({ pitchDeg: 6, rollDeg: -20 }));
assertNear(rollChangedPitchFixedA[0].y, rollChangedPitchFixedB[0].y, 'Roll changes should not alter front pitch hash transform.');
assertNear(rollChangedPitchFixedA[1].y, rollChangedPitchFixedB[1].y, 'Roll changes should not alter rear pitch hash transform.');

const clampedPitchTree = renderStage({ pitchDeg: 45, rollDeg: 0, maxPitchDeg: 15 });
const clampedPitchPoints = hashPoints(clampedPitchTree);
const expectedClampedPitchFront = getTrackPoint(
  LIVE_HASH_TRACKS.pitchFrontLeft,
  HORIZON_Y + PITCH_FRONT_UI_SIGN * DEFAULT_INDICATOR_TRAVEL_Y,
);
const expectedClampedPitchRear = getTrackPoint(
  LIVE_HASH_TRACKS.pitchRearRight,
  HORIZON_Y + PITCH_REAR_UI_SIGN * DEFAULT_INDICATOR_TRAVEL_Y,
);
assertNear(clampedPitchPoints[0].y, expectedClampedPitchFront.y, 'Pitch hash visual travel should clamp at maxPitchDeg.');
assertNear(clampedPitchPoints[1].y, expectedClampedPitchRear.y, 'Rear pitch hash visual travel should clamp at maxPitchDeg.');
assert.strictEqual(
  textContent(findOne(clampedPitchTree, byTestID('vehicle-attitude-pitch-degree-readout')).node),
  '+45.0°',
  'Pitch readout should continue showing the unclamped telemetry value.',
);
assert.strictEqual(
  textContent(findOne(clampedPitchTree, byTestID('vehicle-attitude-pitch-dial-meter-degree-readout')).node),
  '+45°',
  'Pitch native dial readout should continue showing the unclamped telemetry value.',
);

const clampedRollTree = renderStage({ pitchDeg: 0, rollDeg: -72, maxRollDeg: 18 });
const clampedRollPoints = hashPoints(clampedRollTree);
const expectedClampedRollLeft = getTrackPoint(
  LIVE_HASH_TRACKS.rollLeft,
  HORIZON_Y - ROLL_LEFT_UI_SIGN * DEFAULT_INDICATOR_TRAVEL_Y,
);
const expectedClampedRollRight = getTrackPoint(
  LIVE_HASH_TRACKS.rollRight,
  HORIZON_Y - ROLL_RIGHT_UI_SIGN * DEFAULT_INDICATOR_TRAVEL_Y,
);
assertNear(clampedRollPoints[2].y, expectedClampedRollLeft.y, 'Left roll hash visual travel should clamp at maxRollDeg.');
assertNear(clampedRollPoints[3].y, expectedClampedRollRight.y, 'Right roll hash visual travel should clamp at maxRollDeg.');
assert.strictEqual(
  textContent(findOne(clampedRollTree, byTestID('vehicle-attitude-roll-degree-readout')).node),
  '-72.0°',
  'Roll readout should continue showing the unclamped telemetry value.',
);
assert.strictEqual(
  textContent(findOne(clampedRollTree, byTestID('vehicle-attitude-roll-dial-meter-degree-readout')).node),
  '-72°',
  'Roll native dial readout should continue showing the unclamped telemetry value.',
);

assert.deepStrictEqual(
  mapScreenAttitudeToVehicleAttitude({ pitchDeg: 10, rollDeg: -3 }, 'portrait'),
  { pitchDeg: 10, rollDeg: -3 },
  'Portrait screen-frame attitude should map through unchanged.',
);
assert.deepStrictEqual(
  mapScreenAttitudeToVehicleAttitude({ pitchDeg: 10, rollDeg: -3 }, 'portraitUpsideDown'),
  { pitchDeg: -10, rollDeg: 3 },
  'Upside-down portrait screen-frame attitude should invert pitch and roll.',
);
assert.deepStrictEqual(
  mapScreenAttitudeToVehicleAttitude({ pitchDeg: 10, rollDeg: 2 }, 'landscapeLeft'),
  { pitchDeg: 2, rollDeg: -10 },
  'Landscape-left screen-frame attitude should remap roll into vehicle pitch and pitch into vehicle roll.',
);
assert.deepStrictEqual(
  mapScreenAttitudeToVehicleAttitude({ pitchDeg: 10, rollDeg: 2 }, 'landscapeRight'),
  { pitchDeg: -2, rollDeg: 10 },
  'Landscape-right screen-frame attitude should remap roll into vehicle pitch and pitch into vehicle roll.',
);
assert.deepStrictEqual(
  mapScreenAttitudeToVehicleAttitude({ pitchDeg: Number.NaN, rollDeg: Number.POSITIVE_INFINITY }, 'landscapeRight'),
  { pitchDeg: -0, rollDeg: 0 },
  'Orientation mapping should sanitize invalid screen-frame telemetry before remapping.',
);
assert.deepStrictEqual(
  mapAttitudeInputForTelemetryFrame({ pitchDeg: 10, rollDeg: 2 }, 'landscapeLeft', 'vehicle'),
  { pitchDeg: 10, rollDeg: 2 },
  'Vehicle-frame telemetry should not be orientation compensated.',
);
assert.deepStrictEqual(
  mapAttitudeInputForTelemetryFrame({ pitchDeg: 10, rollDeg: 2 }, 'landscapeLeft', 'device'),
  { pitchDeg: 10, rollDeg: 2 },
  'Device-frame telemetry should preserve semantic pitch and roll values in landscape.',
);

const vehicleFrameLandscape = renderStage({
  pitchDeg: 10,
  rollDeg: 2,
  telemetryFrame: 'vehicle',
  screenOrientation: 'landscapeLeft',
});
assert.strictEqual(
  textContent(findOne(vehicleFrameLandscape, byTestID('vehicle-attitude-pitch-degree-readout')).node),
  '+10.0°',
  'Vehicle-frame pitch should stay stable when the screen rotates.',
);
assert.strictEqual(
  textContent(findOne(vehicleFrameLandscape, byTestID('vehicle-attitude-roll-degree-readout')).node),
  '+2.0°',
  'Vehicle-frame roll should stay stable when the screen rotates.',
);

const deviceFramePortrait = renderStage({
  pitchDeg: 10,
  rollDeg: -3,
  telemetryFrame: 'device',
  screenOrientation: 'portrait',
});
assert.strictEqual(
  textContent(findOne(deviceFramePortrait, byTestID('vehicle-attitude-pitch-degree-readout')).node),
  '+10.0°',
  'Portrait device-frame pitch should map through unchanged.',
);
assert.strictEqual(
  textContent(findOne(deviceFramePortrait, byTestID('vehicle-attitude-roll-degree-readout')).node),
  '-3.0°',
  'Portrait device-frame roll should map through unchanged.',
);

const deviceFramePortraitUpsideDown = renderStage({
  pitchDeg: 10,
  rollDeg: -3,
  telemetryFrame: 'device',
  screenOrientation: 'portraitUpsideDown',
});
assert.strictEqual(
  textContent(findOne(deviceFramePortraitUpsideDown, byTestID('vehicle-attitude-pitch-degree-readout')).node),
  '-10.0°',
  'Upside-down portrait device-frame pitch should be inverted.',
);
assert.strictEqual(
  textContent(findOne(deviceFramePortraitUpsideDown, byTestID('vehicle-attitude-roll-degree-readout')).node),
  '+3.0°',
  'Upside-down portrait device-frame roll should be inverted.',
);

const deviceFrameLandscapeLeft = renderStage({
  pitchDeg: 10,
  rollDeg: 2,
  telemetryFrame: 'device',
  screenOrientation: 'landscapeLeft',
});
assert.strictEqual(
  textContent(findOne(deviceFrameLandscapeLeft, byTestID('vehicle-attitude-pitch-degree-readout')).node),
  '+10.0°',
  'Landscape-left device-frame pitch readout should preserve the pitch channel.',
);
assert.strictEqual(
  textContent(findOne(deviceFrameLandscapeLeft, byTestID('vehicle-attitude-roll-degree-readout')).node),
  '+2.0°',
  'Landscape-left device-frame roll readout should preserve the roll channel.',
);

const deviceFrameLandscapeRight = renderStage({
  pitchDeg: 10,
  rollDeg: 2,
  telemetryFrame: 'device',
  screenOrientation: 'landscapeRight',
});
assert.strictEqual(
  textContent(findOne(deviceFrameLandscapeRight, byTestID('vehicle-attitude-pitch-degree-readout')).node),
  '+10.0°',
  'Landscape-right device-frame pitch readout should preserve the pitch channel.',
);
assert.strictEqual(
  textContent(findOne(deviceFrameLandscapeRight, byTestID('vehicle-attitude-roll-degree-readout')).node),
  '+2.0°',
  'Landscape-right device-frame roll readout should preserve the roll channel.',
);

const leftHashPoints = hashPoints(deviceFrameLandscapeLeft);
const expectedLandscapeLeftPitchFront = getTrackPoint(
  LIVE_HASH_TRACKS.pitchFrontLeft,
  HORIZON_Y + (10 / 30) * PITCH_FRONT_UI_SIGN * DEFAULT_INDICATOR_TRAVEL_Y,
);
const expectedLandscapeLeftRollLeft = getTrackPoint(
  LIVE_HASH_TRACKS.rollLeft,
  HORIZON_Y + (2 / 30) * ROLL_LEFT_UI_SIGN * DEFAULT_INDICATOR_TRAVEL_Y,
);
assertNear(leftHashPoints[0].y, expectedLandscapeLeftPitchFront.y, 'Device-frame pitch hash should preserve landscape-left pitch.');
assertNear(leftHashPoints[2].y, expectedLandscapeLeftRollLeft.y, 'Device-frame roll hash should preserve landscape-left roll.');

const zeroTree = renderStage({ onZero: () => undefined, onResetZero: () => undefined });
const zeroControl = findOne(zeroTree, byTestID('vehicle-attitude-zero-control'), 'Zero control should render.');
const zeroStyle = flattenStyle(zeroControl.node.props.style);
assert.strictEqual(ZERO_BUTTON_NUDGE_X, 4, 'Zero button nudge should remain tunable at four viewBox units.');
assert.strictEqual(
  DEFAULT_ATTITUDE_GEOMETRY.zeroButtonAnchor.x,
  876.5 + ZERO_BUTTON_NUDGE_X,
  'Zero button anchor should sit slightly right of mathematical center.',
);
assertNear(
  zeroStyle.left + zeroStyle.width / 2,
  (DEFAULT_ATTITUDE_GEOMETRY.zeroButtonAnchor.x / DEFAULT_ATTITUDE_GEOMETRY.viewBox.width) * stageWidth,
  'Zero button should sit at the configured center anchor.',
);
assert.ok(
  zeroStyle.left + zeroStyle.width / 2 > (876.5 / DEFAULT_ATTITUDE_GEOMETRY.viewBox.width) * stageWidth,
  'Zero button should render slightly right of exact mathematical center.',
);
assert.ok(
  zeroStyle.top + zeroStyle.minHeight / 2 > stageHeight * 0.78,
  'Zero button should sit near the bottom between the inner brackets.',
);

let zeroCalls = 0;
const clickableTree = renderStage({ onZero: () => { zeroCalls += 1; } });
const zeroButton = findOne(
  clickableTree,
  (node) => node.type === 'Pressable' && node.props && node.props.accessibilityLabel === 'Zero attitude',
  'Zero Pressable should render.',
);
assert.strictEqual(zeroButton.node.props.pointerEvents, 'auto', 'Zero button should explicitly allow pointer events.');
assert.strictEqual(textContent(zeroButton.node), '', 'Zero button should be a silent hit target without visible ZERO text.');
zeroButton.node.props.onPress();
assert.strictEqual(zeroCalls, 1, 'Clicking Zero should call onZero exactly once.');

assert.strictEqual(
  image.ancestors[image.ancestors.length - 1].props.pointerEvents,
  'none',
  'Vehicle image layer should be passive.',
);
assert.strictEqual(
  findOne(baseTree, byTestID('vehicle-attitude-stage-hash-overlay')).node.props.pointerEvents,
  'none',
  'Live hash overlay layer should be passive.',
);
assert.strictEqual(
  findOne(baseTree, (node) => node.type === 'Svg' && node.props && node.props.testID === 'vehicle-attitude-live-hash-overlay').node.props.pointerEvents,
  'none',
  'SVG overlay should be passive.',
);
assert.strictEqual(
  findOne(baseTree, byTestID('vehicle-attitude-stage-readout-overlay')).node.props.pointerEvents,
  'none',
  'Readout overlay should be passive.',
);

const hiddenReadoutsTree = renderStage({ showReadouts: false });
assert.strictEqual(
  findAll(hiddenReadoutsTree, byTestID('vehicle-attitude-stage-readout-overlay')).length,
  0,
  'showReadouts=false should hide the readout overlay.',
);
assert.strictEqual(
  findAll(hiddenReadoutsTree, byTestID('vehicle-attitude-stage-gauge-overlay')).length,
  0,
  'showReadouts=false should hide the gauge overlay with the readout overlay.',
);
assert.strictEqual(
  findAll(hiddenReadoutsTree, byTestID('vehicle-attitude-pitch-degree-readout')).length,
  0,
  'showReadouts=false should hide the pitch readout.',
);
assert.strictEqual(
  findAll(hiddenReadoutsTree, byTestID('vehicle-attitude-roll-degree-readout')).length,
  0,
  'showReadouts=false should hide the roll readout.',
);
assert.strictEqual(
  findAll(hiddenReadoutsTree, byTestID('vehicle-attitude-stage-level-readout')).length,
  0,
  'showReadouts=false should hide the bottom level readout.',
);

const riveOnlyTree = renderStage({
  showReadouts: false,
  showGaugeOverlay: true,
  showDegreeReadouts: false,
  showLevelReadout: false,
});
assert.strictEqual(
  findAll(riveOnlyTree, byTestID('vehicle-attitude-stage-gauge-overlay')).length,
  1,
  'showGaugeOverlay=true should keep the native dial layer mounted when legacy readouts are hidden.',
);
assert.strictEqual(
  findAll(riveOnlyTree, byTestID('vehicle-attitude-stage-readout-overlay')).length,
  0,
  'showDegreeReadouts=false should keep the bottom pitch/roll readouts hidden.',
);
assert.strictEqual(
  findAll(riveOnlyTree, byTestID('vehicle-attitude-stage-level-readout')).length,
  0,
  'showLevelReadout=false should keep the lean/incline status hidden.',
);

const hiddenHashTree = renderStage({ showLiveHashIndicators: false });
assert.strictEqual(
  findAll(hiddenHashTree, byTestID('vehicle-attitude-stage-hash-overlay')).length,
  0,
  'showLiveHashIndicators=false should hide the passive hash overlay.',
);
assert.strictEqual(
  hashPoints(hiddenHashTree).length,
  0,
  'showLiveHashIndicators=false should hide all live tactical hash indicators.',
);

const hiddenZeroTree = renderStage({ showZeroButton: false });
assert.strictEqual(
  findAll(hiddenZeroTree, byTestID('vehicle-attitude-zero-control')).length,
  0,
  'showZeroButton=false should hide the Zero control.',
);

const invalidTree = renderStage({ pitchDeg: Number.NaN, rollDeg: Number.POSITIVE_INFINITY });
assert.strictEqual(
  textContent(findOne(invalidTree, byTestID('vehicle-attitude-pitch-degree-readout')).node),
  '+0.0°',
  'Invalid pitch telemetry should render safely as 0.0°.',
);
assert.strictEqual(
  textContent(findOne(invalidTree, byTestID('vehicle-attitude-roll-degree-readout')).node),
  '+0.0°',
  'Invalid roll telemetry should render safely as 0.0°.',
);

reducedMotion = true;
const reducedTree = renderStage({ pitchDeg: 5, rollDeg: -5 });
for (const { node } of findAll(reducedTree, (item) => item.type === 'G' && item.props && item.props.testID && String(item.props.testID).startsWith('vehicle-attitude-live-hash-'))) {
  assert.strictEqual(node.props.style, undefined, 'Reduced motion should remove hash transition styles.');
}

console.log('VehicleAttitudeStage behavioral checks passed.');
