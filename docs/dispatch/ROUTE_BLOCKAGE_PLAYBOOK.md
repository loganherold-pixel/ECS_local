# Route Blockage Operational Playbook

## Product Boundary

Route Blockage coordinates the ECS team when a planned route is reported blocked, restricted, unsafe to continue, or unverifiable. It records a point-in-time operator or member report, keeps that report separate from official legal/access evidence and current-condition evidence, and preserves stale, conflicting, missing, cached, and manual source states.

The playbook does not automatically reroute, replace active guidance, publish a public hazard, change camp, declare an incident, or contact external services. Command proposals require explicit playbook confirmation and a separate Command Composer submission. Incident creation requires an explicit recorded outcome and submission through the existing Incident form.

## Deterministic Inputs

- A permitted exact blockage location, or an explicit restricted/missing state.
- Active route and nearest route segment when local geometry is available.
- Geometry proximity classified as affecting, near, outside, or unknown.
- User report origin, reporter, observation time, and confidence.
- Official legal/access evidence kept separate from current-condition evidence.
- Weather and fire context without inferring a route closure from weather or detection data.
- Saved-route candidates compared through `compareRoutePlans`; unknown safety inputs remain unknown.
- Existing bailout or turnaround context.
- CampOps reassessment state only when measured route-impact categories materially affect arrival or endpoint assumptions.
- Offline Readiness Manifest and departure audit state when available.

## Outcomes And Handoffs

Supported operator outcomes are obstacle cleared, proceed with caution, turnaround, alternate route selected, camp plan changed, route abandoned, and incident created. Selecting an alternate records only its stable route ID. Any subsequent route handoff must pass the existing active-guidance replacement guard and still performs no mutation from the playbook.

Opening blockage context stages the existing Mission Command return route:

`/alert?operationalPlaybook=route_blockage&playbookInstanceId=<instance>`

The linked-context adapter reuses local route, pin, bailout, Navigate, and Incident boundaries. Restricted coordinates are removed before persistence.

## Persistence And Rollout

Route Blockage uses Operational Playbook schema version 1 inside Dispatch persistence version 4. It adds no new persisted shape, Supabase table, provider dependency, or migration.

It uses `dispatch_mission_command`:

- Maturity: internal
- Default: off
- Enable: `EXPO_PUBLIC_ECS_MISSION_COMMAND`
- Kill switch: `EXPO_PUBLIC_ECS_KILL_MISSION_COMMAND`
- Offline support: local playbook, route assets, bailouts, Mission Clock, and Offline Prep audit snapshots

Real Android/iOS map handoff, multi-client acknowledgment ordering, provider-backed closure/access evidence, privacy review for restricted locations, and closed-field route blockage operation remain external release evidence.
