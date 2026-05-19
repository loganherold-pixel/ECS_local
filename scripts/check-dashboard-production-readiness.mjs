import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const RESULT_RELATIVE_PATH = path.join('.smoke', 'dashboard-production-readiness-result.json');
const EVIDENCE_RELATIVE_PATH = path.join('.smoke', 'dashboard-production-evidence.json');

function relPath(root, filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/');
}

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function readJsonIfExists(filePath) {
  try {
    return JSON.parse(readIfExists(filePath));
  } catch {
    return null;
  }
}

function normalize(source) {
  return source.replace(/\r\n/g, '\n');
}

function check(id, label, passed, evidence = [], remediation = []) {
  return { id, label, passed: Boolean(passed), evidence, remediation };
}

function evidenceTrue(evidence, key) {
  return evidence?.[key] === true;
}

function accepted(value) {
  return String(value ?? '').trim().toLowerCase() === 'accepted';
}

export function buildDashboardProductionReadinessResult(options = {}) {
  const root = options.rootDir ?? process.cwd();
  const paths = {
    result: path.join(root, RESULT_RELATIVE_PATH),
    evidence: path.join(root, EVIDENCE_RELATIVE_PATH),
    dashboard: path.join(root, 'app', '(tabs)', 'dashboard.tsx'),
    dashboardHeader: path.join(root, 'components', 'dashboard', 'DashboardHeader.tsx'),
    widgetGrid: path.join(root, 'components', 'dashboard', 'WidgetGrid.tsx'),
    widgetRenderers: path.join(root, 'components', 'dashboard', 'WidgetRenderers.tsx'),
    vehicleTelemetryWidget: path.join(root, 'components', 'dashboard', 'VehicleTelemetryWidget.tsx'),
    widgetRegistry: path.join(root, 'lib', 'widgetRegistry.ts'),
    widgetDetailModal: path.join(root, 'components', 'dashboard', 'WidgetDetailModal.tsx'),
    commandHost: path.join(root, 'components', 'dashboard', 'commandCenter', 'CommandCenterHost.tsx'),
    commandRegistry: path.join(root, 'components', 'dashboard', 'commandCenter', 'commandCenterRegistry.ts'),
    commandSelector: path.join(root, 'components', 'dashboard', 'commandCenter', 'CommandCenterModeSelector.tsx'),
    oldConvoyWidget: path.join(root, 'components', 'dashboard', 'command-center', 'widgets', 'ConvoyCommandWidget.tsx'),
    oldConvoyCommand: path.join(root, 'components', 'dashboard', 'commandCenter', 'ConvoyCommand.tsx'),
    oldConvoyRive: path.join(root, 'components', 'rive', 'ECSConvoyCommandRive.tsx'),
  };

  const evidence = readJsonIfExists(paths.evidence);
  const dashboard = normalize(readIfExists(paths.dashboard));
  const dashboardHeader = normalize(readIfExists(paths.dashboardHeader));
  const widgetGrid = normalize(readIfExists(paths.widgetGrid));
  const widgetRenderers = normalize(readIfExists(paths.widgetRenderers));
  const vehicleTelemetryWidget = normalize(readIfExists(paths.vehicleTelemetryWidget));
  const widgetRegistry = normalize(readIfExists(paths.widgetRegistry));
  const widgetDetailModal = normalize(readIfExists(paths.widgetDetailModal));
  const commandHost = normalize(readIfExists(paths.commandHost));
  const commandRegistry = normalize(readIfExists(paths.commandRegistry));
  const commandSelector = normalize(readIfExists(paths.commandSelector));

  const checks = [
    check(
      'dashboard_widget_registry_and_grid_are_responsive_and_guarded',
      'Dashboard widget registry and grid use curated registration, responsive measurements, error boundaries, and constrained resize controls.',
      widgetRegistry.includes('validateCuratedDashboardConfig') &&
        widgetRegistry.includes('resolveWidgetStatus') &&
        widgetRegistry.includes('resolveWidgetStatusWithBus') &&
        widgetRegistry.includes('fallbackBehavior') &&
        widgetRegistry.includes('getDashboardSupportedSizes') &&
        widgetRegistry.includes('canResizeDashboardWidget') &&
        widgetRegistry.includes('DASHBOARD_MODE_WIDGET_IDS') &&
        widgetGrid.includes('useWindowDimensions') &&
        widgetGrid.includes('containerWidth') &&
        widgetGrid.includes('WidgetErrorBoundary') &&
        widgetGrid.includes('isRegistered') &&
        widgetGrid.includes('getDashboardSupportedSizes') &&
        widgetGrid.includes('canResizeDashboardWidget') &&
        widgetGrid.includes('enableLegacyAndroidLayoutAnimation') &&
        widgetGrid.includes('WidgetContainerBackground') &&
        widgetGrid.includes('layoutMode'),
      [relPath(root, paths.widgetRegistry), relPath(root, paths.widgetGrid)],
      ['Capture Android phone/tablet portrait and landscape evidence for Dashboard widget grid, resize, replace, and error fallback states.'],
    ),
    check(
      'dashboard_widgets_are_source_labeled_and_do_not_fake_live_state',
      'Dashboard widgets use shared source labels, unavailable/stale states, and normalized telemetry/weather/power/route surfaces instead of fake live values.',
      widgetRenderers.includes('resolveWidgetStatus') &&
        widgetRenderers.includes('WidgetStateMessage') &&
        widgetRenderers.includes('WidgetEmptyState') &&
        widgetRenderers.includes('WidgetCardShell') &&
        widgetRenderers.includes('resolveDashboardValue') &&
        widgetRenderers.includes('getDashboardSourceLabel') &&
        widgetRenderers.includes('VehicleTelemetryCompact') &&
        widgetRenderers.includes('PowerSystemCompact') &&
        widgetRenderers.includes('RouteProgressMiniMap') &&
        widgetRenderers.includes('VehicleAttitudeStage') &&
        widgetRenderers.includes('publishAttitudeTelemetryBriefAdvisory') &&
        widgetRenderers.includes("sensorStatus !== 'AWAITING'") &&
        vehicleTelemetryWidget.includes('resolveTelemetrySourceState') &&
        vehicleTelemetryWidget.includes('vt.snapshot.isLive') &&
        vehicleTelemetryWidget.includes('Connected — telemetry not yet decoded') &&
        vehicleTelemetryWidget.includes('Manual Profile') &&
        vehicleTelemetryWidget.includes('No live source') &&
        widgetRenderers.includes('Forecast unavailable.') &&
        widgetRenderers.includes('Using cached forecast.') &&
        widgetRenderers.includes('Select an active vehicle'),
      [relPath(root, paths.widgetRenderers), relPath(root, paths.vehicleTelemetryWidget)],
      ['Run source-state QA for live, cached, stale, disconnected, unavailable, no-route, no-active-vehicle, and awaiting sensor states.'],
    ),
    check(
      'dashboard_command_center_is_available_without_convoy_widget_menu',
      'Dashboard command center hosts implemented command modes, falls back safely, and no longer exposes the Convoy widget/menu surface.',
      widgetRenderers.includes('CommandCenterHost') &&
        widgetRenderers.includes('isCommandCenterModuleId(selectedCommandModule)') &&
        widgetRenderers.includes('commandCenterHostSelected') &&
        commandRegistry.includes('COMMAND_CENTER_IMPLEMENTED_MODES') &&
        commandRegistry.includes("'attitude'") &&
        commandRegistry.includes("'threeDNavigation'") &&
        commandRegistry.includes("'recoveryHazardCompass'") &&
        commandRegistry.includes("'trailDecision'") &&
        commandRegistry.includes("'campScout'") &&
        commandRegistry.includes("'expeditionReadiness'") &&
        commandRegistry.includes('resolveCommandCenterMode') &&
        commandRegistry.includes('getSelectableCommandCenterModes') &&
        commandRegistry.includes("fallbackId: 'attitude'") &&
        commandHost.includes('CommandCenterHostErrorBoundary') &&
        commandHost.includes('Command widget unavailable') &&
        commandSelector.includes('accessibilityRole="tablist"') &&
        commandSelector.includes('accessibilityRole="tab"') &&
        !commandRegistry.includes('convoyCommand') &&
        !fs.existsSync(paths.oldConvoyWidget) &&
        !fs.existsSync(paths.oldConvoyCommand) &&
        !fs.existsSync(paths.oldConvoyRive),
      [
        relPath(root, paths.widgetRenderers),
        relPath(root, paths.commandRegistry),
        relPath(root, paths.commandHost),
        relPath(root, paths.commandSelector),
      ],
      ['Capture Android command-center switching evidence for Attitude, 3D Nav, Recovery, Trail, Camp, Readiness, unavailable fallback, and Dispatch-owned Convoy.'],
    ),
    check(
      'dashboard_header_brief_and_detail_surfaces_use_shared_shells',
      'Dashboard header, embedded Command Brief, widget detail modal, and brief handoff use shared shells and top-banner messaging.',
      dashboard.includes('DashboardHeader') &&
        dashboard.includes('WidgetGrid') &&
        dashboard.includes('<CommandBriefScreen embedded />') &&
        dashboard.includes('onOpenCommandBrief') &&
        dashboard.includes('widgetData') &&
        dashboard.includes('containerWidth') &&
        dashboardHeader.includes('useEcsBriefTopBannerMessage') &&
        dashboardHeader.includes('dashboardHeaderVisibleHeight') &&
        dashboardHeader.includes('variant="dashboard"') &&
        widgetDetailModal.includes('TacticalPopupShell') &&
        widgetDetailModal.includes('WidgetDetailLeadCard') &&
        widgetDetailModal.includes('WidgetDetailStateCard') &&
        widgetDetailModal.includes('renderWidgetDetail') &&
        widgetDetailModal.includes('onCloseDetail: onClose') &&
        widgetDetailModal.includes('onOpenCommandBrief'),
      [relPath(root, paths.dashboard), relPath(root, paths.dashboardHeader), relPath(root, paths.widgetDetailModal)],
      ['Validate Android widget detail modal open/close, Command Brief handoff, top intelligence banner entry/exit, and no banner/dock overlap.'],
    ),
    check(
      'android_dashboard_widget_visual_evidence_present',
      'Android Dashboard widget visual evidence is recorded.',
      evidenceTrue(evidence, 'androidDashboardWidgetVisualQaPassed'),
      [relPath(root, paths.evidence)],
      ['Capture Android phone/tablet screenshots for default Dashboard, expanded/collapsed widgets, detail modals, top banner, bottom dock, and command-center slot.'],
    ),
    check(
      'command_center_switching_device_evidence_present',
      'Command-center switching device evidence is recorded.',
      evidenceTrue(evidence, 'commandCenterSwitchingDeviceEvidencePassed'),
      [relPath(root, paths.evidence)],
      ['Exercise all Dashboard command-center modes on Android, switch away/back, and confirm no crash or stale sound/rollover behavior.'],
    ),
    check(
      'live_stale_unavailable_source_label_evidence_present',
      'Live/stale/unavailable widget source-label evidence is recorded.',
      evidenceTrue(evidence, 'liveStaleUnavailableSourceLabelEvidencePassed'),
      [relPath(root, paths.evidence)],
      ['Record widget evidence for live, cached, stale, disconnected, unavailable, no-route, no-active-vehicle, and awaiting sensor labels.'],
    ),
    check(
      'phone_landscape_rotation_layout_evidence_present',
      'Phone portrait/landscape rotation layout evidence is recorded.',
      evidenceTrue(evidence, 'phoneLandscapeRotationLayoutEvidencePassed'),
      [relPath(root, paths.evidence)],
      ['Validate Dashboard on cramped phone portrait, phone landscape, tablet portrait, and tablet landscape with no clipped command buttons or overlapped dock/header.'],
    ),
    check(
      'production_owner_decision_accepted',
      'Production owner decision is accepted for Dashboard widgets.',
      accepted(evidence?.productionDecision),
      [relPath(root, paths.evidence)],
      ['Record product, engineering, QA, design, privacy/security, and support acceptance after Android dashboard evidence is complete.'],
    ),
  ];

  const failed = checks.filter((item) => !item.passed);
  return {
    passed: failed.length === 0,
    status: failed.length === 0 ? 'production_ready' : 'blocked',
    statusLabel: failed.length === 0 ? 'Production ready' : 'Blocked for production',
    checkedAt: new Date().toISOString(),
    system: 'dashboard_command_center_widgets',
    checks,
    blockers: failed.map((item) => item.id),
    remediation: failed.flatMap((item) => item.remediation),
    notes: [
      'This gate separates Dashboard widget implementation readiness from Android visual, source-state, rotation, and owner-decision evidence.',
      'Dashboard widgets must keep stale, cached, manual, disconnected, unavailable, and no-route states visible instead of presenting fake live data.',
      'Convoy Command belongs in Dispatch; Dashboard command center should retain Attitude, 3D Nav, Recovery, Trail, Camp, and Readiness modes only.',
    ],
  };
}

export function writeDashboardProductionReadinessResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const resultPath = path.join(root, RESULT_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return resultPath;
}

export function formatDashboardProductionReadinessResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const lines = [
    `Dashboard production readiness: ${result.statusLabel}`,
    `Result file: ${relPath(root, path.join(root, RESULT_RELATIVE_PATH))}`,
    `Checked at: ${result.checkedAt}`,
    `Production ready: ${result.passed ? 'yes' : 'no'}`,
    '',
    'Checks:',
  ];
  for (const item of result.checks) lines.push(`- ${item.label}: ${item.passed ? 'pass' : 'blocked'}`);
  if (result.blockers.length > 0) {
    lines.push('', 'Active blockers:');
    for (const blocker of result.blockers) lines.push(`- ${blocker}`);
  }
  if (result.remediation.length > 0) {
    lines.push('', 'Next actions:');
    for (const item of Array.from(new Set(result.remediation))) lines.push(`- ${item}`);
  }
  lines.push('', 'Notes:');
  for (const note of result.notes) lines.push(`- ${note}`);
  return `${lines.join('\n')}\n`;
}

async function main() {
  const jsonOnly = process.argv.includes('--json');
  const result = buildDashboardProductionReadinessResult();
  writeDashboardProductionReadinessResult(result);
  if (jsonOnly) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else process.stdout.write(formatDashboardProductionReadinessResult(result));
  return result.passed ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
