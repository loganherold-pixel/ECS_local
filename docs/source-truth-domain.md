# ECS Source Truth Domain

This document defines the shared source-truth vocabulary for ECS systems that
need to explain where operational data came from and how safe it is to use.
It is a migration foundation, not a UI redesign.

## Concepts

Freshness answers how old the evidence is under a selected policy:
`live`, `recent`, `stale`, `expired`, or `unavailable`. Freshness is age and
expiry based. It does not identify where the data came from.

Origin answers where the value came from: `live`, `cached`, `manual`,
`estimated`, `inferred`, `simulated`, or `unavailable`. A cached or manual value
can be freshly edited or recently read, but its origin must remain cached or
manual.

Availability answers whether the value can still be used: `usable`,
`degraded`, or `unavailable`. Stale or expired data normally becomes degraded
unless a policy explicitly makes it unavailable.

Confidence answers how strongly ECS trusts the source after normalization:
`high`, `medium`, `low`, or `unknown`.

Coverage answers how much of the intended domain the source covers:
`complete`, `partial`, or `unknown`.

Authority, provider, conflict state, and warning codes are carried on
`SourceTruthRef`. They are metadata only. Safety-critical decisions should still
be made by deterministic domain engines.

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

## Migration Expectations

New domain code should emit `SourceTruthRef` entries where practical. Existing
summary consumers can migrate one surface at a time by selecting the appropriate
policy key. Do not add source-truth business logic inside large screen files;
normalize sources in pure domain adapters or selectors, then pass the resulting
metadata to summaries or view models.

Legacy summaries without `sourceTruth` are treated as inferred source entries
using their existing `updated_at`, `freshness`, and `available` fields. This
keeps old summaries readable without claiming an unknown origin is live.

## Source Truth Inspector

`SourceTruthInspectorTrigger` opens the shared, offline-capable source detail
sheet. It consumes only a canonical `SourceTruthRef`, a policy key or override,
user-facing dependency labels, and an optional existing refresh, verify, or
manual-update action. The inspector never changes a score, recommendation,
assessment, or source state itself.

Legacy UI records should be converted through the pure adapters in
`lib/sourceTruthAdapters.ts`. The first integrations cover Dashboard readiness
confidence, Weather source/freshness state, and Route Catalog source badges.
Other surfaces should migrate incrementally rather than passing provider
responses or screen-local diagnostics into the component.

## Redaction And Privacy

`SourceTruthRef` must not contain raw provider responses, provider secrets,
service-role keys, access tokens, authorization headers, personal contact
details, or sensitive payloads. Store only compact IDs, provider names,
authority labels, timestamps, confidence, coverage, availability, conflict
state, and warning codes.

The sanitizer redacts secret-like provider or authority labels and compacts
warning codes, but callers are still responsible for keeping sensitive payloads
out of the source-truth contract.
