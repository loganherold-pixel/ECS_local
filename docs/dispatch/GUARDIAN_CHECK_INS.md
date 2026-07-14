# Guardian Check-Ins

## Product Boundary

Guardian Check-Ins is an internal Mission Command accountability feature inside the existing **Dispatch** tab. It supports teams and solo operators. It does not add a route, send SMS, place calls, contact emergency services, declare an emergency, or infer that another person received a request.

Every transmission remains an explicit Command Composer submission. A missed grace deadline creates a local **Needs Decision** Command Board item only after an operator records no response. Incident creation is an explicit follow-up and uses the existing local Incident workflow.

## Ownership

- `lib/dispatchGuardianCheckInTypes.ts` owns the versioned plan, trigger, response, event, and presentation contracts.
- `lib/dispatchGuardianCheckInDomain.ts` owns validation, state transitions, idempotency, recurrence, privacy sanitization, no-response decisions, retention, and Mission Clock projection.
- `lib/dispatchGuardianCheckInAdapter.ts` owns Command Composer, legacy check-in, presentation, deadline, and solo incident adapters.
- `lib/dispatchPersistenceAdapter.ts` remains the authoritative local Dispatch owner. Guardian Check-Ins introduced the bounded `guardianCheckIns` collection in schema version 5; schema version 7 preserves it while adding Mission Command and Operational Playbook outbox durability and recovery metadata.
- `components/dispatch/DispatchGuardianCheckIns.tsx` is a store-thin operational sheet. Mission Command continues to own command delivery and acknowledgment.

## Trigger Support

| Trigger | Current support |
| --- | --- |
| Fixed time | Absolute Mission Clock timestamp |
| Recurring interval | Absolute timestamp advanced after explicit cycle resolution |
| Route checkpoint | Operator confirms observed arrival against linked context |
| Rally arrival | Operator confirms observed arrival against linked context |
| Camp arrival | Operator confirms observed arrival against linked context |
| Remote segment entry | Operator confirms observed entry against linked context |
| Operator-requested | Explicit operator action |
| Post-incident follow-up | Operator confirms the linked incident follow-up point |
| Manual one-time | Explicit operator action |

No trigger installs continuous background location automation. Event-based triggers are available only when compatible local context exists and require operator confirmation. This preserves offline behavior without claiming geofence reliability the current platform has not established.

## State And Clock

Plans are `active`, `paused`, `completed`, or `cancelled`. Response state is separate: `scheduled`, `requested`, `queued`, `delivered`, `acknowledged`, `delayed`, `declined`, `no_response`, `resolved`, or `cancelled`.

Mission Clock uses one absolute `nextReviewAt` per active plan. Creating a command replaces that timestamp with the command acknowledgment deadline. Pausing stores the bounded remaining duration; resuming creates a new absolute timestamp. Restart and foreground restoration recalculate from persisted timestamps rather than decrementing counters.

## Offline And Solo Behavior

Offline team requests use the existing Mission Command outbox and remain `queued`; queued delivery can never be recorded as acknowledgment. Solo check-ins target only the current user, require no recipient acknowledgment, and explicitly state that no other person received the reminder. A solo operator may manually resolve the check-in, review the communications plan, or explicitly open a local incident record.

## Privacy And Source Truth

Exact coordinates are excluded by default. They are retained only when the operator selects them, the linked context is not restricted, and the current permission adapter allows location access. Restricted context never persists coordinates. Observation time, source truth, stale state, and available accuracy remain visible independently of the coordinates; missing values remain unavailable.

## Rollout

Guardian Check-Ins uses the existing `dispatch_mission_command` master capability. It is `internal`, default off, and permitted only in development, test, and approved internal environments. Enablement uses `EXPO_PUBLIC_ECS_MISSION_COMMAND`; `EXPO_PUBLIC_ECS_KILL_MISSION_COMMAND` remains the kill switch. No backend table or external delivery integration is added.

The kill switch is the safe operational rollback because it leaves v5 plans untouched. A v4 binary does not understand the new collection and may discard it after a Dispatch write; binary rollback therefore requires a storage backup or explicit acceptance that Guardian-only records can be lost while legacy Dispatch records remain intact.
