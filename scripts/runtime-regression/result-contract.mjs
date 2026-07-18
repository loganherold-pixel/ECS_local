export const RUNTIME_REGRESSION_SCHEMA_VERSION = 1;

export const RUNTIME_REGRESSION_STATUSES = Object.freeze([
  'passed',
  'failed',
  'timed_out',
  'skipped',
  'blocked_external',
  'device_evidence_required',
]);

const STATUS_SET = new Set(RUNTIME_REGRESSION_STATUSES);
const SYMBOLIC_ID = /^[a-z][a-z0-9]*(?:[_-][a-z0-9]+)*$/;
const SOURCE_ID = /^(?:fixture:)?[a-z][a-z0-9]*(?:[_-][a-z0-9]+)*$/;
const QUALIFIED_TEST_ID = /^(?:ecs\.runtime|runtime|runtime-regression)(?:\.[a-z][a-z0-9]*(?:[_-][a-z0-9]+)*){2,8}$/;
const SAFE_CODE = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const DECIMAL_OR_SIGNED_NUMBER = /(?:^|[^A-Za-z0-9])(?:[-+]\d+|\d+\.\d+)(?:$|[^A-Za-z0-9])/;
const COORDINATE_PAIR = /(?:^|[._:-])\d{1,3}[._:-]\d{1,3}(?:$|[._:-])/;
const COORDINATE_MARKER = /(?:^|[._:-])(?:(?:lat|latitude|lng|lon|longitude|coord|coordinate|north|south|east|west|x|y)[._:-]?\d|[ns]\d{1,2}(?:[ew]\d{1,3})?(?:$|[._:-])|[ew]\d{1,3}(?:$|[._:-]))/i;
const COMPACT_COORDINATE = /^(?:[ns]\d{1,2}[ew]\d{1,3}|\d{1,2}[ns]\d{1,3}[ew])$/i;
const SENSITIVE_MARKER = /(?:^|[._:-])(?:https?|url|token|secret|password|authorization|api[_-]?key|bearer)(?:$|[._:-])/i;
const CREDENTIAL_SHAPE = /(?:^|[._:-])(?:(?:sk|pk)[-_][a-z0-9]|gh[pousr]_|github_pat_|akia|asia|xox[baprs]-|eyj[a-z0-9_-]{12,}|supabase[_-]eyj)/i;
const LONG_OPAQUE_SEGMENT = /(?:^|[._:-])[a-z0-9]{41,}(?:$|[._:-])/i;

const REGISTERED_SCENARIO_IDS = new Set([
  'dashboard_weather',
  'terrain_risk',
  'draw_route',
  'guidance_snapping',
  'mvum_and_route_geometry',
  'dispatch_canonical_route_store_update',
  'explore_guidance_readiness_promotion',
  'explore_provider_failure_truth',
  'interaction_primary_fleet',
  'interaction_primary_navigate',
  'interaction_primary_dashboard',
  'interaction_primary_explore',
  'interaction_primary_dispatch',
  'dashboard_weather_real_provider',
  'terrain_risk_native_profile',
  'draw_route_native_map_gesture',
  'guidance_snapping_field_gps',
  'navigate_layers_real_map_provider',
  'dispatch_canonical_native_route',
  'explore_real_catalog_readiness',
  'primary_controls_native_sweep',
  'dashboard_weather_live_ready',
  'fast-core-runner',
  'fast-core-scenarios-runner',
  'integration-dispatch-explore-controls-runner',
]);

const REGISTERED_SOURCE_IDS = new Set([
  'fixture:openweather_one_call_normalized',
  'fixture:canonical_guidance_elevation_profile',
  'fixture:route_builder_anchor_trace',
  'fixture:canonical_route_projection',
  'fixture:route_geometry_segments_normalized',
  'fixture:mvum_segments_ecs_route_catalog',
  'isolated_dispatch_persistence_fixture',
  'deterministic_route_catalog_fixture',
  'controlled_route_provider_failure_fixture',
  'mounted_command_dock_component',
  'ecs_weather_edge_configured_provider',
  'stored_canonical_route_elevation',
  'mapbox_native_draft_source',
  'physical_gps_and_stored_canonical_route',
  'mapbox_and_ecs_route_catalog_edge',
  'canonical_dispatch_store_and_route',
  'approved_route_catalog_provider',
  'mounted_fleet_navigate_dashboard_explore_dispatch',
  'weather_broker_normalized_fixture',
  'runtime_lane_orchestrator',
]);

const REGISTERED_EVIDENCE_IDS = new Set([
  'configured_provider_mobile_request',
  'dashboard_provider_timestamp_visual_evidence',
  'offline_transition_evidence',
  'dashboard_svg_profile_phone_landscape_evidence',
  'mapbox_native_draft_pre_preview_evidence',
  'orientation_map_style_reload_evidence',
  'device_gps_canonical_route_trace',
  'field_off_route_behavior',
  'mapbox_source_layer_rendering_evidence',
  'android_pan_zoom_cancellation_request_count',
  'configured_supabase_provider_evidence',
  'android_dispatch_bundle_resolution',
  'real_provider_qualified_route_visibility',
  'real_provider_recovery_after_failure',
  'android_location_permission',
  'ios_location_permission',
  'real_weather_provider',
  'offline_cache_transition',
  'android_profile_render',
  'ios_profile_render',
  'native_orientation_change',
  'live_route_progress',
  'android_map_gesture',
  'ios_map_gesture',
  'mapbox_style_reload',
  'physical_gps_accuracy',
  'parallel_route_field_case',
  'off_route_field_case',
  'offline_canonical_geometry',
  'mapbox_native_render',
  'supabase_edge_configured',
  'rapid_pan_zoom',
  'offline_layer_cache',
  'android_bundle_resolution',
  'ios_bundle_resolution',
  'native_route_restoration',
  'real_dispatch_mutation',
  'real_catalog_provider',
  'approved_guidance_route',
  'provider_failure_transition',
  'navigate_handoff',
  'android_primary_actions',
  'ios_primary_actions',
  'permission_denial',
  'offline_behavior',
  'rapid_tap_deduplication',
  'android_real_provider_refresh',
]);

const REGISTERED_QUALIFIED_TEST_IDS = new Set([
  'ecs.runtime.fast.dashboard_weather.live_and_cached',
  'ecs.runtime.fast.terrain_risk.profile_and_missing_elevation',
  'ecs.runtime.fast.draw_route.pre_preview_draft_lifecycle',
  'ecs.runtime.fast.guidance_snapping.canonical_projection',
  'ecs.runtime.fast.navigate_layers.independent_terminals_and_stale_viewport',
  'runtime.integration.dispatch.canonical-route-store-update',
  'runtime.integration.explore.guidance-readiness-promotion',
  'runtime.integration.explore.provider-failure-truth',
  'runtime.integration.controls.fleet-primary-navigation',
  'runtime.integration.controls.navigate-primary-navigation',
  'runtime.integration.controls.dashboard-primary-navigation',
  'runtime.integration.controls.explore-primary-navigation',
  'runtime.integration.controls.dispatch-primary-navigation',
  'runtime-regression.device-plan.dashboard-weather-real-provider',
  'runtime-regression.device-plan.terrain-risk-native-profile',
  'runtime-regression.device-plan.draw-route-native-map-gesture',
  'runtime-regression.device-plan.guidance-snapping-field-gps',
  'runtime-regression.device-plan.navigate-layers-real-map-provider',
  'runtime-regression.device-plan.dispatch-canonical-native-route',
  'runtime-regression.device-plan.explore-real-catalog-readiness',
  'runtime-regression.device-plan.primary-controls-native-sweep',
  'runtime-regression.fast.dashboard-weather-live-ready',
  'runtime-regression.integration.dispatch-canonical-route-store-update',
  'runtime-regression.fast-core.runner',
  'runtime-regression.fast-core-scenarios.runner',
  'runtime-regression.integration-dispatch-explore-controls.runner',
]);

const REGISTERED_FAILURE_SAFE_CODES = new Set([
  'scenario_skipped',
  'device_evidence_required',
  'dashboard_weather_behavior_failed',
  'terrain_risk_behavior_failed',
  'draw_route_behavior_failed',
  'guidance_snapping_behavior_failed',
  'navigate_layers_behavior_failed',
  'dispatch_canonical_route_store_update_assertion_failed',
  'dispatch_canonical_route_store_update_timed_out',
  'explore_guidance_readiness_promotion_assertion_failed',
  'explore_guidance_readiness_promotion_timed_out',
  'explore_provider_failure_truth_assertion_failed',
  'explore_provider_failure_truth_timed_out',
  'interaction_primary_fleet_assertion_failed',
  'interaction_primary_fleet_timed_out',
  'interaction_primary_navigate_assertion_failed',
  'interaction_primary_navigate_timed_out',
  'interaction_primary_dashboard_assertion_failed',
  'interaction_primary_dashboard_timed_out',
  'interaction_primary_explore_assertion_failed',
  'interaction_primary_explore_timed_out',
  'interaction_primary_dispatch_assertion_failed',
  'interaction_primary_dispatch_timed_out',
  'runtime_child_timeout',
  'runtime_child_export_missing',
  'runtime_child_execution_failed',
  'runtime_child_output_missing',
  'runtime_child_missing',
  'runtime_child_output_invalid',
  'runtime_child_failed',
  'runtime_child_contract_invalid',
]);

export class RuntimeRegressionContractError extends Error {
  constructor(message, safeCode = 'runtime_result_contract_invalid') {
    super(message);
    this.name = 'RuntimeRegressionContractError';
    this.safeCode = safeCode;
  }
}

function objectValue(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RuntimeRegressionContractError(`${label} must be an object.`);
  }
  return value;
}

function hasUnsafeIdentityContent(value) {
  return (
    DECIMAL_OR_SIGNED_NUMBER.test(value)
    || COORDINATE_PAIR.test(value)
    || COORDINATE_MARKER.test(value)
    || COMPACT_COORDINATE.test(value)
    || SENSITIVE_MARKER.test(value)
    || CREDENTIAL_SHAPE.test(value)
    || LONG_OPAQUE_SEGMENT.test(value)
  );
}

function safeIdentity(value, label, pattern) {
  if (
    typeof value !== 'string'
    || value.length > 160
    || !pattern.test(value)
    || hasUnsafeIdentityContent(value)
  ) {
    throw new RuntimeRegressionContractError(
      `${label} must be a bounded symbolic identifier without coordinates, query data, or raw payload text.`,
    );
  }
  return value;
}

function registeredIdentity(value, label, registry, pattern) {
  const normalized = safeIdentity(value, label, pattern);
  if (!registry.has(normalized)) {
    throw new RuntimeRegressionContractError(
      `${label} is not registered for the runtime regression output contract.`,
    );
  }
  return normalized;
}

function safeCode(value, label, nullable = false) {
  if (nullable && value == null) return null;
  return registeredIdentity(value, label, REGISTERED_FAILURE_SAFE_CODES, SAFE_CODE);
}

function duration(value) {
  if (!Number.isInteger(value) || value < 0 || value > 86_400_000) {
    throw new RuntimeRegressionContractError('durationMs must be a nonnegative bounded integer.');
  }
  return value;
}

function evidenceList(value) {
  if (!Array.isArray(value)) {
    throw new RuntimeRegressionContractError('deviceEvidenceStillRequired must be an array.');
  }
  return [...new Set(value.map((entry) => (
    registeredIdentity(
      entry,
      'deviceEvidenceStillRequired entry',
      REGISTERED_EVIDENCE_IDS,
      SYMBOLIC_ID,
    )
  )))].sort();
}

export function normalizeScenarioResult(input) {
  const value = objectValue(input, 'Runtime regression scenario');
  const status = value.status;
  if (!STATUS_SET.has(status)) {
    throw new RuntimeRegressionContractError('status is not a supported runtime regression terminal state.');
  }
  const failureSafeCode = safeCode(value.failureSafeCode, 'failureSafeCode', true);
  if (status === 'passed' && failureSafeCode !== null) {
    throw new RuntimeRegressionContractError('A passed scenario must use a null failureSafeCode.');
  }
  if (status !== 'passed' && failureSafeCode === null) {
    throw new RuntimeRegressionContractError('A non-passing scenario must provide a failureSafeCode.');
  }
  return Object.freeze({
    scenario: registeredIdentity(
      value.scenario,
      'scenario',
      REGISTERED_SCENARIO_IDS,
      SYMBOLIC_ID,
    ),
    status,
    durationMs: duration(value.durationMs),
    sourceFixtureProvider: registeredIdentity(
      value.sourceFixtureProvider,
      'sourceFixtureProvider',
      REGISTERED_SOURCE_IDS,
      SOURCE_ID,
    ),
    failureSafeCode,
    deviceEvidenceStillRequired: evidenceList(value.deviceEvidenceStillRequired),
    qualifiedTestIdentity: registeredIdentity(
      value.qualifiedTestIdentity,
      'qualifiedTestIdentity',
      REGISTERED_QUALIFIED_TEST_IDS,
      QUALIFIED_TEST_ID,
    ),
  });
}

export function normalizeChildPayload(payload, options = {}) {
  const value = objectValue(payload, `Runtime regression child ${options.childIdentity ?? 'unknown'}`);
  const records = Array.isArray(value.results)
    ? value.results
    : Array.isArray(value.scenarios)
      ? value.scenarios
      : null;
  if (!records) {
    throw new RuntimeRegressionContractError('Runtime regression child output must contain results or scenarios.');
  }
  if (records.length === 0) {
    throw new RuntimeRegressionContractError('Runtime regression child output must contain at least one scenario.');
  }
  const normalized = records.map(normalizeScenarioResult);
  const scenarioIds = new Set();
  const qualifiedIds = new Set();
  for (const record of normalized) {
    if (scenarioIds.has(record.scenario)) {
      throw new RuntimeRegressionContractError(`Duplicate runtime scenario identity ${record.scenario}.`);
    }
    if (qualifiedIds.has(record.qualifiedTestIdentity)) {
      throw new RuntimeRegressionContractError(`Duplicate qualified test identity ${record.qualifiedTestIdentity}.`);
    }
    scenarioIds.add(record.scenario);
    qualifiedIds.add(record.qualifiedTestIdentity);
  }
  return normalized;
}

function normalizeChildRun(run) {
  const value = objectValue(run, 'Runtime regression child run');
  const status = value.status;
  if (!['passed', 'failed', 'timed_out'].includes(status)) {
    throw new RuntimeRegressionContractError('Child run status must be passed, failed, or timed_out.');
  }
  return Object.freeze({
    childIdentity: safeIdentity(value.childIdentity, 'childIdentity', SYMBOLIC_ID),
    status,
    durationMs: duration(value.durationMs),
    scenarioCount: duration(value.scenarioCount),
  });
}

export function buildRuntimeRegressionReport(options) {
  const lane = safeIdentity(options.lane, 'lane', SYMBOLIC_ID);
  const scenarios = options.scenarios.map(normalizeScenarioResult);
  if (scenarios.length === 0) {
    throw new RuntimeRegressionContractError(
      'A runtime regression report must contain at least one terminal scenario.',
      'runtime_report_empty',
    );
  }
  const childRuns = (options.childRuns ?? []).map(normalizeChildRun);
  const counts = {
    total: scenarios.length,
    passed: scenarios.filter((entry) => entry.status === 'passed').length,
    failed: scenarios.filter((entry) => entry.status === 'failed').length,
    timedOut: scenarios.filter((entry) => entry.status === 'timed_out').length,
    skipped: scenarios.filter((entry) => entry.status === 'skipped').length,
    blockedExternal: scenarios.filter((entry) => entry.status === 'blocked_external').length,
    deviceEvidenceRequired: scenarios.filter((entry) => entry.status === 'device_evidence_required').length,
    durationMs: duration(options.durationMs),
  };
  const status = counts.failed > 0 || counts.timedOut > 0 || counts.skipped > 0
    ? 'failed'
    : counts.blockedExternal > 0
      ? 'blocked_external'
      : counts.deviceEvidenceRequired > 0
        ? 'device_evidence_required'
        : 'passed';
  const generatedAt = options.generatedAt instanceof Date
    ? options.generatedAt.toISOString()
    : new Date(options.generatedAt).toISOString();
  return Object.freeze({
    schemaVersion: RUNTIME_REGRESSION_SCHEMA_VERSION,
    lane,
    generatedAt,
    status,
    productionApproval: 'not_granted_by_runtime_regression',
    summary: Object.freeze(counts),
    scenarios: Object.freeze(scenarios),
    childRuns: Object.freeze(childRuns),
  });
}
