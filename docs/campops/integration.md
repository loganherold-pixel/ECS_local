# CampOps Search Integration

CampOps is wired into the existing campsite locator behind the `campopsRecommendationsEnabled` feature flag.

## Integration Point

The current search flow remains owned by `lib/campsites/campsiteLocatorService.ts`:

- `locateCampsiteResultForRoute`
- `locateCampsiteResultForPolygon`

Those functions still collect, filter, rank, cap, and publish the legacy campsite candidates exactly as before. After the legacy result is built, it is passed through `withCampOpsSearchPayload` from `lib/campops/campOpsSearchIntegration.ts`.

## Flag Behavior

When `campopsRecommendationsEnabled` is false or omitted:

- The original `CampsiteCandidateResult` object is returned.
- No `campOps` property is attached.
- Existing UI and store consumers see the same candidate list and metadata.

When `campopsRecommendationsEnabled` is true:

- The legacy candidate list is preserved.
- CampOps builds a `CampSearchContext` from available input and optional `campOps.context` overrides.
- Generated campsite candidates are adapted into `CampCandidate` objects.
- Available deterministic candidate fields are enriched into `CampCandidateEnrichment`.
- Optional `CampOpsExternalSourceSignal` records are merged for legal, closure, public access, fire, weather, water, service, slope, occupancy, and freshness data.
- Source cache metadata is preserved for UI and AI transparency: `cachedAt`, `expiresAt`, `sourceGeneratedAt`, `retrievedAt`, `freshnessStatus`, and `offlineAvailable`.
- Legal/public-access signals and closure/seasonal restriction signals remain separate. A camp can be legally allowed on public land and still be rejected by a current closure or seasonal vehicle-access restriction.
- Resource Debt is attached where data exists.
- Hard gates run deterministically.
- Suitability scores run deterministically.
- `CampRecommendationSet` is generated and attached at `result.campOps.recommendationSet`.

## Input Shape

Locator callers can enable CampOps with:

```ts
locateCampsiteResultForRoute({
  ...input,
  campopsRecommendationsEnabled: true,
  campOps: {
    context: {
      currentTimeIso,
      desiredArrivalWindow,
      daylightInfo,
      vehicleProfile,
      convoyProfile,
      resourceState,
      riskTolerance,
      offlineMode,
      delayEstimateMinutes,
    },
  },
});
```

The same `campOps` option is available for polygon searches.

## Compatibility Contract

CampOps does not replace existing filters yet. Legacy candidates are still sourced, filtered, ranked, and capped by the current campsite locator. CampOps only adds an optional operational recommendation payload for later UI/API use.

AI is not called from this integration. AI assist should consume the serializable recommendation set later and explain deterministic outputs without inventing legal status, weather, access, fuel, water, or safety conclusions.

## Source Signals

Callers can pass `sourceSignalsByCandidateId` to `withCampOpsSearchPayload` or `generateCampOpsSearchPayload`. Restrictive signals such as prohibited camping, closed access, active seasonal access restrictions, private access, or fire bans can downgrade or reject a candidate deterministically. Positive stale signals do not upgrade a camp; stale data is retained as a limitation for UI and AI explanation.

Provider bundles can also be collected through `CampOpsSourceProviderRegistry` before search integration. Provider results are resolved by `resolveCampOpsSourceConflicts` before enrichment merge, so downstream hard gates, scoring, recommendations, UI cards, and AI assist consume the same deterministic source truth.

The resolved bundle carries:

- normalized `signalsByCandidateId`
- `resolutionsByCandidateId` with resolved values, confidence, conflict summaries, stale sources, and missing sources
- provider warnings/errors that do not crash CampOps

Offline/cached behavior:

- Fresh cache can be used normally.
- Stale cache can be used when explicitly offline-available, but stale warnings are retained in `dataLimitations`, recommendation warnings, UI source summaries, and AI payloads.
- Expired cache remains visible as source context and must not be shown as current.
- Offline with no cached provider data leaves affected values unknown and adds missing-source warnings.
- AI assist receives stale/expired/missing source notes but cannot soften or remove them.

The current closure adapter path is `CampOpsClosureSourceProvider`, which accepts pre-resolved records from fixtures or a future ECS5 agency/MVUM/closure resolver and emits normalized closure signals. Legal/access, fire, weather, and service providers follow the same resolver path. The integration layer does not call upstream networks directly.

AI assist receives conflict summaries through the recommendation payload and may explain them, but it cannot override hard gates, source resolution, or confidence aggregation.

## Follow-Up Seams

- Add richer app-state adapters for live vehicle, route progress, weather/fire, water, and fuel data.
- Add UI surfaces that render `CampRecommendationSet` only when the flag is enabled.
- Replace heuristic enrichment fields with dedicated legal/access/weather/resource sources as those datasets become available.
- Keep legacy candidate behavior available until CampOps reaches parity and rollout confidence is high.
