# Lost Communications Operational Playbook

## Purpose

Lost Communications coordinates an ECS team response when another expedition member or vehicle operator has not checked in or is unreachable. It is not available in solo mode. The playbook remains ECS team coordination only and does not contact emergency services, send SMS, place calls, transmit externally, reroute, select a camp, or declare an incident automatically.

## Deterministic Flow

1. Review the last verified status, permitted position, age, accuracy, command history, route context, connectivity, and missing fields.
2. Confirm that position freshness was reviewed without inferring movement.
3. Prepare and explicitly confirm a direct Check-In proposal.
4. Prepare a lead/sweep notification proposal, or record why those roles are unavailable.
5. Review an existing rally, bailout, or camp context without changing guidance.
6. Start one absolute no-response Mission Clock deadline.
7. Record manual communication attempts.
8. Select and explicitly confirm an outcome.
9. Resolve or cancel the playbook.

Preparing or confirming a proposal does not create or send a command. The existing Command Composer requires a separate submit action. Offline commands remain `queued`, and delivery and acknowledgment remain independent from operational state.

## Source And Privacy Rules

- Convoy coordinates are included only when the member has an actual location row, sharing is enabled, and the operator has member-location permission.
- No manual or team-position fallback is used as a member GPS position.
- Recent, stale, expired, restricted, missing, cached, and unavailable states remain distinct.
- A stale position is presented as last verified and never as live. Movement is never inferred.
- Restricted coordinates are omitted before the playbook snapshot is persisted and before an incident prefill is created.
- The expedition communications plan is manual guidance only.

## Outcomes And Handoffs

Supported outcomes are member responded, delayed but safe, regroup requested, assistance requested, command cancelled, and escalate for operator review. Operator escalation is available only when the no-response deadline is due or overdue and requires an explicit choice. It opens the existing Incident form with unknown safety fields preserved; the incident is created only if the operator submits that form.

Smart Rally integration accepts preview-only candidates from the existing deterministic regroup planner. It never accepts the candidate, replaces guidance, or changes the route. Linked context uses existing Navigate, Fleet, Camp, and Incident handoffs and preserves a return route to the playbook instance.

## Rollout

Lost Communications uses `dispatch_mission_command`:

- Maturity: internal
- Default: off
- Enable flag: `EXPO_PUBLIC_ECS_MISSION_COMMAND`
- Kill switch: `EXPO_PUBLIC_ECS_KILL_MISSION_COMMAND`
- Backend dependency: none; state is local-first in Dispatch persistence
- Production visibility: blocked until Mission Command rollout, privacy, multi-client, mobile-device, and field evidence are accepted
