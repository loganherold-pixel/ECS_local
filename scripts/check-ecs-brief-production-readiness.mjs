import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const RESULT_RELATIVE_PATH = path.join('.smoke', 'ecs-brief-production-readiness-result.json');
const EVIDENCE_RELATIVE_PATH = path.join('.smoke', 'ecs-brief-production-evidence.json');

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

function evidenceTrue(evidence, key) {
  return evidence?.[key] === true;
}

function accepted(value) {
  return String(value ?? '').trim().toLowerCase() === 'accepted';
}

export function buildEcsBriefProductionReadinessResult(options = {}) {
  const root = options.rootDir ?? process.cwd();
  const paths = {
    result: path.join(root, RESULT_RELATIVE_PATH),
    evidence: path.join(root, EVIDENCE_RELATIVE_PATH),
    briefStore: path.join(root, 'lib', 'briefCadLogStore.ts'),
    updateDedupe: path.join(root, 'lib', 'ecsUpdateDedupe.ts'),
    topBannerHook: path.join(root, 'lib', 'useEcsBriefTopBannerMessage.ts'),
    dashboardHeader: path.join(root, 'components', 'dashboard', 'DashboardHeader.tsx'),
    shellHeader: path.join(root, 'components', 'Header.tsx'),
    telemetryPublisher: path.join(root, 'lib', 'telemetryBriefPublisher.ts'),
    remoteWeatherPublisher: path.join(root, 'lib', 'remote', 'remoteWeatherBriefPublisher.ts'),
    missionBriefEngine: path.join(root, 'lib', 'missionBriefEngine.ts'),
    missionBriefCard: path.join(root, 'components', 'dashboard', 'MissionBriefCard.tsx'),
    commandBrief: path.join(root, 'components', 'brief', 'CommandBriefScreen.tsx'),
    dashboard: path.join(root, 'app', '(tabs)', 'dashboard.tsx'),
    vehicleTelemetryWidget: path.join(root, 'components', 'dashboard', 'VehicleTelemetryWidget.tsx'),
    widgetRenderers: path.join(root, 'components', 'dashboard', 'WidgetRenderers.tsx'),
  };

  const evidence = readJsonIfExists(paths.evidence);
  const briefStore = readIfExists(paths.briefStore);
  const updateDedupe = readIfExists(paths.updateDedupe);
  const topBannerHook = readIfExists(paths.topBannerHook);
  const dashboardHeader = readIfExists(paths.dashboardHeader);
  const shellHeader = readIfExists(paths.shellHeader);
  const telemetryPublisher = readIfExists(paths.telemetryPublisher);
  const remoteWeatherPublisher = readIfExists(paths.remoteWeatherPublisher);
  const missionBriefEngine = readIfExists(paths.missionBriefEngine);
  const missionBriefCard = readIfExists(paths.missionBriefCard);
  const commandBrief = readIfExists(paths.commandBrief);
  const dashboard = readIfExists(paths.dashboard);
  const vehicleTelemetryWidget = readIfExists(paths.vehicleTelemetryWidget);
  const widgetRenderers = readIfExists(paths.widgetRenderers);

  const checks = [
    check(
      'central_dedupe_and_top_banner_pipeline_present',
      'ECS Brief advisories use central duplicate suppression and the shared top intelligence banner.',
      briefStore.includes('AI_GUIDANCE_DUPLICATE_SUPPRESSION_MINUTES = 15') &&
        briefStore.includes('AI_GUIDANCE_HISTORY_LIMIT') &&
        briefStore.includes('ECS_BRIEF_TOP_BANNER_DEFAULT_MS = 16_000') &&
        briefStore.includes('ECS_BRIEF_TOP_BANNER_RESOLVED_MS = 10_000') &&
        briefStore.includes("eyebrow: 'ECS INTELLIGENCE'") &&
        briefStore.includes('isResolvedBriefCadMessage') &&
        briefStore.includes('if (resolved) return true;') &&
        briefStore.includes('shouldSuppressECSUpdateInRegistry') &&
        updateDedupe.includes('ECS_ALERT_DEDUPE_WINDOW_MS = 15 * 60 * 1000') &&
        updateDedupe.includes('createECSUpdateSemanticFingerprint') &&
        updateDedupe.includes('shouldSuppressECSUpdateInRegistry') &&
        topBannerHook.includes('useEcsBriefTopBannerMessage') &&
        topBannerHook.includes('getCurrentBriefCadTopBannerMessage') &&
        topBannerHook.includes('setInterval(refresh, tickMs)') &&
        dashboardHeader.includes('useEcsBriefTopBannerMessage') &&
        shellHeader.includes('useEcsBriefTopBannerMessage'),
      [
        relPath(root, paths.briefStore),
        relPath(root, paths.updateDedupe),
        relPath(root, paths.topBannerHook),
        relPath(root, paths.dashboardHeader),
        relPath(root, paths.shellHeader),
      ],
      ['Keep live/system advisories flowing through the shared ECS intelligence banner with 15-minute duplicate suppression.'],
    ),
    check(
      'telemetry_briefs_are_source_labeled_and_truthful',
      'Telemetry brief advisories label source/freshness and do not create live safety warnings from simulated or unverified data.',
      telemetryPublisher.includes('TELEMETRY_BRIEF_SUPPRESSION_MS = 15 * 60 * 1000') &&
        telemetryPublisher.includes('sourceLine') &&
        telemetryPublisher.includes("case 'unverified'") &&
        telemetryPublisher.includes("case 'simulated'") &&
        telemetryPublisher.includes("snapshot.sourceType === 'simulated'") &&
        telemetryPublisher.includes("snapshot.confidence === 'unverified'") &&
        telemetryPublisher.includes("source: 'ecs-telemetry'") &&
        vehicleTelemetryWidget.includes('publishTelemetryBriefAdvisories') &&
        vehicleTelemetryWidget.includes('useVehicleTelemetryBriefPublisher') &&
        widgetRenderers.includes('publishAttitudeTelemetryBriefAdvisory') &&
        widgetRenderers.includes("sensorStatus !== 'AWAITING'"),
      [
        relPath(root, paths.telemetryPublisher),
        relPath(root, paths.vehicleTelemetryWidget),
        relPath(root, paths.widgetRenderers),
      ],
      ['Keep simulated, unavailable, stale, and unverified telemetry from being presented as current live safety data.'],
    ),
    check(
      'remote_weather_and_route_hazards_are_deduped',
      'Remote weather and route hazard events dedupe repeated guidance and only re-emit on escalation or meaningful changes.',
      remoteWeatherPublisher.includes('REMOTE_WEATHER_BRIEF_DEDUPE_WINDOW_MS = 15 * 60 * 1000') &&
        remoteWeatherPublisher.includes('recordRemoteWeatherBriefEvent') &&
        remoteWeatherPublisher.includes('severity_escalation') &&
        remoteWeatherPublisher.includes('meaningful_change') &&
        !remoteWeatherPublisher.includes('fetch(') &&
        !remoteWeatherPublisher.includes('useState') &&
        !remoteWeatherPublisher.includes('react'),
      [relPath(root, paths.remoteWeatherPublisher)],
      ['Keep remote/weather brief publishing pure, source-driven, and free of direct network/UI dependencies.'],
    ),
    check(
      'command_brief_surface_is_readiness_grounded',
      'Command Brief surfaces readiness, source state, collapsed intelligence detail, and avoids obsolete activity log or overconfident safety copy.',
      commandBrief.includes('Command Brief') &&
        commandBrief.includes('ECS Expedition Readiness') &&
        commandBrief.includes('Go / Caution / Hold Decision') &&
        commandBrief.includes('Route Intelligence') &&
        commandBrief.includes('Offline Preparedness') &&
        commandBrief.includes('Communications / Signal Confidence') &&
        commandBrief.includes('CollapsibleBriefSection') &&
        commandBrief.includes('accessibilityState={{ expanded }}') &&
        !commandBrief.includes('Expedition Readiness Summary') &&
        !commandBrief.includes('Recommended Actions') &&
        !commandBrief.includes('Watch Items') &&
        commandBrief.includes('useCurrentExpeditionReadiness') &&
        commandBrief.includes('useReadinessDecision') &&
        commandBrief.includes('Copy packet') &&
        commandBrief.includes('Share packet') &&
        commandBrief.includes('Save locally') &&
        !commandBrief.includes('MissionBriefCadLog') &&
        !commandBrief.includes('AI says') &&
        !commandBrief.toLowerCase().includes('legal campsite') &&
        !commandBrief.toLowerCase().includes('safe as') &&
        dashboard.includes('<CommandBriefScreen embedded />'),
      [relPath(root, paths.commandBrief), relPath(root, paths.dashboard)],
      ['Keep Command Brief grounded in deterministic readiness selectors and avoid guaranteed legal/safe language.'],
    ),
    check(
      'brief_activity_uses_source_state_wording',
      'Mission Brief activity lines use source-driven weather, route guidance, and expedition phase wording.',
      missionBriefEngine.includes('weatherMeta: buildWeatherMeta(ctx)') &&
        missionBriefEngine.includes('routeGuidanceMeta: buildRouteGuidanceMeta(ctx)') &&
        missionBriefEngine.includes("label = 'Weather updated recently'") &&
        missionBriefEngine.includes("label = 'Weather data is stale'") &&
        missionBriefEngine.includes("label = 'Weather provider unavailable'") &&
        missionBriefCard.includes('function sourceDrivenActivityLine') &&
        missionBriefCard.includes('weatherActivityLine(brief?.weatherMeta)') &&
        missionBriefCard.includes('routeGuidanceActivityLine(brief?.routeGuidanceMeta)') &&
        missionBriefCard.includes('Staging/pre-departure active'),
      [relPath(root, paths.missionBriefEngine), relPath(root, paths.missionBriefCard)],
      ['Keep brief wording tied to actual source/freshness/phase state rather than generic AI or stale fallback copy.'],
    ),
    check(
      'android_top_banner_visual_evidence_present',
      'Android top intelligence banner visual evidence is recorded.',
      evidenceTrue(evidence, 'androidTopBannerVisualQaPassed'),
      [relPath(root, paths.evidence)],
      ['Capture Android screenshots showing advisory entry/exit, resolved-state exit, no overlap, and readable compact-screen banner copy.'],
    ),
    check(
      'real_live_producer_dedupe_evidence_present',
      'Real live advisory producer dedupe evidence is recorded.',
      evidenceTrue(evidence, 'realLiveProducerDedupePassed'),
      [relPath(root, paths.evidence)],
      ['Exercise weather, telemetry, route, remote/weather, and operator-generated producers and record duplicate suppression/escalation behavior.'],
    ),
    check(
      'offline_stale_and_unavailable_brief_evidence_present',
      'Offline, stale, unavailable, simulated, and unverified advisory labeling evidence is recorded.',
      evidenceTrue(evidence, 'offlineStaleUnavailableBriefPassed'),
      [relPath(root, paths.evidence)],
      ['Verify no producer presents cached, simulated, unavailable, or unverified data as live current safety data.'],
    ),
    check(
      'brief_export_share_redaction_evidence_present',
      'Command Brief copy/share/save redaction and export evidence is recorded.',
      evidenceTrue(evidence, 'briefExportShareRedactionPassed'),
      [relPath(root, paths.evidence)],
      ['Verify exported/shared brief packets omit raw secrets, private tokens, and unsupported safety/legal guarantees.'],
    ),
    check(
      'production_owner_decision_accepted',
      'Production owner decision is accepted for ECS Brief/advisory pipeline.',
      accepted(evidence?.productionDecision),
      [relPath(root, paths.evidence)],
      ['Record product, engineering, field-ops, privacy/security, QA, and support acceptance after real producer/device evidence is complete.'],
    ),
  ];

  const failed = checks.filter((item) => !item.passed);
  return {
    passed: failed.length === 0,
    status: failed.length === 0 ? 'production_ready' : 'blocked',
    statusLabel: failed.length === 0 ? 'Production ready' : 'Blocked for production',
    checkedAt: new Date().toISOString(),
    system: 'ecs_brief_advisory_pipeline',
    checks,
    blockers: failed.map((item) => item.id),
    remediation: failed.flatMap((item) => item.remediation),
    notes: [
      'This gate separates ECS Brief/advisory code readiness from Android visual and real producer evidence.',
      'Live advisory producers must suppress repeated guidance within the configured duplicate window unless severity or content meaningfully changes.',
      'Stale, simulated, unavailable, cached, and unverified data must remain visibly labeled and must not be presented as live safety data.',
    ],
  };
}

export function writeEcsBriefProductionReadinessResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const resultPath = path.join(root, RESULT_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return resultPath;
}

export function formatEcsBriefProductionReadinessResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const lines = [
    `ECS Brief production readiness: ${result.statusLabel}`,
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
  const result = buildEcsBriefProductionReadinessResult();
  writeEcsBriefProductionReadinessResult(result);
  if (jsonOnly) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else process.stdout.write(formatEcsBriefProductionReadinessResult(result));
  return result.passed ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
