import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const RESULT_RELATIVE_PATH = path.join('.smoke', 'offline-navigation-production-readiness-result.json');
const EVIDENCE_RELATIVE_PATH = path.join('.smoke', 'offline-navigation-production-evidence.json');

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

export function buildOfflineNavigationProductionReadinessResult(options = {}) {
  const root = options.rootDir ?? process.cwd();
  const paths = {
    result: path.join(root, RESULT_RELATIVE_PATH),
    evidence: path.join(root, EVIDENCE_RELATIVE_PATH),
    offlineReadiness: path.join(root, 'lib', 'offlineReadinessPresentation.ts'),
    routeCacheService: path.join(root, 'lib', 'offlineRouteCacheService.ts'),
    tileSyncCoordinator: path.join(root, 'lib', 'offlineTileSyncCoordinator.ts'),
    navigate: path.join(root, 'app', '(tabs)', 'navigate.tsx'),
    offlineModal: path.join(root, 'components', 'navigate', 'OfflineCacheModal.tsx'),
    commandBrief: path.join(root, 'components', 'brief', 'CommandBriefScreen.tsx'),
    readinessStrip: path.join(root, 'components', 'navigate', 'NavigateReadinessStrip.tsx'),
    campLayerOfflineCache: path.join(root, 'lib', 'map', 'campLayerOfflineCache.ts'),
    campLayerZoom: path.join(root, 'lib', 'map', 'campLayerZoom.ts'),
    mapRenderer: path.join(root, 'components', 'navigate', 'MapRenderer.tsx'),
    offlineHonestyAudit: path.join(root, 'docs', 'offline-honesty-release-audit.md'),
  };

  const evidence = readJsonIfExists(paths.evidence);
  const offlineReadiness = readIfExists(paths.offlineReadiness);
  const routeCacheService = readIfExists(paths.routeCacheService);
  const tileSyncCoordinator = readIfExists(paths.tileSyncCoordinator);
  const navigate = readIfExists(paths.navigate);
  const offlineModal = readIfExists(paths.offlineModal);
  const commandBrief = readIfExists(paths.commandBrief);
  const readinessStrip = readIfExists(paths.readinessStrip);
  const campLayerOfflineCache = readIfExists(paths.campLayerOfflineCache);
  const campLayerZoom = readIfExists(paths.campLayerZoom);
  const mapRenderer = readIfExists(paths.mapRenderer);
  const offlineHonestyAudit = readIfExists(paths.offlineHonestyAudit);

  const checks = [
    check(
      'offline_readiness_derives_route_style_layer_and_stale_states',
      'Offline readiness derives route, style, layer, stale, missing, and cached states without a fake route-pack model.',
      offlineReadiness.includes('findMatchingRoute(current, routes)') &&
        offlineReadiness.includes("label: 'Style Not Cached'") &&
        offlineReadiness.includes("label: 'Layer Not Cached'") &&
        offlineReadiness.includes('routeSyncHydrated') &&
        offlineReadiness.includes('getWeatherFreshness') &&
        offlineReadiness.includes('closure/access snapshot') &&
        !offlineReadiness.includes('Route Pack'),
      [relPath(root, paths.offlineReadiness)],
      ['Keep offline readiness grounded in actual route/cache/weather/closure inputs.'],
    ),
    check(
      'prepare_offline_persists_route_intent_and_starts_route_sync',
      'Prepare Offline persists route intent metadata and starts a route-corridor tile sync.',
      navigate.includes('buildRouteIntentForRoadPreview({') &&
        navigate.includes('tileCacheStore.createFromBounds(') &&
        navigate.includes("sourceType: 'route-corridor'") &&
        navigate.includes("syncType: 'route'") &&
        navigate.includes('cacheOfflineRoute({') &&
        navigate.includes('offlineTileSyncCoordinator') &&
        routeCacheService.includes('routeIntent?: OfflineRouteIntentMetadata | null;') &&
        routeCacheService.includes("syncType: 'route'") &&
        routeCacheService.includes('destination') &&
        tileSyncCoordinator.includes('persistJobs();') &&
        tileSyncCoordinator.includes('completedAt: nowISO()'),
      [
        relPath(root, paths.navigate),
        relPath(root, paths.routeCacheService),
        relPath(root, paths.tileSyncCoordinator),
      ],
      ['Keep Prepare Offline tied to route-specific sync metadata and persisted progress.'],
    ),
    check(
      'downloaded_sync_open_restores_offline_route_preview',
      'Downloaded route syncs can be opened back into road preview using cached destination/geometry fallbacks.',
      offlineModal.includes('Downloaded Syncs') &&
        offlineModal.includes('ROUTE SYNC') &&
        offlineModal.includes('onOpenDownloadedSync') &&
        offlineModal.includes('TacticalProgressBar') &&
        navigate.includes('const handleOpenDownloadedSync = useCallback(async (target: DownloadedSyncOpenTarget) => {') &&
        navigate.includes('getOfflineRouteDestination(route)') &&
        navigate.includes("await previewRoadDestination(destination, 'offline_sync_open');") &&
        navigate.includes('buildOfflineCachedRoadPreviewRoute(route, origin, destination)') &&
        navigate.includes("await previewRoadRoute(cachedRoadRoute, 'offline_sync_open');"),
      [relPath(root, paths.offlineModal), relPath(root, paths.navigate)],
      ['Keep downloaded route syncs actionable without requiring online route services.'],
    ),
    check(
      'departure_audit_and_prepare_offline_cta_visible',
      'Command Brief and Navigate expose offline departure audit status and the route package CTA.',
      commandBrief.includes('Departure Audit') &&
        commandBrief.includes('DepartureAuditChecklist') &&
        readinessStrip.includes('Offline: {offlineStatus}') &&
        readinessStrip.includes('Download Route Package') &&
        navigate.includes('onPrepareOffline={handlePrepareOfflineFromRoadPreview}'),
      [relPath(root, paths.commandBrief), relPath(root, paths.readinessStrip), relPath(root, paths.navigate)],
      ['Keep offline readiness visible before and during route start.'],
    ),
    check(
      'camp_layers_use_cached_or_labeled_offline_reference',
      'Camp layers use cached data offline or clearly label missing/limited camp data instead of fetching live providers.',
      campLayerOfflineCache.includes('readDispersedCampingOfflineCache') &&
        campLayerOfflineCache.includes('readEstablishedCampgroundsOfflineCache') &&
        campLayerOfflineCache.includes('writeDispersedCampingOfflineCache') &&
        campLayerOfflineCache.includes('writeEstablishedCampgroundsOfflineCache') &&
        campLayerZoom.includes('ESTABLISHED_CAMPSITES_MIN_ZOOM') &&
        campLayerZoom.includes('DISPERSED_CAMPING_ELIGIBILITY_MIN_ZOOM') &&
        navigate.includes("plan.reason === 'offline'") &&
        navigate.includes('readDispersedCampingOfflineCache') &&
        navigate.includes('readEstablishedCampgroundsOfflineCache') &&
        navigate.includes('cached established campground') &&
        navigate.includes('cached public-land eligibility') &&
        navigate.includes('Verify status and availability when connected') &&
        navigate.includes('Verify before camping') &&
        mapRenderer.includes("legalityStatus: pin.legalityStatus ?? 'unknown_needs_verification'"),
      [
        relPath(root, paths.campLayerOfflineCache),
        relPath(root, paths.campLayerZoom),
        relPath(root, paths.navigate),
        relPath(root, paths.mapRenderer),
      ],
      ['Do not show offline camp pins as live or legally confirmed without cached/provider evidence.'],
    ),
    check(
      'offline_mode_copy_blocks_live_search_reroute_overclaims',
      'Navigate offline mode copy keeps live search, live routing, and reroutes unavailable while framing cached maps/camps as reference data.',
      navigate.includes('Live search is unavailable. Saved route guidance') &&
        navigate.includes('Live search and reroutes remain unavailable until signal returns.') &&
        navigate.includes('Live routing services are offline. Cached map coverage is still available for field reference.') &&
        navigate.includes('Live search and route building require connectivity. Open saved routes or reconnect to continue.') &&
        offlineHonestyAudit.includes('Offline Navigation Production Gate Notes') &&
        offlineHonestyAudit.includes('does not prove field offline routing until Android no-network evidence is recorded'),
      [relPath(root, paths.navigate), relPath(root, paths.offlineHonestyAudit)],
      ['Keep offline copy honest: cached guidance/reference may remain available, but live search/routing/reroutes require connectivity.'],
    ),
    check(
      'android_no_network_route_e2e_evidence_present',
      'Android no-network route execution evidence is recorded.',
      evidenceTrue(evidence, 'androidNoNetworkRouteE2ePassed'),
      [relPath(root, paths.evidence)],
      ['Run a native Android route preview/start flow with network disabled and capture screenshots/logs.'],
    ),
    check(
      'offline_map_tiles_and_route_cache_verified',
      'Offline map tiles, route geometry, route intent, and downloaded sync Open are verified on device.',
      evidenceTrue(evidence, 'offlineMapTilesRouteCacheVerified'),
      [relPath(root, paths.evidence)],
      ['Capture route package download, tile sync completion, app restart, and downloaded sync Open behavior.'],
    ),
    check(
      'offline_camp_pins_or_unavailable_label_verified',
      'Offline camp pin availability or unavailable/limited-data labeling is verified on device.',
      evidenceTrue(evidence, 'offlineCampPinsAvailabilityVerified'),
      [relPath(root, paths.evidence)],
      ['Verify cached CampOps/established/dispersed layers render, or that missing cached data is explicitly labeled.'],
    ),
    check(
      'offline_departure_audit_device_verified',
      'Departure Audit and Navigate offline readiness strip are verified on Android.',
      evidenceTrue(evidence, 'offlineDepartureAuditDeviceVerified'),
      [relPath(root, paths.evidence)],
      ['Capture Command Brief Departure Audit and Navigate offline readiness strip on Android.'],
    ),
    check(
      'production_owner_decision_accepted',
      'Production owner decision is accepted for offline navigation.',
      accepted(evidence?.productionDecision),
      [relPath(root, paths.evidence)],
      ['Record product, engineering, field-ops, and QA acceptance after no-network evidence is complete.'],
    ),
  ];

  const failed = checks.filter((item) => !item.passed);
  return {
    passed: failed.length === 0,
    status: failed.length === 0 ? 'production_ready' : 'blocked',
    statusLabel: failed.length === 0 ? 'Production ready' : 'Blocked for production',
    checkedAt: new Date().toISOString(),
    system: 'offline_navigation',
    checks,
    blockers: failed.map((item) => item.id),
    remediation: failed.flatMap((item) => item.remediation),
    notes: [
      'This gate separates offline-navigation code readiness from real Android no-network evidence.',
      'Offline camp data must be cached/labeled; do not imply live legal/access or availability facts offline.',
      'Passing static route/cache tests does not prove field offline routing until device evidence is recorded.',
    ],
  };
}

export function writeOfflineNavigationProductionReadinessResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const resultPath = path.join(root, RESULT_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return resultPath;
}

export function formatOfflineNavigationProductionReadinessResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const lines = [
    `Offline Navigation production readiness: ${result.statusLabel}`,
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
  const result = buildOfflineNavigationProductionReadinessResult();
  writeOfflineNavigationProductionReadinessResult(result);
  if (jsonOnly) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else process.stdout.write(formatOfflineNavigationProductionReadinessResult(result));
  return result.passed ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
