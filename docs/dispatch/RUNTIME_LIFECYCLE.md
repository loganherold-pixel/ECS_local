# Dispatch Runtime Lifecycle

## Scope

Dispatch remains local-first. The runtime uses durable local snapshots and an idempotent outbox, then reconciles permitted realtime events through the same merge functions. Realtime Broadcast is a delivery aid. A separate canonical Supabase repository now exists behind a default-off restricted-field-test gate; its presence is not proof of multi-device production readiness.

Dispatch coordinates the ECS team. It does not contact emergency services, automatically escalate outside ECS, publish hazards publicly, or send through external radio or agency systems in this runtime.

## State Ownership

Operational state and delivery state are separate:

- A ping can be `open`, `awaiting_acknowledgment`, `acknowledged`, `declined`, `escalated`, `resolved`, or `cancelled` regardless of whether its delivery is local, queued, sent, delivered, failed, or retrying.
- Queue items and assist requests use `new`, `pending_response`, `assigned`, `in_progress`, `blocked`, `escalated`, `needs_review`, `resolved`, and `cancelled`.
- Assignments use `unassigned`, `offered`, `accepted`, `in_progress`, `blocked`, `completed`, and `declined`.
- Offline actions use `queued`, `replaying`, `replayed`, `failed`, and `cancelled`.
- Acknowledgments and timeline events are immutable identities with versioned, newest-valid merge behavior.

Invalid and terminal-state transitions are rejected by `lib/dispatchLifecycle.ts`. UI handlers must validate permissions and transitions before mutating local state.

## Identity And Merge Rules

- Entity IDs derive from stable idempotency keys in `lib/dispatchIntegrity.ts`.
- Target member ordering and incidental message whitespace do not change an idempotency key.
- Realtime, local writes, restoration, and offline replay use the same record merge functions.
- Older versions cannot replace newer versions.
- Late acknowledgments are retained even after escalation and surface a conflict state for review.
- Resolution and cancellation are terminal unless a future explicit owner-approved lifecycle adds a reopening transition.
- CAD events use semantic dedupe keys, bounded storage, and timestamp-aware upserts.

## Persistence And Replay

Dispatch persistence schema version 4 adds default-off Operational Playbook instances with bounded embedded event history while retaining every version 3 field. Version 3 added Mission Command aggregates and append-only command events. Missing canonical arrays initialize empty, invalid canonical records fail closed, and legacy records remain available for explicit adapter-based migration. Version 1 through version 3 snapshots still load without destructive migration.

Replay is single-flight per expedition, FIFO by creation time, bounded to 100 actions per pass, cancellable, and protected by exponential retry backoff. Interrupted `replaying` actions restore as `queued`. A successful transport changes delivery state to `sent`; it does not mark the operational item resolved.

When canonical persistence is explicitly enabled in `shadow` or `dual_read` mode, replay stores the RLS-scoped server record before considering realtime publication successful. Canonical failure leaves the durable local action retryable. Shadow reads never mutate local state; dual reads converge through the existing merge rules. See `docs/dispatch/CANONICAL_BACKEND_MIGRATION.md`.

Active expedition changes clear scoped local views, cancel stale hydration work, close the previous realtime session, and reject late convoy fetches. Convoy tracking uses owner leases so Dispatch and Navigate cannot tear down one another's active subscription.

## Permissions And Location

- Shared actions fail closed without authenticated expedition or convoy membership.
- Solo mode remains useful but is explicitly local-only.
- Unknown users never inherit the owner or first roster member.
- Denied actions do not write timeline, persistence, dedupe, or operational state.
- Member locations require both the position-sharing rollout and location permission.
- Location rows remain opt-in records from `convoy_member_locations`; manual roster coordinates are not treated as live sharing.
- Stale and offline location labels remain visible.

## Retention

| Record | Limit |
| --- | ---: |
| Pings | 250 |
| Queue items | 250 |
| Assignments | 500 |
| Assist requests | 250 |
| Acknowledgments | 500 |
| Timeline events | 500 |
| Offline actions | 300 |
| CAD events | 300 |
| Mission Commands | 250 |
| Mission Command events | 750 |
| Operational Playbook instances | 100 |
| Operational Playbook events | 250 per instance |
| Dismissed CAD identities | 600 |

Active records are retained ahead of terminal history within each bound.

## Local Performance Evidence

Measured on the same Windows development host using deterministic synthetic records:

| Workflow | Before | After |
| --- | ---: | ---: |
| Merge 10,000 timeline records | 389.741 ms | 11.045 ms |
| Save 10,000-record input | 371.578 ms, 1.89 MB snapshot | 5.769 ms, bounded before write |
| Load persisted Dispatch snapshot | 364.838 ms | 0.559 ms |
| Merge 5,000 CAD events | Not previously measured | 15.369 ms |

These are CI/development regression measurements, not Android or iOS frame-rate, memory, battery, radio, or field-network claims. Real-device profiling is still required for native file hydration, reconnect behavior, background transitions, and sustained multi-client event traffic.

## Rollout Boundary

Current sensitive defaults remain unchanged:

- Mission Command: off, internal-only
- Operational Playbooks: use the Mission Command flag; framework only, no production scenario definitions
- Canonical Dispatch persistence: off
- Team position sharing: off
- Convoy Regroup Planner: off
- External Dispatch integration: off
- Public hazard publishing: off
- Automated SOS transmission: off
- Live radio/network integrations: off

Realtime Dispatch sync and offline replay remain enabled in the existing local-first rollout. Production approval still requires privacy review, RLS and membership evidence, two-client reconciliation tests, background/device tests, and owner approval.
