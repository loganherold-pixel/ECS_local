export type ECSPerformanceWorkflowId =
  | 'cold_startup_shell'
  | 'warm_startup_restore'
  | 'auth_setup_handoff'
  | 'primary_tab_switch'
  | 'navigate_map_first_meaningful_render'
  | 'navigate_map_viewport_interaction'
  | 'gpx_import_preview'
  | 'route_preview_guidance'
  | 'dashboard_stable_grid'
  | 'explore_results'
  | 'dispatch_ready'
  | 'offline_prep_departure_audit'
  | 'active_vehicle_propagation'
  | 'weather_refresh'
  | 'device_reconnect';

export type ECSPerformanceEvidence =
  | 'ci_deterministic'
  | 'runtime_development'
  | 'device_required';

export type ECSPerformanceBudget = {
  workflowId: ECSPerformanceWorkflowId;
  label: string;
  primaryOperation: string;
  targetMs: number;
  hardLimitMs: number;
  maxRelativeRegressionPct: number;
  minSamplesForRelativeGate: number;
  maxRepeatedRequests?: number;
  maxDuplicateSubscriptions?: number;
  maxOutstandingJobs?: number;
  evidence: ECSPerformanceEvidence;
  notes: string;
};

function budget(
  value: ECSPerformanceBudget,
): ECSPerformanceBudget {
  return Object.freeze(value);
}

/**
 * Provisional supported-device budgets. Absolute values are warning rails until
 * Android and iOS field-device baselines exist; CI primarily enforces bounded
 * diagnostics and relative no-regression behavior.
 */
export const ECS_PERFORMANCE_BUDGETS: Readonly<Record<ECSPerformanceWorkflowId, ECSPerformanceBudget>> = Object.freeze({
  cold_startup_shell: budget({
    workflowId: 'cold_startup_shell', label: 'Cold startup to usable shell', primaryOperation: 'startup_to_usable_shell', targetMs: 5_000, hardLimitMs: 8_000,
    maxRelativeRegressionPct: 20, minSamplesForRelativeGate: 5, maxOutstandingJobs: 12, evidence: 'device_required',
    notes: 'Requires release-build Android and iOS startup traces.',
  }),
  warm_startup_restore: budget({
    workflowId: 'warm_startup_restore', label: 'Warm startup and route restoration', primaryOperation: 'startup_route_restoration', targetMs: 2_500, hardLimitMs: 4_000,
    maxRelativeRegressionPct: 20, minSamplesForRelativeGate: 5, maxOutstandingJobs: 8, evidence: 'device_required',
    notes: 'Measured when the app process and persisted route are restored.',
  }),
  auth_setup_handoff: budget({
    workflowId: 'auth_setup_handoff', label: 'Auth and setup handoff', primaryOperation: 'auth_restore_to_entry', targetMs: 2_500, hardLimitMs: 5_000,
    maxRelativeRegressionPct: 20, minSamplesForRelativeGate: 5, maxOutstandingJobs: 8, evidence: 'device_required',
    notes: 'Provider latency is reported separately from local shell work.',
  }),
  primary_tab_switch: budget({
    workflowId: 'primary_tab_switch', label: 'Primary tab switch', primaryOperation: 'command_dock_navigation', targetMs: 650, hardLimitMs: 1_200,
    maxRelativeRegressionPct: 15, minSamplesForRelativeGate: 10, maxOutstandingJobs: 4, evidence: 'device_required',
    notes: 'Fleet, Navigate, Dashboard, Explore, and Dispatch use the same dock measurement.',
  }),
  navigate_map_first_meaningful_render: budget({
    workflowId: 'navigate_map_first_meaningful_render', label: 'Navigate first meaningful map render', primaryOperation: 'mapbox_definitive_ready', targetMs: 4_000, hardLimitMs: 7_000,
    maxRelativeRegressionPct: 20, minSamplesForRelativeGate: 5, maxOutstandingJobs: 8, evidence: 'device_required',
    notes: 'Completes only on definitive Mapbox readiness, not the provisional bootstrap timeout.',
  }),
  navigate_map_viewport_interaction: budget({
    workflowId: 'navigate_map_viewport_interaction', label: 'Navigate viewport interaction settle', primaryOperation: 'gesture_to_viewport_reply', targetMs: 500, hardLimitMs: 1_000,
    maxRelativeRegressionPct: 15, minSamplesForRelativeGate: 20, maxRepeatedRequests: 1, maxOutstandingJobs: 8, evidence: 'device_required',
    notes: 'Measures drag or zoom start through the next viewport reply.',
  }),
  gpx_import_preview: budget({
    workflowId: 'gpx_import_preview', label: 'GPX import to preview ready', primaryOperation: 'parse_persist_stage_preview', targetMs: 2_500, hardLimitMs: 5_000,
    maxRelativeRegressionPct: 20, minSamplesForRelativeGate: 5, maxOutstandingJobs: 4, evidence: 'device_required',
    notes: 'File picker time is excluded; parsing, persistence, and preview staging are included.',
  }),
  route_preview_guidance: budget({
    workflowId: 'route_preview_guidance', label: 'Route preview to active guidance', primaryOperation: 'preview_to_active_overlay', targetMs: 2_000, hardLimitMs: 4_000,
    maxRelativeRegressionPct: 20, minSamplesForRelativeGate: 5, maxOutstandingJobs: 6, evidence: 'device_required',
    notes: 'Completes when the navigation overlay enters active mode.',
  }),
  dashboard_stable_grid: budget({
    workflowId: 'dashboard_stable_grid', label: 'Dashboard hydration to stable widget grid', primaryOperation: 'hydrate_to_usable_grid', targetMs: 1_500, hardLimitMs: 3_000,
    maxRelativeRegressionPct: 15, minSamplesForRelativeGate: 10, maxOutstandingJobs: 6, evidence: 'device_required',
    notes: 'Includes persisted layout restoration and the first usable grid render.',
  }),
  explore_results: budget({
    workflowId: 'explore_results', label: 'Explore result readiness', primaryOperation: 'initial_first_visible_result', targetMs: 1_000, hardLimitMs: 2_500,
    maxRelativeRegressionPct: 15, minSamplesForRelativeGate: 10, maxRepeatedRequests: 1, maxOutstandingJobs: 8, evidence: 'runtime_development',
    notes: 'Existing Explore diagnostics provide first-visible and full-list subspans.',
  }),
  dispatch_ready: budget({
    workflowId: 'dispatch_ready', label: 'Dispatch hydration and realtime readiness', primaryOperation: 'hydrate_and_realtime_ready', targetMs: 2_000, hardLimitMs: 4_000,
    maxRelativeRegressionPct: 20, minSamplesForRelativeGate: 5, maxDuplicateSubscriptions: 0, maxOutstandingJobs: 6, evidence: 'device_required',
    notes: 'Offline and intentionally disabled realtime states are labeled in metadata.',
  }),
  offline_prep_departure_audit: budget({
    workflowId: 'offline_prep_departure_audit', label: 'Offline Prep read and departure audit', primaryOperation: 'package_read_to_manifest_ready', targetMs: 1_500, hardLimitMs: 3_000,
    maxRelativeRegressionPct: 15, minSamplesForRelativeGate: 10, maxOutstandingJobs: 5, evidence: 'runtime_development',
    notes: 'Separately records package-read readiness and synchronous deterministic audit cost.',
  }),
  active_vehicle_propagation: budget({
    workflowId: 'active_vehicle_propagation', label: 'Active vehicle change propagation', primaryOperation: 'store_write_and_notify', targetMs: 500, hardLimitMs: 1_000,
    maxRelativeRegressionPct: 15, minSamplesForRelativeGate: 10, maxOutstandingJobs: 4, evidence: 'runtime_development',
    notes: 'Store listener notification is deterministic; device UI stabilization still needs profiling.',
  }),
  weather_refresh: budget({
    workflowId: 'weather_refresh', label: 'Weather refresh propagation', primaryOperation: 'operational_weather_provider', targetMs: 3_500, hardLimitMs: 8_000,
    maxRelativeRegressionPct: 25, minSamplesForRelativeGate: 10, maxRepeatedRequests: 1, maxOutstandingJobs: 4, evidence: 'device_required',
    notes: 'Network/provider time is retained and deduplicated joins are counted.',
  }),
  device_reconnect: budget({
    workflowId: 'device_reconnect', label: 'Bluetooth, OBD, or device reconnect lifecycle', primaryOperation: 'connection_attempt_lifecycle', targetMs: 10_000, hardLimitMs: 30_000,
    maxRelativeRegressionPct: 25, minSamplesForRelativeGate: 5, maxRepeatedRequests: 1, maxOutstandingJobs: 3, evidence: 'device_required',
    notes: 'CI can simulate lifecycle accounting; hardware handshake timing requires real devices.',
  }),
});

export const ECS_PERFORMANCE_WORKFLOW_IDS = Object.freeze(
  Object.keys(ECS_PERFORMANCE_BUDGETS) as ECSPerformanceWorkflowId[],
);

export function getECSPerformanceBudget(
  workflowId: ECSPerformanceWorkflowId,
): ECSPerformanceBudget {
  return ECS_PERFORMANCE_BUDGETS[workflowId];
}
