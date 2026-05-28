import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const RESULT_RELATIVE_PATH = path.join('.smoke', 'field-utilities-production-readiness-result.json');
const EVIDENCE_RELATIVE_PATH = path.join('.smoke', 'field-utilities-production-evidence.json');

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

function countMatches(source, expression) {
  return [...source.matchAll(expression)].length;
}

export function buildFieldUtilitiesProductionReadinessResult(options = {}) {
  const root = options.rootDir ?? process.cwd();
  const paths = {
    result: path.join(root, RESULT_RELATIVE_PATH),
    evidence: path.join(root, EVIDENCE_RELATIVE_PATH),
    quickActions: path.join(root, 'components', 'QuickActionsSheet.tsx'),
    commandDock: path.join(root, 'components', 'CommandDock.tsx'),
    modalShell: path.join(root, 'components', 'ECSModalShell.tsx'),
    emergencyData: path.join(root, 'components', 'emergency', 'EmergencyData.ts'),
    recoveryData: path.join(root, 'components', 'emergency', 'RecoveryProtocolData.ts'),
    recoveryDetail: path.join(root, 'components', 'emergency', 'RecoveryProtocolDetail.tsx'),
    fieldUseDetail: path.join(root, 'components', 'emergency', 'FieldUseProtocolDetail.tsx'),
    weatherPanel: path.join(root, 'components', 'weather', 'WeatherIntelPanel.tsx'),
    currentConditions: path.join(root, 'components', 'weather', 'CurrentConditionsCard.tsx'),
    forecastTimeline: path.join(root, 'components', 'weather', 'ForecastTimeline.tsx'),
    trailConditions: path.join(root, 'components', 'weather', 'TrailConditionsCard.tsx'),
    safetyAssets: path.join(root, 'assets', 'images', 'safety-protocols'),
    recoveryAssets: path.join(root, 'assets', 'images', 'protocols', 'recovery'),
  };

  const evidence = readJsonIfExists(paths.evidence);
  const quickActions = normalize(readIfExists(paths.quickActions));
  const commandDock = normalize(readIfExists(paths.commandDock));
  const modalShell = normalize(readIfExists(paths.modalShell));
  const emergencyData = normalize(readIfExists(paths.emergencyData));
  const recoveryData = normalize(readIfExists(paths.recoveryData));
  const recoveryDetail = normalize(readIfExists(paths.recoveryDetail));
  const fieldUseDetail = normalize(readIfExists(paths.fieldUseDetail));
  const weatherPanel = normalize(readIfExists(paths.weatherPanel));
  const currentConditions = normalize(readIfExists(paths.currentConditions));
  const forecastTimeline = normalize(readIfExists(paths.forecastTimeline));
  const trailConditions = normalize(readIfExists(paths.trailConditions));

  const requiredSafetyAssets = ['severe_bleeding.png', 'heat_stroke.png', 'impalement.png', 'vehicle_rollover.png'];
  const requiredRecoveryAssets = [
    'recovery_winch.png',
    'recovery_vehicle_assisted_pull.png',
    'recovery_deadman_anchor.png',
    'recovery_snatch_block_redirect.png',
    'recovery_kinetic_rope.png',
    'recovery_multi_vehicle.png',
  ];

  const checks = [
    check(
      'field_utilities_entrypoint_and_navigation_are_single_source',
      'Field Utilities opens from the Dashboard long-press path, uses one shared state model, and returns through the modal shell controls.',
      commandDock.includes('openQuickActions') &&
        commandDock.includes('<QuickActionsSheet') &&
        commandDock.includes('QUICK_ACTIONS_NAV_LOCK_MS') &&
        commandDock.includes("pointerEvents={hideForDashboardExpanded || quickActionsVisible ? 'none' : 'auto'}") &&
        quickActions.includes('type FieldUtilitiesView =') &&
        quickActions.includes('type FieldUtilitiesState = {') &&
        quickActions.includes('openFieldUtilities') &&
        quickActions.includes('closeFieldUtilities') &&
        quickActions.includes('openFieldUtilityAction') &&
        quickActions.includes('closeFieldUtilityAction') &&
        quickActions.includes('closeGuardKey={activeView}') &&
        quickActions.includes('onBack={mainPanelActive ? undefined : handleShellBack}') &&
        modalShell.includes('<Ionicons name="arrow-back"') &&
        modalShell.includes('<Ionicons name="close"'),
      [relPath(root, paths.commandDock), relPath(root, paths.quickActions), relPath(root, paths.modalShell)],
      ['Capture Android long-press open, child back, child close, main close, and no-behind-tap evidence.'],
    ),
    check(
      'field_protocols_use_local_assets_and_compact_safe_guidance',
      'Emergency and recovery protocols use local images, compact field-use detail views, explicit Do Not warnings, and completion checks.',
      emergencyData.includes('beforeYouPull: string[];') &&
        emergencyData.includes('stepCards: {') &&
        emergencyData.includes('doNot: string[];') &&
        requiredSafetyAssets.every((asset) => fs.existsSync(path.join(paths.safetyAssets, asset))) &&
        requiredSafetyAssets.every((asset) => emergencyData.includes(asset)) &&
        countMatches(recoveryData, /title: '[^']+'/g) >= 6 &&
        recoveryData.includes('beforeYouPull: string[];') &&
        recoveryData.includes('stepCards:') &&
        recoveryData.includes('doNot: string[];') &&
        recoveryData.includes("badgeImage: 'local:") &&
        !/https?:\/\//.test(recoveryData) &&
        requiredRecoveryAssets.every((asset) => fs.existsSync(path.join(paths.recoveryAssets, asset))) &&
        requiredRecoveryAssets.every((asset) => recoveryData.includes(asset)) &&
        recoveryDetail.includes('beforeItems: protocol.beforeYouPull') &&
        recoveryDetail.includes('warningItems: protocol.doNot') &&
        recoveryDetail.includes('completionItems: protocol.completionCheck') &&
        fieldUseDetail.includes('accessibilityRole="header"') &&
        fieldUseDetail.includes('bounces={false}') &&
        fieldUseDetail.includes('nestedScrollEnabled'),
      [relPath(root, paths.emergencyData), relPath(root, paths.recoveryData), relPath(root, paths.recoveryDetail), relPath(root, paths.fieldUseDetail)],
      ['Run Android phone/tablet visual QA for every emergency and recovery card/detail state before production.'],
    ),
    check(
      'field_weather_uses_shared_operational_weather_path',
      'Field Utilities Weather Intel uses the shared operational weather source instead of running a second independent fetch path.',
      quickActions.includes("import { useOperationalWeather } from '../lib/useOperationalWeather';") &&
        quickActions.includes('const fieldUtilitiesWeather = useOperationalWeather({') &&
        quickActions.includes("enabled: visible && activeView === 'intel'") &&
        quickActions.includes('weatherSnapshot={fieldUtilitiesWeather.snapshot}') &&
        quickActions.includes('onRefreshWeather={fieldUtilitiesWeather.refresh}') &&
        quickActions.includes('autoFetch={false}') &&
        weatherPanel.includes('const normalizedForecast = weatherSnapshot.normalized.forecast ?? [];') &&
        weatherPanel.includes('weatherSnapshot.raw ?? (') &&
        weatherPanel.includes('trailAssessmentActive?: boolean;') &&
        currentConditions.includes('formatSunEventTime') &&
        currentConditions.includes('conditions.wind_gust != null') &&
        forecastTimeline.includes('dailyForecast.map((day, idx) => {') &&
        forecastTimeline.includes('const gustMax = typeof day.wind_gust_max') &&
        trailConditions.includes("inactive ? 'OFFLINE' : safeUpper(overall)") &&
        trailConditions.includes('Start active guidance to evaluate route-specific trail conditions.'),
      [
        relPath(root, paths.quickActions),
        relPath(root, paths.weatherPanel),
        relPath(root, paths.currentConditions),
        relPath(root, paths.forecastTimeline),
        relPath(root, paths.trailConditions),
      ],
      ['Capture Weather Intel parity evidence against Dashboard weather with live, cached, stale, unavailable, and no-route trail states.'],
    ),
    check(
      'field_utilities_omits_duplicate_bluetooth',
      'Field Utilities omits the duplicate Bluetooth tile because the global banner opens canonical Device Connections.',
      !quickActions.includes('const openDeviceConnections = useCallback') &&
        !quickActions.includes("import { openUnifiedBluetoothCommand } from '../lib/bluetoothCommandNavigation';") &&
        !quickActions.includes('openUnifiedBluetoothCommand(router') &&
        !quickActions.includes('onPress: openDeviceConnections') &&
        !quickActions.includes("key: 'bluetooth'") &&
        !quickActions.includes("openFieldUtilityAction('bluetooth')") &&
        !quickActions.includes('setActivePanel') &&
        !quickActions.includes('OBD2ScannerModal'),
      [relPath(root, paths.quickActions)],
      ['Validate Android Field Utilities keeps six action tiles and Bluetooth remains available from the top global banner.'],
    ),
    check(
      'field_utilities_copy_avoids_external_dispatch_or_fake_live_claims',
      'Field Utilities copy keeps local guidance, explicit warnings, and offline/degraded language without implying emergency-service contact or fake live data.',
      quickActions.includes("renderPanelIntro('Emergency Comms'") &&
        quickActions.includes("renderPanelIntro('Weather'") &&
        quickActions.includes("renderPanelIntro('Team Ping'") &&
        emergencyData.includes('evacuateIf:') &&
        emergencyData.includes('doNot:') &&
        recoveryData.includes('Do not stand near a loaded line.') &&
        fieldUseDetail.includes("const warningLabel = protocol.warningLabel ?? 'DO NOT';") &&
        trailConditions.includes('TRAIL ASSESSMENT OFFLINE') &&
        !quickActions.toLowerCase().includes('911 contacted') &&
        !quickActions.toLowerCase().includes('emergency services contacted') &&
        !quickActions.toLowerCase().includes('live data confirmed'),
      [relPath(root, paths.quickActions), relPath(root, paths.emergencyData), relPath(root, paths.recoveryData), relPath(root, paths.fieldUseDetail)],
      ['Run copy QA to confirm Field Utilities does not imply automatic external dispatch, publishing, or live certainty.'],
    ),
    check(
      'android_field_utilities_visual_evidence_present',
      'Android Field Utilities visual evidence is recorded.',
      evidenceTrue(evidence, 'androidFieldUtilitiesVisualQaPassed'),
      [relPath(root, paths.evidence)],
      ['Capture Android phone and tablet screenshots for main menu, protocol grids, protocol detail, weather, quick note, comms, team ping, and Bluetooth route.'],
    ),
    check(
      'emergency_and_recovery_protocol_device_evidence_present',
      'Emergency and recovery protocol device-flow evidence is recorded.',
      evidenceTrue(evidence, 'emergencyRecoveryProtocolDeviceEvidencePassed'),
      [relPath(root, paths.evidence)],
      ['Exercise every emergency and recovery card/detail on Android, including small-screen scrolling and touch targets.'],
    ),
    check(
      'weather_parity_device_evidence_present',
      'Field Utilities Weather Intel parity device evidence is recorded.',
      evidenceTrue(evidence, 'weatherParityDeviceEvidencePassed'),
      [relPath(root, paths.evidence)],
      ['Compare Field Utilities Weather Intel with Dashboard weather detail on device for live, cached, stale, unavailable, and route-inactive states.'],
    ),
    check(
      'offline_degraded_field_utilities_evidence_present',
      'Offline/degraded Field Utilities evidence is recorded.',
      evidenceTrue(evidence, 'offlineDegradedFieldUtilitiesEvidencePassed'),
      [relPath(root, paths.evidence)],
      ['Validate Field Utilities with no network, denied/poor GPS, cached weather, and no active route.'],
    ),
    check(
      'production_owner_decision_accepted',
      'Production owner decision is accepted for Field Utilities.',
      accepted(evidence?.productionDecision),
      [relPath(root, paths.evidence)],
      ['Record product, engineering, safety/field-ops, QA, privacy/security, and support acceptance after Android/degraded evidence is complete.'],
    ),
  ];

  const failed = checks.filter((item) => !item.passed);
  return {
    passed: failed.length === 0,
    status: failed.length === 0 ? 'production_ready' : 'blocked',
    statusLabel: failed.length === 0 ? 'Production ready' : 'Blocked for production',
    checkedAt: new Date().toISOString(),
    system: 'field_utilities_protocols_weather_tools',
    checks,
    blockers: failed.map((item) => item.id),
    remediation: failed.flatMap((item) => item.remediation),
    notes: [
      'This gate separates Field Utilities implementation readiness from Android visual and degraded-mode evidence.',
      'Field Utilities must remain local, explicit, and conservative: no fake live claims, no automatic external dispatch claims, and no duplicate Bluetooth scanner UI.',
      'Weather Intel must use the same normalized operational weather path as Dashboard weather.',
    ],
  };
}

export function writeFieldUtilitiesProductionReadinessResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const resultPath = path.join(root, RESULT_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return resultPath;
}

export function formatFieldUtilitiesProductionReadinessResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const lines = [
    `Field Utilities production readiness: ${result.statusLabel}`,
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
  const result = buildFieldUtilitiesProductionReadinessResult();
  writeFieldUtilitiesProductionReadinessResult(result);
  if (jsonOnly) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else process.stdout.write(formatFieldUtilitiesProductionReadinessResult(result));
  return result.passed ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
