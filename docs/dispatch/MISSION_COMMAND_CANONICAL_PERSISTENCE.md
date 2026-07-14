# Mission Command Canonical Persistence

## Status

Mission Command canonical persistence is an additive, default-off Supabase shadow lane. The local Dispatch schema version 7 snapshot and durable outbox remain authoritative. Backend reads never mutate Mission Command product state in this rollout, and a backend failure cannot change local or realtime delivery state.

This work does not contact emergency services, publish hazards, send SMS, place calls, reroute, select camps, or perform automatic escalation.

## Existing Authority Reused

The migration extends the existing canonical Dispatch schema instead of creating another Dispatch backend:

- `convoys` and `convoy_members` remain the expedition-scoped membership authority.
- `dispatch_server_revision_seq` remains the monotonic ordering source.
- `dispatch_restricted_locations` remains the only canonical exact-coordinate store.
- `dispatch_operation_receipts` remains the server-owned idempotency receipt store.
- Existing scope, late-acknowledgment, JSON redaction, retention, and Realtime conventions remain in force.

Migration: `supabase/migrations/20260714195656_mission_command_canonical_persistence.sql`

Rollback: `supabase/rollback/20260714195656_mission_command_canonical_persistence.sql`

## Canonical Tables

| Table | Purpose | Mutation model |
| --- | --- | --- |
| `dispatch_mission_commands` | Command aggregate and independent operational, delivery, and acknowledgment state | Versioned, idempotent, tombstone capable |
| `dispatch_mission_command_targets` | Explicit member, role, vehicle, team, or self target facts | Append-only identity |
| `dispatch_mission_command_acknowledgments` | Member receipt or response | Append-only; member may write only their own response |
| `dispatch_mission_command_events` | Critical command audit history | Append-only and monotonically ordered |
| `dispatch_mission_playbook_instances` | Operational Playbook aggregate | Versioned and idempotent |
| `dispatch_mission_playbook_steps` | Current durable step state | Versioned within the parent instance |
| `dispatch_mission_playbook_events` | Playbook audit history | Append-only |
| `dispatch_mission_deadlines` | Absolute command and playbook deadlines | Versioned; no decrementing counters |
| `dispatch_mission_incident_links` | Link to the existing incident identity | Append-only; no competing incident ID |

Exact linked coordinates are not embedded in these rows. They use `dispatch_restricted_locations` with `source_kind = mission_command` and a separate authorized-member list.

## Identity And Ordering

Every aggregate has a server UUID, stable client entity ID, durable client outbox operation ID, expedition and convoy scope, actor user/member identity, idempotency key, client timestamps, server observation timestamp, server revision, and state version. Child rows derive stable identities from the local command, event, target, step, or deadline identity. Migration writes without an outbox record fail safely to the entity idempotency key as their operation identity.

Equivalent retries converge through unique client ID and idempotency constraints. Lower state versions and conflicting same-version writes fail closed. Command and playbook events are append-only. A valid member acknowledgment remains independent from command mutation and may use the existing bounded late-acknowledgment policy after convoy completion.

## RLS And Privacy

Knowing an expedition or convoy ID grants no access. All Mission tables require a non-revoked membership in the exact `(expedition_id, convoy_id)` scope.

- `lead`, `sweep`, `support`, and explicit `command` access may issue and mutate team commands.
- An ordinary member may create only an unassigned self-authored Check-In or Assist command and may acknowledge only as themselves.
- `viewer` access is read-only.
- Revoked members lose access.
- Assignment and incident leadership changes require command authority.
- Exact coordinates require the restricted-location policy in addition to Mission record access.
- `anon` receives no table privileges; service-role cleanup remains server-side.

Ordinary JSON is rejected when it contains coordinate, trace, provider-payload, token, API-key, service-role, authorization, or secret-like fields. The repository also redacts before sending rows.

## Local-First Runtime

1. Mission Command writes the local version 7 snapshot and durable outbox first.
2. Replay publishes through the existing internal Dispatch path in dependency order.
3. When the separate Mission backend rollout resolves to `shadow`, canonical writes are queued per expedition so command aggregates precede their events.
4. Canonical failures are diagnostic-only and cannot fail local/realtime operational delivery.
5. Startup migration can idempotently mirror local commands, events, and playbooks into the shadow schema.
6. Pull and Realtime notifications are scoped to one expedition/convoy and use the existing bounded, coalesced repository coordinator.
7. Shadow comparisons use identities and counts only; restricted content is not logged.

A command aggregate spans multiple canonical rows. The current repository performs idempotent parent-then-child writes rather than a server RPC transaction. A child failure reports `partial_write`; retry or startup migration repairs the same stable identities. This limitation is acceptable only while local state is authoritative and backend influence is disabled.

## Rollout

Feature ID: `dispatch_mission_command_backend`

| Control | Default |
| --- | --- |
| Maturity | `restricted_field_test` |
| Enabled | `false` |
| Mission backend mode | `disabled`; only exact `shadow` is accepted |
| Product read influence | None |
| Offline behavior | Full local operation |
| Kill switch | `EXPO_PUBLIC_ECS_KILL_MISSION_COMMAND_BACKEND` |
| Readiness gate | `gate:dispatch-convoy-production` |

Enablement also requires the Mission Command and canonical Dispatch backend features, authentication, approved Supabase availability, privacy approval, and the feature registry's evidence gates. `dual_read`, malformed modes, missing configuration, and production without approval all fail closed.

## Deployment And Rollback

1. Leave both canonical backend modes disabled.
2. Apply the full migration chain to an isolated project.
3. Run all required pgTAP suites and bind the result to the exact commit SHA, full migration digest, and schema configuration version.
4. Test lead, member, viewer, revoked member, and nonmember identities.
5. Collect two-client replay, ordering, late acknowledgment, Realtime reconnect, and restricted-location evidence.
6. Obtain privacy and owner approval before any internal shadow cohort.
7. Enable shadow only for approved internal accounts and compare safe identity/count diagnostics.

Rollback begins by activating both canonical kill switches and returning modes to `disabled`. The Mission rollback removes only Mission-owned tables, policies, functions, receipts, and the additive membership access column. It does not delete the local snapshot/outbox or legacy canonical Dispatch tables.

## Evidence Boundary

The Node harness is deterministic simulated evidence. The pgTAP suite is executable database evidence only when run against a real local or hosted Postgres instance. Neither substitutes for hosted two-client, privacy, Android/iOS lifecycle, cellular reconnect, or closed-field evidence. No production persistence is approved by this implementation.
