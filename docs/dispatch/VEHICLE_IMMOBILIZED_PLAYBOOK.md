# Vehicle Immobilized Operational Playbook

## Purpose

Vehicle Immobilized coordinates the ECS team response when a selected Fleet vehicle cannot continue. It does not diagnose a mechanical failure, certify terrain or equipment safety, begin a recovery, reroute guidance, contact external assistance, or declare an incident automatically. It remains useful in solo and offline operation.

## Deterministic Flow

1. Select the affected Fleet vehicle and explicitly record stopped, people-accounted, immediate-hazard, communications, and route-obstruction states. Unknown remains unknown.
2. Review and confirm only those displayed observations.
3. Prepare an optional lead-and-sweep stop/regroup proposal. The existing Command Composer still requires explicit confirmation and a separate submit action.
4. Assign a recovery lead and, when team structure supports it, a spotter. Assignment authorizes coordination only.
5. Open the Fleet recovery-readiness snapshot and review references to existing approved ECS recovery protocols.
6. Open permitted last-verified location, route-segment, bailout, or CampOps context without replacing guidance or changing the plan.
7. Record one supported operator outcome, start an absolute Mission Clock status-review deadline, and record acknowledgment targets.
8. Explicitly confirm the outcome, then resolve or cancel the playbook.

Supported outcomes are self-recovered, team recovery in progress, vehicle remains immobilized, route blocked, external assistance planning, camp or overnight decision required, and incident resolved. Route blocked requires an operator-confirmed blocked route. Team recovery in progress requires an assigned recovery lead. Incident resolved requires explicit people-accounted, no-immediate-hazard, and route-clear status.

## Source And Safety Rules

- Fleet profile and loadout data remain manual source state unless their underlying source says otherwise.
- Visible recovery gear means only that Fleet contains relevant gear records. It does not verify condition, rating, terrain suitability, anchor safety, slope safety, or recovery safety.
- Terrain is shown only when cached analysis matches the active route label and remains planning reference data.
- Weather uses the operational broker snapshot. Missing, malformed, cached, stale, offline, and provider-unavailable data remain labeled.
- Daylight is an estimate derived from the weather snapshot sunset time and is labeled estimated.
- Remote convoy coordinates require both member-location permission and GPS sharing. Restricted coordinates are removed before persistence.
- A stale member location is shown only as last verified; movement is never inferred.
- Occupants are not inferred from vehicle ownership.
- Approved recovery protocols are referenced by ID and title. The playbook does not generate physical recovery steps.

## Handoffs And Persistence

Fleet, Navigate, route, camp, and incident context use the existing Mission Command context adapter and preserve a return route to the playbook instance. Opening context does not mutate command state beyond recording the explicit context-open step. Incident review is optional, prefilled conservatively, and creates nothing until the operator submits the existing Incident form.

The playbook persists in the bounded Dispatch operational-playbook collection. Mutations use stable idempotency keys, absolute timestamps, and the shared append-only event model. Safe playbook events also project into the existing local Dispatch timeline. Offline operation does not mark commands sent or acknowledged.

## Rollout

Vehicle Immobilized uses `dispatch_mission_command`:

- Maturity: internal
- Default: off
- Enable flag: `EXPO_PUBLIC_ECS_MISSION_COMMAND`
- Kill switch: `EXPO_PUBLIC_ECS_KILL_MISSION_COMMAND`
- Backend dependency: none; state is local-first in Dispatch persistence
- Production visibility: blocked until Mission Command privacy, multi-client, Android/iOS, and closed-field evidence are accepted
