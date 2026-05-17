# CampOps Current State Audit

Date: 2026-04-30

Scope: current campsite search, candidate sourcing, filtering, ranking, CampIntel assist behavior, related data models, tests, and rollout patterns. This audit is documentation-only and makes no runtime behavior changes.

## File Map

### Primary initiation and UI

- `app/(tabs)/navigate.tsx`
  - Imports the campsite candidate engine, locator service, route locator adapter, CampIntel hook/layer/card, community/private/group/review campsite layers, GPX import, and recommendation form.
  - Owns route and polygon camp search state (`campsiteCandidates`, draw mode, polygon locate state, layer visibility, known campsite layer state).
  - Initiates route campsite locating from the route overview context.
  - Initiates polygon campsite locating when a user finishes a campsite drawing.
  - Initiates the "Recommend Campsite" flow from Map Tools.
- `components/navigate/CampsiteCandidatePanel.tsx`
  - Displays route/polygon candidate summaries from `CampsiteCandidateResult`.
- `components/navigate/CampIntelMarkerLayer.tsx`
  - Converts CampIntel visible sites into map markers.
- `components/navigate/CampIntelDetailCard.tsx`
  - Displays the detailed CampIntel assessment for a selected camp marker.
- `components/navigate/RecommendCampsiteForm.tsx`
  - User submission form for community/group/private campsite recommendations.
- `components/navigate/RecommendCampsiteGpxImportReview.tsx`
  - Review/select GPX-derived campsite candidates before saving/submitting.
- `components/navigate/CommunityCampsiteDetailCard.tsx`
  - Detail card for approved community campsite markers.
- `components/navigate/CampsiteVisibilityDetailCard.tsx`
  - Detail/actions for private, pending, and reviewer-pending campsite reports.
- `components/navigate/GroupCampsiteMarkerDetailCard.tsx`
  - Detail card for group-shared campsite markers.

### Candidate generation, filtering, and ranking

- `lib/campsiteCandidateEngine.ts`
  - Generates route and polygon campsite candidates.
  - Scores candidates for suitability, confidence, timing, remoteness, terrain, and fallback stage.
  - Applies final viability filtering.
  - Stores/publishes the current `CampsiteCandidateResult`.
- `lib/campsites/campsiteLocatorService.ts`
  - Public route and polygon locator API used by Navigate.
  - Applies proximity, coordinate, roadway, score, dedupe, and cap filters.
  - Publishes results through `campsiteCandidateEngine`.
- `lib/campsites/routeCampsiteLocatorAdapter.ts`
  - Normalizes route/run/trail/explore contexts into `RouteCampsiteLocatorInput`.
  - Builds a route campsite signature for dedupe/recompute decisions.
- `lib/campsites/campsiteViabilityFilter.ts`
  - Core hard-gate and fallback-tier logic over `campSuitability`, `terrainSuitability`, `accessConfidence`, and `legalAccess`.
- `lib/campsites/campsiteThresholds.ts`
  - Marker cap, fallback stages, timing windows, route distance limits, and normalized score thresholds.

### Known campsite sources and recommendations

- `lib/campsites/campsiteRecommendationTypes.ts`
  - Main data types for campsites, reports, visibility, statuses, review states, GPX imports, and validation helpers.
- `lib/campsites/campsiteRecommendationService.ts`
  - Service/backend abstraction for creating reports, listing approved campsites, flags, reviews, photos, and publication lifecycle.
- `lib/campsites/communityCampsiteMapLayer.ts`
  - Fetches approved community campsites by bounds and maps trust score to marker score/confidence.
- `lib/campsites/campsiteVisibilityMapLayers.ts`
  - Fetches/maps current user's private reports, pending community submissions, and reviewer-pending reports.
- `lib/campsites/groupCampsiteMapLayer.ts`
  - Fetches/maps group-shared campsites.
- `lib/campsites/gpxCampsiteImport.ts`
  - Validates, parses, stores, and maps GPX waypoints/selected route or track points into campsite candidates.
- `lib/campsites/campsiteOfflineQueue.ts`
  - Offline-safe queue for campsite report submissions.
- `lib/campsites/gpxCampsiteOfflineQueue.ts`
  - Offline-safe queue for GPX import uploads and selected GPX campsite drafts.
- `lib/campsites/campsiteTriageService.ts`
  - Submission triage scoring for abuse, duplicates, validation, source type, and land-use checks.
- `lib/campsites/campsiteTrustScoring.ts`
  - Trust score from verification, photos, confirmations, flags, and staleness.
- `lib/campsites/campsiteLandUseReviewService.ts`
  - Provider-backed land-use/sensitive-area review hooks for submitted campsites.

### CampIntel assist and broader AI layer

- `lib/campIntel/useCampIntel.ts`
  - React hook that builds CampIntel from current candidates plus route, terrain, weather, remoteness, vehicle, resource, and preference context.
  - Persists CampIntel user preferences and cached route results.
- `lib/campIntel/campIntelEngine.ts`
  - Deterministic CampIntel ranking/enrichment engine.
- `lib/campIntel/campIntelScoring.ts`
  - Deterministic dimension scores: access, campability, vehicle fit, safety, compliance, desirability, confidence, viability, sub-assessments.
- `lib/campIntel/campIntelExplain.ts`
  - Deterministic explanation strings for ranked candidates.
- `lib/campIntel/campDecisionEngine.ts`
  - Deterministic operational decision state: stop now, continue, take backup, use emergency option, reassess.
- `lib/campIntel/campIntelTypes.ts`
  - CampIntel data model for candidates, evidence, context, score dimensions, explanations, summaries, and user preferences.
- `lib/campIntel/campIntelSelectors.ts`
  - Structured summary/site selector helpers.
- `lib/campIntel/campIntelCompare.ts`
  - Deterministic comparison output for multiple camps.
- `lib/campIntel/campIntelWeights.ts`
  - Mission-mode weight profiles.
- `lib/ai/expeditionPromptRegistry.ts`
  - Broader Expedition AI prompt registry includes a `camp_logistics` agent prompt.
- `lib/ai/expeditionIntelligenceOrchestrator.ts`
  - Builds runtime prompts, accepts an agent response, validates schema and safety policy.
- `lib/ai/expeditionAgentSchemas.ts`
  - Validates Expedition agent response structure.
- `lib/ai/expeditionIntelligenceContextBuilder.ts`
  - Builds AI grounding context including campsite availability, fuel, and water fields.
- `lib/ai/expeditionAssessmentNarrative.ts`
  - Narrative prompt/parsing for operational assessments; includes explicit anti-invention rules.

### Route, vehicle, trip, resource, and offline data dependencies

- `lib/routeAnalysisEngine.ts`
  - `RouteIntelligence` and `RouteAnalysisSegment` used by the route campsite candidate engine.
- `lib/routeStore.ts`
  - Offline-first imported/custom route storage (`ImportedRoute`, `RouteSegment`, `RouteWaypoint`).
- `lib/runStore.ts`
  - Run/trail recording source used by route analysis and Navigate route context.
- `lib/terrainAnalysisEngine.ts`
  - Terrain context consumed by campsite and CampIntel scoring.
- `lib/remotenessStore.ts` and `lib/remotenessTypes.ts`
  - Remoteness snapshot/index consumed by campsite scoring, CampIntel, and route context.
- `lib/activeVehicleContext.ts`
  - Aggregates current vehicle, specs, consumables, loadout, accessories, tires/lift, and resource profile.
- `lib/vehicleStore.ts`
  - Offline-first vehicle CRUD and sync.
- `lib/vehicleSpecStore.ts`
  - Vehicle GVWR, base weight, fuel tank capacity, and fuel type.
- `lib/resourceForecastEngine.ts`
  - Fuel/water/power sufficiency and margins from route, vehicle, loadout, telemetry, and terrain.
- `lib/expeditionStateStore.ts`
  - Active expedition lifecycle, vehicle, fuel, and water deltas.
- `lib/missionStore.ts`
  - Offline-first mission/expedition records, notes, checkpoints, and water usage stats.
- `lib/offlineExpeditionModeTypes.ts`
  - Offline expedition pack, route geometry, vehicle context, starting fuel/water, and offline behavior profiles.
- `lib/offlineNavigationBridge.ts`
  - Offline overlay categories include campsites, fuel stations, and water sources.
- `lib/tileCacheStore.ts`
  - Offline map/tile route corridor cache.

### Tests and docs

- `scripts/test-campsite-locator.js`
- `scripts/test-campsite-viability-filter.js`
- `scripts/test-campsite-end-to-end-workflow.js`
- `scripts/test-campsite-renderer.js`
- `scripts/test-campsite-navigation-integration.js`
- `scripts/test-campsite-ui-polish.js`
- `scripts/test-camp-intel-evidence-presentation.js`
- `scripts/test-recommend-campsite-map-tools.js`
- `scripts/test-campsite-recommendation-service.js`
- `scripts/test-campsite-submission-service.js`
- `scripts/test-campsite-offline-queue.js`
- `scripts/test-gpx-campsite-import.js`
- `scripts/test-gpx-campsite-offline-import.js`
- `scripts/test-community-campsite-map-layer.js`
- `scripts/test-campsite-visibility-map-layers.js`
- `scripts/test-campsite-triage-service.js`
- `scripts/test-campsite-trust-scoring.js`
- `docs/campsite-feature-flags.md`
- `docs/campsite-recommendations.md`
- `docs/campsite-recommendations-implementation-plan.md`
- `docs/campsite-review-policy.md`
- `docs/campops/overview.md`

## Current Data Flow

### Route-generated camp search

1. `app/(tabs)/navigate.tsx` builds a route campsite context from active run/route/trail/explore state, route intelligence, terrain intelligence, and remoteness.
2. `buildRouteCampsiteLocatorSignature` dedupes route context changes.
3. A Navigate `useEffect` calls `buildRouteCampsiteLocatorInput(routeOverviewCampsiteContext)`.
4. Navigate calls `locateCampsiteResultForRoute(input)`.
5. `campsiteLocatorService` either ranks supplied candidates or calls `analyzeCampsiteCandidates(routeIntelligence, terrainIntelligence, remotenessSnapshot)`.
6. `campsiteCandidateEngine.publishResult` applies ownership, viability filtering, persistence, and listener notification.
7. Navigate keeps `campsiteCandidates` in state and passes them to `useCampIntel`.
8. `useCampIntel` builds ranked CampIntel sites, summaries, cached results, and user preference overlays.
9. `CampIntelMarkerLayer` and related detail/panel components render the result.

### Draw-area camp search

1. User enables campsite draw mode and places polygon points on the Navigate map.
2. `finishCampsiteDrawing` calls `locateCampsitesForCompletedPolygon(points)`.
3. Navigate calls `loadDrawAreaKnownCampsiteSources(polygonId, points)` to fetch known community/private/pending/reviewer/group camps in bounds, then filters them inside the polygon.
4. Navigate calls `locateCampsiteResultForPolygon({ polygonCoordinates, terrainIntelligence, remotenessSnapshot, vehicleProfile, polygonId })`.
5. `campsiteLocatorService` calls `analyzePolygonCampsiteCandidates`, then caps/publishes through `campsiteCandidateEngine`.
6. Generated polygon candidates and known campsite markers are displayed together but come from separate sources.

### Known campsite layers

1. Feature flags are read from `DEFAULT_COMMUNITY_CAMPSITES_ROLLOUT_CONFIG` via `isCommunityCampsitesFeatureEnabled`.
2. Layer visibility defaults come from `DEFAULT_CAMPSITE_LAYER_VISIBILITY`.
3. Viewport, route corridor, or polygon bounds drive source fetches.
4. Community, private, pending, reviewer-pending, and group markers are fetched through their layer adapters and filtered by bounds, route proximity, or polygon inclusion.
5. These markers use trust/verification-derived confidence, not the generated route/polygon candidate suitability engine.

### Recommend campsite flow

1. Map Tools exposes `Recommend Campsite` when `communityCampsitesEnabled` is true.
2. User picks current GPS, drops a pin, or imports GPX/route when `gpxCampsiteImportEnabled` is true.
3. `RecommendCampsiteForm` creates a report via `campsiteRecommendationService` or queues it through `campsiteOfflineQueue`.
4. GPX import validates and parses waypoint/route/track candidates via `gpxCampsiteImport`, with offline-safe upload support through `gpxCampsiteOfflineQueue`.
5. Community submissions proceed through triage/review/publication; private/group submissions remain scoped.

## Current Filter And Ranking Behavior

### Route/polygon locator filters

`lib/campsites/campsiteLocatorService.ts` applies these outer filters:

- Coordinates must normalize to finite latitude/longitude.
- Route candidates must be camping-appropriate when the route source is a road source.
- Major roadway-adjacent route candidates are excluded within `MAJOR_ROADWAY_EXCLUSION_MILES = 1`.
- Route candidates must meet `ROUTE_CAMPSITE_MIN_CONFIDENCE_SCORE = 55`.
- Route candidates must be within `ROUTE_CAMPSITE_BUFFER_MILES = 0.5` unless input overrides the buffer.
- Polygon candidates must be inside the polygon.
- Polygon candidates must meet `DRAW_AREA_CAMPSITE_MIN_CONFIDENCE_SCORE = 55`.
- Results dedupe by id and coordinate key.
- All public locator outputs are capped at `MAX_CAMPSITE_MARKERS = 5`.

Route sorting:

- Primary: `getCandidateRankScore`, which is display score plus an 8-point drivable-trail access bonus.
- Secondary: distance to route.
- Tertiary: stable coordinate key.

Polygon sorting:

- Primary: display score.
- Secondary: remoteness score.
- Tertiary: stable coordinate key.

### Candidate engine filters and ranking

`lib/campsiteCandidateEngine.ts` has two major phases:

- Detection/generation:
  - Route candidates are generated from route segments and sorted by `qualityScore`.
  - Polygon candidates are generated synthetically from a drawn polygon, converted to route-like segment candidates, sorted by `suitabilityScore` then `qualityScore`.
- Suitability scoring:
  - Adds flat/stable terrain bonus.
  - Adds remoteness/context bonus based on remoteness snapshot and fallback mode.
  - Adds ideal/acceptable/poor timing bonus/penalty.
  - Penalizes high elevation nearby.
  - Penalizes mountain pass proximity.
  - Penalizes too-early and too-late route progress.
  - Applies short-route and overnight-likelihood reductions.
  - Classifies confidence and attaches reasons.
  - Sorts by `suitabilityScore`, then `qualityScore`.

Fallback stages live in `lib/campsites/campsiteThresholds.ts`:

- Stage 0 strict starts with tighter terrain, timing, remoteness, route distance, spacing, and score thresholds.
- Later stages progressively lower score thresholds, expand route distance, relax timing/terrain/remoteness, and adjust credibility language.
- Current maximum displayed candidates remains five.

### Viability filter

`lib/campsites/campsiteViabilityFilter.ts` applies core gates after candidate scoring:

- Core score keys:
  - `campSuitability`
  - `terrainSuitability`
  - `accessConfidence`
  - `legalAccess`
- Preferred threshold: all core scores at or above 70.
- Good fallback threshold: 60.
- Possible fallback threshold: 55.
- Limited confidence threshold: 50.
- Safety/access/legal floor: 50.
- Safety text patterns reject candidates with private/no-access/closed/restricted/no-camping/trespass/illegal style signals.
- The engine chooses the best available fallback tier, accepts candidates at that tier or better, and rejects weaker/safety-failing candidates.

### Known campsite layer filtering

- Community campsites must have renderable coordinates and come from approved community listing.
- Private/pending/reviewer layers filter current-user or reviewer-visible reports by bounds and renderability.
- Group sites filter group-shared entries by bounds and renderability.
- Route contextual known-site fetches apply the same route buffer geometry from Navigate.
- Draw-area contextual known-site fetches apply point-in-polygon filtering.

### CampIntel ranking

CampIntel re-ranks only the generated/published candidate result, not all known campsite layers. It computes:

- Access score.
- Campability score.
- Vehicle fit score.
- Safety score.
- Compliance score.
- Desirability score.
- Confidence detail and unknown inputs.
- Viability gate status.

Viable CampIntel candidates sort by:

1. Overall score.
2. Confidence score.
3. Safety raw score.
4. Route segment index.

CampIntel classifies candidates into suggested, backup, emergency, rejected-low-confidence, and related display categories.

## Current AI Assist Behavior

The current route/polygon camp search and CampIntel recommendation path is deterministic. I did not find direct OpenAI/model calls, chat/completion calls, or Supabase function invocations in `lib/campsiteCandidateEngine.ts`, `lib/campsites/*`, `lib/campIntel/*`, `components/navigate/CampIntel*`, or the Navigate camp search initiation path.

What looks "AI-like" in the camp flow is currently local/deterministic:

- `buildCampIntelEngine` enriches and ranks candidates with typed inputs.
- `scoreCampIntelDimensions` computes structured dimension scores.
- `evaluateCampIntelViability` applies deterministic viability gates.
- `buildCampIntelExplanation` creates explanation text from scored reasons.
- `buildCampDecisionState` chooses operational recommendation types and summary lines.
- `useCampIntel` persists preferences and cached route results, and downgrades cached sites for offline display.

The broader Expedition AI layer is separate:

- `lib/ai/expeditionPromptRegistry.ts` defines a `camp_logistics` prompt that asks an AI agent to evaluate camp reachability, daylight margin, weather exposure, water, fuel, food, power, shelter, warmth, and readiness.
- `lib/ai/expeditionIntelligenceOrchestrator.ts` builds runtime prompts from structured context, then validates responses.
- `lib/ai/expeditionAgentSchemas.ts` validates the JSON response contract.
- `lib/ai/expeditionAssessmentNarrative.ts` has a prompt and parser for assessment narratives, with explicit rules not to invent facts, legal status, fuel/water levels, weather, ETAs, or safety conclusions.
- `lib/ai/expeditionIntelligenceContextBuilder.ts` includes campsite availability, fuel, and water context fields, but they are grounding values rather than generated candidate search results.

CampOps should keep this separation: the deterministic CampOps engine should produce gates, scores, margins, confidence, and recommendation state; AI may summarize only those typed outputs.

## Current Data Models

### Camps and generated candidates

- `CampsiteCandidate` in `lib/campsiteCandidateEngine.ts`
  - Segment index, coordinate, distance, elevation, elevation gain, reasons, difficulty, quality score.
  - Suitability score, display score, remoteness/camping/legal/terrain/proximity scores.
  - Rating factors, viability tier, confidence, fallback stage/mode, credibility tier.
- `CampsiteCandidateResult` in `lib/campsiteCandidateEngine.ts`
  - Route or polygon identity, route name, total distance, drive time, candidates, suggested campsites, counts, fallback metadata, source, polygon id, viability summary.
- `CampsiteCandidate` in `lib/campsites/campsiteLocatorService.ts`
  - Public locator shape with id, title, coordinate, score fields, category/rating/description, source metadata, and rating factors.

### Community/private/group camps and POI-like records

- `CampSite` in `lib/campsites/campsiteRecommendationTypes.ts`
  - Published campsite record with type, access difficulty, legal confidence, conditions, trust score, status, visibility, and ownership fields.
- `CampSiteReport`
  - User-submitted report with source type, coordinates, review/moderation state, visibility, and submitter data.
- `PublicCampSite`
  - Public-safe campsite response shape used for map layers.
- `CampSiteGroup`, `CampSiteGroupMembership`, `CampSiteGroupShare`
  - Group sharing model.
- `GpxImport` and `GpxImportCandidate`
  - GPX import records and waypoint/route/track candidate records.
- `OfflineExpeditionMarker` in `lib/offlineNavigationBridge.ts`
  - Offline POI marker categories include `campsites`, `fuel_stations`, and `water_sources`.

### User preferences

- CampIntel preferences live in `lib/campIntel/useCampIntel.ts` under `ecs_camp_intel_preferences_v2`.
- Preferences include saved camp ids, used camp ids, rejected camp ids, and feedback by camp id.
- Cached route CampIntel results live under `ecs_camp_intel_cached_routes_v2`.

### Vehicle profiles

- `Vehicle` comes from `lib/types` and is stored/synced through `lib/vehicleStore.ts`.
- `VehicleSpec` in `lib/vehicleSpecStore.ts` stores GVWR, base weight, fuel tank capacity, and fuel type.
- `getActiveVehicleContext` in `lib/activeVehicleContext.ts` aggregates vehicle, specs, tires/lift, consumables, loadout, accessories, active vehicle id, loadout weights, and resource profile.
- `CampIntelVehicleContext` in `lib/campIntel/campIntelTypes.ts` uses width, wheelbase, clearance, tire size, lift, trailer, rooftop tent, loadout weight, and people count.

### Routes and trip plans

- `RouteIntelligence` in `lib/routeAnalysisEngine.ts`
  - Route id/name, distance, drive time, elevation, difficulty, segments, and bounds.
- `ImportedRoute`, `RouteSegment`, `RouteWaypoint` in `lib/routeStore.ts`
  - Offline-first route geometry and waypoints for GPX/KML/KMZ/FIT/GeoJSON/custom.
- `ExpeditionRecord` in `lib/expeditionStateStore.ts`
  - Active vehicle, expedition state, distance/duration, start/end fuel and water.
- Mission store records in `lib/missionStore.ts`
  - Offline-first expedition records, snapshots, items, events, notes, checkpoints, terrain profile, and water usage stats.

### Resources and offline mode

- `ResourceForecast` in `lib/resourceForecastEngine.ts`
  - Fuel, water, and power forecast; sufficiency level; margins; route id and difficulty.
- `VehicleProfileSnapshot`, `LoadoutTotalsSnapshot`, and `TelemetrySnapshot` in `lib/resourceForecastEngine.ts`
  - Inputs for resource forecasting.
- `ExpeditionPack` in `lib/offlineExpeditionModeTypes.ts`
  - Route geometry, map/cache references, vehicle context, starting fuel, starting water, dashboard offline profiles, and offline intel.
- `OfflineNavigationOverlay` in `lib/offlineNavigationBridge.ts`
  - Offline map overlays with categories for trails, hazards, fuel, water, recovery, and campsites.

## Existing Tests

Relevant package scripts:

- `npm run test:campsite-locator`
- `npm run test:campsite-viability`
- `npm run test:campsite-e2e`
- `npm run test:campsite-renderer`
- `npm run test:campsite-navigation`
- `npm run test:campsite-ui-polish`
- `npm run test:camp-intel-evidence`

Additional camp-related scripts present in `scripts/`:

- Recommendation/service/persistence: `test-campsite-recommendation-service.js`, `test-campsite-recommendation-form.js`, `test-campsite-recommendation-persistence.js`, `test-campsite-submission-service.js`.
- Review/moderation/trust: `test-campsite-community-review.js`, `test-campsite-community-review-ui.js`, `test-campsite-review-service.js`, `test-campsite-review-queue.js`, `test-campsite-review-notifications.js`, `test-campsite-reviewer-management-ui.js`, `test-campsite-reviewer-reputation.js`, `test-campsite-triage-service.js`, `test-campsite-trust-scoring.js`.
- Map/layers/group/offline/GPX: `test-community-campsite-map-layer.js`, `test-campsite-visibility-map-layers.js`, `test-campsite-group-sharing.js`, `test-campsite-group-sharing-ui.js`, `test-campsite-offline-queue.js`, `test-gpx-campsite-import.js`, `test-gpx-campsite-offline-import.js`, `test-recommend-campsite-map-tools.js`.
- Policy/final audit: `test-campsite-land-use-review.js`, `test-campsite-final-audit.js`.

The AI-adjacent Expedition layer has separate tests such as `test:expedition-intelligence-layer`, `test:expedition-assessment-narrative`, and `test:expedition-operational-scenarios`.

## Feature Flags And Config Patterns To Reuse

- `lib/communityCampsitesRolloutConfig.ts`
  - Current feature flag union includes `communityCampsitesEnabled`, `gpxCampsiteImportEnabled`, `campsiteOfflineQueueEnabled`, `campsiteLandUseReviewEnabled`, `campsitePhotosEnabled`, `campsiteGroupSharingEnabled`, and review/publication flags.
  - Local/dev defaults are permissive; production config disables higher-risk public/community surfaces.
  - `resolveCommunityCampsitesRolloutConfig` and `isCommunityCampsitesFeatureEnabled` are the existing helper pattern.
- `docs/campsite-feature-flags.md`
  - Documents local/dev vs production rollout posture.
- `lib/campsites/campsiteReviewConfig.ts`
  - Review quorum/config pattern.
- `lib/campsites/campsiteLandUseReviewConfig.ts`
  - Provider-enabled config pattern.
- `lib/campsites/campsiteThresholds.ts`
  - Deterministic threshold/fallback config pattern for search/scoring behavior.
- `lib/campIntel/campsiteFallbackConfig.ts`
  - Compatibility export for fallback thresholds.

CampOps should add risky behavior behind the same style of typed config/flags, likely starting with a dedicated `campOpsEnabled`/`campOpsScoringEnabled`/`campOpsAiSummaryEnabled` family or an extension to the current campsite rollout config.

## Current Gaps Relative To CampOps

- Camps are still mostly generated as route segment or polygon candidate markers, not as operational endpoints with resource, legal, access, vehicle, group, time, and contingency state in one typed object.
- Fuel range and water range exist elsewhere (`resourceForecastEngine`, vehicle context), but they are not hard gates in the route/polygon camp locator.
- Propane, dump, shower, laundry, and service planning are not part of camp candidate scoring.
- Legal access is represented as a score/confidence/fallback gate, but not as a rich provenance model with source, jurisdiction, staleness, and conflict state.
- Fire restriction awareness exists in broader ECS5 intelligence modules, but is not connected as a camp candidate hard gate.
- Flatness/slope is inferred from terrain/elevation heuristics, not a dedicated slope/levelness data source.
- Wind exposure is estimated in CampIntel from weather and ridgeline exposure, but not a locator hard gate.
- Privacy likelihood, kid/pet suitability, group capacity, and trailer turnaround are partial or inferred at best.
- Late-arrival risk exists through timing/darkness adjustments, but "delayed two hours" is not a first-class scenario query.
- Plan B/emergency camp classification exists in CampIntel, but emergency automation is not a first-class engine output.
- Known campsite layers and generated candidates are displayed together but not unified under one operational ranking model.
- The broader Expedition AI layer has a camp logistics prompt, but it is not fed a typed CampOps recommendation contract yet.
- Current generated polygon candidates can be synthetic; CampOps must preserve truthfulness by making synthetic/estimated/unknown provenance visible.

## Recommended Refactor Seams

1. Introduce typed CampOps domain models beside the current code.
   - Suggested location: `lib/campops/`.
   - Start with input/output types only: `CampOpsCandidate`, `CampOpsContext`, `CampOpsRecommendation`, `CampOpsGate`, `CampOpsScoreBreakdown`, `CampOpsConfidence`, `CampOpsDataProvenance`.

2. Wrap existing sources with adapters.
   - Route generated candidates: adapt from `CampsiteCandidateResult`.
   - Polygon generated candidates: adapt from `CampsiteCandidateResult`.
   - Known camps: adapt from `PublicCampSite`, `CampSiteReportResponse`, `GroupCampSiteItem`, and offline POIs.
   - Keep adapters thin and explicit about missing/estimated/provenance fields.

3. Build deterministic CampOps scoring as pure functions.
   - Gate before rank.
   - Separate hard gates from soft ranking.
   - Keep fuel/water margins, legal/access certainty, route reachability, weather/fire/late-arrival/trailer/group constraints as typed facts.

4. Keep existing route/polygon search behavior stable behind compatibility adapters.
   - Preserve `CampsiteCandidateResult` and current marker payloads during the transition.
   - Use feature flags to opt in to CampOps ranking or display labels.

5. Convert CampIntel to consume CampOps output.
   - CampIntel should become presentation/summary over deterministic CampOps output, or a compatibility layer while both systems coexist.

6. Feed AI only the CampOps output contract.
   - The prompt should receive gates, scores, margins, confidence, data limitations, and selected recommendation.
   - AI should not be allowed to invent or override legal status, margins, weather/fire facts, or safety-critical conclusions.

7. Reuse existing storage/cache patterns.
   - Follow `createMigratingNonSecureStorage` for preferences/cached route results.
   - Keep offline cache downgrades explicit.

## Suggested PR Sequence

1. Docs and contract PR
   - Add `lib/campops` types, no runtime behavior.
   - Add tests for type fixtures and safety contract examples.

2. Source adapter PR
   - Add adapters from generated route/polygon candidates and known campsite records to CampOps inputs.
   - Snapshot tests for missing/stale/estimated/provenance behavior.

3. Deterministic gate and scoring PR
   - Implement pure CampOps gate/scoring/ranking functions.
   - Unit tests for legal/access, resource margin, late arrival, weather/fire, vehicle/trailer, group capacity, and emergency fallback scenarios.

4. Compatibility integration PR
   - Run CampOps in parallel with current outputs behind a feature flag.
   - Log/debug compare current candidate ordering vs CampOps ordering.
   - No UI behavior change by default.

5. UI presentation PR
   - Add CampOps detail fields to existing compact camp surfaces.
   - Preserve existing Navigate layout and marker behavior.
   - Make unknown/stale/estimated fields visible.

6. AI grounding PR
   - Add CampOps summary prompt/context contract.
   - Add tests proving AI cannot change deterministic gates, scores, margins, or safety labels.

7. Cutover PR
   - Flip feature flag for selected environments after parity/QA.
   - Retire or downgrade duplicated legacy scoring paths only after compatibility tests prove stable behavior.

## Risk Areas

- Legal status and access confidence are safety-critical. Do not infer legality from weak text, POI category, remoteness, or AI output.
- Generated polygon candidates may look authoritative even when synthetic. CampOps must expose provenance and confidence.
- Current known campsite layers and generated candidate layers have different scoring semantics; unifying them without provenance could over-rank weak data.
- Route timing currently uses estimated drive hours and segment progress; delayed-arrival scenarios need explicit time and daylight inputs.
- Fuel/water resource forecasts exist but may depend on missing manual or stale telemetry inputs; gates must carry confidence and source.
- Offline mode can surface cached CampIntel results; stale cached recommendations must not appear live or legally confirmed.
- Feature flags currently default many campsite features on in local/dev but off in production. CampOps risky behavior should follow the conservative production pattern.
- The repo has many pre-existing modified/untracked files. Future PRs should keep CampOps changes narrowly scoped to avoid merging unrelated work.
- Lint/typecheck may be affected by unrelated repo changes; verification should distinguish docs-only changes from pre-existing worktree state.
