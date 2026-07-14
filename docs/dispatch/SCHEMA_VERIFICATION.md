# ECS Dispatch Schema Verification

Last updated: 2026-07-12

## Verdict

Dispatch has a durable local version 2 snapshot and outbox plus an additive canonical Supabase schema. Canonical persistence is implementation-complete for guarded internal verification, but it is not production-approved or production-visible. Local state remains authoritative.

The canonical path is disabled by default and fails closed unless the feature registry approves it and the mode is explicitly `shadow` or `dual_read`. Hosted RLS, privacy, multi-client, native-device, provider, and owner evidence is still required.

## Current Inventory

| Area | Current owner | Backend state | Readiness |
| --- | --- | --- | --- |
| Pings | Local snapshot/outbox | `dispatch_pings` | Guarded internal verification |
| Queue items | Local snapshot/outbox | `dispatch_queue_items` | Guarded internal verification |
| Assignments | Local snapshot/outbox | `dispatch_assignments` | Guarded internal verification |
| Assist requests | Local snapshot/outbox | `dispatch_assist_requests` | Guarded internal verification |
| Acknowledgments | Local snapshot/outbox | `dispatch_acknowledgments` | Guarded internal verification |
| Timeline/audit | Local snapshot/outbox | `dispatch_timeline_events` | Guarded internal verification |
| Exact ping/assist locations | Local linked context | `dispatch_restricted_locations` | Isolated and RLS restricted |
| Idempotency evidence | Local idempotency keys | `dispatch_operation_receipts` | Server-generated, read-only to clients |
| Offline operations | Local outbox | No server queue table by design | Local-first and durable |
| Legacy CAD events | Local CAD snapshot plus existing adapter | Existing `dispatch_cad_events` path | Separate compatibility path |

Migration: `supabase/migrations/20260713054719_dispatch_canonical_persistence.sql`

Rollback: `supabase/rollback/20260713054719_dispatch_canonical_persistence.sql`

Runtime contract: `lib/dispatchCanonicalRepository.ts`

Coordinator: `lib/dispatchCanonicalMigrationCoordinator.ts`

## Required Fields And Constraints

Canonical entities include:

- Server UUID and stable client ID.
- Expedition and convoy scope.
- Idempotency key.
- Supabase actor user ID and ECS convoy member ID.
- Recipient or assignee member identities where applicable.
- Client created, updated, and observed timestamps.
- Server created and observed timestamps.
- Monotonic server revision.
- Version on mutable state.
- Tombstone timestamp and reason on mutable state.
- Check constraints matching current Dispatch lifecycle unions.

The schema rejects mutable identity changes, older versions, conflicting same-version changes, invalid or missing scoped references, invalid lifecycle transitions, tombstone resurrection, actor/member mismatches, and ordinary payloads containing coordinates or secret-like keys. Canonical delivery snapshots may coalesce intermediate states only when the final state is reachable through the deterministic runtime graph.

## Scoping And RLS

Every canonical policy checks the exact pair of `convoys.id` and `convoys.expedition_id`, then verifies a non-revoked `convoy_members` row for `auth.uid()`. An expedition ID alone grants nothing.

- Active/planned/paused membership is required for writes.
- Lead, sweep, and support roles are command roles where the operation requires command authority.
- Assignees may update their own assignments.
- Members may append only their own acknowledgment identity.
- Completed/cancelled members retain read-only history, with a seven-day timestamp-bounded exception for a member's own acknowledgment observed before completion.
- Authenticated clients cannot hard-delete records, forge receipts, or execute retention cleanup.

The pgTAP contract is `supabase/tests/database/rls_dispatch_canonical.test.sql`.

## Location Boundary

Ordinary Dispatch tables cannot contain latitude, longitude, coordinates, location payloads, provider secrets, auth tokens, API keys, service-role values, or raw provider payloads in JSON fields. Exact coordinates are stored only in `dispatch_restricted_locations` and are readable only by the actor, a command role, or explicitly authorized active members.

The repository recursively redacts sensitive keys before writing. Migration diagnostics contain counters, revisions, timestamps, and redacted errors only.

## Idempotency And Ordering

Each entity has unique `(expedition_id, client_id)` and `(expedition_id, idempotency_key)` constraints. Security-definer triggers assign a monotonic `server_revision` and write an append-only operation receipt; authenticated clients have no revision-sequence privilege.

- Equivalent retries converge to the existing row.
- Lower versions fail as stale.
- Different data at the same version fails as a conflict.
- Acknowledgments and timeline rows are append-only.
- Realtime and pull reconciliation use the same deterministic app merge functions.
- Tombstones remove active local rows without hard-delete races.

## Indexes And Retention

Indexes cover expedition/status/update time, convoy/server revision, actor, assignee, recipient arrays, source identity, and idempotency constraints. Queries are bounded to 500 rows per entity per pull; local stores retain their existing per-entity bounds.

`cleanup_dispatch_canonical_records` is service-role only. It removes records only for completed or cancelled convoys, with bounded defaults of 90 days for content/history/location and 30 days for operation receipts. Active expedition records are not pruned.

## Rollout

| Control | Default |
| --- | --- |
| Feature ID | `dispatch_canonical_backend` |
| Maturity | `restricted_field_test` |
| Enabled | `false` |
| Mode | `disabled` unless exactly `shadow` or `dual_read` |
| Allowed environments | Development, test, internal |
| Offline behavior | Full local fallback |
| Kill switch | `EXPO_PUBLIC_ECS_KILL_DISPATCH_CANONICAL_BACKEND` |
| Readiness gate | `gate:dispatch-convoy-production` |

See `docs/dispatch/CANONICAL_BACKEND_MIGRATION.md` for deployment, rollback, diagnostics, and evidence requirements.

## Remaining Evidence

- Apply the full migration chain to an isolated local Supabase instance.
- Run the pgTAP suite with real Postgres roles and RLS.
- Run hosted two-client tests with isolated authenticated users and a nonmember.
- Verify Postgres Changes reconnect, ordering, and subscription cleanup.
- Verify Android and iOS offline replay, background/foreground restoration, and process termination.
- Review restricted-coordinate privacy and retention with the privacy owner.
- Record product, safety, privacy, and engineering acceptance before any broader rollout.

The deterministic Node harness is useful CI evidence, but it is explicitly a simulation and cannot satisfy these production requirements.
