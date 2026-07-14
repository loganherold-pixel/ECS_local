# ECS Source Truth Domain

This document defines the shared source-truth vocabulary for ECS systems that
need to explain where operational data came from and how safe it is to use.
It is a migration foundation, not a UI redesign.

## Approved Vocabulary

ECS source truth separates seven dimensions. Do not combine them into labels
such as "live confidence" or infer one dimension from another.

- **Origin:** `live`, `cached`, `manual`, `estimated`, `inferred`, `simulated`,
  or `unavailable`. This says how the value was produced.
- **Freshness:** `live`, `recent`, `stale`, `expired`, or `unavailable`. This is
  age and expiry under a domain policy. UI copy uses **Current** for the live
  freshness band so it is not confused with live origin.
- **Availability:** `usable`, `degraded`, or `unavailable`. This says whether
  the evidence can still support its stated dependency.
- **Coverage:** `complete`, `partial`, or `unknown`. This says how much of the
  intended domain is represented.
- **Confidence:** `high`, `medium`, `low`, or `unknown`. This says how strongly
  ECS trusts the normalized evidence; unknown remains unknown.
- **Authority:** `official`, `verified_document`, `provider`, `device`, `user`,
  `community`, `ecs`, `mixed`, or `unknown`. The bounded authority label and
  provider name remain available for domain-specific detail.
- **Conflict:** `none`, `present`, `resolved`, or `unknown`. A present conflict
  remains visible and deterministic domain logic decides its impact.

A cached or manual value can have current or recent freshness, but its origin
must remain cached or manual. A simulated value must always say simulated or
mocked. **Last known** means a cached source with the `last_good` role; it never
means live. If a live source expires or becomes unavailable while a usable
last-good cache remains, ECS reports both facts.

Legal/access verification, current conditions or closure advisories,
passability, and campground availability are independent evidence sources. An
official legal source does not establish current passability or availability.
Absence of a warning does not establish safety.

All dimensions are metadata only. Deterministic domain engines continue to own
safety, legality, route viability, vehicle readiness, weather state, resource
margins, convoy state, and incident conclusions.

## Policy Selection

The registry in `lib/sourceTruth.ts` owns domain aging rules. Consumers can use
`assessSourceTruth()` directly, attach optional `sourceTruth` and
`sourceTruthPolicyKey` metadata to an `EcsSummaryBase`, or call the opt-in
`ecsBus.getChannelSourceTruth()` / `ecsBus.getChannelFreshnessWithPolicy()`
helpers.

Supported policy keys:

- `default`
- `convoy_member_location`
- `weather_observation`
- `weather_forecast`
- `vehicle_profile`
- `vehicle_telemetry`
- `route_legal_access_evidence`
- `condition_closure_advisory`
- `offline_map_route_package`
- `camp_provider_availability`
- `manual_user_state`

The default policy mirrors the legacy bus age bands for consumers that have not
migrated. Existing `ecsBus.getChannelFreshness()` behavior is unchanged and
still uses last publish time.

Each `SourceTruthRef` may declare its own `policyKey`. Multi-source assessments
must retain those individual policies; convoy GPS, telemetry, forecasts,
persistent vehicle specifications, legal evidence, condition alerts, camp
availability, and offline packages do not share one arbitrary threshold.

## Migration Expectations

New domain code should emit `SourceTruthRef` entries where practical. Existing
summary consumers can migrate one surface at a time by selecting the appropriate
policy key. Do not add source-truth business logic inside large screen files;
normalize sources in pure domain adapters or selectors, then pass the resulting
metadata to summaries or view models.

Adoption checklist:

1. Normalize provider or store state in a pure adapter.
2. Set origin, source role, policy, timestamps, availability, coverage,
   confidence, authority kind, and conflict state independently.
3. Keep domain-specific labels and warning codes, but do not pass raw payloads.
4. Use `selectSourceTruthStatusPresentation()` and the shared source,
   freshness, confidence, conflict, or inspector components.
5. Preserve legacy public fields through adapters until their consumers migrate.

Legacy summaries without `sourceTruth` are treated as inferred source entries
using their existing `updated_at`, `freshness`, and `available` fields. This
keeps old summaries readable without claiming an unknown origin is live.

## Source Truth Inspector

`SourceTruthInspectorTrigger` opens the shared, offline-capable source detail
sheet. It consumes one source or a bounded source list, a policy key or
override, user-facing dependency labels, and an optional existing refresh,
verify, or manual-update action. The inspector never changes a score,
recommendation, assessment, or source state itself.

Compact consumers may use `ECSSourceBadge`, `ECSFreshnessBadge`,
`ECSConfidenceBadge`, and `ECSSourceConflictWarning`. The first bounded
integrations cover ECS Brief/readiness, Weather, Route Catalog and campground
access, Fleet weight estimates, and selected convoy locations in Navigate.

Legacy UI records should be converted through the pure adapters in
`lib/sourceTruthAdapters.ts`. Other surfaces should migrate incrementally rather
than passing provider responses or screen-local diagnostics into components.

## Redaction And Privacy

`SourceTruthRef` must not contain raw provider responses, provider secrets,
service-role keys, access tokens, authorization headers, personal contact
details, or sensitive payloads. Store only compact IDs, provider names,
authority labels, timestamps, confidence, coverage, availability, conflict
state, and warning codes.

The sanitizer redacts secret-like provider or authority labels and compacts
warning codes, but callers are still responsible for keeping sensitive payloads
out of the source-truth contract.
