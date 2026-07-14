# Mission Command Incident Room

Incident Room is an internal, feature-flagged Mission Command workspace for coordinating a serious event. It does not replace Incident & Recovery and does not create a second incident identity.

## Ownership

- `incidentRecoveryWorkflowStore` owns the incident record, lifecycle, actor history, resolution, and debrief.
- The canonical incident ID is the Incident Room ID.
- Mission Command owns linked commands, delivery state, acknowledgments, deadlines, and offline outbox records.
- `dispatchIncidentRoom` builds a read-only presentation model from those owners. Board buckets, room sections, and timeline windows are derived rather than persisted.

## Lifecycle

The room adapts the current Incident & Recovery states into presentation phases: reported, assessing, active, stabilizing, recovering, resolved, and closed. Only transitions accepted by `incidentRecoveryWorkflowStore.canTransitionIncidentStatus` may be recorded. The current lifecycle does not support reopening a resolved or closed incident.

Resolution and debrief reuse the existing Resolve/Debrief workflow. Community hazard publication and route-confidence changes remain manual review requests and are never applied automatically.

## Command Linkage

Commands created in a room use the existing Mission Command composer and carry an incident linked context. Escalating an existing command requires explicit confirmation, uses a stable idempotency key, creates or reuses one canonical incident, and records the linkage on the command. Queued commands remain queued and are not presented as sent or acknowledged.

## Privacy And Offline Behavior

Restricted incident or member positions are omitted from the presentation model and linked context. Stale shared positions are labeled last known. The room remains usable with local incident state and persisted Mission Command/outbox state while offline. It does not contact emergency services, transmit externally, publish hazards, reroute, or change route confidence.

## Rollout

- Feature ID: `dispatch_incident_room`
- Dispatch rollout key: `incidentRoom`
- Enable flag: `EXPO_PUBLIC_ECS_INCIDENT_ROOM`
- Kill switch: `EXPO_PUBLIC_ECS_KILL_INCIDENT_ROOM`
- Default: disabled
- Dependency: `dispatch_mission_command`
- Maturity: internal

Production visibility remains blocked on Incident & Recovery field evidence and Mission Command owner acceptance. Backend persistence, two-client convergence, mobile device behavior, and restricted-location privacy still require external validation.
