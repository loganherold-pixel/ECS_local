import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const RESULT_RELATIVE_PATH = path.join('.smoke', 'garmin-inreach-production-readiness-result.json');
const EVIDENCE_RELATIVE_PATH = path.join('.smoke', 'garmin-inreach-production-evidence.json');

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

export function buildGarminInreachProductionReadinessResult(options = {}) {
  const root = options.rootDir ?? process.cwd();
  const paths = {
    result: path.join(root, RESULT_RELATIVE_PATH),
    evidence: path.join(root, EVIDENCE_RELATIVE_PATH),
    config: path.join(root, 'lib', 'garmin', 'garminInreachConfig.ts'),
    outboundWebhook: path.join(root, 'lib', 'garmin', 'garminInreachOutboundWebhook.ts'),
    mapShare: path.join(root, 'lib', 'garmin', 'garminInreachMapShareKmlAdapter.ts'),
    visibilityPanel: path.join(root, 'components', 'garmin', 'GarminInreachVisibilityPanel.tsx'),
    expeditionTab: path.join(root, 'components', 'dashboard', 'ExpeditionTab.tsx'),
    expeditionIntelligence: path.join(root, 'lib', 'garmin', 'garminInreachExpeditionIntelligence.ts'),
    expeditionPromptRegistry: path.join(root, 'lib', 'ai', 'expeditionPromptRegistry.ts'),
    edgeFunction: path.join(root, 'supabase', 'functions', 'integrations-garmin-inreach-outbound', 'index.ts'),
  };

  const evidence = readJsonIfExists(paths.evidence);
  const config = readIfExists(paths.config);
  const outboundWebhook = readIfExists(paths.outboundWebhook);
  const mapShare = readIfExists(paths.mapShare);
  const visibilityPanel = readIfExists(paths.visibilityPanel);
  const expeditionTab = readIfExists(paths.expeditionTab);
  const expeditionIntelligence = readIfExists(paths.expeditionIntelligence);
  const expeditionPromptRegistry = readIfExists(paths.expeditionPromptRegistry);
  const edgeFunction = readIfExists(paths.edgeFunction);

  const checks = [
    check(
      'default_off_and_secrets_safe',
      'Garmin/inReach integration defaults off, requires operator confirmation, and exposes only safe secret presence flags.',
      config.includes('DEFAULT_GARMIN_INREACH_FEATURE_FLAGS') &&
        config.includes('garminInreachEnabled: false') &&
        config.includes("mode: 'off'") &&
        config.includes('requireExplicitOperatorConfirmation: true') &&
        config.includes('commandsRequireConfirmation: true') &&
        config.includes('allowSosConfirmCancelAutomation: false') &&
        config.includes('createGarminInreachSafeConfigSnapshot') &&
        config.includes('hasWebhookStaticToken') &&
        config.includes('hasIpcApiKey') &&
        config.includes('GARMIN_INREACH_ENV_KEYS'),
      [relPath(root, paths.config)],
      ['Keep Garmin/inReach disabled by default, secrets server-side, and every outbound command behind explicit operator confirmation.'],
    ),
    check(
      'webhook_requires_token_and_dedupes',
      'Garmin IPC webhook requires static token authentication, dedupes retries, and logs only safe masked identifiers.',
      outboundWebhook.includes('authenticateStaticToken') &&
        outboundWebhook.includes("'x-garmin-inreach-token'") &&
        outboundWebhook.includes("'x-ecs-garmin-token'") &&
        outboundWebhook.includes('parseBearerToken') &&
        outboundWebhook.includes('idempotencyKey') &&
        outboundWebhook.includes('duplicateCount') &&
        outboundWebhook.includes('store.has(normalizedEvent.idempotencyKey)') &&
        outboundWebhook.includes('createSafeGarminIpcLogPayload') &&
        outboundWebhook.includes('maskGarminDeviceIdentifier') &&
        edgeFunction.includes('Deno.env.get(GARMIN_INREACH_ENV_KEYS.webhookStaticToken)') &&
        edgeFunction.includes('resolveGarminInreachConfigFromEnv(env())'),
      [relPath(root, paths.outboundWebhook), relPath(root, paths.edgeFunction)],
      ['Keep IPC webhook authentication token-gated, idempotent, and free of raw IMEI/API key logging.'],
    ),
    check(
      'mapshare_readonly_stale_and_safe',
      'MapShare KML ingestion is read-only, stale-aware, URL-restricted, deduped, and demo-only when explicitly enabled.',
      mapShare.includes('GARMIN_MAPSHARE_SOURCE') &&
        mapShare.includes('supportsGarminMapShareKmlIngestion') &&
        mapShare.includes('GARMIN_MAPSHARE_DEMO_URL') &&
        mapShare.includes('demoKmlEnabled') &&
        mapShare.includes('isAllowedFeedUrl') &&
        mapShare.includes('explore\\.garmin\\.com\\/Account|login|signin') &&
        mapShare.includes('STALE_WARNING') &&
        mapShare.includes('duplicateCount') &&
        mapShare.includes("status: 'invalid_url'") &&
        mapShare.includes("status: 'fetch_failed'") &&
        mapShare.includes("status: 'disabled'") &&
        mapShare.includes("sourceSchemaVersion: 'kml'"),
      [relPath(root, paths.mapShare)],
      ['Keep MapShare as read-only location/message evidence, never as a command channel.'],
    ),
    check(
      'mapshare_missing_timestamp_is_not_fresh',
      'MapShare placemarks without a source timestamp are treated as stale/data-quality-limited, not fresh current locations.',
      mapShare.includes("recordWarnings.push('missing_timestamp')") &&
        mapShare.includes('if (!sourceTimestamp) return true') &&
        mapShare.includes('Number.isFinite(polledMs)') &&
        mapShare.includes('Number.isFinite(sourceMs)') &&
        mapShare.includes('dataQualityWarnings') &&
        mapShare.includes('STALE_WARNING'),
      [relPath(root, paths.mapShare)],
      ['Treat missing or invalid MapShare timestamps as stale/currentness-limited evidence so satellite positions are not overclaimed as fresh.'],
    ),
    check(
      'ui_visibility_operator_confirmation_and_sos_review',
      'Garmin UI is hidden when disabled, separates read-only and command states, labels demo data, and exposes SOS review.',
      visibilityPanel.includes('if (!model) return null') &&
        visibilityPanel.includes('testID="garmin-readonly-state"') &&
        visibilityPanel.includes('testID="garmin-command-controls"') &&
        visibilityPanel.includes('testID="garmin-command-confirm"') &&
        visibilityPanel.includes('testID="garmin-sos-review-banner"') &&
        visibilityPanel.includes('DEMO / SYNTHETIC') &&
        visibilityPanel.includes('May take up to 20 minutes. Charges may apply.') &&
        expeditionTab.includes('GarminInreachVisibilityPanel'),
      [relPath(root, paths.visibilityPanel), relPath(root, paths.expeditionTab)],
      ['Keep disabled/read-only/command/SOS-review states visibly distinct and require confirmation before any outbound command.'],
    ),
    check(
      'expedition_intelligence_never_auto_commands',
      'Expedition intelligence may explain Garmin/inReach context but cannot automatically draft, send, confirm, or cancel commands.',
      expeditionIntelligence.includes('automaticGarminCommandAllowed: false') &&
        expeditionIntelligence.includes('executesGarminCommand: false') &&
        expeditionIntelligence.includes('requiresOperatorConfirmationForGarminCommand: true') &&
        expeditionIntelligence.includes('Open Incident & Recovery') &&
        expeditionIntelligence.includes('will not close an incident automatically') &&
        expeditionPromptRegistry.includes('Garmin/inReach context') &&
        expeditionPromptRegistry.includes('Never send, queue, draft for automatic sending'),
      [relPath(root, paths.expeditionIntelligence), relPath(root, paths.expeditionPromptRegistry)],
      ['Do not allow AI or deterministic intelligence to execute Garmin commands or close SOS/incident state automatically.'],
    ),
    check(
      'real_mapshare_feed_device_evidence_present',
      'Real Garmin MapShare feed and device visibility evidence is recorded.',
      evidenceTrue(evidence, 'realMapShareFeedDeviceEvidencePassed'),
      [relPath(root, paths.evidence)],
      ['Exercise a real or approved staging MapShare feed/device and record feed freshness, stale handling, location/message rendering, and disabled/demo labeling.'],
    ),
    check(
      'ipc_webhook_staging_evidence_present',
      'Garmin IPC webhook staging evidence is recorded.',
      evidenceTrue(evidence, 'ipcWebhookStagingEvidencePassed'),
      [relPath(root, paths.evidence)],
      ['Send authenticated staging IPC payloads, unauthenticated requests, malformed requests, duplicate retries, and SOS signals through the Edge Function.'],
    ),
    check(
      'operator_confirmed_command_evidence_present',
      'Operator-confirmed Garmin command workflow evidence is recorded.',
      evidenceTrue(evidence, 'operatorConfirmedCommandEvidencePassed'),
      [relPath(root, paths.evidence)],
      ['Validate that outbound message/locate/check-in workflows require an explicit operator confirmation and show charge/delay copy before queueing.'],
    ),
    check(
      'sos_review_only_field_evidence_present',
      'SOS review-only field behavior evidence is recorded.',
      evidenceTrue(evidence, 'sosReviewOnlyFieldEvidencePassed'),
      [relPath(root, paths.evidence)],
      ['Verify SOS declared/confirmed/cancel signals create review/escalation context without automatic confirmation, cancellation, or incident closure.'],
    ),
    check(
      'production_owner_decision_accepted',
      'Production owner decision is accepted for Garmin/inReach satellite communications.',
      accepted(evidence?.productionDecision),
      [relPath(root, paths.evidence)],
      ['Record product, engineering, field-ops, safety, privacy, and QA acceptance after real provider/device evidence is complete.'],
    ),
  ];

  const failed = checks.filter((item) => !item.passed);
  return {
    passed: failed.length === 0,
    status: failed.length === 0 ? 'production_ready' : 'blocked',
    statusLabel: failed.length === 0 ? 'Production ready' : 'Blocked for production',
    checkedAt: new Date().toISOString(),
    system: 'garmin_inreach_satellite_communications',
    checks,
    blockers: failed.map((item) => item.id),
    remediation: failed.flatMap((item) => item.remediation),
    notes: [
      'This gate separates Garmin/inReach code readiness from real provider, device, command, and SOS review evidence.',
      'MapShare is treated as read-only evidence; IPC command workflows require explicit operator confirmation.',
      'SOS signals must remain human-review-only and must never be confirmed, canceled, or closed automatically by ECS.',
    ],
  };
}

export function writeGarminInreachProductionReadinessResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const resultPath = path.join(root, RESULT_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return resultPath;
}

export function formatGarminInreachProductionReadinessResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const lines = [
    `Garmin/inReach production readiness: ${result.statusLabel}`,
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
  const result = buildGarminInreachProductionReadinessResult();
  writeGarminInreachProductionReadinessResult(result);
  if (jsonOnly) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else process.stdout.write(formatGarminInreachProductionReadinessResult(result));
  return result.passed ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
