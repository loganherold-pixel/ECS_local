import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { buildRuntimeRegressionReport } from './result-contract.mjs';
import {
  buildRuntimeValidationPackage,
  formatRuntimeValidationPackageMarkdown,
  resolveRuntimeValidationOutputPath,
  runtimeValidationPathIdentity,
} from './runtime-validation-package.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const DEVICE_PLAN_CHECKLIST = Object.freeze([
  {
    scenario: 'dashboard_weather_real_provider',
    sourceFixtureProvider: 'ecs_weather_edge_configured_provider',
    qualifiedTestIdentity: 'runtime-regression.device-plan.dashboard-weather-real-provider',
    deviceEvidenceStillRequired: ['android_location_permission', 'ios_location_permission', 'real_weather_provider', 'offline_cache_transition'],
    platforms: ['android', 'ios'],
    steps: ['Grant location permission and mount Dashboard.', 'Verify a real ECS-owned provider request reaches live state with provider and forecast timestamp.', 'Disable network and verify cached or unavailable source truth without a false empty state.'],
  },
  {
    scenario: 'terrain_risk_native_profile',
    sourceFixtureProvider: 'stored_canonical_route_elevation',
    qualifiedTestIdentity: 'runtime-regression.device-plan.terrain-risk-native-profile',
    deviceEvidenceStillRequired: ['android_profile_render', 'ios_profile_render', 'native_orientation_change', 'live_route_progress'],
    platforms: ['android', 'ios'],
    steps: ['Load a stored canonical route with elevation.', 'Verify graph shape and progress marker on phone and landscape.', 'Load guidance without elevation and verify profile unavailable is explicit.'],
  },
  {
    scenario: 'draw_route_native_map_gesture',
    sourceFixtureProvider: 'mapbox_native_draft_source',
    qualifiedTestIdentity: 'runtime-regression.device-plan.draw-route-native-map-gesture',
    deviceEvidenceStillRequired: ['android_map_gesture', 'ios_map_gesture', 'mapbox_style_reload', 'native_orientation_change'],
    platforms: ['android', 'ios'],
    steps: ['Add two draft points with native map gestures before preview.', 'Verify draft GeoJSON is visible, then undo and cancel.', 'Reload map style and rotate the device; verify the draft source is restored without becoming guidance-ready.'],
  },
  {
    scenario: 'guidance_snapping_field_gps',
    sourceFixtureProvider: 'physical_gps_and_stored_canonical_route',
    qualifiedTestIdentity: 'runtime-regression.device-plan.guidance-snapping-field-gps',
    deviceEvidenceStillRequired: ['physical_gps_accuracy', 'parallel_route_field_case', 'off_route_field_case', 'offline_canonical_geometry'],
    platforms: ['android', 'ios', 'field'],
    steps: ['Follow a stored canonical route with raw breadcrumb separately visible.', 'Verify projected progress stays on the canonical line and remains continuous near parallel segments.', 'Leave the bounded tolerance and verify off-route state instead of a forced snap.'],
  },
  {
    scenario: 'navigate_layers_real_map_provider',
    sourceFixtureProvider: 'mapbox_and_ecs_route_catalog_edge',
    qualifiedTestIdentity: 'runtime-regression.device-plan.navigate-layers-real-map-provider',
    deviceEvidenceStillRequired: ['mapbox_native_render', 'supabase_edge_configured', 'rapid_pan_zoom', 'offline_layer_cache'],
    platforms: ['android', 'ios'],
    steps: ['Enable MVUM, then select ECS Route Geometry and verify MVUM turns off; reverse the switch and verify ECS Route Geometry turns off.', 'Pan and zoom rapidly and record bounded request and cancellation diagnostics.', 'Verify features or explicit empty/error/deferred state for each selection, then repeat offline for cache hit and miss.'],
  },
  {
    scenario: 'dispatch_canonical_native_route',
    sourceFixtureProvider: 'canonical_dispatch_store_and_route',
    qualifiedTestIdentity: 'runtime-regression.device-plan.dispatch-canonical-native-route',
    deviceEvidenceStillRequired: ['android_bundle_resolution', 'ios_bundle_resolution', 'native_route_restoration', 'real_dispatch_mutation'],
    platforms: ['android', 'ios'],
    steps: ['Open Dispatch from CommandDock and from a restored deep link.', 'Verify the canonical flagship identity and absence of the legacy command center.', 'Perform an approved state mutation and verify the mounted screen updates.'],
  },
  {
    scenario: 'explore_real_catalog_readiness',
    sourceFixtureProvider: 'approved_route_catalog_provider',
    qualifiedTestIdentity: 'runtime-regression.device-plan.explore-real-catalog-readiness',
    deviceEvidenceStillRequired: ['real_catalog_provider', 'approved_guidance_route', 'provider_failure_transition', 'navigate_handoff'],
    platforms: ['android', 'ios', 'provider'],
    steps: ['Query a configured approved catalog area and record provider through rendered counts.', 'Verify one qualified route becomes guidance-ready only after required geometry.', 'Force provider failure and verify it is distinct from no routes, then verify Navigate handoff.'],
  },
  {
    scenario: 'primary_controls_native_sweep',
    sourceFixtureProvider: 'mounted_fleet_navigate_dashboard_explore_dispatch',
    qualifiedTestIdentity: 'runtime-regression.device-plan.primary-controls-native-sweep',
    deviceEvidenceStillRequired: ['android_primary_actions', 'ios_primary_actions', 'permission_denial', 'offline_behavior', 'rapid_tap_deduplication'],
    platforms: ['android', 'ios'],
    steps: ['Activate each major surface primary action once and verify a meaningful mutation or navigation.', 'Repeat rapidly and verify one effective action plus bounded busy state.', 'Exercise permission denial, offline, and provider error paths with visible terminal feedback.'],
  },
]);

export function buildDevicePlanReport(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now ?? Date.now());
  const scenarios = DEVICE_PLAN_CHECKLIST.map((entry) => ({
    scenario: entry.scenario,
    status: 'device_evidence_required',
    durationMs: 0,
    sourceFixtureProvider: entry.sourceFixtureProvider,
    failureSafeCode: 'device_evidence_required',
    deviceEvidenceStillRequired: entry.deviceEvidenceStillRequired,
    qualifiedTestIdentity: entry.qualifiedTestIdentity,
  }));
  const runtimeValidationPackage = buildRuntimeValidationPackage({
    rootDir: options.rootDir ?? ROOT,
    now,
    registry: options.registry,
    registryPath: options.registryPath,
  });
  return {
    ...buildRuntimeRegressionReport({
      lane: 'device-plan',
      generatedAt: now,
      durationMs: 0,
      scenarios,
      childRuns: [],
    }),
    executionClaim: 'plan_only_not_executed',
    privacyGuard: 'Do not record precise private coordinates, credentials, raw provider payloads, or private expedition content.',
    checklist: DEVICE_PLAN_CHECKLIST,
    runtimeValidationPackage,
  };
}

export function formatDevicePlanMarkdown(report) {
  const lines = [
    '# ECS runtime regression device evidence plan',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '> This is a plan only. It does not claim Android, iOS, GPS, Mapbox, provider, or field execution.',
  ];
  for (const entry of report.checklist) {
    lines.push('', `## ${entry.scenario}`, '', `Qualified test: \`${entry.qualifiedTestIdentity}\``, `Source/provider: \`${entry.sourceFixtureProvider}\``, `Platforms: ${entry.platforms.join(', ')}`, '', 'Evidence required:');
    for (const item of entry.deviceEvidenceStillRequired) lines.push(`- ${item}`);
    lines.push('', 'Procedure:');
    for (const step of entry.steps) lines.push(`- ${step}`);
  }
  lines.push(
    '',
    'Privacy: do not record precise private coordinates, credentials, raw provider payloads, or private expedition content.',
    '',
    '---',
    '',
    formatRuntimeValidationPackageMarkdown(report.runtimeValidationPackage),
  );
  return lines.join('\n');
}

function parseArgs(argv) {
  const args = {
    output: '.smoke/verification/runtime-regression-device-plan.json',
    summaryOutput: '.smoke/verification/runtime-regression-device-plan.md',
  };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--output') args.output = argv[++index] ?? null;
    else if (argv[index] === '--summary-output') args.summaryOutput = argv[++index] ?? null;
    else if (argv[index] === '--json') continue;
    else throw new Error('runtime_device_plan_argument_invalid');
  }
  return args;
}

function write(relativePath, contents) {
  const outputPath = resolveRuntimeValidationOutputPath(ROOT, relativePath);
  fs.mkdirSync(path.dirname(outputPath.absolute), { recursive: true });
  fs.writeFileSync(outputPath.absolute, contents, 'utf8');
}

export function runDevicePlanCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const jsonOutput = args.output == null
    ? null
    : resolveRuntimeValidationOutputPath(ROOT, args.output, 'device-plan JSON output path');
  const summaryOutput = args.summaryOutput == null
    ? null
    : resolveRuntimeValidationOutputPath(ROOT, args.summaryOutput, 'device-plan summary output path');
  if (jsonOutput && summaryOutput
    && runtimeValidationPathIdentity(jsonOutput.absolute) === runtimeValidationPathIdentity(summaryOutput.absolute)) {
    throw new Error('runtime_device_plan_output_collision');
  }
  const report = buildDevicePlanReport();
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (args.output) write(args.output, serialized);
  if (args.summaryOutput) write(args.summaryOutput, formatDevicePlanMarkdown(report));
  process.stdout.write(serialized);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    process.exitCode = runDevicePlanCli();
  } catch {
    process.stderr.write('runtime_device_plan_failed\n');
    process.exitCode = 1;
  }
}
