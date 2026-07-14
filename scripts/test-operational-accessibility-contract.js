const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function read(...segments) {
  return fs.readFileSync(path.join(root, ...segments), 'utf8').replace(/\r\n/g, '\n');
}

function includes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function compileTypeScriptModule(mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  mod._compile(output.outputText, filename);
}

function loadTypeScriptModule(...segments) {
  const fullPath = path.join(root, ...segments);
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  compileTypeScriptModule(mod, fullPath);
  return mod.exports;
}

const buttonSource = read('components', 'ECSButton.tsx');
const statusSource = read('components', 'ECSStatus.tsx');
const modalSource = read('components', 'ECSModal.tsx');
const modalShellSource = read('components', 'ECSModalShell.tsx');
const errorBoundarySource = read('components', 'TabErrorBoundary.tsx');
const navigateSource = read('app', '(tabs)', 'navigate.tsx');
const commandBriefSource = read('components', 'brief', 'CommandBriefScreen.tsx');
const dispatchSource = read('components', 'dispatch', 'DispatchCadCommandCenter.tsx');
const assessmentSource = read('components', 'dashboard', 'ExpeditionAssessmentDetailView.tsx');
const offlinePrepSource = read('app', 'explore-offline-prep-pack.tsx');
const vehicleDisplaySource = read('app', 'vehicle-display.tsx');
const exploreSource = read('app', '(tabs)', 'discover.tsx');

includes(buttonSource, 'accessibilityRole="button"', 'Shared ECS buttons should expose the button role.');
includes(buttonSource, 'accessibilityLabel={accessibilityLabel ?? label}', 'Text buttons should use visible copy as their accessible name.');
includes(modalSource, 'onRequestClose={handleRequestClose}', 'The shared modal should preserve Android back dismissal.');
includes(modalSource, 'isReduceMotionEnabled', 'The shared modal should preserve reduced-motion handling.');
includes(modalShellSource, 'resolveMobileOverlayBounds', 'The tactical shell should preserve bounded phone/tablet layout.');
includes(navigateSource, 'const routeOperationState = useMemo(', 'Navigate should expose one route-operation state for announcements.');
includes(commandBriefSource, 'getBriefFreshnessCopy', 'ECS Brief should preserve explicit freshness copy.');
includes(dispatchSource, "label: 'LIVE' | 'OFFLINE' | 'QUEUED'", 'Dispatch should preserve explicit connection labels.');
for (const label of ['Normal', 'Watch', 'Caution', 'Critical', 'Unknown']) {
  includes(assessmentSource, `label: '${label}'`, `Expedition assessments should preserve ${label} status copy.`);
}
includes(offlinePrepSource, 'setActionMessage', 'Offline Prep should preserve visible action feedback.');
for (const screen of ['navigation', 'attitude', 'resources', 'weather_hazard', 'exit_plan']) {
  includes(vehicleDisplaySource, `case '${screen}'`, `Vehicle Display should preserve the ${screen} surface.`);
}
includes(exploreSource, 'const favoriteTrailCards =', 'Explore should preserve the favorite route-card workflow.');

const announcementPath = path.join(root, 'lib', 'accessibility', 'ecsOperationalAccessibility.ts');
const enhanced = fs.existsSync(announcementPath);
if (enhanced) {
  const announcementSource = read('lib', 'accessibility', 'ecsOperationalAccessibility.ts');
  const announcerSource = read('components', 'ECSOperationalAnnouncer.tsx');
  const { buildECSOperationalAnnouncement } = loadTypeScriptModule(
    'lib',
    'accessibility',
    'ecsOperationalAccessibility.ts',
  );

  for (const kind of [
    'error',
    'connection_changed',
    'route_activated',
    'stale_data',
    'critical_advisory',
    'offline_action_queued',
  ]) {
    includes(announcementSource, `'${kind}'`, `Operational announcement model should support ${kind}.`);
  }
  includes(announcerSource, 'AccessibilityInfo.announceForAccessibility', 'Native state changes should be announced.');
  includes(announcerSource, 'accessibilityLiveRegion', 'Web/Android should retain a live-region model.');
  includes(buttonSource, 'accessibilityState=', 'Shared buttons should expose disabled, busy, and selected state.');
  includes(buttonSource, 'hitSlop=', 'Compact shared buttons should preserve an effective touch target.');
  includes(buttonSource, 'maxFontSizeMultiplier={1.6}', 'Shared button copy should support bounded dynamic text.');
  includes(statusSource, 'accessibilityLabel=', 'Status primitives should describe state without relying on color.');
  includes(statusSource, "warning: 'Warning'", 'Status semantics should expose warning state without color.');
  includes(statusSource, 'numberOfLines={2}', 'Status badges should allow long labels to wrap safely.');
  includes(modalSource, 'accessibilityViewIsModal', 'The shared modal should contain accessibility focus.');
  includes(modalSource, 'onAccessibilityEscape=', 'The shared modal should support accessibility escape dismissal.');
  includes(modalShellSource, 'AccessibilityInfo.setAccessibilityFocus', 'The tactical shell should focus its title when opened.');
  includes(modalShellSource, 'numberOfLines={2}', 'Long modal titles should not be forced onto one clipped line.');
  includes(modalShellSource, 'keyboardDismissMode=', 'Scrollable form shells should support deliberate keyboard dismissal.');
  includes(errorBoundarySource, 'buildECSOperationalAnnouncement', 'Shared tab failures should use the redacted announcement contract.');
  includes(errorBoundarySource, 'accessibilityLiveRegion="assertive"', 'Fatal tab errors should expose an assertive recovery state.');
  includes(errorBoundarySource, 'accessibilityHint="Retries this surface without changing operational data"', 'Error recovery should explain its effect.');
  includes(navigateSource, 'accessibilityViewIsModal', 'Navigate map popups should contain assistive focus.');
  includes(navigateSource, 'accessibilityRole="radio"', 'Navigate map presentation choices should expose selection semantics.');

  for (const source of [navigateSource, commandBriefSource, dispatchSource, assessmentSource, offlinePrepSource, vehicleDisplaySource]) {
    includes(source, 'ECSOperationalAnnouncer', 'Each selected operational surface should use the shared announcer.');
  }

  for (const fragment of [
    'accessibilityRole="tab"',
    'accessibilityRole="radio"',
    'accessibilityRole="switch"',
    'accessibilityState={{ selected: isActive }}',
  ]) {
    includes(vehicleDisplaySource, fragment, `Vehicle Display should include ${fragment}.`);
  }
  includes(exploreSource, 'Open saved route ${favorite.title}', 'Saved routes should expose long, specific names.');
  includes(exploreSource, 'accessible={false}', 'Saved route card grouping should keep nested actions reachable.');
  includes(exploreSource, 'style={s.favoriteCardTitle} numberOfLines={2}', 'Long saved route names should wrap without clipping.');
  includes(exploreSource, "style: 'destructive'", 'Explore destructive removal should require confirmation.');

  const critical = buildECSOperationalAnnouncement({
    id: 'critical-1',
    kind: 'critical_advisory',
    subject: 'Route access',
    detail: 'Closure evidence is current.',
  });
  assert.strictEqual(critical.priority, 'assertive');
  assert.strictEqual(
    critical.message,
    'Critical advisory: Route access. Closure evidence is current.',
  );

  const queued = buildECSOperationalAnnouncement({
    id: 'queue-2',
    kind: 'offline_action_queued',
    subject: 'Dispatch action',
    count: 2,
    detail: 'Delivery will retry after reconnection.',
  });
  assert.strictEqual(queued.priority, 'polite');
  assert.strictEqual(
    queued.message,
    '2 Dispatch actions queued for offline delivery. Delivery will retry after reconnection.',
  );

  const normalized = buildECSOperationalAnnouncement({
    id: 'route-1',
    kind: 'route_activated',
    subject: '  Long   Route  ',
    detail: ' Guidance   is active. ',
  });
  assert.strictEqual(normalized.message, 'Route activated: Long Route. Guidance is active.');
  assert.strictEqual(
    normalized.fingerprint,
    buildECSOperationalAnnouncement({
      id: 'route-1',
      kind: 'route_activated',
      subject: 'Long Route',
      detail: 'Guidance is active.',
    }).fingerprint,
    'Equivalent deterministic announcements should dedupe to one fingerprint.',
  );
}

console.log(JSON.stringify({
  suite: 'operational-accessibility-contract',
  status: 'passed',
  phase: enhanced ? 'hardened' : 'baseline',
}, null, 2));
