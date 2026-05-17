# ECS Dispatch Product Specification

Last updated: 2026-04-24

## Status

Dispatch is implemented as the ECS operational coordination tab. It is local-first, adapter-driven, permission-aware, and protected by rollout controls. The current implementation is suitable for staged launch with conservative defaults: Dispatch UI, roster, Team Ping, queue, assist request, emergency coordination, realtime sync, offline replay, smart suggestions, check-ins, and map context integration are enabled by default; notifications, automated escalation, and expedition log integration are disabled by default until policy and persistence paths are fully verified.

Primary implementation references:

- Route shell: `app/(tabs)/alert.tsx`
- Tab registration: `app/(tabs)/_layout.tsx`
- Command dock entry: `components/CommandDock.tsx`
- Main Dispatch screen: `components/dispatch/DispatchCommandCenter.tsx`
- Team Ping composer: `components/dispatch/DispatchTeamPingComposer.tsx`
- Assist composer: `components/dispatch/DispatchAssistRequestComposer.tsx`
- Queue section: `components/dispatch/DispatchQueueSection.tsx`
- Team roster section: `components/dispatch/DispatchTeamRosterSection.tsx`
- Timeline section: `components/dispatch/DispatchTimelineSection.tsx`
- Domain types: `lib/dispatchTypes.ts`
- Adapters and hardening: `lib/dispatchServiceAdapters.ts`, `lib/dispatchPersistenceAdapter.ts`, `lib/dispatchRealtimeAdapter.ts`, `lib/dispatchOfflineReplayAdapter.ts`, `lib/dispatchIntegrity.ts`, `lib/dispatchPermissionAdapter.ts`, `lib/dispatchNotificationAdapter.ts`
- Rollout controls: `lib/dispatchRolloutConfig.ts`
- Scenario coverage: `scripts/test-dispatch-scenarios.js`

## 1. Purpose

Dispatch is the Expedition Command System coordination layer. It is not a generic chat tab. It connects expedition team status, structured pings, queue work, assignments, assist requests, linked map context, offline delivery state, realtime updates, timeline events, permissions, and rollout controls into one tactical operating surface.

The product goal is to help the expedition operator answer:

- Who is available, stale, offline, or in trouble?
- What coordination items need action now?
- Which pings or tasks are awaiting acknowledgment?
- What is queued, recovered, failed, or live?
- Which items are linked to a pin, waypoint, route segment, resource, vehicle, or power context?
- Which actions are safe for this user role and this rollout stage?

## 2. Dispatch Tab Identity

Dispatch appears as the `DISPATCH` tab in the custom ECS command dock and maps to the Expo Router `alert` route. The visible screen title is `DISPATCH`, with the subtitle `Expedition Channel`.

The Dispatch tab uses ECS tactical styling: dark operational panels, amber rails, status badges, compact metrics, and large enough touch targets for mobile use. It is wrapped by `TabErrorBoundary` in `app/(tabs)/alert.tsx` to avoid taking down the rest of the tab shell if Dispatch fails.

## 3. Expedition Channel

The Expedition Channel is the coordination context displayed inside Dispatch. The active expedition adapter is defined in `lib/dispatchServiceAdapters.ts`.

Implemented behavior:

- Reads active expedition context from `expeditionStateStore` where available.
- Falls back to deterministic mock/local context when expedition state is unavailable.
- Converts the active expedition into a linked Dispatch context for pings, queue items, and timeline events.
- Preserves solo mode and mock fallback behavior for development and local use.

Current limitation:

- Dedicated Dispatch backend tables are not implemented in this repo. `lib/dispatchPersistenceAdapter.ts` explicitly notes a future live backend mirror once schema exists.

## 4. Team Roster

The roster section shows expedition members, role, status, connection state, last update, current assignment, location/context label when permitted, delivery risk, and quick actions.

Implemented behavior:

- `DispatchTeamRosterSection` renders team member cards from `DispatchTeamMember`.
- Live roster loading is attempted through the Dispatch team adapter when safe.
- If no safe live roster is available, Dispatch uses solo/local/mock fallback.
- Empty and loading states are present.
- Member location and contact visibility are controlled by `DispatchPermissionAdapter`.
- Call and message actions are safe placeholders unless ECS comms wiring exists.

Status language:

- `connected`: operational/live
- `offline`: stale/offline
- `on_route`: active
- `at_waypoint`: positioned
- `at_camp`: staged
- `needs_check_in`: attention
- `no_response`: warning
- `unavailable`: muted
- `emergency`: critical

Privacy behavior:

- Restricted member location displays privacy copy rather than coordinates.
- Contact methods are restricted unless the permission adapter allows access.

## 5. Team Ping

Team Ping is the structured communication workflow for Dispatch.

Implemented ping types:

- Check-In
- Rally
- Assist
- Route
- Resource
- Hazard
- Emergency
- General

Implemented composer fields:

- Recipient: member, all team, or supported role/group target
- Ping type
- Priority: low, normal, high, critical
- Message
- Optional linked context
- Require acknowledgment
- Escalation timer placeholder

Behavior:

- The composer opens from command actions, roster member ping actions, queue follow-up actions, and context actions.
- Templates populate message text by ping type.
- Validation prevents missing recipient, ping type, priority, or message.
- Submitted pings create a local `DispatchPing`.
- Pings that require action create or link a `DispatchQueueItem`.
- Submitted pings create a `DispatchTimelineEvent`.
- Delivery state starts as `sent` when Dispatch is live/recovered, and `queued` when offline, stale, unknown, or otherwise not deliverable.
- Rapid duplicate submissions are blocked through idempotency keys and recent-action memory.

## 6. Dispatch Queue

The Dispatch Queue tracks operational coordination items: pings requiring response, assignments, assist requests, route checks, resource checks, hazards, offline concerns, and escalations.

Implemented behavior:

- Queue cards render title, detail, priority, status, assignment target, linked context, created/updated time, acknowledgment progress, delivery state, escalation state, conflict state, and suggested next action.
- Queue sorting prioritizes active critical items, escalations, pending responses, high priority, then recency, while resolved/cancelled items fall behind active work.
- Filters include All, Awaiting Response, Assigned, Escalated, and Resolved.
- Local actions support ping follow-up, assign, mark in progress, mark resolved, escalate, view context placeholder, retry delivery, and cancel queued delivery when permitted.
- Mark resolved does not delete the item.
- Escalation creates visible queue state changes and timeline entries.
- View Context is currently a safe placeholder unless an existing map navigation path is explicitly wired.

## 7. Assignments

Assignments connect queue items to team members.

Implemented behavior:

- Queue assignment actions create or update local `DispatchAssignment` records.
- Assignment state is merged with conflict-aware helpers.
- Assignment notifications are represented through the notification policy adapter, but notifications default disabled by rollout.
- Assignment changes create timeline events.
- Permissions gate assignment and reassignment.

Current limitation:

- There is no dedicated live assignment backend table in the current repo. Assignment persistence is local-first via `dispatchPersistenceAdapter`.

## 8. Assist Requests

Assist Request is a structured support/recovery flow, not an external emergency system.

Implemented assist types:

- Vehicle
- Medical
- Navigation
- Fuel
- Water
- Mechanical
- Comms
- Recovery
- General Support

Implemented behavior:

- Assist Request composer opens from the Dispatch action grid.
- Submit creates a `DispatchPing`, `DispatchQueueItem`, and `DispatchTimelineEvent`.
- Critical assist requests use emergency-style Dispatch coordination and sort near the top through priority.
- Assist copy includes ECS team coordination safety language.
- Permission checks run before assist actions execute.

## 9. Emergency Ping And Assist Safety

Emergency Ping and critical Assist Request are implemented only as ECS team coordination features.

Safety language in code:

- `ECS team coordination only.`
- `Emergency Ping is ECS team coordination only.`
- `Not an emergency services contact.`

Important constraints:

- Dispatch does not contact emergency services.
- Dispatch does not send SMS, email, phone calls, or external messages.
- Emergency and assist features create local/persisted Dispatch records and optional in-app notification policy events only where enabled and permitted.

## 10. Acknowledgments And Receipts

Implemented behavior:

- Pings support acknowledgment requirements.
- Check-in responses update ping acknowledgment fields.
- Queue acknowledgment progress displays count-based progress where linked pings exist.
- Partial acknowledgments keep queue items pending.
- Emergency or assistance-style responses can escalate the ping/queue item inside ECS.
- Late acknowledgments are preserved during merge/conflict resolution.

Receipt/status labels include queued, sent, delivered, seen, acknowledged, accepted, declined, no response, escalated, recovered, failed, retrying, and cancelled where supported by types and sync helpers.

## 11. Offline, Queued, And Recovered Behavior

Dispatch is local-first and offline-aware.

Implemented behavior:

- `DispatchSyncAdapter` maps app connectivity/sync inputs into Dispatch delivery states.
- Offline or unknown delivery starts new pings as queued.
- Queued/failed pings, queue items, and timeline events can be retried where supported.
- Queued pings and queue items can be cancelled where safe.
- Offline replay is implemented in `lib/dispatchOfflineReplayAdapter.ts`.
- Replay uses stable local IDs and idempotency keys to avoid duplicate pings, queue items, assignments, or timeline events.
- Successfully replayed items show recovered state.
- Failed replay shows failed state and can be retried where supported.

Rollout:

- Offline replay defaults enabled in `DEFAULT_DISPATCH_ROLLOUT_CONFIG`.

## 12. Realtime Sync Behavior

Realtime sync is implemented through `lib/dispatchRealtimeAdapter.ts`.

Implemented behavior:

- Uses Supabase broadcast channels when Supabase is configured.
- Subscribes by active expedition ID.
- Ignores events from the same client.
- Deduplicates incoming realtime event IDs.
- Uses merge helpers to avoid duplicate pings, queue items, assignments, and timeline events.
- Cleans up sessions on unmount or subscription replacement.
- UI components receive updates through adapter/hook state, not direct backend calls from card components.

Rollout:

- Realtime sync defaults enabled but can be disabled through `dispatchRolloutConfig`.

Current limitation:

- Multi-client behavior is covered by adapter/scenario tests, not by an end-to-end two-device automated test in this repo.

## 13. Linked Map Context

Dispatch supports linked context for expedition, pin, waypoint, route segment, resource, vehicle, power, and manual references.

Implemented behavior:

- `lib/dispatchContextAdapter.ts` collects context from mock data and safe existing stores.
- Queue and ping cards display linked context type and title.
- Team Ping and Assist Request composers allow selecting context.
- Context actions exist for pins, waypoints, route segments, resources, vehicles, and power.
- View Context is safe placeholder behavior unless an existing navigation path is explicitly wired.

Privacy:

- Location-derived reasoning and labels respect permission checks.
- Smart suggestions must not expose or use restricted location visibility.

## 14. Timeline And Expedition Log Behavior

Dispatch has a local timeline section for audit-style event trail.

Implemented timeline events include:

- Ping created
- Ping acknowledged
- Ping declined
- Assignment created
- Assignment accepted
- Queue escalated
- Queue resolved
- Member stale/offline
- Resource check requested
- Hazard broadcast sent
- Assist request created
- Sync/replay/failure events
- Permission denied attempts where appropriate

Implemented behavior:

- Timeline renders initial mock/local events.
- Local actions append typed timeline events.
- Timeline events include actor, target, priority, linked context, queue item ID or ping ID where applicable.
- Audit payload construction is centralized through `dispatchAuditAdapter`.
- Duplicate timeline events are merged by stable ID/idempotency key.

Rollout:

- Expedition log integration defaults disabled. Timeline remains local-first unless rollout enables log staging.

Current limitation:

- The repo has no confirmed dedicated live Dispatch audit/log backend path. Persistent expedition log integration is intentionally isolated and gated.

## 15. Notifications

Dispatch notification policy is implemented but disabled by default.

Implemented behavior:

- `lib/dispatchNotificationAdapter.ts` computes notification policy for pings, assignments, queue escalation, team member risk, and selected timeline events.
- It suppresses mock/demo actions.
- It suppresses sender notifications.
- It respects active/unavailable recipient state.
- It suppresses retry/recovered/offline replay events to avoid spam.
- It deduplicates notification toasts with a cooldown key.
- Emergency/assist copy includes ECS team coordination language.

Rollout:

- `notifications: false` by default in `DEFAULT_DISPATCH_ROLLOUT_CONFIG`.

Important limitation:

- There is no SMS, email, phone, push provider, or emergency-service integration enabled by Dispatch.

## 16. Permissions And Privacy

Permissions are centralized in `lib/dispatchPermissionAdapter.ts`.

Controlled actions include:

- View Dispatch
- View roster
- View member location
- View contact methods
- Send individual ping
- Send team-wide ping
- Send role/group ping
- Send emergency ping
- Create assist request
- Assign/reassign member
- Resolve queue item
- Escalate queue item
- Cancel queue item
- Broadcast hazard
- Modify timeline
- View audit history

Role behavior:

- Owner/admin/commander style roles have broad control.
- Members can view, send limited individual pings, respond to check-ins, and create limited assist requests.
- Viewers are read-only or limited visibility.
- Solo mode allows local-only Dispatch behavior.

Privacy copy:

- `Member location is restricted.`
- `Contact details are restricted.`
- `You do not have permission for this dispatch action.`

Unauthorized actions do not mutate Dispatch state and can create privacy-safe timeline/audit entries where appropriate.

## 17. Solo Mode

Solo mode is supported.

Implemented behavior:

- When active expedition roster data is unavailable for a non-mock active expedition, Dispatch can create a current-user solo member.
- Solo permissions keep local Dispatch controls usable.
- Solo mode does not imply team delivery, external communication, or emergency contact.
- Empty roster states explain that team readiness appears once members join the channel.

## 18. Empty, Loading, And Error States

Implemented states:

- Dispatch restricted
- Dispatch rollout paused
- Loading expedition roster
- No team members loaded
- No active queue items
- No pending responses
- No assigned queue items
- No active escalations
- No resolved queue items
- No recent pings
- No timeline events
- Dispatch audit restricted
- Disabled rollout cards for paused feature areas

Errors and denied actions are user-facing through safe copy/toasts and do not perform unauthorized writes.

## 19. Known Limitations

Current known limitations:

- Dispatch persistence is local-first. Dedicated backend Dispatch tables/schema are not implemented in this repo.
- Notifications are policy/toast based and disabled by rollout default.
- Expedition log integration is gated off by default.
- View Context is a placeholder unless map navigation wiring is explicitly added.
- Call/message actions in the roster are placeholders.
- Automated escalation timers are not enabled by default. Escalation suggestions and manual escalation exist.
- Multi-client realtime is adapter-backed and scenario tested, but not covered by a two-device automated test.
- Live emulator/device smoke is not represented by the docs or tests here.
- The web export build can print a known `spawn EPERM` warning while checking `sharp --version`, even when export succeeds.

## 20. Future Roadmap

Future ideas, not currently implemented as live product behavior:

- Dedicated Dispatch backend tables for pings, queue items, assignments, assist requests, acknowledgments, and timeline/audit events.
- Safe migration path from local-first persistence to live Dispatch tables.
- Full expedition log persistence once the log adapter path is verified.
- Verified push notification integration through existing ECS notification infrastructure.
- Two-client realtime QA harness for duplicate/event-order testing.
- Map deep links from queue/ping context into the map/pin/route manager.
- Real role/group management if ECS exposes custom groups.
- Verified local scheduling for check-in cadence.
- Verified automatic escalation timers with cancellation, dedupe, and permission checks.
- Rich assignment acceptance/decline flow.
- Operator support diagnostics panel for Dispatch delivery state, queued actions, and last realtime event.
- Exportable Dispatch incident/audit report.

## Launch Readiness Notes

Dispatch should be launched with conservative rollout settings:

- Keep notifications disabled until notification policy is reviewed in a live expedition.
- Keep expedition log integration disabled until persistence semantics are verified.
- Keep automated escalation disabled unless a safe timer/scheduling strategy is confirmed.
- Keep emergency/assist wording scoped to ECS team coordination only.
- Verify live device/emulator UI behavior before broad release, even though TypeScript, lint, scenario tests, helper tests, and web export have passed in local QA.
