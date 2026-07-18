const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const modalCalls = [];

function normalizeChildren(children) {
  return children.flat(Infinity).filter((child) => child !== undefined && child !== null && child !== false);
}

const reactStub = {
  createElement(type, props, ...children) {
    const normalized = normalizeChildren(children);
    const nextProps = { ...(props || {}) };
    if (normalized.length === 1) nextProps.children = normalized[0];
    if (normalized.length > 1) nextProps.children = normalized;
    if (typeof type === 'function') return type(nextProps);
    return { type, props: nextProps };
  },
};

function MockModalShell(props) {
  modalCalls.push(props);
  return { type: 'ECSModalShell', props };
}

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react') return { __esModule: true, default: reactStub, ...reactStub };
  if (request === 'react-native') {
    return {
      StyleSheet: { create: (styles) => styles },
      Text: 'Text',
      View: 'View',
    };
  }
  if (request === '../ECSModalShell') {
    return { __esModule: true, default: MockModalShell };
  }
  if (request === '../SafeIcon') {
    return { SafeIcon: (props) => ({ type: 'SafeIcon', props }) };
  }
  if (request === '../ECSStatus') {
    return { ECSBadge: (props) => ({ type: 'ECSBadge', props }) };
  }
  if (request === '../../lib/theme') {
    return {
      TACTICAL: {
        amber: '#c48a2c',
        goldMedium: '#d4af37',
        text: '#ffffff',
        textMuted: '#b7bfc7',
      },
    };
  }
  if (request === '../../lib/ecsStatusTokens') {
    return { ECS_STATUS: { tone: { ready: { text: '#74b66a' } } } };
  }
  if (request === '../../lib/ecsTypographyTokens') {
    return {
      ECS_TEXT: {
        body: {},
        cardTitle: {},
        screenTitle: {},
        sectionTitle: {},
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

function compileTypeScriptModule(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
}

require.extensions['.tsx'] = compileTypeScriptModule;

function childrenOf(node) {
  const children = node && node.props ? node.props.children : undefined;
  if (children == null) return [];
  return Array.isArray(children) ? children : [children];
}

function walk(node, visitor) {
  if (node == null || node === false) return;
  if (typeof node === 'string' || typeof node === 'number') {
    visitor(node);
    return;
  }
  if (typeof node !== 'object') return;
  visitor(node);
  childrenOf(node).forEach((child) => walk(child, visitor));
}

function findByTestID(tree, testID) {
  let result = null;
  walk(tree, (node) => {
    if (!result && typeof node === 'object' && node.props?.testID === testID) result = node;
  });
  return result;
}

function textContent(tree) {
  const parts = [];
  walk(tree, (node) => {
    if (typeof node === 'string' || typeof node === 'number') parts.push(String(node));
  });
  return parts.join(' ');
}

function flattenStyle(style) {
  if (!style) return {};
  if (Array.isArray(style)) return Object.assign({}, ...style.filter(Boolean).map(flattenStyle));
  return typeof style === 'object' ? style : {};
}

const { FleetVehicleStatusModal } = require(
  path.join(root, 'components', 'fleet', 'FleetVehicleStatusModal.tsx'),
);

const notice = {
  score: 82,
  scoreLabel: '82',
  title: 'Trail Rig readiness is 82.',
  summary: 'The saved Fleet profile is usable for planning.',
  intelligenceSummary: 'Current load placement is the primary watch item.',
  intelligenceDetail: 'Keep the high-mounted load secured before departure.',
  intelligenceConfidenceLabel: 'Estimated',
  reasons: Array.from({ length: 8 }, (_, index) => `Reason ${index + 1}`),
  priorityReasons: ['Blocking payload issue', 'Active top-heavy risk'],
  improvements: Array.from({ length: 8 }, (_, index) => `Improvement ${index + 1}`),
};

let closeCount = 0;
const readinessTree = FleetVehicleStatusModal({
  kind: 'readiness',
  visible: true,
  notice,
  vehicleName: 'Trail Rig',
  maxWidth: 1120,
  topClearance: 48,
  bottomClearance: 84,
  onClose: () => { closeCount += 1; },
});

assert.equal(modalCalls.length, 1, 'Readiness should mount one shared ECS modal shell.');
const readinessShell = modalCalls[0];
assert.equal(readinessShell.title, 'Vehicle Readiness');
assert.equal(readinessShell.subtitle, 'Trail Rig');
assert.equal(readinessShell.maxWidth, 1120, 'The detail should use the Fleet main-body width.');
assert.equal(readinessShell.maxHeightFraction, 0.94, 'The detail may use the available Fleet body height.');
assert.equal(readinessShell.minHeightFraction, undefined, 'Content must not be stretched to a forced minimum height.');
assert.equal(readinessShell.topClearanceOverride, 48);
assert.equal(readinessShell.bottomClearanceOverride, 84);
assert.equal(readinessShell.scrollable, true, 'Overflow scrolling should remain only as a short-screen accessibility fallback.');
assert.equal(readinessShell.footer, undefined, 'The header close control should avoid a duplicate height-consuming footer.');
assert.equal(flattenStyle(readinessShell.bodyStyle).flexGrow, 0, 'The body should measure to its content.');
assert.equal(flattenStyle(readinessShell.contentContainerStyle).flexGrow, 0, 'Content should not create an empty vertical void.');

assert.ok(findByTestID(readinessTree, 'fleet-vehicle-readiness-detail'));
assert.ok(findByTestID(readinessTree, 'fleet-vehicle-readiness-reasons'));
assert.ok(findByTestID(readinessTree, 'fleet-vehicle-readiness-improvements'));
assert.match(textContent(readinessTree), /Blocking payload issue/, 'Prioritized operational blockers should lead the compact detail.');
assert.doesNotMatch(textContent(readinessTree), /Reason 1/, 'Generic reasons should not displace prioritized blockers.');
assert.equal(findByTestID(readinessTree, 'fleet-vehicle-readiness-reason-2'), null, 'The compact detail should use the explicit prioritized reason set.');
assert.equal(findByTestID(readinessTree, 'fleet-vehicle-readiness-improvement-4'), null, 'The compact detail should bound improvement rows.');
assert.match(textContent(readinessTree), /To Improve Readiness/);
assert.doesNotMatch(textContent(readinessTree), /Weight sources/i, 'Readiness should not expose the weight-source drilldown.');

readinessShell.onClose();
assert.equal(closeCount, 1, 'One close activation should produce one close action.');

const confidenceTree = FleetVehicleStatusModal({
  kind: 'confidence',
  visible: true,
  notice: { ...notice, scoreLabel: '82%' },
  vehicleName: 'Trail Rig',
  maxWidth: 1120,
  topClearance: 48,
  bottomClearance: 84,
  onClose: () => { closeCount += 1; },
});

assert.equal(modalCalls.length, 2, 'Confidence should reuse the same detail component.');
assert.equal(modalCalls[1].title, 'Vehicle Confidence');
assert.ok(findByTestID(confidenceTree, 'fleet-vehicle-confidence-detail'));
assert.match(textContent(confidenceTree), /To Improve Confidence/);
assert.doesNotMatch(textContent(confidenceTree), /Weight sources/i, 'Confidence should not expose the weight-source drilldown.');

console.log('Fleet vehicle readiness/confidence modal behavior checks passed.');
