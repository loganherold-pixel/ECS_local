# CampOps Legacy Camp Filter Cleanup

This note tracks the first cleanup pass that aligns the legacy campsite candidate path with CampOps while preserving the existing UI/API output shape.

## Current Legacy Path

- `lib/campsiteCandidateEngine.ts`
  - Detects route/polygon campsite zones.
  - Computes legacy route-day/display scores such as `qualityScore`, `suitabilityScore`, confidence, fallback stage, and marker order.
  - Runs `applyLegacyCampsiteDisplayFilter` before publishing `CampsiteCandidateResult`.
- `lib/campsites/campsiteViabilityFilter.ts`
  - Preserves the existing compatibility API:
    - `evaluateCampsiteCandidateViability`
    - `isViableCampsiteCandidate`
    - `filterViableCampsiteCandidates`
  - Adds `filterCampCandidatesPassingLegacyHardGates` as the clearer name for new callers.
- `lib/campops/campOpsSearchIntegration.ts`
  - Builds CampOps candidates/enrichments from the legacy result and runs CampOps behind the existing feature flag.

## Legacy Shape Consumers

These callers still expect the legacy `CampsiteCandidateResult` / `CampsiteCandidate` shape and should remain compatible during migration:

- `components/navigate/CampsiteCandidatePanel.tsx`
  - Reads `suggestedCampsites`, legacy confidence, rating, score, reasons, and candidate coordinates for the visible list.
  - Can display CampOps annotations, but still renders legacy cards.
- `app/(tabs)/navigate.tsx`
  - Subscribes to `campsiteCandidateEngine`, stores route/polygon candidate state, compares route/polygon ownership, and feeds map/panel rendering.
- `lib/campsiteCandidateEngine.ts`
  - Owns persistence, candidate notifications, route/polygon cleanup, and the published result object.
- `lib/campsites/campsiteLocatorService.ts`
  - Wraps route/draw area candidate generation and still returns legacy `CampsiteCandidateResult`.
- `lib/campIntel/*`
  - Consumes legacy candidates/results for camp intel summaries.
- Existing scripts/tests
  - Assert legacy result ordering, marker counts, and generated candidate viability.

The migration should therefore preserve `CampsiteCandidateResult` until every caller either consumes CampOps directly or uses a compatibility adapter.

## Duplicate Filtering Found

Legacy viability duplicated CampOps hard-gate concerns in two places:

- explicit private/no-access/closure/no-camping text detection
- low legal/access score exclusion below `MIN_CAMPSITE_SAFETY_SCORE`

Those hard-reject signals now flow through `lib/campops/campOpsLegacyCompatibility.ts`.

The legacy evaluation still returns the same `CampsiteCoreScoreEvaluation` fields for existing callers, but it also exposes `hardGateResults` so future migration work can compare legacy exclusions with CampOps hard gates.

## Duplicate Ranking Found

Legacy route/polygon ranking still exists for backward compatibility:

- generated candidate order by `qualityScore`
- display ordering by legacy `suitabilityScore`
- fallback tier selection through `preferred`, `good`, `possible`, and `limited_confidence`

CampOps suitability scoring is the recommendation ranking pipeline. Legacy display ranking should remain only as a marker/list compatibility layer until `campopsRecommendationsEnabled` is proven in UI and API consumers.

## Legacy Filter Classification

| Legacy behavior | Migration classification | Notes |
| --- | --- | --- |
| Private/no-access/closure/no-camping text detection | Superseded by CampOps hard gates | Keep compatibility output while CampOps hard gates become the source of truth. |
| Low `legalAccessScore` exclusion below `MIN_CAMPSITE_SAFETY_SCORE` | Superseded by CampOps hard gates | CampOps should own legal/access rejection, caution, and unknown handling. |
| `rejected_safety` viability tier | Superseded by CampOps hard gates | Keep as compatibility diagnostics until parity tests prove it can be removed. |
| `qualityScore`, `suitabilityScore`, `score`, and marker rating | Still useful as legacy display fields | These are display/list ordering fields, not CampOps recommendation authority. |
| Route-day timing penalties for too early, too late, short route, and overnight unlikely | Still useful as user preference/display filters | CampOps time and late-arrival scoring should own endpoint recommendations. |
| Remoteness/privacy heuristic | Still useful as preference signal | Treat as low-confidence preference input unless provider/debrief data improves it. |
| Terrain/campability score | Still useful as candidate enrichment input | CampOps should own access, trailer, terrain, and group-fit scoring. |
| Fallback tiers (`preferred`, `good`, `possible`, `limited_confidence`) | Deprecated for recommendation decisions | Can remain for legacy copy until CampOps roles are primary. |
| "Best" legacy copy | Deprecated when CampOps is visible | Use `Top result` or `Search result`; CampOps cards own endpoint recommendation copy. |
| Route proximity/density heuristics | Unknown / requires validation | Likely remains useful for candidate generation and marker density, not final recommendation. |
| Mountain pass/elevation penalties | Unknown / requires validation | May remain a preference or risk enrichment, depending on route context and vehicle profile. |

## Naming Cleanup

- Internal `applyCampsiteViabilityFilter` was renamed to `applyLegacyCampsiteDisplayFilter`.
- New exported alias `filterCampCandidatesPassingLegacyHardGates` clarifies that legacy filtering is hard-gate compatibility, not preference ranking.
- Existing exported `filterViableCampsiteCandidates` remains as an alias for older tests and consumers.

## Migration Notes

- Do not remove legacy score fields yet. Existing map markers, panels, and tests still consume `qualityScore`, `suitabilityScore`, `score`, `rating`, `viabilityTier`, and `viabilityConfidenceLabel`.
- Keep feature-flag-off behavior unchanged. CampOps may annotate or run alongside the legacy result, but the old result shape must continue to work.
- When CampOps recommendation cards are visible, legacy UI copy must distinguish `Search results` from `Endpoint recommendation`.
- Do not call the legacy top result `best` while CampOps is enabled. Use `Top result` or `Search result` language.
- Use `CampOps caution` or `Not recommended` annotations when a visible legacy item has a caution/rejected CampOps status.
- If CampOps downgrades a planned camp or chooses a different endpoint than the legacy top result, show a coexistence note instead of letting legacy ranking imply the operational choice.
- Prefer adding comparison tests before replacing any legacy fallback tier behavior.
- Replace UI language gradually: use "recommended", "caution", "fallback", or "unknown" instead of unqualified "safe" unless a specific safety gate is being described.

## Compatibility Adapter

`lib/campops/campOpsLegacyCoexistence.ts` now acts as the legacy migration adapter:

- `campOpsCandidateFromLegacySearchResult`
  - Converts a generated legacy camp candidate into the same `CampCandidate` id/source format used by CampOps recommendation generation.
- `campOpsEnrichmentDraftFromLegacyCandidate`
  - Produces a partial CampOps enrichment draft from legacy fields where possible, including access difficulty, legal confidence, route distance, terrain score, and data limitations.
- `campOpsRecommendationToLegacyDisplayFields`
  - Converts CampOps recommendation status, suitability score, role labels, confidence, and deterministic reasons into legacy-friendly display metadata.
  - Keeps legacy rank meaning explicit as `Search result rank` so it is not confused with CampOps recommendation order.
- `orderLegacyCandidatesByCampOpsCompatibility`
  - Provides a future Stage 3 ordering helper that can place CampOps-recommended candidates before rejected/caution legacy entries.
  - It is not wired into production ordering yet; feature-flag-off behavior remains unchanged.

## Coexistence Guard Added

`lib/campops/campOpsLegacyCoexistence.ts` maps legacy generated candidate ids to CampOps candidate ids and classifies visible legacy entries as:

- `recommended_endpoint`
- `backup_endpoint`
- `emergency_fallback`
- `not_recommended`
- `caution`
- `available_result`

`components/navigate/CampsiteCandidatePanel.tsx` uses those classifications only when a CampOps recommendation set is present. This reduces copy/ranking conflicts while preserving the legacy list and feature-flag-off behavior.

## Migration Stages

### Stage 0: Legacy Only

- `campopsRecommendationsEnabled` is off.
- `CampsiteCandidateResult` is published without `campOps`.
- Legacy route/polygon candidate generation, display filtering, and marker/list order remain unchanged.

### Stage 1: CampOps Cards + Legacy List

- CampOps recommendation cards render above or beside the legacy list.
- Legacy list is labeled `Search results`; CampOps cards are labeled `Endpoint recommendation`.
- Legacy ranking remains visible but cannot be called the operational recommendation.

### Stage 2: CampOps Statuses Annotate Legacy List

- Legacy list entries show CampOps status where data exists:
  - Recommended endpoint
  - Backup endpoint
  - Emergency fallback
  - CampOps caution
  - Not recommended
- Rejected/caution legacy entries are visually and textually prevented from appearing as primary recommendations.

### Stage 3: CampOps Ranking Powers Primary Camp Ordering

- Use `orderLegacyCandidatesByCampOpsCompatibility` or a successor adapter to order legacy-compatible display output from CampOps roles/scores.
- Preserve the legacy output shape for map markers, panel cards, and API consumers.
- Keep the old order available for diagnostics while proving no consumer depends on legacy rank semantics.

### Stage 4: Legacy Ranking Removed Or Retained Only As Compatibility

- CampOps hard gates, suitability scores, and recommendation roles become the central camp recommendation pipeline.
- Legacy fields remain only as compatibility/display fields where still needed.
- Deprecated fallback-tier recommendation behavior can be removed after parity and rollback coverage exist.

## Next Cleanup Candidates

- Add parity assertions comparing legacy `rejected_safety` candidates with CampOps `rejected` hard gates.
- Move route-day display scoring documentation into a clearly named legacy-display section.
- Once feature-flag-on parity is proven, retire legacy preference fallback tiers in favor of CampOps recommendation roles.
