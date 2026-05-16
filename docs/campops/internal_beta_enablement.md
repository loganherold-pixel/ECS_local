# CampOps Internal Beta Enablement

CampOps internal beta is a controlled evaluation path for ECS engineers, product reviewers, and selected internal testers. It is not a closed field test, limited regional rollout, or public rollout.

## Purpose

Use this package to evaluate whether CampOps recommendation cards, endpoint recommendations, source transparency, and decision-point logic are understandable with controlled internal data and fixtures.

Internal beta should answer:

- Are recommended, backup, and emergency endpoint cards understandable?
- Are stale, missing, unknown, and conflicting source warnings visible?
- Does the delayed-day endpoint flow help explain when to divert?
- Does legacy camp search coexist without contradicting CampOps recommendations?
- Are privacy defaults intact while testers give feedback?

## Who May Enable CampOps

CampOps internal beta may be enabled only by:

- ECS engineers validating the CampOps integration.
- Product/design reviewers using controlled internal builds.
- Internal testers who have read this enablement package, `mobile_qa.md`, and the relevant rollout limitations.

Do not enable CampOps for general users, public beta users, community debrief publishing, or production telemetry through this package.

## Required Flag Posture

All CampOps flags remain default-off in source/config. Internal beta enablement is an explicit runtime/config decision for controlled builds only.

The Navigate Mapbox CampOps surface is gated by a single internal beta environment flag:

```bash
EXPO_PUBLIC_ENABLE_CAMPOPS_INTERNAL_BETA=true
```

Use the non-public alias `ENABLE_CAMPOPS_INTERNAL_BETA=true` only in server-side or local Node harnesses. Leave both unset or `false` for normal production/public behavior. Dev mode alone does not enable CampOps pins, provider calls, scoring, or Camp Intel UI.

Internal beta activation should resolve through `resolveCampOpsInternalBetaActivation()` in `lib/campops/campOpsRecommendationConfig.ts`. Do not turn on CampOps for internal beta by passing raw rollout flags for a general user. The activation helper requires an approved tester id, email, explicit `approved: true`, or membership in an allowed internal beta cohort.

| Flag | Internal beta posture | Notes |
| --- | --- | --- |
| `campopsRecommendationsEnabled` | Controlled internal only | Enables deterministic CampOps recommendation sets and cards. |
| `campOpsRecommendationSetEnabled` | Do not use directly | Legacy alias only; prefer `campopsRecommendationsEnabled`. |
| `campopsEndpointRecommendationEnabled` | Controlled internal only | Enables Find Safe End Point / delayed-day flow for internal review. |
| `campopsDecisionPointsEnabled` | Controlled internal only | Enable only when route/progress data is present enough to review. |
| `campopsSourceTransparencyEnabled` | Controlled internal only | Recommended for internal beta so testers can inspect source confidence, stale data, conflicts, and missing data. |
| `campopsProviderValidationShadowModeEnabled` | Dev/shadow only | Allowed for provider quality diagnostics. Must not affect user-facing recommendations. |
| `campopsProviderAdaptersEnabled` | Shadow/dev only unless approved | Keep off unless a specific provider/category/region has readiness approval. |
| `campopsAiAssistEnabled` | Off unless real-output review passes | Keep off until a configured real-model adversarial review passes for the active model/config. |
| `campopsDebriefCommunityPublishingEnabled` | Off | Must remain off. Community publishing is not part of internal beta. |
| `campopsTelemetryEnabled` | Off | Must remain off unless a sink has explicit product/privacy approval. |
| `campopsTelemetrySinkApproved` | Off | Must remain off unless product/privacy approve the sink, retention, access, and joining behavior. |

Minimum internal beta review posture:

```json
{
  "testerGate": "approved tester id/email/cohort required",
  "envGate": "EXPO_PUBLIC_ENABLE_CAMPOPS_INTERNAL_BETA=true for internal beta builds only",
  "campopsRecommendationsEnabled": true,
  "campopsEndpointRecommendationEnabled": true,
  "campopsDecisionPointsEnabled": true,
  "campopsSourceTransparencyEnabled": true,
  "campopsProviderValidationShadowModeEnabled": true,
  "campopsProviderAdaptersEnabled": false,
  "campopsAiAssistEnabled": false,
  "campopsDebriefCommunityPublishingEnabled": false,
  "campopsTelemetryEnabled": false
}
```

Example activation shape:

```ts
const activation = resolveCampOpsInternalBetaActivation({
  tester: {
    testerId: 'internal-tester-id',
    cohorts: ['campops-internal-beta']
  },
  allowlistedTesterIds: ['internal-tester-id'],
  allowedCohorts: ['campops-internal-beta'],
  requestedFlags: {
    campopsRecommendationsEnabled: true,
    campopsEndpointRecommendationEnabled: true,
    campopsDecisionPointsEnabled: true,
    campopsSourceTransparencyEnabled: true,
    campopsProviderValidationShadowModeEnabled: true
  }
});

// Use activation.rolloutConfig only when activation.enabled is true.
```

## Flags That Must Remain Off

These must remain off for internal beta:

- `campopsDebriefCommunityPublishingEnabled`
- `campopsTelemetryEnabled`
- `campopsTelemetrySinkApproved`

These must remain off unless a named approval exists:

- `campopsProviderAdaptersEnabled`: requires explicit provider/category/region readiness approval and `providerInfluenceApproved=true` in the activation helper.
- `campopsAiAssistEnabled`: requires PR 52 real-output review approval for the active model/config and `aiAssistRealOutputReviewApproved=true` in the activation helper.

The internal beta activation helper forces community publishing and telemetry off even if a caller requests them.

## Navigate Mapbox Internal Beta Behavior

With `EXPO_PUBLIC_ENABLE_CAMPOPS_INTERNAL_BETA=false` or unset:

- CampOps route pins are inactive.
- Route, preview, and search-area flows do not request CampOps recommendation payloads.
- Camp Intel does not appear from CampOps pins.
- Demo or fixture camps are not shown as production fallback camps.

With `EXPO_PUBLIC_ENABLE_CAMPOPS_INTERNAL_BETA=true` in a controlled internal build:

- Navigate may attach the deterministic CampOps recommendation set to route/search-area candidate scans.
- Up to five qualifying CampOps pins may render through the shared ECS camp pin style.
- Camp Intel opens for visible CampOps pins and uses ECS-Inferred, confidence-based language.
- Provider adapters, AI assist, telemetry, and community publishing remain off unless their separate explicit approvals are present.

## Provider Mode Requirements

Provider quality is not proven for real legal/access, closure, fire, weather, or service data.

Allowed:

- Run `campopsProviderValidationShadowModeEnabled=true` for region labels or fixture cohorts.
- Generate provider readiness reports using region labels, not precise private coordinates.
- Review coverage, freshness, unknown, stale, missing-data, and conflict rates.

Not allowed without provider readiness approval:

- Enabling provider outputs to affect recommendations.
- Treating fixture readiness as real regional readiness.
- Marking legal/access, closure, fire, weather, or service data as authoritative.

Use `campopsProviderValidationShadowModeEnabled` for diagnostics. `campopsProviderAdaptersEnabled` must remain false unless the exact provider/category/region has readiness approval and the activation helper is called with `providerInfluenceApproved=true`.

Reference:

- `docs/campops/provider_readiness.md`
- `docs/campops/provider_readiness_region_001.md`
- `docs/campops/source_adapters.md`

## AI Assist Requirements

AI assist must remain off by default.

AI may be enabled only for a specific internal review session when:

- `docs/campops/ai_real_output_review.md` records a configured real-model run for the active model/config.
- The real-output review has no critical post-parser failures.
- Product/privacy approve the model/config path for internal review.
- Testers understand AI narrates CampOps output and does not choose camps.
- The internal beta activation helper is called with `aiAssistRealOutputReviewApproved=true`.

AI must not receive private user ids, vehicle ids, convoy ids, raw debrief notes, raw provider payloads, raw AI prompts, or precise private trip data. AI must not override hard gates, recommend rejected camps, or soften stale/missing/conflict warnings.

## Telemetry Requirements

Telemetry remains off for internal beta unless separately approved.

Telemetry cannot emit unless all are true:

- `campopsTelemetryEnabled=true`
- a sink is configured
- `campopsTelemetrySinkApproved=true`
- payload validation passes

Internal beta does not require telemetry. If feedback is needed, use the feedback schema in this document rather than enabling analytics.

## Community Debrief Requirements

Community debrief publishing remains off.

Allowed:

- Private debrief capture for internal testing.
- Private structured feedback that helps personal/internal review.

Not allowed:

- Community-visible debrief publishing.
- Public feed/export of debriefs.
- Raw photo refs, exact user ids, vehicle associations, or precise private locations in shared feedback artifacts.

Reference: `docs/campops/debrief.md`.

## Privacy Requirements

Internal beta testers must use controlled data and avoid shared artifacts with sensitive details.

Required:

- Use region labels and route labels instead of precise private coordinates.
- Keep community publishing off.
- Keep telemetry off unless explicitly approved.
- Treat local debrief storage as unencrypted because CampOps does not provide an encryption layer.
- Do not include private debrief notes, raw AI prompts, user ids, vehicle ids, VINs, raw photo refs, or exact camp coordinates in shared feedback.
- Use source transparency to verify stale, missing, cached, unknown, and conflicting data is visible.

Reference: `docs/campops/privacy_storage_review.md`.

## Mobile QA Prerequisites

Before internal beta testers use CampOps cards on Android, run the deterministic checks in `docs/campops/mobile_qa.md`.

At minimum:

```bash
node ./scripts/test-campops-search-integration.js
node ./scripts/test-campops-ui-cards.js
node ./scripts/test-campops-safe-endpoint.js
node ./scripts/test-campops-ai-assist.js
node ./scripts/test-campops-mobile-qa-harness.js
npx tsc --noEmit
npm run lint
```

Manual Android evidence is still required before closed field test. Internal beta may proceed with partial mobile QA only if testers know Android device evidence remains a blocker.

Review these states:

- feature flag off and on
- recommended, backup, and emergency endpoint cards
- planned camp downgraded
- stale source and source conflict warnings
- unknown legal, closure, fire, weather, service data
- low fuel and low water
- trailer and large group cautions
- offline cached and offline no-cache states
- long camp names and long warning lists
- expanded/collapsed AI and "Why this recommendation?" sections

## Known Limitations

- Real provider quality is unproven by region.
- Android emulator/physical-device QA evidence is incomplete.
- AI assist has fixture and dry-run adversarial coverage, but a configured real-model review is still required before tester enablement.
- CampOps local debrief storage is not encrypted by CampOps.
- Community publishing is blocked.
- Telemetry sinks are not approved.
- Legacy search results still coexist beside CampOps cards.
- CampOps should be treated as decision support, not as a legal/access authority.

## Tester Feedback Expectations

Testers should submit privacy-safe feedback after each review session. Use the schema below in internal notes, issue templates, or release review docs.

Do not include precise private coordinates, raw AI prompts, raw debrief notes, user ids, vehicle ids, VINs, or raw photo refs.

The repository feedback capture path is `lib/campops/campOpsInternalBetaFeedback.ts`.

Use:

- `CampOpsInternalBetaFeedbackService.captureFeedback(...)` for private/internal review capture.
- `createCampOpsInternalBetaFeedbackRecord(...)` when a caller needs deterministic normalization before storage.
- `exportCampOpsInternalBetaFeedbackForReview(...)` to create a privacy-safe internal review summary.

Classify feedback using `docs/campops/internal_beta_issue_rubric.md`. P0 issues and unresolved P1 issues block closed field testing. Multiple related P2 issues may also block closed field testing when they obscure legal/access confidence, stale data, late-arrival risk, emergency fallback behavior, or source warnings.

Privacy defaults:

- Feedback defaults to `private`.
- Precise coordinates, private user ids, vehicle identifiers, raw AI prompts, and private debrief notes are not stored.
- Freeform notes are retained only after coordinate-like text is redacted.
- Feedback has no community publishing state machine and must not be treated as a CampOps debrief.
- Feedback capture does not emit telemetry. Telemetry remains governed separately by the telemetry approval gate.

```json
{
  "campopsInternalBetaFeedbackVersion": 1,
  "testerRole": "engineering | product | design | internal_field_reviewer",
  "buildLabel": "string",
  "regionLabel": "string; no precise private location",
  "routeLabel": "string; no precise private location",
  "featureFlags": {
    "campopsRecommendationsEnabled": true,
    "campopsProviderAdaptersEnabled": false,
    "campopsAiAssistEnabled": false,
    "campopsEndpointRecommendationEnabled": true,
    "campopsDecisionPointsEnabled": true,
    "campopsSourceTransparencyEnabled": true,
    "campopsDebriefCommunityPublishingEnabled": false,
    "campopsTelemetryEnabled": false,
    "campopsTelemetrySinkApproved": false
  },
  "scenario": {
    "mode": "planning | delayed_day | endpoint_selection | offline_cached | offline_no_cache | debrief",
    "delayScenario": "none | 30m | 1h | 2h | custom | not_applicable",
    "vehicleContext": "solo | trailer | full_size | convoy | unknown",
    "resourceContext": "normal | low_fuel | low_water | low_fuel_and_water | unknown",
    "offlineContext": "online | degraded | offline_cached | offline_no_cache"
  },
  "feedback": {
    "confusingRecommendation": "yes | no | mixed",
    "incorrectProviderData": "yes | no | unknown | not_applicable",
    "staleMissingWarningClarity": "clear | unclear | mixed | not_applicable",
    "aiWordingConcern": "yes | no | not_enabled",
    "uiCrampedOrOverflowIssue": "yes | no",
    "legacyResultConflict": "yes | no | not_applicable",
    "privacyConcern": "yes | no",
    "endpointRecommendationUsefulness": "useful | not_useful | mixed | not_tested",
    "decisionPointUsefulness": "useful | not_useful | mixed | not_available"
  },
  "notes": {
    "whatWorked": "string",
    "whatWasConfusing": "string",
    "sourceOrProviderConcern": "string; no precise private coordinates",
    "aiConcern": "string; no raw prompts",
    "mobileUiConcern": "string",
    "legacyConflictSummary": "string",
    "privacyConcernSummary": "string",
    "recommendedFollowUp": "provider_validation | mobile_qa | ai_review | privacy_review | legacy_coexistence | ui_copy | no_action | other"
  },
  "severity": "low | medium | high | critical"
}
```

## Rollback Steps

Use the narrowest rollback that removes the problem:

1. Disable `campopsAiAssistEnabled` if AI wording is confusing, overconfident, or insufficiently reviewed.
2. Disable `campopsProviderAdaptersEnabled` if provider data is wrong, stale, conflicting, or not approved for the test cohort.
3. Disable `campopsDecisionPointsEnabled` if decision points are confusing or route progress is insufficient.
4. Disable `campopsEndpointRecommendationEnabled` if delayed-day endpoint output is not useful.
5. Disable `campopsSourceTransparencyEnabled` only if the source details create UI noise; keep this on when debugging provider confidence.
6. Disable `campopsRecommendationsEnabled` to return fully to legacy camp search behavior.
7. Keep `campopsDebriefCommunityPublishingEnabled`, `campopsTelemetryEnabled`, and `campopsTelemetrySinkApproved` off.

For a full beta rollback, use `rollbackCampOpsInternalBetaActivation()` or equivalent config that resolves every CampOps rollout flag to false.

After rollback, capture:

- flag state before and after
- scenario id
- reason for rollback
- whether legacy behavior resumed correctly
- required follow-up

## Internal Beta Exit Criteria

Internal beta preparation is complete when:

- Flag posture is documented in the test build or review notes.
- CampOps card and endpoint flows have been reviewed with controlled internal data.
- Feedback has been captured using the schema above.
- Any high or critical recommendation, source, privacy, or UI issues are documented as blockers.
- Closed field test prerequisites remain separate and unresolved until mobile device QA and provider readiness evidence are complete.
