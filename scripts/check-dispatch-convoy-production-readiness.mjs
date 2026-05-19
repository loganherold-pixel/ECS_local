import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const RESULT_RELATIVE_PATH = path.join('.smoke', 'dispatch-convoy-production-readiness-result.json');
const INTERNAL_BETA_RESULT_RELATIVE_PATH = path.join('.smoke', 'dispatch-internal-beta-readiness-result.json');
const EVIDENCE_RELATIVE_PATH = path.join('.smoke', 'dispatch-convoy-production-evidence.json');
const READINESS_DOC_RELATIVE_PATH = path.join('docs', 'release', 'dispatch-convoy-production-readiness.md');

const SENSITIVE_DEFAULT_OFF_FEATURES = [
  'teamPositionSharing',
  'agencyDataIngestion',
  'externalDispatchIntegration',
  'publicHazardPublishing',
  'automatedSosTransmission',
  'liveRadioNetworkIntegrations',
  'demoData',
];

function rootDir() {
  return process.cwd();
}

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

function check(id, label, passed, evidence = [], remediation = []) {
  return {
    id,
    label,
    passed: Boolean(passed),
    evidence,
    remediation,
  };
}

function requireEvidenceValue(evidence, key, expectedValue = true) {
  return evidence && evidence[key] === expectedValue;
}

function hasAcceptedLine(text, label) {
  return new RegExp(`^${label}:\\s*accepted\\s*$`, 'im').test(text);
}

export function buildDispatchConvoyProductionReadinessResult(options = {}) {
  const root = options.rootDir ?? rootDir();
  const paths = {
    result: path.join(root, RESULT_RELATIVE_PATH),
    internalBetaResult: path.join(root, INTERNAL_BETA_RESULT_RELATIVE_PATH),
    evidence: path.join(root, EVIDENCE_RELATIVE_PATH),
    readinessDoc: path.join(root, READINESS_DOC_RELATIVE_PATH),
    dispatchPanel: path.join(root, 'components', 'dispatch', 'DispatchConvoyCommandPanel.tsx'),
    dispatchCommandCenter: path.join(root, 'components', 'dispatch', 'DispatchCadCommandCenter.tsx'),
    rolloutConfig: path.join(root, 'lib', 'dispatchRolloutConfig.ts'),
    commandRegistry: path.join(root, 'components', 'dashboard', 'commandCenter', 'commandCenterRegistry.ts'),
    commandStore: path.join(root, 'lib', 'ecsCommandModuleStore.ts'),
    nativeRiveWrapper: path.join(root, 'components', 'rive', 'ECSConvoyCommandPanelRive.native.tsx'),
    webRiveWrapper: path.join(root, 'components', 'rive', 'ECSConvoyCommandPanelRive.tsx'),
    assetRive: path.join(root, 'assets', 'rive', 'ConvoyCommand_Panel.riv'),
    publicRive: path.join(root, 'public', 'rive', 'ConvoyCommand_Panel.riv'),
    oldDashboardWidget: path.join(root, 'components', 'dashboard', 'command-center', 'widgets', 'ConvoyCommandWidget.tsx'),
    oldDashboardCommand: path.join(root, 'components', 'dashboard', 'commandCenter', 'ConvoyCommand.tsx'),
    oldRiveWrapper: path.join(root, 'components', 'rive', 'ECSConvoyCommandRive.tsx'),
    oldRiveAsset: path.join(root, 'assets', 'rive', 'ConvoyCommand.riv'),
  };

  const internalBetaResult = readJsonIfExists(paths.internalBetaResult);
  const evidence = readJsonIfExists(paths.evidence);
  const readinessDoc = readIfExists(paths.readinessDoc);
  const dispatchPanelSource = readIfExists(paths.dispatchPanel);
  const dispatchCommandSource = readIfExists(paths.dispatchCommandCenter);
  const rolloutSource = readIfExists(paths.rolloutConfig);
  const registrySource = readIfExists(paths.commandRegistry);
  const storeSource = readIfExists(paths.commandStore);
  const nativeRiveSource = readIfExists(paths.nativeRiveWrapper);
  const webRiveSource = readIfExists(paths.webRiveWrapper);
  const assetStat = fs.existsSync(paths.assetRive) ? fs.statSync(paths.assetRive) : null;
  const publicStat = fs.existsSync(paths.publicRive) ? fs.statSync(paths.publicRive) : null;

  const checks = [
    check(
      'dispatch_internal_beta_gate_green',
      'Dispatch internal beta gate is green before production review.',
      internalBetaResult?.passed === true && internalBetaResult?.internalBetaReady === true,
      [relPath(root, paths.internalBetaResult)],
      ['Run npm run gate:dispatch-internal-beta and clear all blockers before production review.'],
    ),
    check(
      'convoy_panel_rive_assets_present',
      'Convoy Command panel Rive assets are present for native and web bundles.',
      Boolean(assetStat?.size && publicStat?.size && assetStat.size === publicStat.size),
      [relPath(root, paths.assetRive), relPath(root, paths.publicRive)],
      ['Copy the provided ConvoyCommand_Panel.riv into assets/rive and public/rive.'],
    ),
    check(
      'convoy_panel_runtime_wrappers_present',
      'Native and web Rive wrappers render the full Dispatch panel asset without stretching.',
      /ConvoyCommand_Panel\.riv/.test(nativeRiveSource) &&
        /Fit\.Contain/.test(nativeRiveSource) &&
        /dashboard_no_exterior_border/.test(nativeRiveSource) &&
        /ConvoyCommand_Panel\.riv/.test(webRiveSource) &&
        /Fit\.Contain/.test(webRiveSource),
      [relPath(root, paths.nativeRiveWrapper), relPath(root, paths.webRiveWrapper)],
      ['Keep Dispatch Convoy Command on the panel Rive asset with contain-fit rendering.'],
    ),
    check(
      'dashboard_convoy_widget_removed',
      'Convoy Command is removed from the Dashboard widget/menu system.',
      !fs.existsSync(paths.oldDashboardWidget) &&
        !fs.existsSync(paths.oldDashboardCommand) &&
        !fs.existsSync(paths.oldRiveWrapper) &&
        !fs.existsSync(paths.oldRiveAsset) &&
        !/ConvoyCommandWidget|id:\s*'convoyCommand'|label:\s*'Convoy Command'/.test(registrySource) &&
        /convoyCommand.*convoy-command/.test(storeSource),
      [
        relPath(root, paths.commandRegistry),
        relPath(root, paths.commandStore),
        relPath(root, paths.oldDashboardWidget),
        relPath(root, paths.oldDashboardCommand),
      ],
      ['Remove old Dashboard Convoy Command UI and normalize legacy stored selections away from the removed mode.'],
    ),
    check(
      'emergency_ping_truthful_and_local',
      'Emergency coordinate ping remains local/internal and does not claim SOS or agency dispatch.',
      /onEmergencyPing=\{handleRecoveryAssist\}/.test(dispatchCommandSource) &&
        /It does not contact emergency services\./.test(dispatchPanelSource) &&
        /Local ECS Dispatch report only/.test(dispatchCommandSource) &&
        /does not contact emergency services/.test(dispatchCommandSource),
      [relPath(root, paths.dispatchPanel), relPath(root, paths.dispatchCommandCenter)],
      ['Keep emergency coordinate ping copy explicit: ECS does not contact emergency services.'],
    ),
    check(
      'sensitive_dispatch_integrations_default_off',
      'Sensitive Dispatch integrations remain disabled by default until approved.',
      SENSITIVE_DEFAULT_OFF_FEATURES.every((feature) =>
        new RegExp(`${feature}:\\s*false`).test(rolloutSource),
      ),
      [relPath(root, paths.rolloutConfig)],
      ['Keep position sharing, public publishing, agency ingestion, SOS transmission, demo data, and live radio integrations default-off until approved.'],
    ),
    check(
      'android_dispatch_convoy_visual_evidence_present',
      'Android device visual QA evidence exists for the Dispatch Convoy panel.',
      requireEvidenceValue(evidence, 'androidDispatchConvoyVisualQaPassed'),
      [relPath(root, paths.evidence)],
      ['Capture phone/tablet Android screenshots for Dispatch Convoy panel, portrait/landscape, no banner/dock overlap, Rive visible, emergency button visible.'],
    ),
    check(
      'emergency_coordinate_ping_e2e_evidence_present',
      'Emergency coordinate ping E2E evidence covers GPS allowed and denied paths.',
      requireEvidenceValue(evidence, 'emergencyCoordinatePingE2ePassed'),
      [relPath(root, paths.evidence)],
      ['Exercise emergency coordinate ping on device with GPS permission allowed and denied; confirm local event and map-open action.'],
    ),
    check(
      'position_sharing_privacy_approval_recorded',
      'Convoy position sharing privacy/product approval is recorded before any live sharing rollout.',
      hasAcceptedLine(readinessDoc, 'Position sharing approval'),
      [relPath(root, paths.readinessDoc)],
      ['Record explicit product/privacy approval before enabling live team position sharing beyond local/internal beta.'],
    ),
    check(
      'production_decision_recorded',
      'Production decision is explicitly accepted by product, safety, privacy, and engineering owners.',
      hasAcceptedLine(readinessDoc, 'Production decision'),
      [relPath(root, paths.readinessDoc)],
      ['Record owner acceptance after evidence is complete.'],
    ),
  ];

  const failed = checks.filter((item) => !item.passed);
  const result = {
    passed: failed.length === 0,
    status: failed.length === 0 ? 'production_ready' : 'blocked',
    statusLabel: failed.length === 0 ? 'Production ready' : 'Blocked for production',
    checkedAt: new Date().toISOString(),
    system: 'dispatch_convoy_command',
    checks,
    blockers: failed.map((item) => item.id),
    remediation: failed.flatMap((item) => item.remediation),
    notes: [
      'This gate evaluates the first production-readiness system lane: Dispatch/Convoy Command.',
      'A blocked result is expected until any remaining Android evidence gaps and owner approvals are recorded.',
      'Do not enable live position sharing, public publishing, agency ingestion, or SOS transmission from this gate alone.',
    ],
  };
  return result;
}

export function writeDispatchConvoyProductionReadinessResult(result, options = {}) {
  const root = options.rootDir ?? rootDir();
  const resultPath = path.join(root, RESULT_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return resultPath;
}

export function formatDispatchConvoyProductionReadinessResult(result, options = {}) {
  const root = options.rootDir ?? rootDir();
  const lines = [
    `Dispatch/Convoy production readiness: ${result.statusLabel}`,
    `Result file: ${relPath(root, path.join(root, RESULT_RELATIVE_PATH))}`,
    `Checked at: ${result.checkedAt}`,
    `Production ready: ${result.passed ? 'yes' : 'no'}`,
    '',
    'Checks:',
  ];
  for (const item of result.checks) {
    lines.push(`- ${item.label}: ${item.passed ? 'pass' : 'blocked'}`);
  }
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
  const result = buildDispatchConvoyProductionReadinessResult();
  writeDispatchConvoyProductionReadinessResult(result);
  if (jsonOnly) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(formatDispatchConvoyProductionReadinessResult(result));
  }
  return result.passed ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
