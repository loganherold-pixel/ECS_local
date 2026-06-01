# ECS Dispatch Post-Launch Monitoring Checklist

Last updated: 2026-04-24

## Purpose

Use this checklist after Dispatch launch to watch reliability, data integrity, offline behavior, realtime consistency, permissions, notification control, safety language, and support impact.

Dispatch emergency and assist behavior is ECS team coordination only. Dispatch does not contact emergency services, SMS, email, or phone services unless a future external communication path is explicitly implemented, verified, and enabled.

## Monitoring Checklist

| Area | What to watch | Why it matters | Likely cause | First debugging step | Related file/service |
| --- | --- | --- | --- | --- | --- |
| Dispatch screen load errors | Crashes, blank Dispatch screen, route load failures, maximum update depth warnings | Blocks all Dispatch workflows | component render error, bad persisted local snapshot, missing import, invalid enum value | Open Dispatch in dev, check console/log output, temporarily disable `dispatchTabVisibility` if needed | `components/dispatch/DispatchCommandCenter.tsx`, `lib/dispatchPersistenceAdapter.ts`, `lib/dispatchRolloutConfig.ts` |
| Team roster load failures | Empty roster when team expedition is active, repeated loading state, fallback used unexpectedly | Operators need roster state to coordinate safely | missing active expedition, unavailable `dispatch-feed`, membership adapter failure, Supabase unavailable | Check active expedition source and roster load result; verify mock/solo fallback behavior | `lib/dispatchServiceAdapters.ts`, `lib/dispatchStore.ts`, `lib/supabase.ts` |
| Ping creation failures | Team Ping submit rejected, no ping appears, validation loops | Ping is core Dispatch communication | validation failure, permission denial, recipient resolution failure, idempotency duplicate guard, persistence error | Confirm composer fields, recipient resolution, and permission result | `DispatchTeamPingComposer.tsx`, `DispatchCommandCenter.tsx`, `lib/dispatchRoutingAdapter.ts`, `lib/dispatchPermissionAdapter.ts` |
| Queue update failures | Assign, in-progress, resolve, escalate, retry, or cancel does not update | Queue is the operational work tracker | permission denial, stale queue state, conflict merge, persistence failure, rollout disabled | Check queue action permission and local persisted snapshot after action | `DispatchQueueSection.tsx`, `DispatchCommandCenter.tsx`, `lib/dispatchIntegrity.ts`, `lib/dispatchPersistenceAdapter.ts` |
| Acknowledgment failures | Check-in response does not register, acknowledgment count wrong | Acknowledgments drive safety and escalation | current member not targeted, permission denial, ping status terminal, check-in response merge issue | Verify current member ID and `ping.targetMemberIds`; inspect `checkInResponses` | `lib/dispatchCheckInAdapter.ts`, `DispatchCommandCenter.tsx`, `lib/dispatchTypes.ts` |
| Offline replay failures | Queued items stay queued, retry never recovers, replay marks failed | Offline-first behavior must not lose work | realtime disabled, sync not deliverable, publish failure, local record not replayable, local ID mismatch | Check rollout flags, realtime status, `syncSnapshot.isDeliverable`, and delivery state | `lib/dispatchOfflineReplayAdapter.ts`, `lib/dispatchSyncAdapter.ts`, `lib/dispatchRealtimeAdapter.ts` |
| Duplicate pings | Same Team Ping appears multiple times | Duplicates confuse operators and can spam workflows | missing/changed idempotency key, rapid submit guard bypass, realtime echo merge failure | Compare `id` and `idempotencyKey`; run helper tests | `lib/dispatchIntegrity.ts`, `DispatchCommandCenter.tsx`, `scripts/test-dispatch-helpers.js` |
| Duplicate queue items | Multiple queue cards for one ping/assist/action | Queue priority and metrics become unreliable | queue idempotency mismatch, offline replay duplicate, source ping not linked | Check `sourcePingId`, `idempotencyKey`, and merge path | `lib/dispatchIntegrity.ts`, `lib/dispatchPersistenceAdapter.ts`, `DispatchQueueSection.tsx` |
| Duplicate notifications | User receives repeated notification/toast for one Dispatch event | Notification spam reduces trust and may cause unsafe confusion | notification key too broad/narrow, replay/retry not suppressed, realtime echo | Disable `notifications`, inspect notification policy key and event source | `lib/dispatchNotificationAdapter.ts`, `lib/dispatchRolloutConfig.ts` |
| Duplicate timeline/log events | Same event appears repeatedly in Dispatch timeline or expedition log | Audit trail must stay trustworthy | timeline idempotency mismatch, optimistic + realtime echo, expedition log staging duplicate | Compare timeline `idempotencyKey`; verify staged audit dedupe | `lib/dispatchTimelineLogAdapter.ts`, `lib/dispatchAuditAdapter.ts`, `lib/dispatchIntegrity.ts` |
| Realtime subscription errors | Realtime state is error/closed, no cross-client updates | Live team coordination depends on sync when enabled | Supabase unavailable, channel error, invalid expedition ID, network issue | Check realtime status, Supabase config diagnostics, rollout flag | `lib/dispatchRealtimeAdapter.ts`, `lib/supabase.ts`, `DispatchCommandCenter.tsx` |
| Permission-denied action attempts | Frequent denied actions or users blocked unexpectedly | May indicate role confusion or broken permission mapping | role mismatch, solo/team mode detection, overly strict action mapping | Check current role label and denied action reason | `lib/dispatchPermissionAdapter.ts`, `DispatchCommandCenter.tsx` |
| Notification delivery failures | Notifications expected but absent | Teams may miss important Dispatch events if notifications are enabled | notifications rollout disabled, mock suppression, sender suppression, recipient unavailable, provider absent | Confirm `notifications` flag, event policy, current user target, and source | `lib/dispatchNotificationAdapter.ts`, `lib/dispatchRolloutConfig.ts` |
| Assist Request usage | Volume, criticality, unresolved assist items, confusion in support tickets | Assist is safety-sensitive team coordination | unclear UI copy, inappropriate routing, permission mismatch, unresolved queue items | Review assist queue/timeline records and support reports | `DispatchAssistRequestComposer.tsx`, `DispatchCommandCenter.tsx`, `lib/dispatchMetricsAdapter.ts` |
| Emergency Ping usage | Frequency, unresolved emergency pings, user misunderstanding | Emergency language must not imply emergency services | users expect 911/external contact, critical pings overused, safety copy missed | Verify safety copy appears; review user guide/support scripts | `DispatchTeamPingComposer.tsx`, `DispatchCommandCenter.tsx`, `docs/dispatch/USER_GUIDE.md` |
| Failed delivery retry rate | High retry counts, repeated failed delivery states | Indicates connectivity/sync/realtime instability | offline replay disabled, publish failures, unreachable Supabase, local state conflict | Check failed/retrying counts in diagnostics and replay result | `lib/dispatchOfflineReplayAdapter.ts`, `lib/dispatchSyncAdapter.ts`, `DispatchCommandCenter.tsx` |
| Stale team member states | Members stuck offline/no_response/needs_check_in | Roster freshness drives safety decisions | no live roster source, stale last seen, missed check-in response, realtime member update missing | Verify team roster source and last seen timestamps; request manual check-in | `lib/dispatchServiceAdapters.ts`, `lib/dispatchCheckInAdapter.ts`, `DispatchTeamRosterSection.tsx` |
| Performance on large expeditions | Slow scroll, delayed composer open, heavy render, high memory, repeated sorting | Dispatch must remain usable with many members/items | large arrays, expensive derived metrics, unbounded timeline, frequent realtime bursts | Use dev diagnostics, test large demo/live data, profile list rendering | `lib/dispatchPerformanceAdapter.ts`, `lib/dispatchMetricsAdapter.ts`, `DispatchQueueSection.tsx`, `DispatchTeamRosterSection.tsx` |
| User confusion around emergency language | Support tickets asking whether Emergency Ping calls rescue/911 | Safety messaging must be unmistakable | copy too subtle, training gap, emergency action placement | Confirm UI/docs say ECS team coordination only; update support macro if needed | `docs/dispatch/USER_GUIDE.md`, `docs/dispatch/RELEASE_NOTES.md`, `DispatchTeamPingComposer.tsx` |
| Support tickets | Repeated questions, bug reports, failed workflows, unclear permissions | Support volume reveals launch friction | documentation gap, product language mismatch, rollout issue, real bug | Tag tickets by Dispatch area and compare to diagnostics/checklist | `docs/dispatch/*`, `lib/dispatchRolloutConfig.ts`, support tooling |

## Daily Launch Review

During the first launch window, review:

- number of Dispatch screen load issues
- pings created
- queue items created/updated/resolved
- assist requests created
- emergency pings created
- failed/retrying/recovered delivery counts
- duplicate reports
- permission-denied reports
- support tickets mentioning emergency language
- realtime subscription health
- offline replay health

## Escalation Thresholds

Consider disabling targeted rollout flags if:

- duplicate notifications are reported by more than one tester/user
- Emergency Ping is misunderstood as contacting emergency services
- failed delivery/retry loops persist across reconnect
- realtime errors cause visible duplicate or stale state
- unauthorized users can mutate queue or send restricted pings
- member location/contact details appear without permission

Recommended first flags to disable:

1. `notifications`
2. `realtimeSync`
3. `offlineReplay`
4. `emergencyPing`
5. `assistRequest`
6. `teamPing`
7. `dispatchTabVisibility`

See `docs/dispatch/ROLLBACK_PLAN.md` for rollback details.

## Support Response Notes

Use this language for safety-sensitive support:

- "Assist Request is ECS team coordination only."
- "Emergency Ping does not contact emergency services."
- "Dispatch does not trigger SMS, email, phone, or external emergency communication unless a verified integration is explicitly enabled."
- "Queued means the action is staged locally and waiting for delivery."
- "Recovered means the action succeeded after reconnect."

## Verification After Fixes

After any Dispatch launch fix:

- run `npx tsc --noEmit`
- run `node ./scripts/test-dispatch-helpers.js`
- run `node ./scripts/test-dispatch-scenarios.js`
- smoke test Dispatch open/render
- verify no duplicate pings, queue items, notifications, or timeline events
- verify permissions still block restricted actions
- verify emergency/assist safety copy remains visible
