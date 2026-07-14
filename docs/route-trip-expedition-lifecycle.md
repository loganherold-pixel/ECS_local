# ECS Route, Trip, Expedition, and Archive Lifecycle

## Purpose

This document defines the canonical language, identity links, ownership boundaries, and allowed lifecycle transitions for the current ECS implementation. It is a compatibility map, not a destructive model rewrite. Existing public IDs and persisted records remain valid; adapters attach `ecs.journey.v1` linkage so records can move between existing domains without losing provenance.

## Canonical Lifecycle

The shared lifecycle is:

`discovered -> previewing -> planned -> offline_ready -> expedition_ready -> staged -> active -> paused -> completed -> archived`

Alternative terminal or recovery paths are:

- Any preparatory phase may move to `cancelled` or `failed` where the transition table permits it.
- `active` or `paused` may move to `completed`, `cancelled`, or `failed`.
- `failed` may return to discovery, preview, or planning after an explicit retry.
- `completed` and `cancelled` may be archived.
- Repeating the current phase is an idempotent no-op.
- Every other transition is rejected by `decideJourneyTransition`.

The authoritative transition table and identity helpers live in `lib/lifecycle/routeTripExpeditionLifecycle.ts`.

## Terminology And Ownership

| Term | Current canonical meaning | Owner | Canonical identity |
| --- | --- | --- | --- |
| Discovered route | A source-specific candidate that has not become a user-owned route asset | Explore discovery adapters | `discoveryId` |
| Route catalog record | Official/provider catalog metadata and optional geometry; remains a source record | `lib/explore/routeCatalog.ts` | Existing catalog ID as `discoveryId` |
| Trail pack | Reviewed or source-labelled discovery package; not automatically an official route | `lib/explore/trailPacks.ts` | Existing trail-pack ID as `discoveryId` |
| AI route idea | Suggested discovery content, visually and semantically distinct from verified data | `lib/aiRouteTypes.ts` | Existing AI route ID as `discoveryId` |
| Imported GPX/KML/GeoJSON | A durable user route asset after validation and import | `routeStore` | Existing route UUID as `routeAssetId` |
| Saved route | The reusable, offline-first route asset with geometry and provenance | `routeStore` | Existing route UUID as `routeAssetId` |
| Route-builder output | A saved route asset whose origin is `route_builder` | `routeStore` via route-builder adapter | Existing route UUID as `routeAssetId` |
| Stitched route | A saved route asset whose geometry provenance is `stitched_geometry` | `routeStore` via stitch adapter | Existing route UUID as `routeAssetId` |
| ECS Run | A route planning/navigation representation with vehicle and loadout context; it is not the completed trip outcome | `runStore` | Existing run UUID as `recordedRunId` for compatibility |
| Trip Builder plan | Deterministic trip intent: route, vehicle, camps, waypoints, bailouts, readiness references, and itinerary | Trip Builder service and plan store | Existing `trip-plan-<route>` ID as `tripPlanId` |
| Offline Prep package | Route/plan-scoped downloadable and cached departure-readiness manifest | Offline Prep service | Existing `offline-prep-<route>` ID as `offlinePackageId` |
| Expedition plan | Planned command/checklist/cloud record that organizes an expedition before activation | `expeditionStore` and wizard adapters | Existing expedition ID as `expeditionId` |
| Active expedition | The one live operational session, including pause/resume and resource deltas | `expeditionStateStore` | Existing live session ID as `expeditionId` |
| Navigation session | Restorable Navigate route snapshot and camera/guidance context | `navigateRouteSessionStore` | Existing session ID as `navigationSessionId` |
| Active guidance | Road, trail, hybrid, or run guidance currently controlling Navigate | Guidance stores plus replacement guard | Existing session ID as `guidanceSessionId` |
| Recorded trip trace | High-frequency GPS/resource/event capture for a live trip | `tripRecorderEngine` | Existing recorder trip ID as `recordedRunId` |
| Completed expedition outcome | The one durable, deduplicated record consumed by recap, reports, badges, personal records, and insights | `expeditionTripRecordStore` | Existing trip record ID as `completedOutcomeId` |
| Archive/debrief record | Archived view and generated artifacts derived from a completed outcome | Expedition trip repository/report/recap services | `archiveRecordId`, linked to `completedOutcomeId` |

`ECSRun` retains its existing name and IDs for compatibility. New code must not treat it as proof that travel occurred. Only a completed `ExpeditionTripRecord` is the canonical durable outcome.

## Identity And Idempotency

`ECSJourneyIdentity` links existing IDs without replacing them. Each lifecycle object owns its own ID; foreign IDs are linkage, never aliases for mutable ownership.

- Discovery IDs come from the source domain.
- Imported and built geometry gets a stable geometry fingerprint. Reimporting the same source or geometry returns the existing route asset.
- Converting a route asset to an ECS Run reuses the linked run.
- Trip Builder and Offline Prep retain their established deterministic IDs.
- Handoffs carry stable idempotency keys and survive native/web restoration.
- Starting the same active expedition is a no-op. A different active expedition is not silently replaced.
- Starting an already active trip recorder is a no-op unless the caller explicitly requests replacement.
- Completion uses `completionKey`, preferring expedition identity and then guidance/navigation identity. Repeated arrival, restoration, or materialization converges on one `ExpeditionTripRecord`.

## Provenance And Required Linkage

Every handoff should preserve `ECSJourneyLinkage` where the source provides it:

- route origin and source identity
- geometry fingerprint, source format, source label, capture time, verification state, and warnings
- active vehicle ID
- camp, waypoint, and bailout IDs
- Trip Builder plan ID
- Offline Prep package ID and readiness state
- expedition, navigation, guidance, recorded trace, completion, and archive IDs

Missing metadata remains null or unknown. Embedded geometry may support degraded offline continuation; it must not be relabelled as verified provider geometry.

## Golden Journey

1. Explore exposes a source record in `discovered` state.
2. Route preview moves the linked journey to `previewing` without mutating source ownership.
3. Saving/importing creates or reuses a `routeStore` asset with provenance.
4. Trip Builder creates one deterministic `TripPlan` in `planned` state.
5. Offline Prep creates one route-scoped package and marks linkage `offline_ready` only when readiness is true.
6. Expedition planning links the same route, plan, package, vehicle, camps, waypoints, and bailouts.
7. Navigate stages guidance. Existing active guidance is kept for the same route, requires confirmation for a different route, and replaces only after confirmation.
8. The live expedition and guidance session move through `active` and optional `paused` states. Persisted route geometry keeps guidance usable when its source object is unavailable.
9. Arrival/completion materializes one durable `ExpeditionTripRecord` using the completion key.
10. Debrief, reports, badges, personal records, and insights consume that completed outcome. Archive changes its lifecycle state; it does not create another completed trip.

## Persistence And Migration

- `routeStore` and `runStore` accept legacy arrays and write version 2 envelopes after mutation. Native storage now hydrates through the existing persisted key-value cache.
- Trip Builder state and route/planning handoffs use existing non-secure migrating storage and normalize legacy payloads.
- Offline Prep and expedition launch handoffs normalize older payloads before attaching schema version 2 linkage.
- `expeditionTripRecordStore` reads the existing storage key, upgrades version 1 records to `ecs.expedition.trip.v2`, and derives missing completion/linkage fields without deleting historical data.
- Public store methods and existing entity IDs remain supported.

Rollback is code-level: older builds ignore additive fields and continue reading established IDs. Because version 2 writers retain legacy record fields and storage keys, rollback does not require deleting local data. A rollback build will not understand new linkage, so it may lose cross-domain deduplication until the hardened version returns.

## Store Responsibilities

- `routeStore`: durable route assets, geometry/source dedupe, active route selection, run linkage.
- `runStore`: planning/navigation runs, vehicle/loadout context, route-to-run dedupe.
- Trip Builder plan/handoff stores: persisted planning intent and restart-safe entry context.
- Offline Prep service/handoff store: package manifest and departure-readiness linkage.
- `expeditionStore`: planned/cloud command records and checklists; it is not the high-frequency live-state owner.
- `expeditionStateStore`: one live operational expedition and its pause/resume/end lifecycle.
- `navigateRouteSessionStore`: restorable Navigate presentation/guidance snapshot.
- `tripRecorderEngine`: active GPS/resource/event recording.
- `expeditionTripRecordStore`: canonical completed outcome and downstream recap/report/achievement identity.

## Remaining Boundaries

1. Cloud `ecs_expeditions` archives and local completed outcomes need an owner-approved canonical server linkage and RLS contract before they can be merged.
2. Native route/run/handoff restoration requires Android and iOS termination/relaunch evidence.
3. Recorder traces and completed outcomes intentionally remain separate until retention, privacy, and geometry-size policies are approved.
4. Deep-link restoration should continue through route/shell policy; this lifecycle contract determines data resumability, not route authorization.
