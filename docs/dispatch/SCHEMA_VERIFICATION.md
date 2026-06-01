# ECS Dispatch Schema Verification

Last updated: 2026-04-24

## Summary

Dispatch is **local-persistence ready** and **backend-schema not ready** for full live Dispatch persistence.

The current Dispatch implementation persists Phase 3 Dispatch state through `lib/dispatchPersistenceAdapter.ts` into the project-local key-value persistence layer. That local snapshot supports the active TypeScript records as JSON and is scoped by expedition ID.

The Supabase migration set does **not** currently include dedicated Dispatch backend tables for pings, queue items, assignments, assist requests, acknowledgments, timeline events, offline actions, or notification dedupe. The existing `dispatchStore` points at a `dispatch-feed` edge function, but this function is not present in `supabase/functions` and is not listed as deployed in `lib/supabase.ts`. Because of that, this pass does not add a partial migration. A migration should be added only with matching adapter writes, RLS, realtime, offline replay, and rollout behavior.

## Files Inspected

- `lib/dispatchTypes.ts`
- `lib/dispatchPersistenceAdapter.ts`
- `lib/dispatchIntegrity.ts`
- `lib/dispatchOfflineReplayAdapter.ts`
- `lib/dispatchRealtimeAdapter.ts`
- `lib/dispatchServiceAdapters.ts`
- `lib/dispatchStore.ts`
- `lib/dispatchQueueStore.ts`
- `lib/dispatchTimelineLogAdapter.ts`
- `lib/dispatchRolloutConfig.ts`
- `lib/supabase.ts`
- `lib/keyValuePersistence.ts`
- `supabase/migrations/001_ecs_core_schema.sql`
- `supabase/migrations/002_ecs_auth_entitlements.sql`
- `supabase/migrations/003_ecs_issue_intelligence.sql`
- `supabase/migrations/004_ecs_fleet_schema.sql`
- `supabase/remote_public_schema.sql`
- `docs/dispatch/DATA_CONTRACT.md`

## Existing Persistence Inventory

| Area | Current schema/storage | Readiness |
| --- | --- | --- |
| Dispatch Phase 3 pings | `DispatchPersistenceSnapshot.pings` in `ecs_dispatch_persistence` key-value file | Ready for local-first JSON persistence |
| Dispatch queue items | `DispatchPersistenceSnapshot.queueItems` | Ready for local-first JSON persistence |
| Dispatch assignments | `DispatchPersistenceSnapshot.assignments` | Ready for local-first JSON persistence |
| Dispatch timeline events | `DispatchPersistenceSnapshot.timelineEvents` | Ready for local-first JSON persistence |
| Dispatch assist requests | Typed as `DispatchAssistRequest`, but represented durably by ping + queue item + timeline event | Backend table missing; standalone local array missing |
| Dispatch acknowledgments | Typed as `DispatchAcknowledgment`, but currently embedded in `DispatchPing.acknowledgedByMemberIds` and `checkInResponses` | Backend table missing; standalone local array missing |
| Queued offline Dispatch actions | Typed as `DispatchQueuedOfflineAction`, but replay derives work from queued local entity records | Backend table missing; standalone local array missing |
| Legacy dispatch feed events | `DispatchEvent` and `dispatchStore.createEvent` target `dispatch-feed` edge function | Not ready in this checkout; edge function is absent/unlisted |
| Legacy web offline queue | `lib/dispatchQueueStore.ts` stores `QueuedDispatchEvent[]` in web `localStorage` under `ecs_dispatch_offline_queue` | Separate legacy path; not equivalent to Phase 3 Dispatch queue |
| Expedition log staging | `dispatchTimelineLogAdapter` stages audit payloads into `expeditionStateStore.logTimelineEvent` when rollout allows | Local expedition timeline ready; cloud table migration not present in checked migrations |
| Supabase backend | Migrations define core trips/waypoints, auth/operators/audit logs, issue events, fleet/loadout tables | No dedicated Dispatch Phase 3 tables |
| Remote schema dump | `supabase/remote_public_schema.sql` is empty | Cannot verify remote Dispatch tables from repo |

## Data Contract Coverage

| Entity | Local schema support | Backend schema support | Notes |
| --- | --- | --- | --- |
| `DispatchTeamMember` | Loaded from adapters; not stored in Dispatch snapshot | No dedicated Dispatch roster table | Live roster can use membership data if `dispatch-feed` exists, but this checkout does not include that edge function or migrations. |
| `DispatchPing` | Supported in snapshot JSON | Missing | Needs expedition scope, actor, target recipients, status, priority, escalation, idempotency, version/update metadata, linked context, acknowledgment fields. |
| `DispatchQueueItem` | Supported in snapshot JSON | Missing | Needs required `linkedContext`, `createdByMemberId`, assigned members, status, priority, delivery, escalation, version/update metadata. |
| `DispatchAssignment` | Supported in snapshot JSON | Missing | Needs queue item relation, assignee, status lifecycle, idempotency, version/update metadata. |
| `DispatchAssistRequest` | Type exists; current product flow persists equivalent ping/queue/timeline records | Missing | If assist requests become standalone live entities, add table or explicit JSON payload field on queue item. |
| `DispatchAcknowledgment` | Type exists; current product flow embeds responses in ping | Missing | For multi-client receipts, standalone acknowledgment rows are recommended. |
| `DispatchTimelineEvent` | Supported in snapshot JSON | Missing | Needs event type, actor/target labels, related IDs, audit payload, linked context, delivery/conflict fields. |
| `DispatchLinkedContext` | Embedded JSON in ping/queue/timeline | Missing as relational context table | Embedded JSON is acceptable for audit snapshots; indexes may be needed on context type/id if queried. |
| `DispatchDeliveryState` | Type-safe union in app code | Missing checks | Backend should use check constraints or enum tables. |
| `DispatchEscalationState` | Type-safe union in app code | Missing checks | Backend should use check constraints or enum tables. |
| `DispatchQueuedOfflineAction` | Type exists; replay derives from entity state | Missing | Needed if backend/local replay grows beyond entity-level queued records. |

## Missing Fields For Live Backend Tables

These fields are required before Phase 3 Dispatch can be considered backend-schema ready.

### Shared Columns

Every live Dispatch table should include:

- `id`
- `expedition_id`
- `idempotency_key`
- `created_by_member_id` or `actor_member_id`
- `created_by_user_id` where Supabase auth user scoping is required
- `created_at`
- `updated_at`
- `version`
- `delivery_state` or equivalent delivery/reliability state where applicable
- `conflict_state`
- `conflict_reason`
- `last_conflict_at`
- `metadata` or typed JSON payload only for non-query-critical extra data

### Pings

Required live fields:

- `type`
- `priority`
- `status`
- `message`
- `target_member_ids`
- `linked_context`
- `escalation_state`
- `response_due_at`
- `requires_acknowledgment`
- `check_in_type`
- `check_in_schedule`
- `acknowledged_by_member_ids` or normalized acknowledgment rows
- `check_in_responses` or normalized response rows
- `reliability_state`

### Queue Items

Required live fields:

- `title`
- `detail`
- `status`
- `priority`
- `assigned_member_ids`
- `linked_context`
- `source_ping_id`
- `delivery_state`
- `reliability_state`
- `escalation_state`
- `due_at`
- `tags`

### Assignments

Required live fields:

- `queue_item_id`
- `assignee_member_id`
- `status`
- `assigned_at`
- `accepted_at`
- `completed_at`
- `notes`

### Assist Requests

Required live fields if standalone persistence is adopted:

- `assist_type`
- `priority`
- `status`
- `message`
- `target_member_ids`
- `linked_context`
- `require_acknowledgment`
- `escalation_state`
- `source_ping_id`
- `queue_item_id`

### Acknowledgments

Required live fields if standalone receipt rows are adopted:

- `ping_id`
- `queue_item_id`
- `member_id`
- `status`
- `acknowledged_at`
- `message`

### Timeline Events

Required live fields:

- `type`
- `title`
- `detail`
- `occurred_at`
- `priority`
- `member_ids`
- `actor`
- `target`
- `linked_context`
- `queue_item_id`
- `ping_id`
- `delivery_state`
- `escalation_state`
- `audit_event`

### Offline Actions

Required live/local replay fields if a separate queue table is added:

- `entity_type`
- `action_type`
- `source_entity_id`
- `payload`
- `status`
- `created_at`
- `replayed_at`
- `last_error`
- `retry_count`
- `max_retries`

### Notification Dedupe

Required fields if notification dedupe becomes persistent:

- `notification_key`
- `expedition_id`
- `event_type`
- `source_entity_id`
- `recipient_member_ids`
- `sent_at`
- `suppressed_at`
- `reason`

## Nullable Fields That Should Be Required

The following fields should be non-null in live backend records because Dispatch depends on them for scoping, dedupe, conflict resolution, or safety:

- `expedition_id`
- `idempotency_key` for all user-created or replayable Dispatch records
- `created_by_member_id` or `actor_member_id` for pings, queue items, assist requests, timeline/audit events, and permission-denied events
- `created_at`
- `updated_at` on mutable records
- `version` on mutable records, or an equivalent monotonic conflict column
- `status`
- `priority` where present in TypeScript
- `delivery_state` for pings, queue items, timeline events, and offline/replayable records
- `escalation_state` for pings, queue items, and assist requests
- `linked_context` on queue items, because `DispatchQueueItem.linkedContext` is required in TypeScript

## Status Enum Safety

The app currently enforces enum values with TypeScript unions. A backend schema should also enforce them with Postgres check constraints or enum types.

Required value sets:

- `DispatchPriority`: `low`, `normal`, `high`, `critical`
- `DispatchPingType`: `check_in`, `rally`, `assist`, `route`, `resource`, `hazard`, `emergency`, `general`
- `DispatchDeliveryState`: `draft`, `queued`, `sending`, `sent`, `delivered`, `seen`, `acknowledged`, `accepted`, `declined`, `no_response`, `escalated`, `recovered`, `failed`, `retrying`, `cancelled`
- `DispatchReliabilityState`: `live`, `queued`, `sending`, `sent`, `delivered`, `stale`, `offline_risk`, `recovered`, `failed`, `retrying`, `cancelled`, `unknown`
- `DispatchQueueItemStatus`: `new`, `pending_response`, `assigned`, `in_progress`, `blocked`, `escalated`, `needs_review`, `resolved`, `cancelled`
- `DispatchEscalationState`: `none`, `monitor`, `follow_up`, `escalate_to_lead`, `broadcast_to_team`, `recommended`, `escalated`, `emergency_unresolved`, `resolved`, `recovered`
- `DispatchAssignmentStatus`: `unassigned`, `offered`, `accepted`, `in_progress`, `blocked`, `completed`, `declined`
- `DispatchAssistRequestType`: `vehicle`, `medical`, `navigation`, `fuel`, `water`, `mechanical`, `comms`, `recovery`, `general_support`
- `DispatchCheckInResponseStatus`: `ok`, `delayed`, `need_assistance`, `at_waypoint`, `returning`, `unavailable`, `emergency`

## Missing Indexes And Query Risks

Backend Dispatch tables do not exist, so all live query indexes are currently missing. Recommended indexes once tables exist:

- `(expedition_id, updated_at desc)` for pings, queue items, assignments, and timeline events
- `(expedition_id, created_at desc)` for pings and queue items
- `(expedition_id, occurred_at desc)` for timeline events
- `(expedition_id, status)` for pings, queue items, assignments, assist requests, and offline actions
- `(expedition_id, priority, status)` for queue sorting
- `(expedition_id, escalation_state)` for escalation counts
- `(expedition_id, delivery_state)` for queued/failed metrics
- `(expedition_id, idempotency_key)` unique where applicable
- `(source_ping_id)` on queue items
- `(queue_item_id)` on assignments, acknowledgments, and timeline events
- `(ping_id, member_id)` unique on acknowledgments
- `(notification_key)` unique on notification dedupe records
- GIN indexes on `linked_context` or extracted generated columns if filtering by context type/id becomes common

## Expedition Scoping

Local snapshot scoping is present:

- `DispatchPersistenceSnapshot.expeditionId`
- storage key `dispatch_state_${expeditionId}`
- realtime channel `ecs-dispatch:${expeditionId}`
- idempotency key input includes `expeditionId`

Backend scoping is missing for Phase 3 entities because tables are missing. Any live migration must make `expedition_id` required and indexed on every Dispatch table.

## Actor And Current User Fields

Local Dispatch entities carry actor/member fields:

- `DispatchPing.createdByMemberId`
- `DispatchQueueItem.createdByMemberId`
- `DispatchAssignment.assigneeMemberId`
- `DispatchAssistRequest.createdByMemberId`
- `DispatchAcknowledgment.memberId`
- `DispatchTimelineEvent.actor`
- `DispatchTimelineEvent.target`
- `DispatchAuditEvent.actor.memberId`

Backend tables should preserve both ECS member identity and Supabase auth user identity where needed:

- `actor_member_id` or `created_by_member_id`
- `created_by_user_id`
- optional `target_member_ids`

This is required for permission enforcement, audit attribution, and privacy-safe review.

## Idempotency Fields

Local idempotency support is strong:

- `createDispatchIdempotencyKey`
- `createDispatchEntityId`
- merge helpers compare `id` and `idempotencyKey`
- realtime envelope IDs include entity idempotency/version/timestamp/status

Backend idempotency fields are missing because tables are missing. Recommended requirement:

- Every user-created/replayable table should include `idempotency_key text not null`.
- Add unique indexes scoped by expedition, for example `(expedition_id, idempotency_key)`.
- Notification dedupe should include a unique `notification_key`.

## UpdatedAt And Version Fields

Local types include optional `version` on most mutable entities. `updatedAt` coverage is mixed by entity:

- `DispatchPing.updatedAt` is optional.
- `DispatchQueueItem.updatedAt` is required.
- `DispatchAssignment.updatedAt` is optional.
- `DispatchAssistRequest.updatedAt` is optional.
- `DispatchTimelineEvent` uses `occurredAt`.
- `DispatchAcknowledgment` uses `acknowledgedAt`.

For backend readiness, mutable records should require:

- `version integer not null default 1`
- `updated_at timestamptz not null default now()`
- update triggers using the existing `public.set_updated_at()` pattern

Timeline and acknowledgment tables can use immutable event timestamps plus optional update metadata if edits are supported.

## Migration Needs

### Required Before Full Live Dispatch Persistence

Add dedicated, non-destructive Supabase migrations for:

1. `dispatch_pings`
2. `dispatch_queue_items`
3. `dispatch_assignments`
4. `dispatch_assist_requests`, if standalone assist persistence is required
5. `dispatch_acknowledgments`, if standalone receipts are required
6. `dispatch_timeline_events`
7. `dispatch_offline_actions`, if replay state must be queryable outside the local entity state
8. `dispatch_notification_dedupe`, if notifications become live and cross-device dedupe is required

Each table needs:

- `create table if not exists`
- `alter table add column if not exists`
- non-destructive defaults
- check constraints for statuses
- indexes listed above
- RLS enabled
- expedition membership policies
- realtime publication strategy, if Supabase database realtime is used instead of broadcast channels
- rollback notes in comments if the repo adopts rollback documentation

### Not Added In This Pass

No migration was added because:

- The app currently writes Phase 3 Dispatch records to local key-value persistence, not Supabase tables.
- The `dispatch-feed` edge function referenced by `lib/dispatchStore.ts` is not present in this repo and is not listed in `DEPLOYED_EDGE_FUNCTIONS`.
- `supabase/remote_public_schema.sql` is empty, so remote table compatibility cannot be verified.
- A table-only migration would not make the feature live and could create a false sense of backend readiness without adapter writes, RLS, realtime, offline replay, and notification dedupe wiring.

## Proposed Migration Order

1. Add expedition-scoped `dispatch_pings`, `dispatch_queue_items`, `dispatch_assignments`, and `dispatch_timeline_events`.
2. Add RLS policies tied to expedition membership/role checks.
3. Add status check constraints and indexes.
4. Add unique idempotency indexes.
5. Wire Dispatch persistence adapters to the new tables behind rollout flags.
6. Add standalone `dispatch_acknowledgments` and `dispatch_assist_requests` if product requires independent querying.
7. Add `dispatch_notification_dedupe` only when notifications are enabled beyond local/in-app policy.
8. Add migration-backed tests or SQL verification scripts if the repo adopts them.

## Readiness Verdict

| Capability | Verdict | Reason |
| --- | --- | --- |
| Local Dispatch persistence | Ready with caveats | JSON snapshot supports core pings, queue items, assignments, and timeline events. Assist, acknowledgments, and offline actions are represented indirectly. |
| Live backend persistence | Not ready | No Dispatch Phase 3 tables, no local `dispatch-feed` edge function, and no schema dump to verify remote support. |
| Expedition scoping | Ready locally; missing backend | Local storage key and realtime channel are expedition-scoped. Backend tables are absent. |
| Actor/current user fields | Partially ready locally | Member-level actor fields exist. Backend should also include auth user fields. |
| Idempotency | Ready locally; missing backend | App helpers exist; backend unique constraints do not. |
| Version/conflict fields | Partially ready | Types and merge helpers support version/conflict. Backend required columns and constraints are absent. |
| Status enum safety | Ready in TypeScript only | Backend check constraints are absent for Dispatch entities. |
| Index/query performance | Not ready for backend | No Dispatch tables/indexes exist. |
| Migration safety | Pattern exists | Existing Supabase migrations use non-destructive `create table if not exists` and `alter add column if not exists`, but Dispatch migration should wait for adapter integration. |

## Follow-Up Checks

After any future Dispatch schema migration:

- Run `supabase db diff` or the repo's equivalent schema verification command if configured.
- Verify TypeScript still passes.
- Verify Dispatch helper/scenario tests still pass.
- Verify local persistence fallback still works when Supabase is unavailable.
- Verify RLS with owner/member/viewer/solo cases.
- Verify realtime subscription cleanup and duplicate prevention.
- Verify offline replay does not duplicate pings, queue items, timeline events, or notifications.
