import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const RESULT_RELATIVE_PATH = path.join('.smoke', 'established-campgrounds-production-readiness-result.json');
const EVIDENCE_RELATIVE_PATH = path.join('.smoke', 'established-campgrounds-production-evidence.json');
const RUNBOOK_RELATIVE_PATH = path.join('docs', 'integrations', 'established-campgrounds-provider-sync.md');

const PROVIDER_SECRET_REFS = [
  'RIDB_API_KEY',
  'NPS_API_KEY',
  'CAMPFLARE_API_KEY',
  'ACTIVE_API_KEY',
  'ACTIVE_API_SECRET',
  'RESERVEAMERICA_API_KEY',
  'ASPIRA_API_KEY',
  'OSM_USER_AGENT',
  'OSM_OVERPASS_URL',
  'OSM_ATTRIBUTION',
];

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

function accepted(value) {
  return String(value ?? '').trim().toLowerCase() === 'accepted';
}

function evidenceTrue(evidence, key) {
  return evidence?.[key] === true;
}

export function buildEstablishedCampgroundsProductionReadinessResult(options = {}) {
  const root = options.rootDir ?? process.cwd();
  const paths = {
    result: path.join(root, RESULT_RELATIVE_PATH),
    evidence: path.join(root, EVIDENCE_RELATIVE_PATH),
    runbook: path.join(root, RUNBOOK_RELATIVE_PATH),
    mobile: path.join(root, 'lib', 'map', 'establishedCampgroundMobile.ts'),
    mobileClient: path.join(root, 'lib', 'map', 'establishedCampgroundSearchClient.ts'),
    search: path.join(root, 'supabase', 'functions', 'campgrounds-search', 'index.ts'),
    detail: path.join(root, 'supabase', 'functions', 'campground-detail', 'index.ts'),
    sharedApi: path.join(root, 'supabase', 'functions', '_shared', 'campgroundApi.ts'),
    navigate: path.join(root, 'app', '(tabs)', 'navigate.tsx'),
    mapRenderer: path.join(root, 'components', 'navigate', 'MapRenderer.tsx'),
    sheet: path.join(root, 'components', 'navigate', 'EstablishedCampsiteSheet.tsx'),
    campIntelPopup: path.join(root, 'components', 'navigate', 'CampScoutIntelCard.tsx'),
    zoom: path.join(root, 'lib', 'map', 'campLayerZoom.ts'),
  };

  const evidence = readJsonIfExists(paths.evidence);
  const runbook = readIfExists(paths.runbook);
  const mobile = readIfExists(paths.mobile);
  const mobileClient = readIfExists(paths.mobileClient);
  const search = readIfExists(paths.search);
  const detail = readIfExists(paths.detail);
  const sharedApi = readIfExists(paths.sharedApi);
  const navigate = readIfExists(paths.navigate);
  const mapRenderer = readIfExists(paths.mapRenderer);
  const sheet = readIfExists(paths.sheet);
  const campIntelPopup = readIfExists(paths.campIntelPopup);
  const zoom = readIfExists(paths.zoom);

  const mobileSecretRefsAbsent = PROVIDER_SECRET_REFS.every((secret) =>
    !mobile.includes(secret) && !mobileClient.includes(secret) && !search.includes(secret),
  );

  const checks = [
    check(
      'mobile_uses_ecs_owned_cached_endpoints',
      'Mobile established campground flow uses ECS-owned cached endpoints, not provider APIs.',
      mobile.includes("ESTABLISHED_CAMPGROUNDS_EDGE_FUNCTION = 'campgrounds-search'") &&
        mobileClient.includes('supabase.functions.invoke(ESTABLISHED_CAMPGROUNDS_EDGE_FUNCTION') &&
        search.includes("from('campgrounds')") &&
        !search.includes('fetch(') &&
        !detail.includes('fetch('),
      [relPath(root, paths.mobile), relPath(root, paths.mobileClient), relPath(root, paths.search), relPath(root, paths.detail)],
      ['Keep provider acquisition in sync functions only; mobile must call ECS cached canonical endpoints.'],
    ),
    check(
      'provider_secrets_not_in_mobile_or_search',
      'Provider secrets are not referenced by mobile code or mobile search endpoint.',
      mobileSecretRefsAbsent,
      [relPath(root, paths.mobile), relPath(root, paths.mobileClient), relPath(root, paths.search)],
      ['Move provider credentials to Supabase Edge Function environment variables only.'],
    ),
    check(
      'attribution_and_freshness_preserved',
      'Attribution and conservative availability freshness handling are preserved.',
      mobile.includes('attribution: cleanText(record.attribution)') &&
        sharedApi.includes('effectiveAvailabilityStatus') &&
        sharedApi.includes('isAvailabilityFresh') &&
        sharedApi.includes('rawJson: null') &&
        !mobile.includes('Available now'),
      [relPath(root, paths.mobile), relPath(root, paths.sharedApi)],
      ['Preserve attribution and degrade expired availability to unknown.'],
    ),
    check(
      'runbook_documents_provider_operations',
      'Runbook documents provider sync, health, troubleshooting, attribution, limitations, and scheduling responsibility.',
      runbook.includes('Troubleshooting Missing Campgrounds') &&
        runbook.includes('Attribution Requirements') &&
        runbook.includes('Known Limitations') &&
        runbook.includes('Scheduling is a deployment environment responsibility') &&
        runbook.includes('campground_provider_configs.sync_interval_minutes'),
      [relPath(root, paths.runbook)],
      ['Keep deployment-managed scheduler and provider-health expectations documented.'],
    ),
    check(
      'mobile_pin_popup_actions_and_zoom_guardrails',
      'Mobile map pins, details, attribution, popup actions, and zoom-gated fetching are wired for established/CampOps candidates.',
      zoom.includes('ESTABLISHED_CAMPSITES_MIN_ZOOM = 8') &&
        navigate.includes('establishedCampsitesZoomReady') &&
        navigate.includes("isCampLayerZoomEligible('established_campgrounds', mapZoom)") &&
        navigate.includes('establishedCampsitesZoomPrompt') &&
        navigate.includes('handleEstablishedCampsiteTap') &&
        navigate.includes('<EstablishedCampsiteSheet') &&
        navigate.includes('establishedCampsites={establishedCampsitesLayer}') &&
        mapRenderer.includes('ESTABLISHED_CAMPSITES_MIN_ZOOM') &&
        mapRenderer.includes('cluster: true') &&
        mapRenderer.includes("map.on('click', ESTABLISHED_CAMPSITES_SYMBOL_LAYER_ID") &&
        mapRenderer.includes('send(ESTABLISHED_CAMPSITE_SELECTED_MESSAGE_TYPE') &&
        sheet.includes('Source / attribution') &&
        sheet.includes('formatCampgroundAvailabilityLabel') &&
        sheet.includes('Verify current details with the campground operator before travel') &&
        campIntelPopup.includes('CAMP INTEL') &&
        campIntelPopup.includes('SAVE CAMP') &&
        campIntelPopup.includes('NAVIGATE HERE') &&
        campIntelPopup.includes('REPORT UNUSABLE'),
      [
        relPath(root, paths.navigate),
        relPath(root, paths.mapRenderer),
        relPath(root, paths.sheet),
        relPath(root, paths.campIntelPopup),
        relPath(root, paths.zoom),
      ],
      ['Keep established campground fetch/render work zoom-gated and keep pin/detail/popup actions source-labeled and verification-first.'],
    ),
    check(
      'production_scheduler_configured',
      'Deployment scheduler is configured for provider sync cadence.',
      evidenceTrue(evidence, 'productionSchedulerConfigured'),
      [relPath(root, paths.evidence)],
      ['Record deployment scheduler type, cadence, auth method, and target functions before production.'],
    ),
    check(
      'provider_health_checked',
      'Provider health endpoint confirms required secrets are present without exposing values.',
      evidenceTrue(evidence, 'providerHealthChecked'),
      [relPath(root, paths.evidence)],
      ['Run campground-provider-health in the target environment and capture boolean/missing-secret output only.'],
    ),
    check(
      'sync_runs_validated',
      'Recent provider sync runs are validated for records read/upserted, errors, and rate limits.',
      evidenceTrue(evidence, 'syncRunsValidated'),
      [relPath(root, paths.evidence)],
      ['Record campground_sync_runs evidence for each enabled provider without raw provider payloads.'],
    ),
    check(
      'canonical_records_validated',
      'Canonical campground rows and dedupe behavior are validated in the target region.',
      evidenceTrue(evidence, 'canonicalRecordsValidated'),
      [relPath(root, paths.evidence)],
      ['Validate canonical campgrounds by bbox/name, source records, dedupe, status, coordinates, and attribution.'],
    ),
    check(
      'availability_freshness_validated',
      'Availability freshness and expired-to-unknown behavior are validated.',
      evidenceTrue(evidence, 'availabilityFreshnessValidated'),
      [relPath(root, paths.evidence)],
      ['Confirm campground_availability expires_at/last_checked_at TTL behavior in target data.'],
    ),
    check(
      'android_visible_pin_popup_action_evidence_recorded',
      'Android evidence covers visible provider-backed pins, detail popup, attribution, Save Camp, Navigate Here, and Report Unusable actions.',
      evidenceTrue(evidence, 'androidVisiblePinPopupActionEvidenceRecorded'),
      [relPath(root, paths.evidence)],
      ['Exercise a candidate-producing route or viewport on Android and capture provider-backed pin/detail/action evidence without fake live camp data.'],
    ),
    check(
      'production_owner_decision_accepted',
      'Production owner decision is accepted for established campgrounds.',
      accepted(evidence?.productionDecision),
      [relPath(root, paths.evidence)],
      ['Record product, privacy, engineering, and operations acceptance after deployment evidence is complete.'],
    ),
  ];

  const failed = checks.filter((item) => !item.passed);
  return {
    passed: failed.length === 0,
    status: failed.length === 0 ? 'production_ready' : 'blocked',
    statusLabel: failed.length === 0 ? 'Production ready' : 'Blocked for production',
    checkedAt: new Date().toISOString(),
    system: 'established_campgrounds',
    checks,
    blockers: failed.map((item) => item.id),
    remediation: failed.flatMap((item) => item.remediation),
    notes: [
      'This gate separates code readiness from deployment evidence for established campground providers.',
      'Visible CampOps/established pins and actions require provider-backed Android evidence before production approval.',
      'Passing cached endpoint checks does not prove provider sync, scheduler, or freshness readiness.',
      'Do not expose provider secrets to mobile code or fetch providers during mobile map requests.',
    ],
  };
}

export function writeEstablishedCampgroundsProductionReadinessResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const resultPath = path.join(root, RESULT_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return resultPath;
}

export function formatEstablishedCampgroundsProductionReadinessResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const lines = [
    `Established campgrounds production readiness: ${result.statusLabel}`,
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
  const result = buildEstablishedCampgroundsProductionReadinessResult();
  writeEstablishedCampgroundsProductionReadinessResult(result);
  if (jsonOnly) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else process.stdout.write(formatEstablishedCampgroundsProductionReadinessResult(result));
  return result.passed ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
