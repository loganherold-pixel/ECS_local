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
- `lib/dispatchMissionCommandProposal.ts` owns the versioned cross-domain proposal envelope, source-state snapshot, restricted-context sanitization, explicit confirmation/cancellation, stable fingerprint, and existing navigation-flow handoff into Dispatch.
- `lib/dispatchMissionCommandSourceAdapters.ts` is the thin integration boundary for Dashboard/ECS Brief, Fleet, Navigate, Explore/Trip Builder, CampOps, operational weather, and Incident & Recovery outputs. It accepts validated source results and does not recalculate their conclusions.
- `lib/dispatchMissionCommandResolutionHandoff.ts` projects a terminal command into one idempotent, allowlisted expedition timeline note. It cannot mutate Fleet, route, camp, weather, or incident state.
- `lib/dispatchMissionCommandSolo.ts` owns personal-action templates and the explicit, idempotent conversion of a self action into a local team draft without changing command identity or claiming delivery.
- `lib/dispatchOperationalPlaybookTypes.ts` owns the versioned definition, instance, step, event, proposal, deadline, input, and effect contracts for guided coordination workflows.
- `lib/dispatchOperationalPlaybookDomain.ts` owns playbook validation, deterministic transitions, explicit command-proposal confirmation, migration, restart normalization, retention, source-state checks, and Mission Clock deadline projection.
- `lib/dispatchOperationalPlaybookPresentation.ts` owns the memoizable playbook runner model and typed UI intents.
- `components/dispatch/DispatchMissionCommandBoard.tsx` renders the gated Command Board, bounded history, and ECS detail sheet. It does not own command or clock rules.
- `components/dispatch/DispatchMissionClockPanel.tsx` renders the next-deadline metric, bounded chronological list, and deadline detail sheet from a typed clock snapshot.
- `components/dispatch/DispatchMissionCommandComposer.tsx` is the single gated creation, reassignment, and follow-up sheet. It receives typed catalogs and callbacks; it does not read stores or decide permissions.
- `components/dispatch/DispatchOperationalPlaybookRunner.tsx` is a reusable, store-free runner sheet. It emits typed user intents and cannot mutate state, create commands, or transmit commands.
- `lib/dispatchPersistenceAdapter.ts` remains the authoritative local Dispatch store. Schema version 7 adds durable Operational Playbook outbox actions and conservative recovery of malformed Mission outbox records while preserving all legacy records.
- `lib/dispatchMissionCommandCanonicalAdapter.ts` maps the local command, event, playbook, deadline, incident-link, and restricted-location contracts into the additive canonical Dispatch schema without exposing restricted coordinates in ordinary rows.
- `lib/dispatchCanonicalRepository.ts` and `lib/dispatchCanonicalMigrationCoordinator.ts` own the default-off Supabase shadow path. Server reads cannot mutate Mission Command state in this rollout.

## Runtime ownership

- `dispatchMissionCommandRuntime.ts` coordinates hydration, foreground replay, background flush, account or expedition generation changes, and privacy-safe diagnostics. It does not own a second command store.
- Team command mutations enqueue one stable `mission_command` operation and an ordered `mission_command_event` operation. Repeated writes with the same command version or event identity converge on the same operation IDs.
- Solo reminders remain `local`; they never enter the realtime outbox and never acquire fabricated sent, delivered, or acknowledged state.
- Reconciliation is field-specific. Operational state, delivery state, assignments, acknowledgments, deadlines, resolution, and append-only events do not share a generic last-write-wins rule. Valid late acknowledgments are preserved while stale core updates cannot reopen terminal commands.
- Realtime remains an internal, rollout-gated delivery path. Additive canonical Mission Command tables are available only through the separate default-off shadow flag; local state remains authoritative.

## Retention and diagnostics

- Mission Commands are bounded to 250 and Mission events to 750. Dispatch offline operations remain bounded to 300, with exhausted retry records retained only inside that cap.
- Runtime diagnostics expose counts, safe codes, timestamps, schema version, realtime status, and subscription count only. Account IDs, expedition IDs, coordinates, traces, command text, and provider payloads are omitted.

Canonical persistence is documented in `docs/dispatch/MISSION_COMMAND_CANONICAL_PERSISTENCE.md`. It extends existing Dispatch membership, ordering, receipt, privacy, and RLS boundaries rather than creating a parallel backend.

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

One submit creates one command and one initial event in one local persistence update. A draft ID scopes the idempotency key, so repeated taps on the same draft do not duplicate command or event records while a newly opened draft may intentionally create another command. Offline team creation records `deliveryState: queued` and a `queued` event. A self-targeted action always records `deliveryState: local`, `acknowledgmentState: not_required`, and a `created` event because no recipient or delivery path exists. Online local creation also records `deliveryState: local`; it is never labeled sent, delivered, or acknowledged without confirmation from a future approved delivery adapter. Starting replay moves a queued team command to `sending` with a `replayed` event whose copy explicitly says delivery is not yet confirmed.

Command Board buckets are derived and never persisted:

- **Needs Decision**: proposed, ready, blocked, failed delivery, declined acknowledgment, or expired acknowledgment.
- **Awaiting Acknowledgment**: pending or partial acknowledgment after higher-priority decision states are considered.
- **In Progress**: active/in-progress commands without an outstanding decision or acknowledgment.
- **Resolved**: resolved, cancelled, or expired operational records.

## Solo Operation

When no active team or convoy exists, Mission Command presents a personal board rather than simulating team delivery. Self actions are local reminders, decisions, checklists, check-ins, or manual incident records. The supplied templates cover personal action, camp diversion, fuel/water/power review, weather recheck, route decision, and manual comms-plan review. Mission Clock remains available without an active expedition, and the existing saved comms plan may be opened for manual use. ECS does not call, message, monitor, or contact anyone.

Assignment and acknowledgment controls are not offered for self actions. Guardian Check-Ins retain their explicit local response and no-response workflows. Lost Communications is not offered as a self-directed playbook; Vehicle Immobilized, Route Blockage, Guardian Check-Ins, and existing Incident Room flows remain available where their actual source context permits them. Manual status notes append command events without creating delivery receipts.

If the user later joins a team, an explicit confirmation can prepare the same nonterminal personal command as a team draft. The command ID and source truth are preserved, the target changes to the known expedition roster, delivery remains `local`, and active personal work moves to `blocked` so the operator must review it. Repeating the transition or persistence write does not duplicate the command or audit event. A separate approved action is still required before any delivery state may advance.

## Mission Clock

Mission Clock derives time state from absolute timestamps. It never persists a decrementing counter, so restart, foreground restoration, timezone changes, and device-clock changes recalculate from the same source timestamp. Exact deadline time is `due`; time after the deadline is `overdue`. Source-specific warning and critical windows distinguish `scheduled`, `due_soon`, and `due` before the cutoff. Completed and cancelled records remain terminal; invalid timestamps or missing source truth are `unavailable`, not clear.

The initial adapters cover canonical/legacy-projected command deadlines and durable offline retry windows. The typed `createMissionClockDeadline` boundary also accepts scheduled check-ins, no-response reviews, rally deadlines, CampOps diversion cutoffs, safe-arrival/sunset deadlines, weather rechecks, expedition milestones, and incident reviews without importing their stores into Dispatch UI. Linked context contains only an ID, type, safe label, and restriction state; coordinates and arbitrary metadata are excluded.

One scheduler targets the next material status boundary and otherwise refreshes at a bounded one-minute cadence. Backgrounding clears its timer; foregrounding recalculates immediately; expedition replacement, logout/unmount, or a clock with no active deadlines leaves no timer. Mission Clock may present a deterministic suggested review action, but it never sends a command, escalates an incident, changes camp/route state, or contacts anyone.

## Adapter Strategy

Existing `DispatchPing`, `DispatchQueueItem`, `DispatchAssignment`, `DispatchAcknowledgment`, and `DispatchTimelineEvent` contracts remain public and unchanged. Adapters preserve existing command types, including `emergency`, and add the canonical `recovery` type. Local legacy records are labeled manual/local unless stronger source provenance already exists; adaptation never upgrades them to live.

Persisted user/team `DispatchEvent` records from the currently routed CAD composer are adapted as `legacy_cad_event` commands. Live engine advisories are not promoted into Mission Commands. A queue item linked to its source ping becomes one command, and an explicit canonical mutation supersedes its adapter projection by stable ID and idempotency key.

Restricted linked context retains only safe identifiers, labels, source state, and the restriction marker. Coordinates and arbitrary metadata are removed before the command enters canonical persistence.

## Cross-Domain Proposals

Dashboard and ECS Brief identify validated situations; source-domain engines remain authoritative for Fleet readiness, route state, CampOps decisions, weather hazards, offline readiness, and incident truth. A source surface may create a typed `MissionCommandProposal`, but viewing data alone is rejected as `mission_command_proposal_explicit_action_required`. Every proposal carries an originating domain, stable source entity, source-truth references, evaluated freshness/availability/confidence/conflict state, a safe return route, and a content-bound fingerprint.

The existing navigation-flow store stages one proposal for Dispatch. Repeated staging of the same fingerprint is deduplicated. Dispatch reevaluates freshness when it consumes the handoff, shows the origin and source state, and asks the operator to review or cancel. Review may open the current Command Composer, Command Board, supported Operational Playbook, or an existing Incident Room. It does not create, send, acknowledge, reroute, select a camp, or escalate anything. Command creation still occurs only through the existing permission-checked Composer submit path, whose draft identity is derived from the proposal fingerprint.

Restricted linked context retains the restriction marker but drops coordinates, accuracy, member-position fields, and arbitrary provider metadata before staging. Source facts are bounded presentation snapshots, not new ownership of source calculations. Material weather proposals with the same source entity and validated content resolve to the same command identity, preventing duplicate weather commands on repeated taps or restoration.

When a command reaches a terminal state through the Command Board, Mission Command may append one redacted `manual_note` to the matching active expedition timeline. The note contains only command ID/type, terminal outcome, bounded summary, occurrence time, and an idempotency key. Expedition mismatch, duplicate handoff, and nonterminal commands produce no write.

The local schema version 7 migration is additive, as were the Guardian Check-In, Operational Playbook, and original Mission Command migrations:

1. Existing pings, queue items, assignments, assists, acknowledgments, timeline, outbox, and CAD records are retained.
2. Missing Mission Command, Operational Playbook, and Guardian Check-In arrays initialize empty.
3. Invalid Mission Command, Operational Playbook, or Guardian Check-In records are dropped without deleting valid legacy Dispatch data; the load result reports partial recovery.
4. Explicit adapters can create canonical aggregates when the rollout is enabled; hydration does not silently duplicate legacy records.
5. Operational rollback uses `EXPO_PUBLIC_ECS_KILL_MISSION_COMMAND`; this hides the internal UI without rewriting version 7 data. Backend rollback additionally uses `EXPO_PUBLIC_ECS_KILL_MISSION_COMMAND_BACKEND` and disables canonical modes before running the scoped SQL rollback. An older binary does not understand all Mission outbox metadata, so Mission replay must be disabled before it writes the snapshot.

## Rollout

Feature ID: `dispatch_mission_command`

- Maturity: `internal`
- Default: off
- Allowed environments: development, test, internal
- Enable flag: `EXPO_PUBLIC_ECS_MISSION_COMMAND`
- Kill switch: `EXPO_PUBLIC_ECS_KILL_MISSION_COMMAND`
- Offline support: full local operation
- Route registration: none
- Backend dependency: local operation requires none. A separate restricted-field-test feature, `dispatch_mission_command_backend`, may shadow to additive Supabase tables but is default off and cannot influence product reads.
- Operational Playbook visibility: framework uses this same master flag; no scenario definitions are registered or mounted by this task

The feature registry and Dispatch rollout selector must both approve the capability. Production fails closed even if the enable flag is set. The enabled internal UI keeps compact access to Command Board, Team/Convoy, and Timeline/Events. Production visibility still requires separate privacy, multi-client, Android/iOS, field, and owner verification.
