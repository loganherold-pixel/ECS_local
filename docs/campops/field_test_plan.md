# CampOps Closed Field-Test Plan

This package prepares CampOps for controlled real-world validation without broad rollout. It is for internal/product review and selected field testers only.

Closed field testing must not enable community publishing, must not require telemetry, and must not treat provider outputs as product-ready until validation evidence supports the target region.

## Test Objectives

- Validate whether CampOps helps a user decide where to end the day when the route plan changes.
- Confirm the deterministic engine, not AI, owns hard gates, scoring, resource debt, and recommendation roles.
- Verify legal/access, closure, fire, weather, service, stale-data, and source-conflict warnings are visible and understandable.
- Evaluate mobile UI readability on real Android screens in planning, delayed, offline, and endpoint-selection states.
- Gather structured feedback without collecting precise private locations, raw vehicle identifiers, raw AI prompts, or public community debrief data.
- Compare provider shadow/readiness reports against tester observations for selected region labels.

## Tester Profile

Closed field testers should be:

- Experienced with overland route planning, dispersed camping, or remote travel logistics.
- Comfortable reading conservative confidence language and reporting provider/source mismatches.
- Able to run Android Expo/dev builds or a controlled internal app build.
- Willing to test offline/cached states and delayed-day decisions without treating CampOps as the only source of truth.
- Trained that legal status, access, closures, and fire restrictions must be verified with official local sources when confidence is medium, low, unknown, stale, or conflicting.

Recommended tester mix:

- Solo vehicle / no trailer.
- Trailer or full-size rig.
- Convoy or group trip.
- Family/pets scenario if the tester already uses those planning fields voluntarily.
- Low-resource planning scenario for fuel or water margin review.

## Required Vehicle And Trip Context

Use only data the tester already has or intentionally enters for the test:

- Vehicle class, range/fuel reserve, and access constraints.
- Trailer presence and turnaround needs if applicable.
- Group size and vehicle count if applicable.
- Water reserve estimate and next-day water need if known.
- Planned camp, backup camp, or route day endpoint if available.
- Desired arrival window or before-sunset preference.
- Offline mode/cache state where possible.

Do not require:

- Raw VIN.
- Exact private home/base location.
- Medical details.
- Passenger names.
- Public community publishing.
- Raw photo refs outside the app's private debrief flow.

## Regions And Routes To Validate

Use region labels and route labels, not precise private coordinates, in field-test artifacts.

Suggested labels:

- `Northern Nevada dry-route test cell`
- `Sierra foothills mixed-access test cell`
- `High desert trailer turnaround test cell`
- `Forest-road closure/stale-source test cell`
- `Low-service resupply-margin test cell`

For each route label, record:

- region label
- route type: highway approach, forest road, desert track, mountain access, mixed
- expected source categories: legal/access, closure, fire, weather, services
- offline/cell coverage expectation: online, degraded, offline
- whether the route includes trailer, group, low fuel, low water, late arrival, or high-wind review

Do not record precise private camp coordinates in shared field-test docs. Use internal route/camp ids only if they are already privacy-safe and intended for test tracking.

## Required Feature Flags

Minimum closed field-test flags:

| Flag | Required state | Notes |
| --- | --- | --- |
| `campopsRecommendationsEnabled` | On | Enables deterministic recommendation sets. |
| `campopsSourceTransparencyEnabled` | On | Required so testers can review source confidence, stale data, conflicts, and missing data. |
| `campopsEndpointRecommendationEnabled` | On for delayed-day tests | Required for "Where can we end the day if delayed?" validation. |
| `campopsDecisionPointsEnabled` | On where route/progress data exists | Enables decision-point review. |
| `campopsProviderValidationShadowModeEnabled` | On for provider validation runs | Shadow mode must not alter user-facing recommendations. |
| `campopsProviderAdaptersEnabled` | Off until a provider category passes readiness review for the test cell | May be enabled only for explicitly approved region/provider cohorts. |
| `campopsAiAssistEnabled` | Off by default; on only for AI review sessions | AI must summarize CampOps output only. |
| `campopsDebriefCommunityPublishingEnabled` | Off | Community publishing is not part of closed field testing. |
| `campopsTelemetryEnabled` | Off unless a sink has explicit privacy/product approval | Telemetry also requires configured and approved sink. |

## Provider Validation Requirements

Before field use in a test cell:

1. Run provider validation in shadow mode for the region label.
2. Generate a provider readiness report.
3. Review legal/access, closure, fire, weather, and service categories separately.
4. Record coverage band, freshness band, unknown rate, stale rate, conflict count, and missing-data count.
5. Keep provider influence disabled for categories marked `not_ready`.
6. Keep source transparency visible for all field testers.

Acceptance for closed field test:

- Shadow validation exists for the test region label.
- Unknown/stale/conflict warnings are expected and visible.
- Testers know provider output is under validation, not authoritative product truth.

## Offline Test Cases

Run at least these cases where practical:

- Online planning, then offline before endpoint selection.
- Offline with cached legal/access and weather source data.
- Offline with no cached legal/access data.
- Offline with stale weather source data.
- Offline with missing service/resupply data.
- Offline debrief saved privately for later sync if the app supports it.

Expected:

- CampOps remains usable with cached or unknown data.
- Stale, cached, missing, or unavailable warnings remain visible.
- Unknown data lowers confidence instead of being treated as allowed/current.
- AI does not soften stale or missing warnings if AI review is enabled.

## Stale-Data Test Cases

Include at least one route/camp where each category can be stale or unknown:

- legal/access stale or unknown
- closure status stale or unknown
- fire restriction stale or unknown
- weather stale
- service/resupply stale or unknown

Expected:

- Recommendation confidence reflects stale or missing source data.
- Source transparency shows the stale category.
- AI summary mentions stale data when enabled.
- UI does not say "guaranteed open", "definitely legal", or unqualified "safe".

## Debrief Privacy Expectations

Closed field testing uses private debrief capture only.

Required:

- Debrief visibility defaults to `private`.
- Community publishing remains disabled.
- Freeform notes are treated as private.
- Vehicle association is not public.
- Raw photo refs are not public.
- Precise location is not included in shared feedback artifacts.

Do not ask testers to publish community-visible debriefs. If a tester wants to share a public/community report, treat it as out of scope until community governance is approved.

## AI Assist Review Expectations

AI assist may be enabled only for specific review sessions.

Review AI for:

- Does it explain CampOps recommendations without changing them?
- Does it preserve hard-gate warnings?
- Does it avoid recommending rejected camps?
- Does it clearly mention unknown or low legal confidence?
- Does it preserve stale closure/fire/weather/service warnings?
- Does it avoid invented fuel, water, services, operating hours, road width, weather, slope, occupancy, or legal status?
- Is field-mode output concise enough for a delayed route decision?

Capture AI concerns using the feedback schema below. Do not include raw prompts or private trip details.

## Mobile UI Review Expectations

Use `docs/campops/mobile_qa.md` and `docs/campops/mobile_visual_state_matrix.md`.

Review on:

- small Android portrait
- large Android portrait
- landscape if supported
- online
- offline cached
- offline no cached data
- long camp names
- long warning lists
- missing source fields
- expanded and collapsed "Why this recommendation?"
- expanded and collapsed AI summary if AI review is enabled

Expected:

- Recommended, backup, and emergency cards render without clipping.
- Source confidence and stale/missing warnings remain visible in field mode.
- Action buttons are tappable and use existing navigation/share patterns.
- Legacy search results are labeled separately from endpoint recommendations.

## Tester Checklists

### Before Trip

- Confirm build/version and feature flags.
- Confirm community publishing is off.
- Confirm telemetry is off unless approved for this test.
- Confirm provider validation report exists for the route region label.
- Save offline maps/source data if the scenario requires cached behavior.
- Record region label and route label, not precise private coordinates.

### During Planning

- Select or create planned camp and backup candidates where available.
- Review CampOps recommendation, backup, emergency fallback, and source transparency.
- Check legal/access, closure, fire, weather, service, fuel, water, and late-arrival fields.
- Note any source marked stale, unknown, conflicting, or missing.
- Confirm legacy result list does not contradict the CampOps endpoint recommendation.

### While Delayed

- Test no delay, 30 minute delay, 1 hour delay, 2 hour delay, and custom delay if available.
- Confirm planned camp downgrade reason appears when ETA moves after sunset or beyond arrival window.
- Confirm resource margin summary changes when delay affects next-day logistics.
- Confirm decision point appears where route/progress data supports it.

### At Endpoint Selection

- Review recommended endpoint, backup endpoint, and emergency fallback.
- Check whether reasons and warnings match observed context.
- Confirm the recommendation does not overclaim legal/access certainty.
- Record whether the endpoint choice was useful, confusing, or contradicted by known local conditions.

### Offline/Cached State

- Put device in airplane/offline mode where safe and practical.
- Confirm cached source data is labeled cached/stale when applicable.
- Confirm missing source data is shown as unknown, not allowed/current.
- Confirm endpoint cards render without AI output.

### After Debrief

- Capture private debrief only.
- Confirm default visibility is private.
- Do not enable community publishing.
- Record observed access, capacity, trailer suitability, fire signage, hazards, privacy, wind exposure, and late-arrival suitability when available.
- Submit field-test feedback using the schema below without precise private coordinates.

## Feedback Form Schema

Use this structure in internal notes, issue templates, or test reports. Keep fields coarse and privacy-safe.

```json
{
  "fieldTestId": "campops-field-YYYYMMDD-region-label-##",
  "testerRole": "solo_vehicle | trailer | convoy | family_pets | product_reviewer | engineering_reviewer",
  "regionLabel": "string; no precise private location",
  "routeLabel": "string; no precise private location",
  "buildLabel": "string",
  "featureFlags": {
    "campopsRecommendationsEnabled": true,
    "campopsSourceTransparencyEnabled": true,
    "campopsEndpointRecommendationEnabled": true,
    "campopsDecisionPointsEnabled": true,
    "campopsProviderAdaptersEnabled": false,
    "campopsAiAssistEnabled": false,
    "campopsDebriefCommunityPublishingEnabled": false,
    "campopsTelemetryEnabled": false
  },
  "scenario": {
    "mode": "planning | delayed | endpoint_selection | offline_cached | offline_no_cache | debrief",
    "delayScenario": "none | 30m | 1h | 2h | custom | not_applicable",
    "vehicleContext": "solo | trailer | full_size | convoy | unknown",
    "resourceContext": "normal | low_fuel | low_water | low_fuel_and_water | unknown",
    "offlineContext": "online | degraded | offline_cached | offline_no_cache"
  },
  "providerReadiness": {
    "reportId": "string | null",
    "legalAccessReadiness": "ready | watch | not_ready | disabled | unknown",
    "closureReadiness": "ready | watch | not_ready | disabled | unknown",
    "fireReadiness": "ready | watch | not_ready | disabled | unknown",
    "weatherReadiness": "ready | watch | not_ready | disabled | unknown",
    "serviceReadiness": "ready | watch | not_ready | disabled | unknown"
  },
  "feedback": {
    "recommendationWasUseful": "yes | no | mixed | not_applicable",
    "recommendationWasConfusing": "yes | no | mixed",
    "sourceConfidenceWasClear": "yes | no | mixed",
    "staleDataWarningWasClear": "yes | no | mixed | not_applicable",
    "legacyResultConflictObserved": "yes | no | not_applicable",
    "aiWordingConcern": "yes | no | not_applicable",
    "mobileUiIssue": "yes | no",
    "providerDataWrong": "yes | no | unknown",
    "privacyConcern": "yes | no"
  },
  "details": {
    "whatWorked": "string",
    "whatWasConfusing": "string",
    "providerMismatchSummary": "string; no precise private coordinates",
    "aiConcernSummary": "string; no raw prompts",
    "mobileUiIssueSummary": "string",
    "privacyConcernSummary": "string",
    "screenshotsAttached": false
  },
  "outcome": {
    "testerWouldUseAgain": "yes | no | maybe",
    "recommendedFollowUp": "provider_validation | mobile_ui | ai_guardrail | privacy_review | legacy_coexistence | no_action | other",
    "severity": "low | medium | high | critical"
  }
}
```

## Privacy And Governance Guardrails

- Do not require community publishing.
- Do not enable `campopsDebriefCommunityPublishingEnabled`.
- Do not enable telemetry unless a sink is explicitly approved.
- Do not include precise private coordinates in shared test artifacts.
- Do not include raw AI prompts, private debrief notes, user ids, vehicle ids, VINs, or raw photo refs in feedback.
- Use region labels and route labels for shared reports.
- Treat CampOps as a decision-support system under validation, not as a legal/access authority.

## Exit Criteria For Closed Field Test

Closed field testing is complete for a route/region label when:

- Mobile QA evidence exists for that build and device class.
- Provider readiness report exists for the region label.
- At least one delayed-day scenario is exercised.
- At least one stale/offline scenario is exercised.
- Tester feedback is captured with the privacy-safe schema.
- Any critical provider/legal/access mismatch is filed as a launch blocker.
- Community publishing remained off.
- Telemetry was either off or explicitly approved before the test.
