# Operational Playbook Framework

## Product Boundary

Operational Playbooks are deterministic guided coordination workflows inside Mission Command. The framework gathers declared context, exposes missing or restricted inputs, records explicit decisions, prepares command proposals, creates absolute Mission Clock deadlines, and retains an audit timeline. It does not add a Dispatch route or top-level tab.

Lost Communications, Vehicle Immobilized, and Route Blockage are independently verified scenario definitions on the shared framework. Other scenarios remain separate future work.

A playbook cannot declare an emergency, contact emergency services, transmit externally, choose a route or camp, override a deterministic engine, bypass permissions, expose restricted member coordinates, or execute a command automatically. AI may summarize an already-derived instance; it cannot add, remove, reorder, skip, or complete steps.

## Ownership

- `dispatchOperationalPlaybookTypes.ts` owns schema version 1 definitions, instances, steps, events, inputs, proposals, deadlines, effects, and migrations.
- `dispatchOperationalPlaybookDomain.ts` owns validation and all state mutation. Callers persist only successful domain results.
- `dispatchOperationalPlaybookPresentation.ts` derives the runner model and typed UI intents.
- `DispatchOperationalPlaybookRunner.tsx` renders supplied models through existing ECS modal, status, source-truth, and accessibility primitives. It has no store or provider subscription.
- `dispatchLostCommunicationsPlaybook.ts` owns the deterministic Lost Communications definition, source-aware selectors, outcomes, Smart Rally preview adapter, and explicit incident handoff.
- `dispatchLostCommunicationsRuntimeAdapter.ts` projects current roster, command history, and permitted convoy state into a privacy-minimized scenario input without reading stores directly.
- `DispatchLostCommunicationsPlaybook.tsx` coordinates the tested domain with the generic runner, existing Command Composer, Mission Clock, linked-context adapter, and Incident form.
- `dispatchVehicleImmobilizedPlaybook.ts` owns the deterministic Vehicle Immobilized definition, status and evidence selectors, assignment and outcome gates, and explicit incident handoff.
- `dispatchVehicleImmobilizedRuntimeAdapter.ts` projects Fleet, active-trip, weather, terrain, convoy, route, and permitted location state into a privacy-minimized point-in-time input without reading stores directly.
- `DispatchVehicleImmobilizedPlaybook.tsx` coordinates the tested definition with the generic runner, existing Command Composer, Mission Clock, linked-context adapter, Dispatch timeline, and Incident form.
- `dispatchRouteBlockagePlaybook.ts` owns the deterministic Route Blockage definition, separate report/legal/current-condition evidence, outcome gates, guidance-handoff guard, and explicit incident handoff.
- `dispatchRouteBlockageRuntimeAdapter.ts` projects permitted map context, active route geometry, saved-route comparisons, bailouts, CampOps impact, weather context, and Offline Prep readiness into a point-in-time input without reading stores directly.
- `DispatchRouteBlockagePlaybook.tsx` coordinates the tested definition with Navigate context, Command Composer, Mission Clock, CampOps review, Offline Prep state, Dispatch timeline, and the explicit Incident form.
- `dispatchPersistenceAdapter.ts` is the authoritative local owner. Dispatch snapshot version 4 stores a bounded `operationalPlaybooks` array.

## State And Steps

Instances use `draft`, `ready`, `active`, `paused`, `blocked`, `completed`, and `cancelled`. The domain rejects transitions not present in the transition graph. Completion is derived from the definition's completion rules; board or runner state is never persisted separately.

The bounded step vocabulary is `review_context`, `request_input`, `create_command_proposal`, `assign_role`, `request_acknowledgment`, `open_context`, `start_deadline`, `record_decision`, `confirm_action`, and `resolve`. Definitions may compose only these step types.

Skipped steps and completed steps remain separate. A skip requires an explicit reason and is available only when the definition marks the step skippable. Missing, stale, conflicting, unavailable, or restricted required inputs remain visible and block readiness according to the input policy.

## Command Confirmation

Command proposals use a two-phase boundary:

1. Prepare a source-aware proposal without creating a Mission Command.
2. Record explicit operator confirmation and return a `command_proposal_confirmed` effect.
3. The existing Command Composer requires a separate submit action before it creates a canonical command.
4. The coordinator links the resulting command to the confirmed proposal through an idempotent, exact-match domain operation.

The playbook domain never marks a proposal sent, delivered, or acknowledged. Repeated confirmations with the same idempotency key are no-ops.

## Persistence And Offline Operation

Definitions and instances have independent versions. Definition upgrades require an explicit ordered migration for every version step. Persisted instances are reconstructed from allowlisted fields; malformed nested results, proposals, deadlines, events, actors, or restricted contexts fail closed. Version 3 Dispatch snapshots load as version 4 with an empty playbook collection, while all legacy Dispatch and Mission Command records remain intact.

Playbook operation is local and offline-capable. Absolute timestamps are persisted for deadlines and projected into Mission Clock. Completion or cancellation closes active playbook deadlines. Event, result, proposal, deadline, and instance retention is bounded.

## Rollout

Operational Playbooks use the existing `dispatch_mission_command` feature decision:

- Maturity: internal
- Default: off
- Environments: development, test, internal
- Enable flag: `EXPO_PUBLIC_ECS_MISSION_COMMAND`
- Kill switch: `EXPO_PUBLIC_ECS_KILL_MISSION_COMMAND`
- Backend dependency: none
- Implemented scenario definitions: Lost Communications, Vehicle Immobilized, Route Blockage

The runner and scenario entry points are mounted only when the existing Mission Command decision is enabled. Mission Command remains internal and default-off.
