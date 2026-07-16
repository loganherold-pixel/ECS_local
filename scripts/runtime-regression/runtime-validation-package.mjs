import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  RELEASE_EVIDENCE_REGISTRY_CONTRACT,
  validateReleaseEvidenceRegistry,
} from '../verification/release-evidence-registry.mjs';
import {
  VERIFICATION_ARTIFACT_SCHEMAS,
  sanitizeVerificationArtifactText,
} from '../verification/verification-artifact-policy.mjs';
import { validateWorkflowArtifactPathInput } from '../verification/workflow-input-safety.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_REGISTRY_PATH = 'config/release-evidence-registry.json';
const DEFAULT_OUTPUT_PATH = '.smoke/verification/runtime-validation-package.json';
const DEFAULT_SUMMARY_PATH = '.smoke/verification/runtime-validation-package.md';
const SHA_PATTERN = /^[a-f0-9]{40}$/i;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/i;
const SYMBOLIC_ID_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const SAFE_CONTEXT_PATTERN = /^[a-z0-9][a-z0-9._ -]{0,79}$/i;
const COORDINATE_PAIR_PATTERN = /[-+]?\d{1,3}\.\d{2,}\s*[,; _-]\s*[-+]?\d{1,3}\.\d{2,}/;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const OPAQUE_IDENTIFIER_PATTERN = /(?:^|[._ -])[a-z0-9]{32,}(?:$|[._ -])/i;
const PLATFORMS = new Set(['android', 'ios']);
const COVERAGE_RELATIONSHIPS = new Set(['direct', 'conditional', 'provenance_only', 'related_review_only']);

export const RUNTIME_VALIDATION_PACKAGE_CONTRACT = 'ecs-runtime-validation-package-v1';
export const RUNTIME_VALIDATION_PACKAGE_VERSION = '2026-07-16.1';

export const RUNTIME_VALIDATION_PRIVACY_RESTRICTIONS = Object.freeze([
  'Keep raw screenshots, logs, GPS traces, route geometry, and provider payloads in privacy-approved restricted storage; do not commit or upload them as verification metadata.',
  'Crop or redact coordinates, route and trip names, expedition content, account or member identifiers, vehicle identifiers, and device identifiers before review.',
  'Strip screenshot metadata and EXIF before retention or sharing.',
  'Sanitize logs and manually review them for credentials, authorization headers, signed URLs, raw request or response bodies, and precise location data.',
  'Record only a reviewed safe summary, a SHA-256 evidence-packet digest, and a safe symbolic external reference in a later registry submission.',
  'Never record a device serial, IMEI, advertising identifier, raw push token, API key, service-role key, or provider credential.',
]);

function scenario(scenarioId, title, steps, expectedResult) {
  return Object.freeze({
    scenarioId,
    title,
    steps: Object.freeze(steps.map((step, index) => Object.freeze({
      stepId: `${scenarioId}_${index + 1}`,
      action: step[0],
      expectedResult: step[1],
    }))),
    expectedResult,
  });
}

function registryBinding(evidenceId, relationship, condition) {
  return Object.freeze({ evidenceId, relationship, condition });
}

export const RUNTIME_VALIDATION_PROCEDURE_DEFINITIONS = Object.freeze([
  Object.freeze({
    evidenceId: 'ecs.runtime.validation.dashboard_weather',
    title: 'Dashboard live weather',
    devicePlanScenario: 'dashboard_weather_real_provider',
    qualifiedTestIdentity: 'runtime-regression.device-plan.dashboard-weather-real-provider',
    sourceFixtureProvider: 'ecs_weather_edge_configured_provider',
    registryBindings: Object.freeze([
      registryBinding('provider_weather', 'conditional', 'The full registry scenario also requires the approved weather-alert path in the configured provider environment.'),
      registryBinding('provider_fallback', 'conditional', 'Only supports the provider-set requirement when the reviewed scope accepts weather as the exercised provider and all required environment fields match.'),
      registryBinding('mobile_permissions', 'conditional', 'This procedure covers the location-permission slice only; the full required native-permission set remains a separate registry condition.'),
      registryBinding('mobile_background_restoration', 'conditional', 'Only supports this requirement when the full background and foreground route-restoration scenario is also captured.'),
      registryBinding('field_build_provenance', 'provenance_only', 'The binary provenance must be reviewed and submitted separately.'),
    ]),
    scenarios: Object.freeze([
      scenario('online_live_provider', 'Online live provider', [
        ['Start the release binary with network available, the approved ECS weather Edge Function configured, and location permission granted.', 'The Dashboard weather consumer enters a bounded loading state and issues one ECS-owned provider request.'],
        ['Open Dashboard and wait through the configured request timeout.', 'The widget reaches a terminal live or provider-error state; it never remains indefinitely loading.'],
        ['Inspect provider and freshness labels.', 'A successful response is labeled live with the approved provider identity and is not presented as mock or cache data.'],
      ], 'Configured live weather reaches a truthful terminal live state without exposing provider credentials.'),
      scenario('provider_timestamp', 'Provider timestamp', [
        ['Compare the visible observation and forecast timestamps with the sanitized provider diagnostic.', 'The UI preserves provider validity time and displays a last-updated value consistent with the normalized response.'],
        ['Capture a sanitized widget screenshot and bounded diagnostic summary.', 'The evidence shows provider identity, source state, and timestamp without coordinates or raw payloads.'],
      ], 'Provider identity and normalized forecast timestamp are visible and internally consistent.'),
      scenario('location_permission', 'Location permission', [
        ['From a clean permission state, grant location permission and open Dashboard.', 'Coordinate-first local weather eligibility becomes available without requiring active guidance.'],
        ['Deny or revoke permission and repeat the refresh.', 'The UI reaches permission-required or documented fallback state and does not claim coordinate-local live weather.'],
        ['Grant permission again and retry.', 'One new request is issued and the terminal state recovers.'],
      ], 'Grant, denial or revocation, and recovery remain truthful and terminal.'),
      scenario('app_foreground_refresh', 'App foreground refresh', [
        ['Load a successful forecast, background the app until refresh policy is due, then foreground it.', 'The cached value remains labeled by freshness while one deduplicated refresh begins.'],
        ['Wait for refresh completion.', 'The timestamp and source update on success, or last-good data remains labeled cached or stale on failure.'],
      ], 'Foregrounding refreshes according to policy without a request storm or stale hydration suppression.'),
      scenario('offline_last_good_cache', 'Offline last-good cache', [
        ['Obtain one successful live forecast, then disable network and remount or foreground Dashboard.', 'The last-good forecast is preserved when policy permits and is explicitly labeled cached, stale, or offline.'],
        ['Retry while offline, then restore network and retry again.', 'Offline retry terminates truthfully; restored-network retry issues a real request and can return to live.'],
      ], 'Offline behavior preserves truthful last-good data and never renders provider failure as an empty success.'),
    ]),
    expectedResult: 'Dashboard weather transitions through bounded loading to live, cached or stale, permission-required, or provider-error states with provider and timestamp truth preserved.',
    screenshotRequirements: Object.freeze([
      'Capture the live widget with provider, source or freshness, and timestamp visible.',
      'Capture permission-required or documented fallback state without system account details.',
      'Capture offline last-good state with cached or stale labeling and no private location text.',
    ]),
    logRequirements: Object.freeze([
      'Record a sanitized weather diagnostic summary containing surface ID, terminal status, provider symbolic ID, elapsed time, result count, and safe error code only.',
      'Record foreground refresh request count and dedupe outcome without request URL, coordinates, headers, or payload.',
    ]),
  }),
  Object.freeze({
    evidenceId: 'ecs.runtime.validation.terrain_risk',
    title: 'Terrain Risk elevation profile',
    devicePlanScenario: 'terrain_risk_native_profile',
    qualifiedTestIdentity: 'runtime-regression.device-plan.terrain-risk-native-profile',
    sourceFixtureProvider: 'stored_canonical_route_elevation',
    registryBindings: Object.freeze([
      registryBinding('field_active_guidance', 'conditional', 'Supports only the guidance and progress portion; the registry also requires restoration, completion, and cancellation.'),
      registryBinding('field_build_provenance', 'provenance_only', 'The binary provenance must be reviewed and submitted separately.'),
    ]),
    scenarios: Object.freeze([
      scenario('imported_route_with_elevation', 'Imported route with elevation', [
        ['Import an approved sanitized route fixture containing valid distance-ordered elevation samples.', 'Terrain Risk renders a mountain profile derived from those samples, with source and confidence visible.'],
        ['Compare at least the start, a peak, a valley, and the end against fixture expectations.', 'Graph ordering and relative elevation match the fixture; no invented samples appear.'],
      ], 'The graph shape corresponds to real route elevation samples and preserves peaks and valleys.'),
      scenario('active_guidance', 'Active guidance', [
        ['Start guidance on the imported route and open the compact widget and detail sheet.', 'The same route identity and elevation source feed both presentations.'],
        ['Inspect completed and remaining profile styling.', 'Completed and remaining profile are distinct without implying elevation equals technical difficulty.'],
      ], 'Active guidance uses route analysis and elevation data rather than route-presence-only graphics.'),
      scenario('progress_movement', 'Progress movement', [
        ['Advance the deterministic GPS or route-progress simulator along the canonical route.', 'The progress marker and completed profile move monotonically along the profile.'],
        ['Observe profile processing diagnostics before and after progress updates.', 'Unchanged elevation samples are not fully rebuilt for every GPS update.'],
      ], 'Progress moves while the unchanged profile geometry remains stable.'),
      scenario('orientation_change', 'Orientation change', [
        ['Rotate from phone portrait to landscape and back while guidance remains active.', 'The compact card and detail sheet remain readable, unclipped, and bound to the same route and profile.'],
      ], 'Orientation changes preserve the truthful profile and current progress.'),
      scenario('route_without_elevation', 'Route without elevation', [
        ['Replace the active route with valid canonical geometry that has no elevation samples.', 'The widget explicitly reports elevation profile unavailable and does not fabricate a mountain graph.'],
        ['Inspect any remaining risk text.', 'Terrain risk text appears only when deterministic analysis supports it and names the missing-data reason.'],
      ], 'Active guidance without elevation produces an explicit unavailable state, not a fake graph.'),
    ]),
    expectedResult: 'Terrain Risk renders only evidence-backed elevation profiles, tracks route progress, survives orientation changes, and reports missing elevation explicitly.',
    screenshotRequirements: Object.freeze([
      'Capture portrait and landscape profile states with route names and coordinates redacted.',
      'Capture the progress marker at two sanitized route-progress positions.',
      'Capture the no-elevation unavailable state.',
    ]),
    logRequirements: Object.freeze([
      'Record only route identity as a safe test-fixture token, elevation sample count, downsample count, source state, confidence, and progress fraction.',
      'Do not retain GPX, GeoJSON, polyline, or raw elevation payloads in the validation package.',
    ]),
  }),
  Object.freeze({
    evidenceId: 'ecs.runtime.validation.gps_route_alignment',
    title: 'GPS route alignment',
    devicePlanScenario: 'guidance_snapping_field_gps',
    qualifiedTestIdentity: 'runtime-regression.device-plan.guidance-snapping-field-gps',
    sourceFixtureProvider: 'physical_gps_and_stored_canonical_route',
    registryBindings: Object.freeze([
      registryBinding('field_active_guidance', 'conditional', 'Supports alignment and off-route behavior; the full active-guidance registry scenario must be captured before submission.'),
      registryBinding('mobile_offline_navigation', 'conditional', 'This procedure covers canonical alignment through network loss; the complete active-navigation network-loss scenario and both target platforms remain required.'),
      registryBinding('field_no_network', 'conditional', 'Only supports this requirement when the broader no-network operational run is captured.'),
      registryBinding('field_build_provenance', 'provenance_only', 'The binary provenance must be reviewed and submitted separately.'),
    ]),
    scenarios: Object.freeze([
      scenario('on_route_simulation', 'On-route drive or walk simulation', [
        ['Load a stored canonical route and begin guidance with raw breadcrumb shown as a separate optional overlay.', 'Completed and remaining guidance lines are split from canonical route geometry.'],
        ['Move along the route within bounded accuracy and tolerance.', 'Projected progress stays on the canonical line without replacing the raw GPS sample.'],
      ], 'Visible guidance alignment uses canonical geometry and continuous projected progress.'),
      scenario('off_route_deviation', 'Off-route deviation', [
        ['Move beyond the accepted snap tolerance in a controlled area.', 'Guidance enters an explicit off-route state rather than forcing progress onto the route.'],
        ['Return within a plausible segment and continuity window.', 'Progress recovers deterministically without a material backward jump.'],
      ], 'Off-route distance is truthful and recovery is continuity-aware.'),
      scenario('switchback_parallel_segment', 'Switchback or parallel-road segment', [
        ['Traverse a sanitized switchback or parallel-segment test route.', 'Nearest plausible segment selection favors continuity and does not jump to an adjacent leg.'],
        ['Pass an intersection or self-crossing if the approved fixture supports it.', 'Segment choice remains deterministic from prior progress and route direction.'],
      ], 'Parallel or crossing geometry does not cause implausible progress jumps.'),
      scenario('poor_gps_accuracy', 'Poor GPS accuracy', [
        ['Feed or observe a location sample with poor reported accuracy.', 'Snap tolerance remains bounded and the UI becomes degraded or off-route when confidence is insufficient.'],
      ], 'Poor accuracy cannot create a false precise snap.'),
      scenario('offline_guidance', 'Offline guidance', [
        ['Start guidance while online, confirm canonical geometry is stored, then disable network.', 'Active guidance continues from stored canonical geometry through network loss.'],
        ['Continue on route and then deviate off route.', 'Canonical split and off-route behavior remain truthful without provider calls.'],
      ], 'Offline guidance uses stored canonical geometry and reaches explicit degraded states when geometry is insufficient.'),
    ]),
    expectedResult: 'Guidance overlays remain on canonical route geometry, raw GPS remains separate, progress is continuity-aware, and out-of-tolerance locations produce off-route state.',
    screenshotRequirements: Object.freeze([
      'Capture canonical, completed, remaining, projected-position, and optional raw-breadcrumb overlays with identifying map labels and coordinates removed.',
      'Capture explicit off-route and poor-accuracy states.',
    ]),
    logRequirements: Object.freeze([
      'Record only safe route-fixture ID, selected segment index, progress fraction, rounded or bucketed accuracy class, snap decision, and safe error code.',
      'Keep raw location samples and route traces outside repository and uploaded verification artifacts.',
    ]),
  }),
  Object.freeze({
    evidenceId: 'ecs.runtime.validation.draw_route',
    title: 'Draw Route draft visibility',
    devicePlanScenario: 'draw_route_native_map_gesture',
    qualifiedTestIdentity: 'runtime-regression.device-plan.draw-route-native-map-gesture',
    sourceFixtureProvider: 'mapbox_native_draft_source',
    registryBindings: Object.freeze([
      registryBinding('provider_mapbox', 'conditional', 'Only supports the provider requirement when the configured Mapbox services scenario is also captured.'),
      registryBinding('mobile_map_responsiveness', 'conditional', 'Only supports the responsiveness requirement when pan, zoom, and common overlays are measured.'),
      registryBinding('field_build_provenance', 'provenance_only', 'The binary provenance must be reviewed and submitted separately.'),
    ]),
    scenarios: Object.freeze([
      scenario('draw_points', 'Draw points', [
        ['Open Draw Route and add one valid point, then a second valid point.', 'Builder state records raw draft points without creating active-guidance state.'],
        ['Add additional valid points.', 'The draft geometry updates while unrelated map sources remain stable.'],
      ], 'Valid points update one stable draft source.'),
      scenario('immediate_line', 'Immediate line', [
        ['Before opening preview, inspect the map after the second point.', 'A visually distinct draft line is visible immediately.'],
      ], 'Two valid points produce visible draft geometry before preview or guidance.'),
      scenario('undo', 'Undo', [
        ['Undo the latest point, then redo it when supported.', 'The visible draft line and builder state update together without duplicate sources.'],
      ], 'Undo and redo remain synchronized with visible draft geometry.'),
      scenario('preview', 'Preview', [
        ['Open guidance preview and return to the builder.', 'Preview does not create a conflicting duplicate route source; draft lifecycle follows documented preservation or finalization behavior.'],
      ], 'Preview transition preserves a single coherent draft or finalized route source.'),
      scenario('cancel', 'Cancel', [
        ['Cancel the draft from the builder or sheet.', 'Draft points, draft line, and draft-only markers are removed while active guidance remains untouched.'],
      ], 'Cancel cleans up only draft geometry.'),
      scenario('map_style_change', 'Map style change', [
        ['Create a two-point draft, change or reload map style, and wait for style readiness.', 'The stable draft source and layer are restored before preview without becoming guidance-ready.'],
      ], 'Map style changes restore the draft source and preserve route-role separation.'),
    ]),
    expectedResult: 'A stable, distinct draft line appears before preview, follows undo or cancel, survives style changes, and never overwrites canonical or active guidance routes.',
    screenshotRequirements: Object.freeze([
      'Capture the two-point draft before preview and after undo with map labels and coordinates removed.',
      'Capture the restored draft after a style change.',
    ]),
    logRequirements: Object.freeze([
      'Record safe draft source and layer IDs, point count, drawable feature count, lifecycle role, and style-reload restoration outcome.',
      'Do not retain drawn coordinates, GeoJSON, or route names in the validation package.',
    ]),
  }),
  Object.freeze({
    evidenceId: 'ecs.runtime.validation.navigate_layers',
    title: 'MVUM and ECS Route Geometry layers',
    devicePlanScenario: 'navigate_layers_real_map_provider',
    qualifiedTestIdentity: 'runtime-regression.device-plan.navigate-layers-real-map-provider',
    sourceFixtureProvider: 'mapbox_and_ecs_route_catalog_edge',
    registryBindings: Object.freeze([
      registryBinding('provider_route_catalog', 'conditional', 'Supports geometry detail; catalog search and pagination must also be captured for the full registry scenario.'),
      registryBinding('provider_mapbox', 'conditional', 'Supports map rendering; geocoding and directions remain separate parts of the registry scenario.'),
      registryBinding('provider_fallback', 'conditional', 'Only supports this requirement when a genuine provider failure and truthful last-good fallback are captured.'),
      registryBinding('mobile_map_responsiveness', 'conditional', 'This procedure captures pan, zoom, bounded requests, and both overlays; reviewed readiness and interaction timing thresholds remain required.'),
      registryBinding('field_build_provenance', 'provenance_only', 'The binary provenance must be reviewed and submitted separately.'),
    ]),
    scenarios: Object.freeze([
      scenario('enable_layers', 'Enable', [
        ['Enable MVUM Segments, then ECS Route Geometry, and observe each diagnostic independently.', 'Each layer has independent enabled, eligibility, request, source, and terminal state.'],
        ['Disable one layer during a request.', 'That layer cancels or supersedes its work without contaminating the other layer state.'],
      ], 'Both overlays can run simultaneously without shared loading-state contamination.'),
      scenario('zoom_eligibility', 'Zoom', [
        ['Move below and above each documented zoom threshold.', 'Below-threshold state is zoom-deferred, not loading; eligible zoom can issue a bounded request.'],
      ], 'Zoom eligibility is explicit and terminal.'),
      scenario('pan_and_supersede', 'Pan', [
        ['Pan rapidly across several eligible viewports and then stop.', 'Older fingerprints are cancelled or ignored and request count remains bounded.'],
        ['Inspect the final source state.', 'Only the newest viewport result can update drawable GeoJSON.'],
      ], 'Rapid pan and zoom cannot allow stale responses to overwrite the final viewport.'),
      scenario('online_load', 'Online load', [
        ['With Mapbox and ECS provider configuration available, enable both overlays in an approved coverage area.', 'Each layer reaches ready, empty, degraded, or error within its timeout and exposes feature and invalid-feature counts.'],
      ], 'Online requests reach explicit terminal states and valid geometry renders with stable unique IDs.'),
      scenario('no_result_area', 'No-result area', [
        ['Move to an approved area with a valid empty provider result.', 'Each relevant layer reaches empty with zero drawable features and no spinner.'],
      ], 'Valid empty is distinct from provider failure.'),
      scenario('provider_failure', 'Provider failure', [
        ['Use an approved staging failure control or unavailable-provider fixture.', 'Affected layer reaches error or degraded with a safe code; the other layer remains independent.'],
        ['Activate retry after restoring provider availability.', 'Retry creates a new request and can reach a terminal success or empty state.'],
      ], 'Provider failure terminates and retry performs real work.'),
      scenario('offline_cache', 'Offline cache', [
        ['Prime a valid fingerprinted cache, disable network, and revisit the matching viewport.', 'The layer renders cache data with offline and freshness labeling.'],
        ['Visit an uncached viewport while offline.', 'The layer reports offline unavailable rather than loading indefinitely or showing false empty.'],
      ], 'Offline cache hit and miss remain distinct and terminal.'),
    ]),
    expectedResult: 'MVUM and Route Geometry remain independent, supersede stale viewports, render stable sources, and terminate as ready, empty, deferred, degraded, offline unavailable, cancelled, or error.',
    screenshotRequirements: Object.freeze([
      'Capture both overlays enabled with their independent terminal source states.',
      'Capture zoom-deferred, valid-empty, provider-error, offline-cache-hit, and offline-cache-miss states.',
    ]),
    logRequirements: Object.freeze([
      'Record one sanitized layer diagnostic per transition: layer ID, enabled, eligibility, zoom bucket, request fingerprint token, status, source, feature count, invalid feature count, cache hit, safe error code, and elapsed time.',
      'Record bounded request and cancellation counts for the rapid-pan scenario without bounds, coordinates, request URLs, or raw features.',
    ]),
  }),
  Object.freeze({
    evidenceId: 'ecs.runtime.validation.dispatch',
    title: 'Dispatch canonical runtime',
    devicePlanScenario: 'dispatch_canonical_native_route',
    qualifiedTestIdentity: 'runtime-regression.device-plan.dispatch-canonical-native-route',
    sourceFixtureProvider: 'canonical_dispatch_store_and_route',
    registryBindings: Object.freeze([
      registryBinding('dispatch_outbox_replay', 'conditional', 'Only supports this requirement when an offline write is queued and replayed after reconnect using isolated identities and Supabase staging.'),
      registryBinding('field_build_provenance', 'provenance_only', 'The binary provenance must be reviewed and submitted separately.'),
    ]),
    scenarios: Object.freeze([
      scenario('open_from_command_dock', 'Open from CommandDock', [
        ['Launch the release binary and open Dispatch from CommandDock.', 'The registered Dispatch route mounts without a dead route or legacy fallback.'],
      ], 'CommandDock reaches the canonical Dispatch entry.'),
      scenario('confirm_current_implementation', 'Confirm current implementation', [
        ['Inspect the stable flagship test ID or current approved heading.', 'The canonical current Dispatch component is present and the legacy command center is absent.'],
        ['Restore or deep-link to the Dispatch route.', 'The same canonical module identity mounts.'],
      ], 'Direct, restored, and dock navigation resolve to one canonical implementation.'),
      scenario('create_update_local_command', 'Create or update local command', [
        ['Create or update an approved local command once.', 'One authoritative Dispatch mutation occurs and visible state rerenders.'],
        ['Tap the action rapidly while it is busy.', 'Duplicate mutation is prevented and the busy state terminates.'],
      ], 'A meaningful mutation reaches the authoritative store and visible canonical component once.'),
      scenario('offline_state', 'Offline state', [
        ['Disable network, create an approved offline-capable command, and observe terminal feedback.', 'The UI truthfully shows queued, local-only, or unavailable behavior; it does not claim server acknowledgment.'],
        ['When the workflow supports outbox replay, restore network and observe reconciliation.', 'One queued mutation replays idempotently and reaches an explicit acknowledged or error state.'],
      ], 'Offline behavior is truthful; conditional outbox evidence includes reconnect and replay.'),
      scenario('active_expedition_switch', 'Active expedition switch', [
        ['Switch from one sanitized test expedition to another while Dispatch remains mounted.', 'Subscriptions and selectors replace their scope and the visible command state updates to the new expedition.'],
        ['Switch back or clear the active expedition.', 'Old-expedition updates do not overwrite the current scope and no-active-expedition state is explicit.'],
      ], 'Active expedition changes propagate without stale subscription or legacy-screen fallback.'),
    ]),
    expectedResult: 'CommandDock and restored routes mount one canonical Dispatch implementation whose authoritative state updates, offline outcomes, and expedition scope are visible and terminal.',
    screenshotRequirements: Object.freeze([
      'Capture the canonical Dispatch stable identity after CommandDock navigation and route restoration.',
      'Capture pre-mutation and post-mutation state plus offline terminal feedback with expedition and member details redacted.',
      'Capture the active-expedition switch using safe fixture labels only.',
    ]),
    logRequirements: Object.freeze([
      'Record canonical module test ID, route alias token, safe expedition fixture token, mutation action token, dedupe count, outbox state, and safe error code.',
      'Do not retain command content, member identities, realtime payloads, auth/session data, or raw Supabase request and response bodies.',
    ]),
  }),
  Object.freeze({
    evidenceId: 'ecs.runtime.validation.explore',
    title: 'Explore guidance-ready routes',
    devicePlanScenario: 'explore_real_catalog_readiness',
    qualifiedTestIdentity: 'runtime-regression.device-plan.explore-real-catalog-readiness',
    sourceFixtureProvider: 'approved_route_catalog_provider',
    registryBindings: Object.freeze([
      registryBinding('provider_route_catalog', 'conditional', 'Supports discovery and geometry handoff; include catalog pagination for the full registry scenario.'),
      registryBinding('provider_mapbox', 'conditional', 'Only supports the provider requirement when the approved map preview and directions services are exercised.'),
      registryBinding('provider_legal_access', 'related_review_only', 'Legal-access authority remains a separate provider review and cannot be inferred from route geometry.'),
      registryBinding('field_build_provenance', 'provenance_only', 'The binary provenance must be reviewed and submitted separately.'),
    ]),
    scenarios: Object.freeze([
      scenario('guidance_ready_route', 'Guidance-ready route', [
        ['Open Explore in an approved catalog area and record sanitized provider, normalized, deduplicated, filtered, not-ready, and ready counts.', 'At least one route that satisfies geometry, access, safety, moderation, source, vehicle, and current-condition requirements appears in Guidance Ready.'],
        ['Inspect a known excluded route.', 'It remains excluded with one or more typed reasons and is not promoted merely to populate the UI.'],
      ], 'Qualified routes appear while excluded routes retain truthful safety and source reasons.'),
      scenario('filters_reset', 'Filters reset', [
        ['Apply supported filters, then activate Reset Filters.', 'Persisted valid filters clear once and list counts update.'],
        ['Restore a legacy or invalid persisted filter fixture if supported.', 'Migration drops invalid values and does not silently hide all routes.'],
      ], 'Filter reset and migration expose routes without bypassing readiness rules.'),
      scenario('geometry_detail', 'Geometry detail', [
        ['Select a summary route whose readiness requires detail geometry.', 'A deduplicated bounded detail request begins for that route rather than blocking the whole section.'],
        ['Wait for valid detail completion.', 'The route can move from pending or not-ready to ready when all other requirements remain satisfied.'],
      ], 'Geometry detail completion can promote only an otherwise qualified route.'),
      scenario('route_preview', 'Route preview', [
        ['Open preview for a guidance-ready route.', 'Canonical geometry and truthful source or readiness state render without exposing restricted geometry.'],
        ['Return to Explore.', 'Pagination, filters, counts, and normalized route identity remain stable.'],
      ], 'Preview uses approved canonical geometry and preserves Explore state.'),
      scenario('navigate_handoff', 'Navigate handoff', [
        ['Activate Navigate handoff from the approved ready route.', 'The staged route identity and canonical geometry reach Navigate through the supported handoff.'],
        ['Attempt the same action for a route with a blocking exclusion reason.', 'Handoff remains hidden or disabled with a reason and does not mutate active guidance.'],
      ], 'Only guidance-ready routes can stage navigation handoff.'),
    ]),
    expectedResult: 'Explore shows qualified guidance-ready routes, explains exclusions, resets valid filters, deliberately loads geometry detail, previews approved geometry, and gates Navigate handoff.',
    screenshotRequirements: Object.freeze([
      'Capture ready, filtered, not-ready, and geometry-pending counts without route names or map coordinates.',
      'Capture one guidance-ready card and one typed exclusion reason using approved sanitized fixtures.',
      'Capture preview and Navigate handoff readiness without partner-restricted geometry.',
    ]),
    logRequirements: Object.freeze([
      'Record sanitized count transitions across provider, normalization, dedupe, filtering, geometry pending, not-ready, and ready stages.',
      'Record safe route fixture tokens and typed exclusion reason codes only; omit geometry, search bounds, provider payloads, and user filter values that reveal location.',
    ]),
  }),
]);

function fail(message, safeCode = 'runtime_validation_package_invalid') {
  const error = new Error(message);
  error.safeCode = safeCode;
  throw error;
}

function safeRepositoryPath(rootDir, value, field) {
  if (typeof value !== 'string' || !value.trim() || value.length > 240 || /[\u0000-\u001f\u007f]/.test(value)) {
    fail(`${field} must be a bounded repository-relative path.`);
  }
  const normalized = value.trim().replaceAll('\\', '/').replace(/^\.\//, '');
  if (path.isAbsolute(normalized) || path.win32.isAbsolute(normalized)
    || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    fail(`${field} must remain inside the repository.`);
  }
  const absolute = path.resolve(rootDir, ...normalized.split('/'));
  const relative = path.relative(rootDir, absolute);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail(`${field} must remain inside the repository.`);
  }
  return { normalized, absolute };
}

function requiredSymbolicId(value, field) {
  if (typeof value !== 'string' || value.length > 160 || !SYMBOLIC_ID_PATTERN.test(value)) {
    fail(`${field} must be a bounded symbolic identifier.`);
  }
  return value;
}

function optionalContextValue(value, field) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !SAFE_CONTEXT_PATTERN.test(value)
    || COORDINATE_PAIR_PATTERN.test(value)
    || UUID_PATTERN.test(value)
    || OPAQUE_IDENTIFIER_PATTERN.test(value)
    || /(?:serial|imei|uuid|token|secret|password|authorization|api[_ -]?key|https?:|\/)/i.test(value)) {
    fail(`${field} must be safe descriptive metadata and must not contain an identifier, credential, URL, or path.`);
  }
  return value.trim();
}

function exactObjectFields(value, allowedFields, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${field} must be an object.`);
  }
  const unexpected = Object.keys(value).filter((key) => !allowedFields.has(key));
  if (unexpected.length > 0) fail(`${field} contains unsupported fields.`);
}

function loadRegistry(rootDir, registryPath, suppliedRegistry) {
  if (suppliedRegistry) return validateReleaseEvidenceRegistry(suppliedRegistry);
  const resolved = safeRepositoryPath(rootDir, registryPath, 'registry path');
  if (!fs.existsSync(resolved.absolute) || !fs.statSync(resolved.absolute).isFile()) {
    fail('The authoritative release evidence registry is unavailable.', 'runtime_validation_registry_missing');
  }
  return validateReleaseEvidenceRegistry(JSON.parse(fs.readFileSync(resolved.absolute, 'utf8')));
}

function normalizeArtifactBinding(provenance, context = {}) {
  const suppliedContext = [context.platform, context.osVersion, context.deviceModel, context.providerEnvironment]
    .some((value) => value != null && value !== '');
  if (!provenance && !suppliedContext) {
    return Object.freeze({
      state: 'required_before_execution',
      exactBuildSha: null,
      binaryArtifactDigest: null,
      platform: null,
      osVersion: null,
      device: Object.freeze({ model: null, hardwareIdentifierRecorded: false }),
      providerEnvironment: null,
      provenanceContract: VERIFICATION_ARTIFACT_SCHEMAS.PROVENANCE,
      provenanceReference: null,
    });
  }
  if (!provenance) fail('A bound package requires release-binary artifact provenance.', 'runtime_validation_provenance_required');
  exactObjectFields(provenance, new Set([
    'schemaVersion',
    'artifactPolicy',
    'generatedAt',
    'commandId',
    'workspaceId',
    'artifact',
    'ci',
    'productionApproval',
  ]), 'artifact provenance');
  exactObjectFields(provenance.artifactPolicy, new Set([
    'audience',
    'policyVersion',
    'rawFieldDataAllowed',
    'retentionDays',
  ]), 'artifact provenance policy');
  exactObjectFields(provenance.artifact, new Set([
    'id',
    'kind',
    'fileCount',
    'sizeBytes',
    'sha256',
  ]), 'artifact provenance artifact');
  exactObjectFields(provenance.ci, new Set([
    'provider',
    'runId',
    'runAttempt',
    'sourceCommit',
  ]), 'artifact provenance CI binding');
  if (provenance.schemaVersion !== VERIFICATION_ARTIFACT_SCHEMAS.PROVENANCE
    || provenance.artifactPolicy?.audience !== 'release_candidate'
    || provenance.artifactPolicy?.rawFieldDataAllowed !== false
    || provenance.artifact?.id !== 'supplied-release-artifact'
    || provenance.artifact?.kind !== 'release-binary'
    || provenance.productionApproval !== 'not_granted_by_artifact_creation') {
    fail('The release-binary provenance contract or identity is invalid.', 'runtime_validation_provenance_invalid');
  }
  if (!Number.isInteger(provenance.artifact.fileCount) || provenance.artifact.fileCount < 1
    || !Number.isInteger(provenance.artifact.sizeBytes) || provenance.artifact.sizeBytes < 1) {
    fail('Release-binary provenance must describe at least one nonempty artifact file.', 'runtime_validation_provenance_invalid');
  }
  if (typeof provenance.ci?.sourceCommit !== 'string' || !SHA_PATTERN.test(provenance.ci.sourceCommit)) {
    fail('Release-binary provenance must contain an exact 40-character source commit.', 'runtime_validation_build_sha_missing');
  }
  if (typeof provenance.artifact?.sha256 !== 'string' || !DIGEST_PATTERN.test(provenance.artifact.sha256)) {
    fail('Release-binary provenance must contain a SHA-256 artifact digest.', 'runtime_validation_binary_digest_missing');
  }
  if (!PLATFORMS.has(context.platform)) {
    fail('A bound package requires platform android or ios.', 'runtime_validation_platform_missing');
  }
  const osVersion = optionalContextValue(context.osVersion, 'osVersion');
  const deviceModel = optionalContextValue(context.deviceModel, 'deviceModel');
  const providerEnvironment = optionalContextValue(context.providerEnvironment, 'providerEnvironment');
  if (!osVersion) fail('A bound package requires an OS version.', 'runtime_validation_os_version_missing');
  if (!deviceModel) fail('A bound package requires a safe device model.', 'runtime_validation_device_model_missing');
  if (!providerEnvironment || !SYMBOLIC_ID_PATTERN.test(providerEnvironment)) {
    fail('A bound package requires a symbolic provider environment.', 'runtime_validation_provider_environment_missing');
  }
  return Object.freeze({
    state: 'collection_ready_not_executed',
    exactBuildSha: provenance.ci.sourceCommit.toLowerCase(),
    binaryArtifactDigest: provenance.artifact.sha256.toLowerCase(),
    platform: context.platform,
    osVersion,
    device: Object.freeze({ model: deviceModel, hardwareIdentifierRecorded: false }),
    providerEnvironment,
    provenanceContract: provenance.schemaVersion,
    provenanceReference: 'supplied-release-artifact',
  });
}

function actualResultTemplate() {
  return Object.freeze({
    executionStatus: 'not_run',
    observedResult: null,
    stepResults: Object.freeze([]),
    failureSafeCode: null,
    evidencePacketDigest: null,
    evidencePacketReference: null,
    collectionStartedAt: null,
    collectionCompletedAt: null,
  });
}

function bindRegistryRequirements(definition, registryById) {
  return Object.freeze(definition.registryBindings.map((binding, index) => {
    requiredSymbolicId(binding.evidenceId, `${definition.evidenceId}.registryBindings[${index}].evidenceId`);
    if (!COVERAGE_RELATIONSHIPS.has(binding.relationship)) {
      fail(`${definition.evidenceId} has an unsupported registry relationship.`);
    }
    const requirement = registryById.get(binding.evidenceId);
    if (!requirement) {
      fail(`Unknown release evidence requirement ${binding.evidenceId}.`, 'runtime_validation_registry_binding_missing');
    }
    return Object.freeze({
      evidenceId: requirement.evidenceId,
      relationship: binding.relationship,
      condition: binding.condition,
      requiredScenario: requirement.requiredScenario,
      evidenceClass: requirement.evidenceClass,
      targetPlatform: requirement.targetPlatform,
      ownerRole: requirement.ownerRole,
      reviewerRole: requirement.reviewerRole,
      bindingRequirements: requirement.bindingRequirements,
      revalidationPolicy: requirement.revalidationPolicy,
      canAutoResolveRequirement: false,
      submissionCreated: false,
    });
  }));
}

function buildRevalidationPolicy(bindings) {
  const registryPolicies = bindings.map((binding) => ({
    evidenceId: binding.evidenceId,
    mode: binding.revalidationPolicy.mode,
    maxAgeDays: binding.revalidationPolicy.maxAgeDays,
  }));
  return Object.freeze({
    expiresAt: null,
    maxAgeDays: Math.min(...registryPolicies.map((entry) => entry.maxAgeDays)),
    revalidateOn: Object.freeze([...new Set(registryPolicies.flatMap((entry) => {
      if (entry.mode === 'per_build') return ['new_build', 'max_age'];
      if (entry.mode === 'on_provider_change') return ['provider_change', 'max_age'];
      if (entry.mode === 'on_migration_change') return ['migration_change', 'max_age'];
      if (entry.mode === 'per_release') return ['new_release', 'max_age'];
      return [entry.mode, 'max_age'];
    }))].sort()),
    registryPolicies: Object.freeze(registryPolicies),
    note: 'Expiration starts only after evidence is executed, collected, and dated; procedure generation does not start an acceptance or expiry window.',
  });
}

function buildProcedure(definition, artifactBinding, registryById) {
  requiredSymbolicId(definition.evidenceId, 'procedure evidenceId');
  const releaseEvidenceBindings = bindRegistryRequirements(definition, registryById);
  const reviewerRoles = [...new Set(releaseEvidenceBindings.map((binding) => binding.reviewerRole))].sort();
  return Object.freeze({
    evidenceId: definition.evidenceId,
    title: definition.title,
    devicePlanScenario: definition.devicePlanScenario,
    qualifiedTestIdentity: definition.qualifiedTestIdentity,
    sourceFixtureProvider: definition.sourceFixtureProvider,
    status: 'not_executed',
    executionClaim: 'plan_only_not_executed',
    acceptanceState: 'not_submitted',
    exactBuildSha: artifactBinding.exactBuildSha,
    binaryArtifactDigest: artifactBinding.binaryArtifactDigest,
    platform: artifactBinding.platform,
    osVersion: artifactBinding.osVersion,
    device: artifactBinding.device,
    providerEnvironment: artifactBinding.providerEnvironment,
    scenarioSteps: Object.freeze(definition.scenarios.map((entry) => Object.freeze({
      ...entry,
      actualResult: actualResultTemplate(),
    }))),
    expectedResult: definition.expectedResult,
    actualResult: actualResultTemplate(),
    sanitizedScreenshotRequirements: definition.screenshotRequirements,
    sanitizedLogRequirements: definition.logRequirements,
    privacyRestrictions: RUNTIME_VALIDATION_PRIVACY_RESTRICTIONS,
    reviewer: Object.freeze({
      name: null,
      requiredRoles: Object.freeze(reviewerRoles),
      decision: 'pending',
      reviewedAt: null,
      notes: null,
    }),
    expirationRevalidationPolicy: buildRevalidationPolicy(releaseEvidenceBindings),
    releaseEvidenceBindings,
    productionApproval: 'not_granted_by_runtime_validation',
  });
}

export function buildRuntimeValidationPackage(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? ROOT);
  const registryPath = options.registryPath ?? DEFAULT_REGISTRY_PATH;
  const registry = loadRegistry(rootDir, registryPath, options.registry);
  const artifactBinding = normalizeArtifactBinding(options.artifactProvenance, options.captureContext);
  const definitions = options.procedureDefinitions ?? RUNTIME_VALIDATION_PROCEDURE_DEFINITIONS;
  if (!Array.isArray(definitions) || definitions.length !== 7) {
    fail('The ECS runtime validation package must contain exactly seven primary defect procedures.');
  }
  const evidenceIds = definitions.map((definition) => definition.evidenceId);
  if (new Set(evidenceIds).size !== evidenceIds.length) fail('Runtime validation procedure evidence IDs must be unique.');
  const registryById = new Map(registry.requirements.map((entry) => [entry.evidenceId, entry]));
  const procedures = Object.freeze(definitions.map((definition) => buildProcedure(
    definition,
    artifactBinding,
    registryById,
  )));
  const generatedAt = options.now instanceof Date
    ? options.now.toISOString()
    : new Date(options.now ?? Date.now()).toISOString();
  if (!Number.isFinite(Date.parse(generatedAt))) fail('now must be a valid timestamp.');
  return Object.freeze({
    schemaVersion: 1,
    resultContract: RUNTIME_VALIDATION_PACKAGE_CONTRACT,
    packageVersion: RUNTIME_VALIDATION_PACKAGE_VERSION,
    generatedAt,
    status: artifactBinding.state,
    executionClaim: 'plan_only_not_executed',
    reviewDecision: 'pending',
    productionApproval: 'not_granted_by_runtime_validation',
    artifactBinding,
    authoritativeReleaseEvidenceRegistry: Object.freeze({
      path: registryPath.replaceAll('\\', '/'),
      resultContract: RELEASE_EVIDENCE_REGISTRY_CONTRACT,
      registryVersion: registry.registryVersion,
      requirementCount: registry.requirements.length,
      submissionCount: registry.submissions.length,
      productionApproval: Object.freeze({
        status: registry.productionApproval.status,
        decision: registry.productionApproval.decision,
      }),
      integrationMode: 'read_only_references_no_submission',
    }),
    procedures,
  });
}

function printable(value, missing = 'UNBOUND - required before execution') {
  return value == null || value === '' ? missing : value;
}

export function formatRuntimeValidationPackageMarkdown(validationPackage) {
  const binding = validationPackage.artifactBinding;
  const lines = [
    '# ECS repaired-defect runtime validation package',
    '',
    `Generated: ${validationPackage.generatedAt}`,
    `Package status: \`${validationPackage.status}\``,
    '',
    '> Procedure package only. No scenario was executed, no evidence was submitted or accepted, and no Android, iOS, provider, GPS, Mapbox, Supabase, or field validation is claimed.',
    '',
    '## Artifact and environment binding',
    '',
    `- Exact build SHA: \`${printable(binding.exactBuildSha)}\``,
    `- Binary artifact SHA-256: \`${printable(binding.binaryArtifactDigest)}\``,
    `- Platform: \`${printable(binding.platform)}\``,
    `- OS version: \`${printable(binding.osVersion)}\``,
    `- Device model: \`${printable(binding.device.model)}\``,
    `- Provider environment: \`${printable(binding.providerEnvironment)}\``,
    `- Hardware identifier recorded: \`${binding.device.hardwareIdentifierRecorded}\``,
    '',
    'Generate a separate bound package for each platform binary. Do not execute an unbound package.',
    '',
    '## Authoritative registry boundary',
    '',
    `Registry: \`${validationPackage.authoritativeReleaseEvidenceRegistry.path}\` (${validationPackage.authoritativeReleaseEvidenceRegistry.registryVersion})`,
    `Registry submissions at generation: ${validationPackage.authoritativeReleaseEvidenceRegistry.submissionCount}`,
    `Production approval: \`${validationPackage.authoritativeReleaseEvidenceRegistry.productionApproval.status}/${validationPackage.authoritativeReleaseEvidenceRegistry.productionApproval.decision}\``,
    '',
    'Procedure mappings are read-only references. A later reviewed evidence packet must be submitted through the authoritative registry process; this package cannot resolve a requirement.',
  ];
  for (const procedure of validationPackage.procedures) {
    lines.push(
      '',
      `## ${procedure.title}`,
      '',
      `Evidence ID: \`${procedure.evidenceId}\`  `,
      `Qualified test: \`${procedure.qualifiedTestIdentity}\`  `,
      `Execution: \`${procedure.status}\`  `,
      `Actual result: \`${procedure.actualResult.executionStatus}\``,
      '',
      `Expected result: ${procedure.expectedResult}`,
      '',
      'Registry references:',
    );
    for (const reference of procedure.releaseEvidenceBindings) {
      lines.push(`- \`${reference.evidenceId}\` — ${reference.relationship}; reviewer \`${reference.reviewerRole}\`; ${reference.revalidationPolicy.mode}/${reference.revalidationPolicy.maxAgeDays} days; automatic resolution: no. ${reference.condition}`);
    }
    lines.push('', 'Scenario procedure:');
    for (const entry of procedure.scenarioSteps) {
      lines.push('', `### ${entry.title}`, '');
      for (const step of entry.steps) lines.push(`${step.stepId}. ${step.action}  `, `   Expected: ${step.expectedResult}`);
      lines.push('', `Expected scenario result: ${entry.expectedResult}`, '', '- Actual result: ____________________', '- Step result references: ____________________', '- Failure safe code, if any: ____________________');
    }
    lines.push('', 'Sanitized screenshots:');
    for (const requirement of procedure.sanitizedScreenshotRequirements) lines.push(`- ${requirement}`);
    lines.push('', 'Sanitized logs:');
    for (const requirement of procedure.sanitizedLogRequirements) lines.push(`- ${requirement}`);
    lines.push(
      '',
      'Review and expiry:',
      '',
      `- Reviewer: ____________________ (${procedure.reviewer.requiredRoles.join(', ')})`,
      '- Review decision: pending',
      '- Reviewed at: ____________________',
      '- Evidence packet SHA-256: ____________________',
      '- Safe external reference: ____________________',
      `- Revalidate on: ${procedure.expirationRevalidationPolicy.revalidateOn.join(', ')}`,
      `- Maximum age after collection: ${procedure.expirationRevalidationPolicy.maxAgeDays} days`,
      '- Calculated expiration: ____________________',
    );
  }
  lines.push('', '## Privacy restrictions', '');
  for (const restriction of RUNTIME_VALIDATION_PRIVACY_RESTRICTIONS) lines.push(`- ${restriction}`);
  lines.push('');
  return lines.join('\n');
}

function readJsonFile(rootDir, value, field) {
  let validated;
  try {
    validated = validateWorkflowArtifactPathInput(value, { rootDir, expectedType: 'file' });
  } catch {
    fail(`${field} is unavailable or unsafe.`);
  }
  return {
    resolved: {
      normalized: validated.relativePath,
      absolute: validated.absolutePath,
      real: validated.realPath,
    },
    value: JSON.parse(fs.readFileSync(validated.realPath, 'utf8')),
  };
}

export function parseRuntimeValidationArgs(argv) {
  const args = {
    registryPath: DEFAULT_REGISTRY_PATH,
    artifactProvenancePath: null,
    platform: null,
    osVersion: null,
    deviceModel: null,
    providerEnvironment: null,
    output: DEFAULT_OUTPUT_PATH,
    summaryOutput: DEFAULT_SUMMARY_PATH,
  };
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--artifact-provenance') args.artifactProvenancePath = argv[++index] ?? null;
    else if (value === '--platform') args.platform = argv[++index] ?? null;
    else if (value === '--os-version') args.osVersion = argv[++index] ?? null;
    else if (value === '--device-model') args.deviceModel = argv[++index] ?? null;
    else if (value === '--provider-environment') args.providerEnvironment = argv[++index] ?? null;
    else if (value === '--output') args.output = argv[++index] ?? null;
    else if (value === '--summary-output') args.summaryOutput = argv[++index] ?? null;
    else if (!value.startsWith('--')) positionals.push(value);
    else throw new Error('runtime_validation_package_argument_invalid');
  }
  // npm on Windows can consume unknown named options while forwarding their values.
  args.artifactProvenancePath ??= positionals[0] ?? null;
  args.platform ??= positionals[1] ?? null;
  args.osVersion ??= positionals[2] ?? null;
  args.deviceModel ??= positionals[3] ?? null;
  args.providerEnvironment ??= positionals[4] ?? null;
  if (positionals[5]) args.output = positionals[5];
  if (positionals[6]) args.summaryOutput = positionals[6];
  return args;
}

export function resolveRuntimeValidationOutputPath(rootDir, relativePath, field = 'output path') {
  const resolved = safeRepositoryPath(rootDir, relativePath, field);
  const approvedOutputRoot = path.resolve(rootDir, '.smoke', 'verification');
  const relativeToApprovedRoot = path.relative(approvedOutputRoot, resolved.absolute);
  if (relativeToApprovedRoot === '..'
    || relativeToApprovedRoot.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativeToApprovedRoot)) {
    fail(
      'Runtime validation output must remain under .smoke/verification.',
      'runtime_validation_output_scope_invalid',
    );
  }
  let cursor = path.resolve(rootDir);
  for (const segment of path.relative(cursor, resolved.absolute).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    try {
      if (fs.lstatSync(cursor).isSymbolicLink()) {
        fail(
          'Runtime validation output paths must not traverse symbolic links.',
          'runtime_validation_output_symlink_invalid',
        );
      }
    } catch (error) {
      if (error?.safeCode === 'runtime_validation_output_symlink_invalid') throw error;
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  return resolved;
}

export function runtimeValidationPathIdentity(value) {
  const absolute = path.resolve(value);
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
}

function writeOutput(rootDir, relativePath, contents) {
  if (relativePath == null) return;
  const resolved = resolveRuntimeValidationOutputPath(rootDir, relativePath);
  fs.mkdirSync(path.dirname(resolved.absolute), { recursive: true });
  fs.writeFileSync(resolved.absolute, contents, 'utf8');
}

export function runRuntimeValidationPackageCli(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? ROOT);
  const args = parseRuntimeValidationArgs(options.argv ?? process.argv.slice(2));
  const artifactProvenanceInput = args.artifactProvenancePath
    ? readJsonFile(rootDir, args.artifactProvenancePath, 'artifact provenance path')
    : null;
  const validationPackage = buildRuntimeValidationPackage({
    rootDir,
    registryPath: args.registryPath,
    artifactProvenance: artifactProvenanceInput?.value ?? null,
    captureContext: {
      platform: args.platform,
      osVersion: args.osVersion,
      deviceModel: args.deviceModel,
      providerEnvironment: args.providerEnvironment,
    },
  });
  const jsonOutput = args.output == null
    ? null
    : resolveRuntimeValidationOutputPath(rootDir, args.output, 'JSON output path');
  const summaryOutput = args.summaryOutput == null
    ? null
    : resolveRuntimeValidationOutputPath(rootDir, args.summaryOutput, 'summary output path');
  if (jsonOutput && summaryOutput
    && runtimeValidationPathIdentity(jsonOutput.absolute) === runtimeValidationPathIdentity(summaryOutput.absolute)) {
    fail('JSON and Markdown outputs must use different paths.', 'runtime_validation_output_collision');
  }
  for (const output of [jsonOutput, summaryOutput]) {
    const outputIdentity = output ? runtimeValidationPathIdentity(output.absolute) : null;
    const provenanceIdentities = artifactProvenanceInput
      ? [
        runtimeValidationPathIdentity(artifactProvenanceInput.resolved.absolute),
        runtimeValidationPathIdentity(artifactProvenanceInput.resolved.real),
      ]
      : [];
    if (outputIdentity && provenanceIdentities.includes(outputIdentity)) {
      fail(
        'Runtime validation output must not overwrite artifact provenance input.',
        'runtime_validation_input_output_collision',
      );
    }
  }
  const json = `${JSON.stringify(validationPackage, null, 2)}\n`;
  writeOutput(rootDir, args.output, json);
  writeOutput(rootDir, args.summaryOutput, formatRuntimeValidationPackageMarkdown(validationPackage));
  (options.stdout ?? process.stdout).write(json);
  return validationPackage;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    runRuntimeValidationPackageCli();
  } catch (error) {
    const safeCode = typeof error?.safeCode === 'string' ? error.safeCode : 'runtime_validation_package_failed';
    const safeMessage = sanitizeVerificationArtifactText(error instanceof Error ? error.message : String(error), 240);
    process.stderr.write(`${safeCode}: ${safeMessage}\n`);
    process.exitCode = 1;
  }
}
