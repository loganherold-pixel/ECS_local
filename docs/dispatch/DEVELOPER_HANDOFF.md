# ECS Dispatch Developer Handoff

Last updated: 2026-04-24

## Purpose

This handoff explains how the ECS Dispatch feature is structured and how to safely extend it.

Dispatch is the operational coordination layer for Expedition Command System. It connects team roster state, Team Ping, Dispatch Queue, assignments, assist requests, escalation, linked context, timeline/log events, offline/replay, realtime sync, notifications, permissions, rollout flags, mock/demo data, and developer diagnostics.

## Non-Negotiable Rules

- Do not write backend calls directly from UI components.
- Do not bypass Dispatch adapters.
- Do not add external messaging without explicit verified infrastructure.
- Do not contact emergency services from Dispatch.
- Do not expose member location or contact details without permission checks.
- Do not create duplicate pings, queue items, timeline/log events, offline replay actions, or notifications.
- Assist Request and Emergency Ping are ECS team coordination only.

## Feature Folder Structure

Primary UI lives in:

- `components/dispatch/DispatchCommandCenter.tsx`
- `components/dispatch/DispatchTeamPingComposer.tsx`
- `components/dispatch/DispatchAssistRequestComposer.tsx`
- `components/dispatch/DispatchQueueSection.tsx`
- `components/dispatch/DispatchTeamRosterSection.tsx`
- `components/dispatch/DispatchTimelineSection.tsx`
- `components/dispatch/DispatchAdvisorySurface.tsx`

The Dispatch route/tab should continue to import the command center rather than reimplementing Dispatch logic in route files.

Domain and service code lives in `lib/`:

- `lib/dispatchTypes.ts`
- `lib/dispatchMockData.ts`
- `lib/dispatchDemoScenarios.ts`
- `lib/dispatchServiceAdapters.ts`
- `lib/dispatchPersistenceAdapter.ts`
- `lib/dispatchRealtimeAdapter.ts`
- `lib/dispatchOfflineReplayAdapter.ts`
- `lib/dispatchSyncAdapter.ts`
- `lib/dispatchIntegrity.ts`
- `lib/dispatchPermissionAdapter.ts`
- `lib/dispatchNotificationAdapter.ts`
- `lib/dispatchContextAdapter.ts`
- `lib/dispatchTimelineLogAdapter.ts`
- `lib/dispatchAuditAdapter.ts`
- `lib/dispatchCheckInAdapter.ts`
- `lib/dispatchEscalationAdapter.ts`
- `lib/dispatchRoutingAdapter.ts`
- `lib/dispatchSuggestionAdapter.ts`
- `lib/dispatchMetricsAdapter.ts`
- `lib/dispatchPerformanceAdapter.ts`
- `lib/dispatchRolloutConfig.ts`

Documentation lives in:

- `docs/dispatch/PRODUCT_SPEC.md`
- `docs/dispatch/DATA_CONTRACT.md`
- `docs/dispatch/EVENT_CONTRACT.md`
- `docs/dispatch/SCHEMA_VERIFICATION.md`
- `docs/dispatch/DEMO_SCENARIOS.md`
- `docs/dispatch/USER_GUIDE.md`
- `docs/dispatch/DEVELOPER_HANDOFF.md`

## Domain Types

The source of truth for Dispatch entities is `lib/dispatchTypes.ts`.

Core entities:

- `DispatchTeamMember`
- `DispatchPing`
- `DispatchQueueItem`
- `DispatchAssignment`
- `DispatchAssistRequest`
- `DispatchAcknowledgment`
- `DispatchTimelineEvent`
- `DispatchLinkedContext`
- `DispatchQueuedOfflineAction`
- `DispatchAuditEvent`

Important enum unions:

- `DispatchPingType`
- `DispatchPriority`
- `DispatchDeliveryState`
- `DispatchReliabilityState`
- `DispatchQueueItemStatus`
- `DispatchEscalationState`
- `DispatchAssignmentStatus`
- `DispatchLinkedContextType`
- `DispatchTimelineEventType`

When adding or changing a domain value, update all helpers that format, sort, filter, validate, route, notify, or persist that value.

## Hooks And State

There is not a separate Dispatch hook layer yet. The main orchestration currently lives in `DispatchCommandCenter.tsx` using React state, memoized derived values, refs for current lists, and adapter calls.

Important local state:

- `teamMembers`
- `pings`
- `queueItems`
- `assignments`
- `timelineEvents`
- `realtimeStatus`
- `lastRealtimeEventAt`
- `lastOfflineReplayAt`
- composer visibility/seed state
- check-in schedule

Future refactors should move orchestration into typed hooks without changing adapter boundaries.

## Adapters

Dispatch uses adapters to keep UI away from backend, sync, map, notification, and permission internals.

Primary adapter registry:

- `lib/dispatchServiceAdapters.ts`

Adapter responsibilities:

- active expedition context
- team roster loading
- ping list and initial delivery status
- queue list
- timeline list and expedition log staging
- sync state
- linked context collection/actions

If adding live persistence, add or extend adapter methods first. Do not call Supabase, storage, or external services directly from component event handlers except through existing adapter wrappers.

## Mock And Demo Data

Default mock fallback:

- `lib/dispatchMockData.ts`

Named demo scenarios:

- `lib/dispatchDemoScenarios.ts`

Demo scenarios are deterministic and local-only. They must not trigger real notifications, external communication, emergency services, or backend writes.

Use demo scenarios for QA/product validation. Preserve default mock data because Dispatch fallback currently depends on it.

## Persistence Integration

Current Phase 3 persistence is local-first:

- `lib/dispatchPersistenceAdapter.ts`
- storage file key: `ecs_dispatch_persistence`
- snapshot key: `dispatch_state_${expeditionId}`

Snapshot fields:

- `version`
- `expeditionId`
- `pings`
- `queueItems`
- `assignments`
- `timelineEvents`
- `updatedAt`

Standalone arrays do not currently exist for assist requests, acknowledgments, queued offline actions, or notifications. Those are represented through pings, queue items, timeline events, delivery states, and policy adapters.

Backend schema readiness is documented in `docs/dispatch/SCHEMA_VERIFICATION.md`. Dedicated Supabase Dispatch tables are not present in the checked migrations.

## Realtime Integration

Realtime is handled by:

- `lib/dispatchRealtimeAdapter.ts`

Realtime event types:

- `ping_upsert`
- `queue_item_upsert`
- `assignment_upsert`
- `team_member_upsert`
- `timeline_event_added`

The session uses a Supabase broadcast channel scoped by expedition:

- `ecs-dispatch:${expeditionId}`

Duplicate protection:

- ignores same-client envelopes
- ignores wrong expedition IDs
- remembers recent event IDs
- uses `shouldApplyIncomingDispatchEvent`
- merges records by stable `id` or `idempotencyKey`

## Offline Replay Integration

Offline replay is handled by:

- `lib/dispatchOfflineReplayAdapter.ts`
- `lib/dispatchSyncAdapter.ts`
- `lib/dispatchIntegrity.ts`

Replay currently scans local Dispatch records with `local-*` IDs and queued/failed/retrying state. It publishes normal realtime events, then marks records recovered or failed.

Do not add unmanaged background loops. Replay should remain bounded and driven by existing connectivity/sync conditions.

## Notification Integration

Notification policy is handled by:

- `lib/dispatchNotificationAdapter.ts`

Notifications are rollout-gated in:

- `lib/dispatchRolloutConfig.ts`

Current default:

- `notifications: false`

Policy responsibilities:

- suppress mock/demo notifications
- suppress sender notifications
- suppress queued/retrying/recovered/failed notification spam
- target recipients by ping/queue/assignment/team status
- include ECS-only safety copy for emergency/assist escalation
- dedupe notification keys for a cooldown window

Do not add SMS, email, phone, push provider, or emergency-service behavior unless infrastructure is explicitly verified and approved.

## Permission Integration

Permissions are centralized in:

- `lib/dispatchPermissionAdapter.ts`

Key helpers:

- `resolveDispatchPermissions`
- `resolveCurrentDispatchMember`
- `canSubmitDispatchPing`
- `canSubmitAssistRequest`
- `canMutateDispatchQueueItem`
- `getActionPermissionSet`
- `getComposerPermissionSet`
- `getQueuePermissionSet`
- `getRosterPermissionSet`
- `getTimelinePermissionSet`

Permission-sensitive areas:

- team-wide ping
- role/group ping
- emergency ping
- assist request
- assignment
- escalation
- resolution
- cancellation
- member location
- member contact details
- timeline/log modification

The UI should disable or block unauthorized actions before writes occur.

## Linked Context Integration

Linked context helpers live in:

- `lib/dispatchContextAdapter.ts`

Supported context types:

- expedition
- pin
- waypoint
- route segment
- resource
- vehicle
- power
- manual

Context records are embedded into pings, queue items, assist flows, and timeline events. Do not assume every context has coordinates. Treat coordinates as sensitive and permission controlled.

## Timeline And Log Integration

Timeline events use:

- `DispatchTimelineEvent`
- `lib/dispatchTimelineLogAdapter.ts`
- `lib/dispatchAuditAdapter.ts`

Timeline events are local Dispatch history. Expedition log staging is rollout-gated:

- `expeditionLogIntegration: false` by default

Audit/log payloads should be privacy-safe:

- no raw contact details
- no unnecessary coordinates
- no raw technical IDs in user-facing copy when labels exist
- dedupe by idempotency key

## Testing Strategy

Existing bounded scripts:

- `node ./scripts/test-dispatch-helpers.js`
- `node ./scripts/test-dispatch-scenarios.js`

Common validation:

- `npx tsc --noEmit`
- `npm run lint` if linting is in scope and practical
- scenario scripts after adapter/type changes
- manual Dispatch smoke for UI changes

Prefer tests around pure helpers, adapters, and state transitions. Avoid brittle snapshots unless the repo already uses them for the same area.

## Feature Flags

Rollout config lives in:

- `lib/dispatchRolloutConfig.ts`

Current feature flags:

- `dispatchTabVisibility`
- `liveTeamRoster`
- `teamPing`
- `dispatchQueue`
- `assistRequest`
- `emergencyPing`
- `realtimeSync`
- `offlineReplay`
- `notifications`
- `developerDiagnostics`
- `smartSuggestions`
- `automatedCheckIns`
- `escalationAutomation`
- `mapContextIntegration`
- `expeditionLogIntegration`

Safety-sensitive features should default conservatively. Notifications and expedition log integration are currently disabled by default.

Developer diagnostics are dev-only in the UI and should not expose member location or contact details.

## Common Pitfalls

- Adding a new enum value only in `dispatchTypes.ts` and forgetting labels/sorting/UI.
- Creating pings and queue items without idempotency keys.
- Writing directly to Supabase from UI components.
- Publishing realtime events without local persistence.
- Adding a notification event without dedupe or sender suppression.
- Logging sensitive member location/contact data.
- Treating Emergency Ping as an emergency-service integration.
- Creating duplicate timeline events from optimistic updates and realtime echoes.
- Adding automatic timers without bounded lifecycle cleanup.
- Assuming mock/demo data is safe to notify.

## Add A New Ping Type

1. Add the value to `DispatchPingType` in `lib/dispatchTypes.ts`.
2. Add display copy in `getPingTypeLabel` inside `DispatchCommandCenter.tsx`.
3. Add queue title mapping in `getQueueTitleForPing`.
4. Add timeline mapping in `getTimelineTypeForPing` if it needs a specific timeline event.
5. Update `DispatchTeamPingComposer.tsx` options/templates.
6. Update notification policy in `dispatchNotificationAdapter.ts` if the ping should notify.
7. Update routing/permission checks if the ping has special targeting or safety rules.
8. Add mock/demo data if QA needs coverage.
9. Run TypeScript and Dispatch scripts.

## Add A New Queue Status

1. Add the value to `DispatchQueueItemStatus` in `lib/dispatchTypes.ts`.
2. Add a label in `getQueueStatusLabel`.
3. Update queue sorting in `sortDispatchQueue` if the status changes priority.
4. Update metrics in `dispatchMetricsAdapter.ts` if it affects active, awaiting, resolved, failed, or escalation counts.
5. Update `dispatchIntegrity.ts` conflict/merge rules if status transitions can conflict.
6. Update `DispatchQueueSection.tsx` rendering/actions if needed.
7. Add tests for helper behavior.

## Add A New Linked Context Type

1. Add the value to `DispatchLinkedContextType`.
2. Add label/action support in `dispatchContextAdapter.ts`.
3. Add icon support in `getContextIcon` inside `DispatchCommandCenter.tsx`.
4. Update composer context selector display if needed.
5. Update privacy rules if the new context can expose location/contact/sensitive data.
6. Update mock/demo contexts.
7. Update docs and schema contract if it should be persisted/queryable.

## Add A New Notification Event

1. Add policy handling in `dispatchNotificationAdapter.ts`.
2. Define a deterministic notification key.
3. Suppress sender notifications unless product explicitly expects them.
4. Respect recipient availability, mute/unavailable state, and permissions.
5. Suppress mock/demo and replay/retry duplicates.
6. Include ECS-only safety copy for assist, emergency, and escalation events.
7. Keep `notifications` rollout-gated.
8. Add tests around policy decisions where practical.

## Add A New Permission Rule

1. Add the action to `DispatchPermissionAction`.
2. Update `canPerformDispatchAction`, `canMemberPerformAction`, and `canViewerPerformAction`.
3. Add it to a permission set helper if UI needs disabled state.
4. Enforce it before the action writes data.
5. Add disabled copy if the default message is not clear enough.
6. Check solo mode behavior.
7. Add tests for allowed/denied paths where practical.

## Launch Readiness Reminder

Before promoting Dispatch behavior beyond local/demo use, verify:

- TypeScript passes.
- Dispatch helper/scenario tests pass.
- No duplicate pings/queue items/timeline events/notifications.
- Offline replay does not duplicate records.
- Realtime subscriptions clean up.
- Permissions block unauthorized writes.
- Member location/contact privacy is respected.
- Emergency/assist behavior remains ECS team coordination only.
- Backend schema and adapters are aligned if live persistence is enabled.
