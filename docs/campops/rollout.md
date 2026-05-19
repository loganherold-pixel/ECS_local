# CampOps Rollout Matrix

CampOps rollout controls live in `lib/campops/campOpsRecommendationConfig.ts`. Defaults are conservative: all new CampOps feature areas are off unless a caller explicitly enables them.

Production callers should resolve flags through `getCampOpsFeatureState()` or the typed helpers in `lib/campops/campOpsRecommendationConfig.ts`. Generic `enabled: true` shortcuts are compatibility-only and must not enable CampOps behavior by themselves.

## Flags

| Flag | Default | Purpose | Dependencies |
| --- | --- | --- | --- |
| `campopsRecommendationsEnabled` | `false` | Enables the deterministic CampOps recommendation set in camp search integration. | None |
| `campOpsRecommendationSetEnabled` | `false` | Legacy alias for `campopsRecommendationsEnabled`. | None |
| `campopsProviderAdaptersEnabled` | `false` | Allows external provider/source signals to affect enrichment, hard gates, scoring, and recommendations. | Requires `campopsRecommendationsEnabled` |
| `campopsAiAssistEnabled` | `false` | Allows callers to expose CampOps recommendation sets to the AI assist narrator. | Requires `campopsRecommendationsEnabled` |
| `campopsEndpointRecommendationEnabled` | `false` | Enables the Find Safe End Point / delayed-day recommendation flow. | Requires `campopsRecommendationsEnabled` |
| `campopsDecisionPointsEnabled` | `false` | Enables route/progress decision point output inside endpoint recommendations. | Requires `campopsEndpointRecommendationEnabled` |
| `campopsDebriefCommunityPublishingEnabled` | `false` | Allows community-visible anonymized debrief publishing when explicit consent is also present. | Independent; still requires debrief consent |
| `campopsSourceTransparencyEnabled` | `false` | Exposes normalized source signal/resolution summaries for UI and AI transparency. | Requires `campopsRecommendationsEnabled` |
| `campopsProviderValidationShadowModeEnabled` | `false` | Allows provider validation harnesses to collect and summarize provider output in shadow mode without changing recommendations. | Independent; does not apply provider output |
| `campopsTelemetryEnabled` | `false` | Allows CampOps telemetry helpers to emit privacy-safe events, but only when a sink is configured and approved. | Independent; also requires telemetry sink approval |

## Dependency Behavior

`resolveCampOpsRecommendationRolloutConfig` normalizes dependencies:

- Provider adapters, AI assist, endpoint recommendations, and source transparency cannot become enabled while recommendations are disabled.
- Decision points cannot become enabled while endpoint recommendations are disabled.
- Community debrief publishing remains independent from recommendations, but validation still requires explicit user consent.
- Provider validation shadow mode remains independent from recommendations and provider adapters because it is observational only.
- Telemetry remains independent from recommendations because it is observational only, but it also requires a configured sink and explicit `campopsTelemetrySinkApproved` runtime approval before any event emits.

## Internal Beta Activation Controls

Controlled internal beta builds should use `resolveCampOpsInternalBetaActivation()` instead of passing raw rollout flags for a general user. The helper accepts tester id, email, explicit approval, or cohort membership plus the allowlists for the active build. Non-approved testers receive the default-off rollout config even if requested flags are true.

Navigate route pins and Camp Intel are additionally gated by the explicit build/session flag `EXPO_PUBLIC_ENABLE_CAMPOPS_INTERNAL_BETA=true` or the local Node alias `ENABLE_CAMPOPS_INTERNAL_BETA=true`. The deprecated route-pin flag and `__DEV__` mode do not enable CampOps by themselves. Normal production/public builds should leave the internal beta flag unset or `false`, which keeps CampOps route pins, CampOps scoring, and CampOps UI inactive.

The internal beta activation helper may enable only the controlled beta surfaces:

- `campopsRecommendationsEnabled`
- `campOpsRecommendationSetEnabled`
- `campopsEndpointRecommendationEnabled`
- `campopsDecisionPointsEnabled`
- `campopsSourceTransparencyEnabled`
- `campopsProviderValidationShadowModeEnabled`

The helper keeps community publishing and telemetry off unless their own approval inputs are provided. Provider adapters can influence recommendations only when `providerInfluenceApproved=true` is provided for the active provider/category/region. AI assist can be enabled only when `aiAssistRealOutputReviewApproved=true` is provided for the active model/config. Telemetry can be enabled only when `telemetrySinkPrivacyApproved=true` is provided, and community publishing can be enabled only when `communityPublishingApproved=true` is provided.

Use `rollbackCampOpsInternalBetaActivation()` for a full internal beta rollback. It returns every CampOps rollout flag to false and preserves the legacy camp search path.

## Risk-Accepted Restricted Closed Field Test

Risk-accepted closed field-test builds should use `resolveCampOpsRiskAcceptedRestrictedFieldTestActivation()` instead of raw rollout flags. This is not full readiness and does not approve provider influence, public release, AI assist, telemetry, community publishing, or broad privacy/storage rollout. It only allows a restricted field test when risk acceptance is explicitly accepted and the active tester cohort, build identifier, region label, route label, and scenario label match the approved risk-acceptance scope.

When accepted and scoped correctly, the helper may enable only deterministic field-test surfaces:

- `campopsRecommendationsEnabled`
- `campOpsRecommendationSetEnabled`
- `campopsSourceTransparencyEnabled`
- `campopsProviderValidationShadowModeEnabled`
- `campopsEndpointRecommendationEnabled` only for approved delayed-day scenario labels
- `campopsDecisionPointsEnabled` only when an approved delayed-day scenario also has route/progress data that supports review

The helper keeps risky surfaces off unless their own exact approvals exist:

- `campopsProviderAdaptersEnabled=false` unless exact category/region provider influence approval exists.
- `campopsAiAssistEnabled=false` unless exact model/config real-output approval exists.
- `campopsTelemetryEnabled=false` unless sink/privacy approval exists.
- `campopsDebriefCommunityPublishingEnabled=false` unless exact community governance approval exists.

Restricted field-test activation must use labels only, approved testers only, approved builds only, and manual privacy-safe feedback after every session. Provider validation may run in shadow mode, but unapproved provider output must remain shadow-only/unknown and must not influence recommendations. Region/category approval must be based on real upstream provider evidence; fixture-backed readiness is not enough to enable provider adapters.

## Production Caller Behavior

- `withCampOpsSearchPayload` and `generateCampOpsSearchPayload` attach CampOps output only when `rolloutConfig.campopsRecommendationsEnabled` resolves true.
- Navigate passes the CampOps rollout config to route/search-area candidate scans only when `EXPO_PUBLIC_ENABLE_CAMPOPS_INTERNAL_BETA` or `ENABLE_CAMPOPS_INTERNAL_BETA` resolves true.
- `campsiteLocatorService` maps its public `campopsRecommendationsEnabled` input into the shared rollout config before calling CampOps. Its legacy `enabled` shortcut is not used.
- Provider source signals and provider bundle warnings/errors are ignored unless `campopsProviderAdaptersEnabled` resolves true.
- Source transparency details (`sourceSignals` and `sourceResolutions`) are stripped unless `campopsSourceTransparencyEnabled` resolves true.
- `findCampOpsSafeEndPoint` runs only when `campopsEndpointRecommendationEnabled` resolves true; `enabled: true` is ignored unless the explicit rollout flags are present.
- Decision point output is emitted only when `campopsDecisionPointsEnabled` resolves true.
- `isCampOpsAiAssistAvailable` returns true only when `campopsAiAssistEnabled` resolves true, so model-call sites should check it before generating summaries.
- Community-visible debrief publishing requires `campopsDebriefCommunityPublishingEnabled` plus explicit publishing consent.
- Provider validation shadow mode runs only when `campopsProviderValidationShadowModeEnabled` is true and never applies shadow output to recommendations.
- CampOps telemetry emits only when `campopsTelemetryEnabled` is true, a sink is configured, the sink is approved, and the payload passes privacy validation.

## Off-State Expectations

- Internal beta flag off: Navigate route/search-area scans do not request CampOps payloads, no CampOps pins render, and Camp Intel cannot open from CampOps pins.
- Recommendations off: `withCampOpsSearchPayload` returns the original result object and does not attach `campOps`.
- Provider adapters off: candidate generation can still run, but external source signals/provider bundles do not alter gates or scoring.
- Endpoint recommendations off: `findCampOpsSafeEndPoint` returns a disabled summary and no recommendation.
- Decision points off: endpoint recommendations can still run, but no decision point is emitted.
- AI assist off: callers should skip CampOps AI summary generation.
- Source transparency off: detailed `sourceSignals` and `sourceResolutions` are stripped from the exposed recommendation payload.
- Community debrief publishing off: community-visible debrief validation fails even when consent is present.
- Provider validation shadow mode off: provider validation returns a disabled summary and does not collect provider outputs.
- Telemetry off, sink missing, or sink approval missing: no CampOps telemetry event is stored or sent.

## Recommended Rollout Order

1. Internal fixtures only.
2. CampOps cards visible to internal testers.
3. Provider validation shadow mode enabled for limited regions/sources.
4. Provider adapters enabled for limited regions/sources after validation.
5. Endpoint recommendations enabled.
6. AI assist summaries enabled.
7. Debrief private capture.
8. Privacy-approved telemetry sink for internal recommendation quality monitoring, if needed.
9. Community anonymized debriefs only after privacy review.

## Acceptance Gates

Rollout decisions should reference `docs/campops/product_acceptance_review.md` before enabling each cohort. Controlled internal beta enablement should also follow `docs/campops/internal_beta_enablement.md`. Closed field testing must pass `docs/campops/closed_field_test_readiness.md`.

| Cohort | Required acceptance gate |
| --- | --- |
| Internal dev | Core pipeline, feature flags, fixture tests, and docs are `pass`. |
| Internal beta | Mobile QA is at least partially executed, community publishing remains off, and AI/telemetry are explicitly gated. |
| Restricted closed field test | `closed_field_test_readiness.md` reports `ready_with_restrictions` / `risk_accepted_restricted_closed_field_test`: no unresolved P0/P1, Android/device QA complete for the guarded packet, guarded privacy/storage approved, rollback path present, community publishing off, telemetry off unless approved, AI assist disabled unless approved, and provider influence shadow-only unless exact provider/category/region approval exists. |
| Closed field test without risk acceptance | All closed-field gates pass without risk acceptance: provider readiness approved for the target region/category, Android/device QA complete, privacy/storage approved, rollback verified, community publishing off, telemetry off unless approved, and AI assist approved or disabled. |
| Limited region rollout | Provider quality, source freshness, stale/unknown/conflict rates, support plan, and rollback plan are accepted for the region. |
| Broad rollout | Multiple regions pass provider readiness, community governance is approved if used, and field evidence supports user comprehension of confidence/missing-data copy. |

Current product acceptance status is tracked in the launch blocker registry in `product_acceptance_review.md`. A feature flag being technically available does not mean the corresponding product area is launch-ready.

A risk-accepted restricted closed field test is not the same as full closed-field readiness. The current packet has accepted restricted risk, Android/device QA for the guarded packet, and guarded privacy/storage approval, but provider influence remains unapproved and broad rollout remains blocked. Any alternate restricted path requires an explicitly accepted `docs/campops/closed_field_test_risk_acceptance.md` with product, safety, privacy, and engineering sign-offs, a recorded expiration date, approved tester cohort, approved build, approved labels, incident contact, and rollback owner/path.

## Executable Closed Field-Test Gate

Before any closed field-test build review, run:

```bash
npm run gate:campops-live-readiness:json
npm run gate:closed-field-test:json
```

The JSON closed-field gate reads the evidence docs and currently reports `ready_with_restrictions` / `risk_accepted_restricted_closed_field_test` for the accepted restricted packet. The aggregate gate remains useful for broader release review:

1. `npm run smoke`
2. `npm run gate:android-qa`
3. `npm run gate:provider-readiness`
4. `npm run gate:privacy-storage`
5. `npm run gate:ai-assist`
6. `npm run gate:closed-field-test`

The aggregate may pass for a restricted closed field test only when all gates pass or when `docs/campops/closed_field_test_risk_acceptance.md` is explicitly accepted with real sign-offs and scope. That posture is restricted to approved testers, approved labels only, and the recorded expiration date. It must preserve rollback, manual privacy-safe feedback after every session, and all non-negotiable restrictions.

Passing `npm run smoke` does not mean closed field testing is ready. Smoke only verifies the app can be inspected headlessly; Android/device QA, provider readiness, privacy/storage approval, AI assist approval, telemetry approval, and community publishing posture remain separate release gates.

Android/device QA guard:

- Run `npm run gate:android-qa` before any closed field-test promotion.
- The gate is static and reads `mobile_qa_evidence.md`; it does not run adb, Expo, Expo Go, emulator, simulator, or physical hardware.
- Android/device QA must still be completed separately and evidenced with tester/device/build/date fields plus screenshot or artifact references.

Provider readiness guard:

- Run `npm run gate:provider-readiness` before requesting provider influence for a closed field-test build.
- Fixture-backed validation is not approval.
- Real-shadow validation is not approval unless the target region/category approval fields are complete.
- Provider influence must remain shadow-only or unknown for every unapproved category.
- `campopsProviderAdaptersEnabled` must remain false outside the exact approved region/category/route scope.
- Source transparency must stay visible during any closed field-test provider review.
- Legal/access, closure, fire, weather, and service/resupply data must not be marked ready for broader regional rollout until real provider coverage, freshness, unknown, stale, and conflict rates are validated and accepted.

Privacy/storage guard:

- Run `npm run gate:privacy-storage` before any closed field-test data posture review.
- The gate must fail while owner, approval date, retention, deletion, storage/encryption, and access-control approval are incomplete.
- Telemetry must remain disabled unless sink, retention, access, and privacy approval are recorded.
- Community publishing must remain disabled.

AI assist guard:

- Run `npm run gate:ai-assist` before any closed field-test build review that includes CampOps AI assist.
- The gate may pass while AI assist is disabled; that does not approve AI assist for testers.
- `campopsAiAssistEnabled` must remain false unless the exact active model/config has approved real-output review.
- AI output must never override CampOps hard gates, provider truth, stale/missing/conflict warnings, or privacy gates.

Smoke requirements:

- `npm run smoke` must pass before closed field-test build review.
- `npm run smoke` is headless and must not start Expo, launch Expo Go, use a simulator/emulator/device, or require network.
- `npm run smoke:bundle` is recommended before Android/device QA when dependencies are installed and local export is appropriate.
- `npm run smoke:bundle` does not replace Android/device QA. Android/device QA remains a separate evidence requirement in `mobile_qa_evidence.md` and `closed_field_test_readiness.md`.

Closed field-test posture remains restricted:

- Provider influence remains shadow-only unless the exact target region and provider category readiness is approved.
- AI assist remains disabled unless the exact model/config real-output review is approved.
- Community publishing remains disabled.
- Telemetry remains disabled unless sink/privacy approval is recorded.
- Rollback must remain verified for the active build.
- Risk-accepted field tests must use labels only and expire on the recorded expiration date.

No CI workflow is configured in this repository for closed field-test readiness. Release visibility is documented in `docs/release/closed_field_test_ci_guard.md`. If CI is added later, this aggregate should be a manual, release-only, or informational field-test visibility gate, not a blocker for ordinary development builds.

## Legacy Camp Ranking Migration

CampOps and legacy camp search intentionally coexist during rollout. The legacy result shape remains the compatibility contract until Navigate, camp intel, locator services, and tests no longer require `CampsiteCandidateResult`.

| Stage | Flag posture | User-facing behavior | Migration requirement |
| --- | --- | --- | --- |
| 0. Legacy only | `campopsRecommendationsEnabled=false` | Legacy search/filter/ranking output only. | Preserve existing result shape and order. |
| 1. Cards + list | `campopsRecommendationsEnabled=true` for testers | CampOps cards appear while legacy list remains `Search results`. | Do not call legacy top result the endpoint recommendation. |
| 2. Annotated list | Recommendations on; source transparency optional | Legacy list entries can show CampOps statuses such as `Recommended endpoint`, `CampOps caution`, or `Not recommended`. | Use `campOpsRecommendationToLegacyDisplayFields` for compatibility metadata. |
| 3. CampOps-powered ordering | Recommendations on after parity validation | Primary camp ordering can be produced from CampOps roles/scores while preserving legacy display fields. | Gate behind rollout, use `orderLegacyCandidatesByCampOpsCompatibility` or successor, and keep rollback to legacy order. |
| 4. Legacy ranking retired or compatibility-only | Recommendations broadly enabled | CampOps is the central recommendation pipeline; legacy scores are display/diagnostic fields only. | Remove deprecated ranking only after tests prove no consumer depends on old semantics. |

Compatibility helpers live in `lib/campops/campOpsLegacyCoexistence.ts`:

- Legacy candidate to CampOps candidate: `campOpsCandidateFromLegacySearchResult`.
- Legacy candidate to partial enrichment: `campOpsEnrichmentDraftFromLegacyCandidate`.
- CampOps recommendation to legacy display metadata: `campOpsRecommendationToLegacyDisplayFields`.
- Future compatibility ordering: `orderLegacyCandidatesByCampOpsCompatibility`.

No production caller should use Stage 3 ordering until a dedicated flag or rollout decision enables CampOps-powered ordering. Feature flag off must continue returning the unmodified legacy result.

## Rollback Plan

Rollback should disable the narrowest flag first:

1. Disable `campopsAiAssistEnabled` if summaries become confusing or overconfident.
2. Disable `campopsDecisionPointsEnabled` if route-progress decision points are not reliable enough.
3. Disable `campopsEndpointRecommendationEnabled` if delayed-day recommendations need more validation.
4. Disable `campopsProviderAdaptersEnabled` if upstream data is stale, conflicting, or regionally incomplete.
5. Leave `campopsProviderValidationShadowModeEnabled` on only for diagnostic regional validation, or disable it if provider diagnostics are noisy.
6. Disable `campopsSourceTransparencyEnabled` if UI details are noisy while keeping deterministic recommendations available.
7. Disable `campopsTelemetryEnabled` or remove `campopsTelemetrySinkApproved` if event payload handling, retention, or sink behavior needs review.
8. Disable `campopsRecommendationsEnabled` to preserve legacy camp search output entirely.
9. Keep `campopsDebriefCommunityPublishingEnabled` off until privacy review approves community publishing.

## Verification

Run:

```bash
npm run test:campops-rollout
npm run test:campops-provider-validation
node ./scripts/test-campops-search-integration.js
node ./scripts/test-campops-safe-endpoint.js
node node_modules/typescript/bin/tsc --noEmit
npm run lint
```

The rollout test covers recommendation off behavior, provider adapter gating, source transparency gating, provider validation gating, endpoint gating, decision point gating, AI assist availability, and community debrief publishing validation.
