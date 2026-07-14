# Canonical Dispatch Backend Migration

## Status

Canonical Dispatch persistence is implemented as an additive, default-off internal migration lane. The durable local snapshot and outbox remain authoritative. The schema does not make backend persistence production-visible and does not enable external communication, automatic escalation, public publishing, or emergency-service contact.

The feature registry classifies `dispatch_canonical_backend` as `restricted_field_test`. It requires authentication, Supabase readiness, convoy membership, privacy approval, RLS evidence, multi-client evidence, device evidence, and owner acceptance. Its production kill switch is `EXPO_PUBLIC_ECS_KILL_DISPATCH_CANONICAL_BACKEND`.

## Runtime Flow

1. A permitted Dispatch action is validated and written to the local version 2 snapshot.
2. The local adapter creates or updates a durable, idempotent outbox action.
3. Replay resolves the signed-in actor and recipient aliases against active `convoy_members` rows.
4. In `shadow` or `dual_read` mode, the typed repository upserts the canonical row through the signed-in Supabase client and RLS.
5. Exact coordinates, when present, are written separately to `dispatch_restricted_locations`.
6. The existing Broadcast transport may notify peers, but canonical REST persistence can complete without Broadcast availability.
7. Pull and Postgres Changes notifications pass through the same deterministic merge functions used by local restoration and offline replay.

If any canonical write fails, the local action remains queued or failed for bounded retry. Local Dispatch remains usable offline.

## Schema

Migration: `supabase/migrations/20260713054719_dispatch_canonical_persistence.sql`

| Table | Ownership | Mutation model | Retention |
| --- | --- | --- | --- |
| `dispatch_pings` | Actor or command role | Versioned, tombstone capable | Completed/cancelled convoy, 90 days by default |
| `dispatch_queue_items` | Actor or command role | Versioned, tombstone capable | Completed/cancelled convoy, 90 days by default |
| `dispatch_assignments` | Command creates; command or assignee updates | Versioned, tombstone capable | Completed/cancelled convoy, 90 days by default |
| `dispatch_assist_requests` | Actor or command role | Versioned, tombstone capable | Completed/cancelled convoy, 90 days by default |
| `dispatch_acknowledgments` | Acknowledging member | Append-only | Completed/cancelled convoy, 90 days by default |
| `dispatch_timeline_events` | Active actor | Append-only audit history | Completed/cancelled convoy, 90 days by default |
| `dispatch_restricted_locations` | Source actor; explicitly authorized readers | Append-only restricted record | Completed/cancelled convoy, 90 days by default |
| `dispatch_operation_receipts` | Server trigger only | Append-only idempotency receipt | Completed/cancelled convoy, 30 days by default |

Every canonical entity has a server UUID, stable client ID, expedition and convoy scope, actor identity, explicit client/server timestamps, a server revision, and an idempotency key. Mutable entities require a monotonically increasing `state_version`. Same-version changes and older versions are rejected; byte-equivalent retries are idempotent.

Server revisions, server observation timestamps, receipt rows, and record creation timestamps are server-generated. Authenticated clients cannot allocate revision-sequence values or override those fields. Clients cannot delete canonical rows. Mutable records use terminal `deleted_at` and `tombstone_reason` values so deletions converge offline without client-side resurrection.

## RLS And Privacy

All eight tables have RLS enabled. Ordinary reads require a non-revoked membership in the exact convoy whose `expedition_id` matches the record. Writes additionally require an active, planned, or paused convoy and the action-specific actor or role policy. Knowing an expedition or convoy ID is insufficient.

The trigger layer independently validates:

- Convoy and expedition scope match.
- Actor user and actor member identities match an active membership.
- Every recipient, assignee, and authorized location reader belongs to the scoped convoy.
- Referenced ping and queue client IDs already exist in the same expedition and convoy.
- Mutable identity fields cannot change.
- Lifecycle values and transitions match the existing deterministic Dispatch graph. Canonical delivery snapshots may skip locally validated intermediate states only when the destination is reachable through that graph.
- Ordinary JSON does not contain coordinates, location objects, provider secrets, tokens, service-role values, API keys, or raw payloads.

Exact ping and assist coordinates live only in `dispatch_restricted_locations`. RLS limits them to the actor, a command role, or an explicitly authorized active member. The repository never logs row payloads or coordinates in migration diagnostics.

Completed and cancelled convoy members retain read-only history. Other active writes fail once the convoy closes. A member's own acknowledgment may arrive for seven days after closure only when its client observation timestamp is at or before the convoy completion timestamp; acknowledgments created after completion remain blocked.

`resolve_dispatch_actor_membership` exposes only the signed-in user's membership for the exact expedition/convoy pair. It exists so a queued acknowledgment can resolve its actor after the broader active-roster policy closes; it never returns the completed roster.

## Rollout Modes

`canonicalBackendPersistence` defaults to `false`. Missing or malformed configuration resolves to `disabled`.

| Mode | Server writes | Server reads | Local mutation from reads |
| --- | --- | --- | --- |
| `disabled` | No | No | No |
| `shadow` | Yes | Yes | No; differences are counted only |
| `dual_read` | Yes | Yes | Yes, through deterministic merge rules |

Internal enablement requires both:

- `EXPO_PUBLIC_ECS_DISPATCH_CANONICAL_BACKEND=true`
- `EXPO_PUBLIC_ECS_DISPATCH_CANONICAL_BACKEND_MODE=shadow` or `dual_read`

The feature registry permits these modes only in development, test, or internal environments. There is no production mode in this change.

## Diagnostics

`DispatchCanonicalMigrationCoordinator.getDiagnostics()` returns bounded, redacted counters for:

- Outstanding jobs.
- Attempted, applied, and failed writes.
- Attempted, applied, and failed pulls.
- Shadow identity differences plus explicit full/partial pull coverage and truncated table names.
- Realtime notifications and coalesced notifications.
- Last server revision, success timestamp, and redacted error code/message.

Realtime notifications are delayed by 300 ms, deduplicated during the delay, and limited to one pending follow-up while a pull is running. Pulls are single-flight per expedition and convoy. Each entity query is capped at 500 rows, while existing local retention remains bounded. A rollout must review truncation and retention metrics before increasing field-test volume.

## Deployment

1. Keep the mobile feature flag and mode disabled.
2. Back up the target project and apply migrations in order.
3. Run `supabase db reset`, `supabase test db`, and the Dispatch RLS suite against an isolated local project.
4. Deploy the updated `convoy-membership` Edge Function so new convoys record the active expedition ID.
5. Verify generated API visibility and RLS with two isolated authenticated users plus a nonmember.
6. Enable `shadow` only for an approved internal account set.
7. Review migration diagnostics, idempotency receipts, location authorization, retention, and local/server differences.
8. Collect Android and iOS foreground, background, reconnect, and offline replay evidence.
9. Consider `dual_read` only after privacy, multi-client, device, and owner gates pass.

Existing cloud convoys with a null `expedition_id` are intentionally ineligible. This migration does not guess or bulk-backfill their scope. Recreate them under an active expedition or perform an owner-reviewed, auditable backfill before internal testing.

## Rollback

Manual SQL: `supabase/rollback/20260713054719_dispatch_canonical_persistence.sql`

1. Activate the kill switch and set the mode to `disabled`.
2. Confirm clients have returned to local-only operation.
3. Export any shadow or field-test records that must be retained.
4. Remove the canonical tables from Realtime and run the rollback SQL.
5. Redeploy the prior Edge Function/mobile build if expedition scoping must also be removed from creation payloads.

The rollback removes only objects owned by this migration. It deliberately preserves `convoys.expedition_id`, which belongs to an earlier migration. Local snapshots and outboxes are unaffected.

## Evidence Boundary

Automated tests provide deterministic repository, reconciliation, outbox, static schema, and simulated two-client evidence. They are not proof of hosted Supabase RLS, Realtime behavior, cellular recovery, Android/iOS persistence, background execution, battery impact, or field privacy. Production visibility remains blocked until those external evidence requirements and owner approvals are recorded.
