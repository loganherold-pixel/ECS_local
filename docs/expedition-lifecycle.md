# ECS Expedition Lifecycle

## Canonical states

`draft -> planned -> ready -> active -> completing -> completed -> archived`

Additional paths:

- `active <-> paused`
- `active|paused -> recovery-required -> active|paused|completing|cancelled`
- `draft|planned|ready|active|paused|recovery-required -> cancelled -> archived`
- `completing -> active` is an explicit correction used by the persisted undo workflow.

Every state change is validated and carries an idempotency key, cause, actor, timestamp, revision, and optional reason. Reusing a key for a different target is rejected. Transition and correction history is bounded in persisted data.

## Ownership

- `expeditionStore` owns the durable plan/command record in `ecs_expeditions`. The canonical plan and lifecycle are stored additively under `meta.ecs_expedition_lifecycle`; legacy `status` remains an adapter for existing screens and cloud rows.
- `expeditionStateStore` owns the single live, high-frequency Expedition runtime used by Dashboard, Navigate, and Dispatch. It mirrors canonical state while retaining the existing `standby|active|paused|complete` API.
- `expeditionTripRecordStore` owns the durable completed outcome consumed by recap, archive/debrief, badges, personal records, insights, reports, and trip learning.
- `expeditionLaunchHandoffStore` owns the restart-safe Navigate launch handoff. It does not own completion or archive state.
- Checklist, route, waypoint, field-log, assessment, and telemetry stores own their domain records. They may update plan references but may not write lifecycle status directly.

## Plan contract

The wizard creates a canonical `planned` Expedition with stable client identity and visible manual source truth. Route Manager attaches the route reference. A plan is `ready` only when both an active vehicle and route reference are present; missing data remains explicit. Offline Prep, Navigate, CampOps, and Dispatch should consume the canonical plan adapter rather than reconstructing identity from screen parameters.

## Completion and undo

Completion is a persisted transaction:

1. `active|paused|recovery-required -> completing` stores the completion key, redacted debrief snapshot, deterministic summary inputs, field-log ID, and undo deadline in one command-record update.
2. Undo performs a correction back to `active` and retains correction history.
3. Commit creates the idempotent field-log entry, moves to `completed`, and materializes exactly one trip outcome by completion key.
4. A restart resumes a pending transaction. An expired undo window commits; an unexpired window remains reversible.

The debrief snapshot excludes exact coordinates and restricted fields. Navigate guidance geometry remains authoritative when it exists. Command-only completion creates a truthful geometry-missing outcome rather than inventing a route trace.

## Compatibility and migration

- Existing `draft`, `active`, `completed`, and `archived` rows are adapted on read.
- `planned` and `ready` map to legacy `draft`; `paused`, `completing`, and `recovery-required` map to legacy `active`.
- Existing public store methods remain available and delegate to canonical transitions.
- Native command cache data uses the repository persistence layer. Web keys retain the existing `ecs_cmd_` prefix.
- No Supabase schema expansion is required for this additive first tranche. Cloud writes retain the current row/RLS contract, while the offline queue carries lifecycle metadata and idempotency keys.

## Safety rules

- Unknown route, vehicle, condition, or assessment data remains unknown.
- Geofence events create durable proposals before applying idempotent automatic transitions.
- Operational assessment status remains deterministic and source-labelled across Overview, Route, Convoy, Camp, Logistics, and Vehicles.
- Archive/report/badge/personal-record consumers read the completed trip outcome, not current live state.
