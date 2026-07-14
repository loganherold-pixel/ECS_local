# Mission Command Domain Foundation

## Product Boundary

Mission Command is the structured operational-command foundation inside the existing **Dispatch** experience. It does not add a route or top-level tab. The Command Board becomes the flagship Dispatch surface only when the internal rollout is approved; the default-off path keeps the established Dispatch presentation unchanged. It coordinates explicit ECS team or solo actions only. It does not contact emergency services, send external messages, declare incidents, reroute, select camps, or escalate automatically.

Deterministic application logic owns command eligibility, transitions, deadlines, acknowledgment requirements, linked-context restrictions, and board placement. AI may later explain validated command state, but it may not create, transmit, resolve, cancel, or override a command.

## Ownership

- `lib/dispatchMissionCommandTypes.ts` owns the versioned command, event, target, assignment, acknowledgment, resolution, and safe-audit contracts.
- `lib/dispatchMissionCommandDomain.ts` owns pure transitions, acknowledgment derivation, idempotent merge, event append, persistence validation, restricted-context sanitization, retention, and Command Board selectors.
- `lib/dispatchMissionCommandAdapters.ts` is the compatibility boundary for current pings, queue items, assignments, acknowledgments, routed CAD commands, and timeline events.
- `lib/dispatchMissionCommandPresentation.ts` owns memoizable board, summary, deadline, source-state, and allowed-action presentation models.
- `lib/dispatchMissionClock.ts` owns absolute deadline normalization, source-specific warning windows, status derivation, chronological selectors, and safe linked context.
- `lib/dispatchMissionClockScheduler.ts` owns the injectable single-timer controller and material-boundary refresh policy.
- `lib/useMissionClockScheduler.ts` binds the pure scheduler to React Native app foreground/background state and replaces it when expedition scope changes.
- `lib/dispatchMissionCommandComposer.ts` owns command-form defaults, legacy-entry mapping, targeting, assignment, acknowledgment, deadline, linked-context validation, permission checks, stable identity, and canonical creation.
- `lib/dispatchOperationalPlaybookTypes.ts` owns the versioned definition, instance, step, event, proposal, deadline, input, and effect contracts for guided coordination workflows.
- `lib/dispatchOperationalPlaybookDomain.ts` owns playbook validation, deterministic transitions, explicit command-proposal confirmation, migration, restart normalization, retention, source-state checks, and Mission Clock deadline projection.
- `lib/dispatchOperationalPlaybookPresentation.ts` owns the memoizable playbook runner model and typed UI intents.
- `components/dispatch/DispatchMissionCommandBoard.tsx` renders the gated Command Board, bounded history, and ECS detail sheet. It does not own command or clock rules.
- `components/dispatch/DispatchMissionClockPanel.tsx` renders the next-deadline metric, bounded chronological list, and deadline detail sheet from a typed clock snapshot.
- `components/dispatch/DispatchMissionCommandComposer.tsx` is the single gated creation, reassignment, and follow-up sheet. It receives typed catalogs and callbacks; it does not read stores or decide permissions.
- `components/dispatch/DispatchOperationalPlaybookRunner.tsx` is a reusable, store-free runner sheet. It emits typed user intents and cannot mutate state, create commands, or transmit commands.
- `lib/dispatchPersistenceAdapter.ts` remains the authoritative local Dispatch store. Schema version 4 adds `operationalPlaybooks` while preserving the version 3 Mission Command fields and all legacy records.

No Supabase table or remote write path is added by this foundation.

## State Model

Mission Command keeps three independent state dimensions:

| Dimension | States |
| --- | --- |
| Operational | `proposed`, `ready`, `active`, `in_progress`, `blocked`, `resolved`, `cancelled`, `expired` |
| Delivery | `local`, `queued`, `sending`, `sent`, `delivered`, `failed`, `retrying`, `cancelled` |
| Acknowledgment | `not_required`, `pending`, `partial`, `complete`, `declined`, `expired` |

Changing delivery or acknowledgment state does not silently change operational state. `resolved`, `cancelled`, and `expired` are terminal. Repeating a terminal transition is an idempotent no-op and does not append another event.

Events are immutable identities for creation, staging, queueing, sending, delivery, acknowledgment, decline, assignment, follow-up requests, start, blocking, resolution, cancellation, expiration, replay, retry, and failure. Retention is bounded to 250 commands and 750 events per expedition snapshot; active commands are retained ahead of terminal history.

## Command Composer

The internal rollout consolidates routed Check-In, Rally, Assist, Hazard, Resource, recovery-report, event-action, threat-action, and convoy-regroup drafts into one Command Composer. It also supports Route and General commands. Flag-off behavior remains unchanged while the rollout is internal.

Targets are resolved from the permission-filtered runtime catalog: one member, a role, selected members, the whole expedition, a vehicle, or the current user in solo mode. Assignments remain independent from targets and may be unassigned, member, role, vehicle, or an available team/convoy unit. A reassignment increments the command version and appends an `assigned` event; repeated assignment to the same target is an idempotent no-op.

Acknowledgment policy supports none, any target, every target, a resolved role subset, or an explicit safe count. A role requirement persists the role ID together with the resolved member IDs so later presentation does not relabel it as a generic live group. Deadlines support absolute time, relative minutes, Mission Clock templates, and supplied route/check-in milestones.

Linked context is accepted only through typed context options. Restricted context is rejected before persistence. The composer copies only the canonical context fields and omits arbitrary metadata. Manual context remains available without coordinates.

One submit creates one command and one initial event in one local persistence update. A draft ID scopes the idempotency key, so repeated taps on the same draft do not duplicate command or event records while a newly opened draft may intentionally create another command. Offline creation records `deliveryState: queued` and a `queued` event. Online local creation records `deliveryState: local`; it is never labeled sent, delivered, or acknowledged without confirmation from a future approved delivery adapter. Starting replay moves a queued command to `sending` with a `replayed` event whose copy explicitly says delivery is not yet confirmed.

Command Board buckets are derived and never persisted:

- **Needs Decision**: proposed, ready, blocked, failed delivery, declined acknowledgment, or expired acknowledgment.
- **Awaiting Acknowledgment**: pending or partial acknowledgment after higher-priority decision states are considered.
- **In Progress**: active/in-progress commands without an outstanding decision or acknowledgment.
- **Resolved**: resolved, cancelled, or expired operational records.

## Mission Clock

Mission Clock derives time state from absolute timestamps. It never persists a decrementing counter, so restart, foreground restoration, timezone changes, and device-clock changes recalculate from the same source timestamp. Exact deadline time is `due`; time after the deadline is `overdue`. Source-specific warning and critical windows distinguish `scheduled`, `due_soon`, and `due` before the cutoff. Completed and cancelled records remain terminal; invalid timestamps or missing source truth are `unavailable`, not clear.

The initial adapters cover canonical/legacy-projected command deadlines and durable offline retry windows. The typed `createMissionClockDeadline` boundary also accepts scheduled check-ins, no-response reviews, rally deadlines, CampOps diversion cutoffs, safe-arrival/sunset deadlines, weather rechecks, expedition milestones, and incident reviews without importing their stores into Dispatch UI. Linked context contains only an ID, type, safe label, and restriction state; coordinates and arbitrary metadata are excluded.

One scheduler targets the next material status boundary and otherwise refreshes at a bounded one-minute cadence. Backgrounding clears its timer; foregrounding recalculates immediately; expedition replacement, logout/unmount, or a clock with no active deadlines leaves no timer. Mission Clock may present a deterministic suggested review action, but it never sends a command, escalates an incident, changes camp/route state, or contacts anyone.

## Adapter Strategy

Existing `DispatchPing`, `DispatchQueueItem`, `DispatchAssignment`, `DispatchAcknowledgment`, and `DispatchTimelineEvent` contracts remain public and unchanged. Adapters preserve existing command types, including `emergency`, and add the canonical `recovery` type. Local legacy records are labeled manual/local unless stronger source provenance already exists; adaptation never upgrades them to live.

Persisted user/team `DispatchEvent` records from the currently routed CAD composer are adapted as `legacy_cad_event` commands. Live engine advisories are not promoted into Mission Commands. A queue item linked to its source ping becomes one command, and an explicit canonical mutation supersedes its adapter projection by stable ID and idempotency key.

Restricted linked context retains only safe identifiers, labels, source state, and the restriction marker. Coordinates and arbitrary metadata are removed before the command enters canonical persistence.

The version 3 to version 4 persistence migration is additive, as was the version 2 to version 3 Mission Command migration:

1. Existing pings, queue items, assignments, assists, acknowledgments, timeline, outbox, and CAD records are retained.
2. Missing Mission Command and Operational Playbook arrays initialize empty.
3. Invalid Mission Command or Operational Playbook records are dropped without deleting valid legacy Dispatch data; the load result reports partial recovery.
4. Explicit adapters can create canonical aggregates when the rollout is enabled; hydration does not silently duplicate legacy records.
5. Rolling back to a version 3 reader is non-destructive because the playbook field is additive. Rolling back farther retains the same legacy compatibility caveat documented for Mission Command.

## Rollout

Feature ID: `dispatch_mission_command`

- Maturity: `internal`
- Default: off
- Allowed environments: development, test, internal
- Enable flag: `EXPO_PUBLIC_ECS_MISSION_COMMAND`
- Kill switch: `EXPO_PUBLIC_ECS_KILL_MISSION_COMMAND`
- Offline support: full local operation
- Route registration: none
- Backend dependency: none; Command Board delivery remains local/queued unless an existing approved Dispatch path confirms delivery
- Operational Playbook visibility: framework uses this same master flag; no scenario definitions are registered or mounted by this task

The feature registry and Dispatch rollout selector must both approve the capability. Production fails closed even if the enable flag is set. The enabled internal UI keeps compact access to Command Board, Team/Convoy, and Timeline/Events. Production visibility still requires separate privacy, multi-client, Android/iOS, field, and owner verification.
