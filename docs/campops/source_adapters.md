# CampOps Source Adapters

CampOps accepts typed source signals through `CampOpsExternalSourceSignal` and merges them into candidate enrichment before hard gates, scoring, resource debt, and recommendation roles run.

The adapter layer is deterministic. It can carry legal, closure, public-access, fire, weather, fuel, water, service, slope, occupancy, privacy, and freshness signals, but it does not infer missing safety-critical facts. Unknown values remain unknown.

## Provider Contract

Provider-specific adapters implement `CampOpsSourceProvider`:

```ts
const provider: CampOpsSourceProvider = {
  id: 'agency-closures',
  displayName: 'Agency Closures',
  sourceCategory: 'closure',
  sourceConfidence: 'high',
  staleAfterMinutes: 240,
  async collectSignals({ context, candidates, currentTimeIso }) {
    return candidates.map(candidate => ({
      candidateId: candidate.id,
      providerId: 'agency-closures',
      providerDisplayName: 'Agency Closures',
      sourceCategory: 'closure',
      sourceConfidence: 'high',
      sourceFreshness: 'fresh',
      sourceTimestampIso: currentTimeIso,
      rawProviderStatus: { status: 'ok' },
      signal: {
        source: 'offline_dataset',
        confidence: 'high',
        observedAtIso: currentTimeIso,
        closureStatus: 'open',
      },
      warnings: [],
      errors: [],
      missingDataReason: null,
    }));
  },
};
```

Provider output must be deterministic and serializable. It can include:

- provider id and display name
- source category
- source confidence
- source freshness and timestamp
- cache metadata: `cachedAt`, `expiresAt`, `sourceGeneratedAt`, `retrievedAt`, `freshnessStatus`, and `offlineAvailable`
- safe raw provider status
- normalized CampOps signal
- warnings/errors
- missing data reason

Do not include API keys, tokens, secrets, credentials, user identifiers, or raw provider payloads that are not safe for diagnostics. The normalizer strips obvious credential-like keys from `rawProviderStatus`, but providers should avoid returning them in the first place.

## Legal and Access Provider

The first legal/access adapter is `CampOpsLegalAccessSourceProvider`. It is fixture-backed today so the CampOps path can be exercised before parcel, MVUM, public-land, or agency geometry providers are wired.

It accepts `CampOpsLegalAccessRecord` records and normalizes:

- `campingAllowed`: `yes`, `no`, `likely`, or `unknown`
- `accessAllowed`: `yes`, `no`, `restricted`, or `unknown`
- `landStatus`: `public`, `private`, `mixed`, or `unknown`
- `legalConfidence`: `high`, `medium`, `low`, or `unknown`
- `restrictionType`
- `observedAtIso` and freshness
- safe `sourceSummary`
- warnings and missing data reason

Normalization is conservative:

- `campingAllowed: no` becomes `legalStatus: prohibited`.
- `campingAllowed: likely` becomes `legalStatus: likely_allowed`.
- `landStatus: private` becomes `publicAccessStatus: private`.
- `landStatus: mixed` becomes `publicAccessStatus: permission_required`.
- `accessAllowed: no` becomes `closureStatus: closed`.
- `accessAllowed: restricted` becomes `closureStatus: restricted`, except permit-style restrictions become `permit_required`.
- Unknown remains unknown.

Do not display or generate "definitely legal." The provider can summarize source evidence, but legal certainty remains bounded by `legalConfidence`, freshness, and conflicts.

## Closure and Seasonal Restriction Provider

`CampOpsClosureSourceProvider` handles current access status separately from legal land status. It is fixture/pre-resolved today, but its record shape matches the existing ECS5 closure vocabulary found in agency ingestion, route intelligence, and legal/closure conflict detection modules.

It accepts `CampOpsClosureRecord` records and normalizes:

- `closureStatus`: `open`, `closed`, `seasonal`, `restricted`, or `unknown`
- `closureReason`
- `restrictionWindow` with optional `startIso`, `endIso`, and label
- `appliesToCamping`
- `appliesToVehicleAccess`
- `appliesToFires`
- `sourceConfidence`
- `observedAtIso` and freshness
- safe `sourceSummary`
- warnings and missing data reason

Closure normalization is intentionally distinct from legal normalization:

- Legal/public land data can say camping is allowed while a current closure still blocks access.
- Confirmed `closed` or `restricted` closure records become hard-gate blockers where they apply.
- `seasonal` records keep their seasonal identity; active seasonal windows that apply to camping or vehicle access block the candidate.
- Time-windowed restrictions outside the current evaluation time become `closureStatus: open` only when the source has medium or high confidence. Low-confidence open status remains unknown.
- Stale closure data is retained as uncertainty and source context, not as a confirmed open/closed recommendation.
- Fire-related closure signals create cautionary fire/restriction context unless a separate deterministic fire conflict is present.

Do not display or generate "guaranteed open." A camp is only as current as its closure source confidence, timestamp, and conflict state.

## Fire Restriction Provider

`CampOpsFireRestrictionSourceProvider` handles campfire, stove, open-flame, red-flag, smoke, and fire/emergency closure context separately from baseline camping suitability.

It accepts `CampOpsFireRestrictionRecord` records and normalizes:

- `campfireAllowed`: `yes`, `no`, `restricted`, or `unknown`
- `stoveAllowed`: `yes`, `no`, `restricted`, or `unknown`
- `fireRestrictionLevel`
- `redFlagRisk`: `high`, `medium`, `low`, or `unknown`
- `smokeOrAirQualityRisk`: `high`, `medium`, `low`, or `unknown`
- `areaClosedDueToFire`
- `closureReason`
- `sourceConfidence`
- `observedAtIso` and freshness
- safe `sourceSummary`
- warnings and missing data reason

Normalization is conservative:

- Campfire prohibition becomes `fireRestrictionStatus: fire_ban` and a caution, not a camp rejection by itself.
- Stove restrictions become cautionary fire restriction data and lower weather/fire suitability.
- Red-flag or smoke/AQI risk can lower weather suitability and add recommendation warnings.
- A fire or emergency area closure becomes `closureStatus: closed` and can hard-reject the camp.
- Unknown fire status remains explicit. Do not infer campfire or stove permission from missing data.
- Stale fire data is retained as uncertainty, not as confirmed permission or confirmed prohibition.

AI may explain these normalized fields but must not invent restriction details. If the source says campfires are prohibited, AI should say "prohibited." If status is unknown, AI should say "campfire status unknown."

## Weather Provider

`CampOpsWeatherSourceProvider` handles forecast-window weather context for endpoint decisions. It is fixture/pre-resolved today so it can be wired to existing ECS weather infrastructure later without changing hard gates, scoring, recommendations, UI, or AI prompt contracts.

Existing upstream candidates for real wiring include shared operational weather, route weather sampling, NWS/OpenWeather route adapters, AirNow smoke/AQI data, and cached/offline weather state. Unit tests must use fixtures or mocks, not real network calls.

It accepts `CampOpsWeatherRecord` records and normalizes:

- `forecastTimeWindow`
- `windSpeedMph`
- `windGustMph`
- `windDirection`
- `precipitationRisk`: `high`, `medium`, `low`, or `unknown`
- `stormRisk`: `high`, `medium`, `low`, or `unknown`
- `temperatureLowF`
- `temperatureHighF`
- `heatRisk`: explicit risk or inferred from high temperature
- `coldRisk`: explicit risk or inferred from low temperature
- `smokeOrAirQualityRisk`
- `sourceConfidence`
- `observedAtIso` and freshness
- safe `sourceSummary`
- warnings and missing data reason

Weather exposure is normalized to `low`, `medium`, `high`, or `unknown` using the strongest available weather risk. Wind is inferred from sustained wind or gusts, heat from high temperature, cold from low temperature, and smoke/AQI from the provided risk signal.

Normalization is conservative:

- High wind, storm, heat, cold, precipitation, or smoke/AQI can lower weather suitability and add recommendation warnings.
- High wind or storm risk can increase late-arrival risk because final approach conditions become less forgiving.
- High heat can add water-margin caution context.
- Stale weather data becomes unknown current weather with a stale-data warning.
- Missing weather data remains unknown and should reduce confidence, not invent calm conditions.

Weather data is not permanent source truth. Do not display or generate "guaranteed clear," "definitely calm," or similar certainty.

## Service and Resupply Provider

`CampOpsServiceSourceProvider` handles nearby services as operational logistics context rather than simple POI pins. It is fixture/pre-resolved today and can later be wired to map search, cached POI, route service, public campground, or offline service datasets.

It accepts `CampOpsServiceRecord` records and normalizes:

- `serviceType`: `fuel`, `potable_water`, `propane`, `dump_station`, `shower`, `laundry`, `mechanic_repair`, `tire_service`, `grocery_food`, `developed_campground`, or `town_exit`
- `name`
- `location`
- `distanceFromCampMiles`
- `distanceFromRouteMiles`
- `routeAwareDistanceMiles`
- `confidence`
- `observedAtIso` and freshness
- operating hours summary and current-open flag when available
- service `status`: `open`, `closed`, or `unknown`
- safe `sourceSummary`
- warnings and missing data reason

The merged enrichment exposes nearest-service summaries:

- `nearestFuel`
- `nearestWater`
- `nearestPropane`
- `nearestDump`
- `nearestRepair`
- `nearestTownOrExit`

Route-aware distance is preferred when a provider supplies it. Straight-line or camp-distance values can be retained as fallback, but UI and AI should not imply they are driveable distance unless the source says so.

Normalization is conservative:

- Open services can improve resource debt and resupply role selection.
- Unknown service status can still be shown as nearby logistics context, but it lowers confidence and must be called out as unknown.
- Closed services do not count as reliable resupply.
- Unknown operating hours remain unknown.
- Stale service data becomes uncertainty and should not be used to claim a service is currently available.
- Nearby repair or tire service can mark a camp recovery-friendly when the service is close enough and confirmed open.

Do not display or generate "fuel guaranteed," "water guaranteed," or "repair available" unless the source explicitly supports open/current availability.

## Registry and Composition

Use `CampOpsSourceProviderRegistry` or `collectCampOpsSourceProviderBundle` to combine providers:

```ts
const registry = new CampOpsSourceProviderRegistry([
  legalProvider,
  closureProvider,
  weatherProvider,
]);

const bundle = await registry.collect({
  context,
  candidates,
  config: {
    providersEnabled: true,
    disabledProviderIds: ['experimental-provider'],
  },
});
```

The bundle contains:

- `providerResults`: serializable per-provider outputs
- `signalsByCandidateId`: normalized source signals for CampOps enrichment
- `resolutionsByCandidateId`: per-field conflict/confidence summaries produced by the resolver
- `warnings`: stale, missing, or conflicting source notes
- `errors`: provider failures captured without crashing CampOps

Provider failures do not block recommendations. They are captured as provider errors and may be surfaced as CampOps warnings, while the deterministic engine continues with whatever data remains.

## Source Resolution and Confidence

`resolveCampOpsSourceConflicts` runs after provider collection and before enrichment merge. It turns multiple provider outputs into one normalized source signal per candidate, plus structured resolution summaries for AI, UI, and diagnostics.

Resolution summaries include:

- `resolvedValue`
- `resolvedConfidence`
- `conflictDetected`
- `conflictSummary`
- `sourceSummaries`
- `staleSources`
- `missingSources`

Source weighting is configurable through `resolutionConfig`. Default tiers are:

- `official_source`
- `verified_partner_source`
- `app_owned_data`
- `recent_user_debrief_data`
- `older_user_debrief_data`
- `unknown_source`

The resolver is conservative:

- Confirmed restrictions beat unknown data.
- Fresh high-confidence sources beat stale low-confidence sources.
- Conflicting legal or access signals reduce confidence and add a conflict summary.
- Unknown values are not promoted to allowed/open/available.
- Stale positive service, weather, fire, legal, or closure data is preserved as uncertainty, not current availability.
- Provider failures or missing coverage do not crash CampOps; they become missing-source context.

The resolved summaries are copied into `CampCandidateEnrichment.sourceResolutions` and are safe to pass into AI assist. AI may explain these summaries, but it must not change resolved source truth or resurrect hard-gate rejections.

## Provider Validation Shadow Mode

`runCampOpsProviderValidation` provides a staged validation harness for real or semi-real provider outputs before they are allowed to affect production recommendations.

Shadow validation is controlled by `campopsProviderValidationShadowModeEnabled`. It can collect configured providers, normalize their outputs, run source conflict resolution, and produce quality summaries without applying provider outputs to CampOps recommendation sets. `providerOutputAppliedToRecommendations` is always `false` in the validation summary.

The validation summary is typed and serializable. It includes:

- legal/access source availability
- closure source availability
- fire restriction source availability
- weather source freshness
- service/resupply coverage
- conflict frequency
- unknown-rate frequency
- stale-rate frequency
- missing-data frequency
- per-provider readiness reports

Provider readiness reports include provider id, display name, region/test-area label, source category, coverage band, freshness band, confidence distribution, conflict count, missing data count, and recommendation impact summary.

For developer-facing release review, turn the validation summary into a readiness report with `createCampOpsProviderReadinessReport`, then render Markdown or JSON with `renderCampOpsProviderReadinessMarkdown` or `renderCampOpsProviderReadinessJson`. See `docs/campops/provider_readiness.md` for readiness bands and rollout use.

Validation summaries intentionally avoid precise candidate coordinates, raw trip details, secrets, API keys, raw AI prompts, user identifiers, vehicle identifiers, and private debrief notes. Providers may fetch or consume real outputs when configured by product code, but tests must use fixtures/mocks only.

Recommended provider rollout path:

1. Run providers in shadow mode with fixtures and known regional test areas.
2. Review coverage, freshness, unknown, stale, missing-data, and conflict rates.
3. Fix provider normalization before enabling `campopsProviderAdaptersEnabled`.
4. Enable production provider influence only for regions and source categories that meet product readiness thresholds.

## Offline and Cached Sources

CampOps source signals can carry cache metadata directly on `CampOpsExternalSourceSignal`:

- `cachedAt`: when ECS stored the source signal or provider result
- `expiresAt`: when the cached source should no longer be treated as current
- `sourceGeneratedAt`: when the upstream source generated the fact
- `retrievedAt`: when ECS retrieved it from the upstream source or cache
- `freshnessStatus`: `fresh`, `stale`, `expired`, or `unknown`
- `offlineAvailable`: whether this signal is intentionally usable while offline

Provider normalization resolves freshness before hard gates and scoring:

- Fresh cached data can populate enrichment normally.
- Stale cached data may still populate known fields when it is explicitly `offlineAvailable`, but it must append stale warnings and lower data confidence.
- Expired cached data remains visible as source context and must append expired warnings.
- If the app is offline and no cached provider data exists, providers should return `signal: null` with a `missingDataReason`; CampOps keeps affected fields unknown and lowers confidence through missing/unknown scoring paths.
- Stale or expired data must never be displayed as current.
- Field mode must still surface stale, expired, cached, missing, and unavailable warnings.

Category-specific stale/expired warnings are expected for legal/access, closure, fire restriction, weather, and service sources.

For future durable provider caches, use `CAMP_OPS_SOURCE_SIGNAL_CACHE_RETENTION_DAYS` as the default maximum normalized-source retention window unless a provider supplies a shorter `expiresAt`. Persist only normalized and redacted source signals, not raw provider payloads.

Before writing source summaries or provider diagnostics to any offline cache, run them through the CampOps redaction helpers:

- `redactCampOpsSourceSummaryForOfflineCache`
- `redactCampOpsSourceSignalForOfflineCache`
- `redactCampOpsProviderResultForOfflineCache`

These helpers remove obvious user/vehicle/trip/convoy identifiers, exact coordinate pairs, local file refs, phone numbers, email addresses, and credential-like raw provider keys. They are a last line of defense; providers should still avoid returning private identifiers, secrets, raw trip data, raw debrief notes, or exact user locations.

CampOps does not currently own a durable source cache or provide encryption for provider cache storage. If a provider later persists source data, document that storage location, deletion path, and encryption status in `docs/campops/privacy_storage_review.md`.

## Merge Rules

- Restrictive legal, closure, public-access, and fire signals are allowed to override weaker inferred values because they can block or downgrade a recommendation.
- Restrictive source truth wins unknown or weaker conflicting values when confidence/freshness supports it.
- Low-confidence restrictive community-style signals do not override high-confidence official/open evidence by themselves; they are retained as conflict warnings for review.
- Positive stale signals do not upgrade a camp. Stale restrictive signals are retained as cautionary evidence.
- Explicitly offline-available cached signals can fill unknown fields with stale warnings, but confidence remains reduced and source transparency must show the stale/expired state.
- Closure signals are evaluated separately from legal signals. A fresh official closure can override otherwise legal public access.
- Stale closure records append data limitations and should reduce confidence instead of producing overconfident recommendations.
- Fire restriction signals are evaluated separately from legal and closure signals. Fire bans generally warn and reduce suitability; fire/emergency closures can reject.
- Stale fire records append limitations and should not be used to claim campfires, stoves, or open flames are allowed.
- Weather signals are evaluated separately from legal, closure, and fire signals. They influence suitability, weather-fallback roles, late-arrival risk, warnings, and AI summaries.
- Stale weather records append limitations and should not be used to claim current wind, storm, heat, cold, smoke, or air-quality conditions.
- Service signals influence resource debt, resupply roles, low-fuel/low-water recommendations, recovery-friendly handling, warnings, and AI summaries.
- Stale service records append limitations and should not be used to claim current fuel, water, repair, town, dump, propane, shower, laundry, or grocery availability.
- Data freshness is recorded in `sourceSignals` and stale signals append a data limitation.
- AI receives these results only through `CampRecommendationSet`; AI does not decide source truth.

## Integration

Existing generated campsite candidates still work without source signals. When `campopsRecommendationsEnabled` is false, the search result remains unchanged.

When enabled, callers can pass `sourceSignalsByCandidateId` to `withCampOpsSearchPayload` or `generateCampOpsSearchPayload`. This keeps future source adapters thin: each adapter should normalize its data into explicit signals rather than hiding business logic.

For provider adapters, collect the bundle before calling search integration and pass it as `sourceProviderBundle`. Search integration stays synchronous and preserves legacy behavior when no bundle is provided:

```ts
const sourceProviderBundle = await registry.collect({ context, candidates });

const result = withCampOpsSearchPayload(legacyResult, {
  source: 'route',
  context,
  rolloutConfig: {
    campopsRecommendationsEnabled,
    campopsProviderAdaptersEnabled,
  },
  sourceProviderBundle,
});
```

If `campopsRecommendationsEnabled` is false, the legacy search result is returned unchanged.

## Adding a Provider

1. Keep credentials and network clients outside the provider result object.
2. Fetch or read provider data in the adapter layer, not inside scoring or AI code.
3. Normalize only fields the provider actually knows.
4. Use `missingDataReason` when coverage does not include a candidate.
5. Set `observedAtIso` and `staleAfterMinutes` whenever possible.
6. Return restrictive facts explicitly instead of relying on AI or display code.
7. Add fixture-based tests; do not make live network calls in unit tests.
