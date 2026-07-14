# ECS State Ownership and Persistence Map

Status: implemented foundation, schema version 1. The executable source is
`lib/state/stateOwnershipRegistry.ts`; this document explains its operating
policy and records the remaining release work.

## Ownership rule

Every cross-system concept has one authoritative owner. Adapters may project or
normalize that owner's state, but they must not become a second writer. A UI
store may own presentation state; it must not own the route, vehicle,
expedition, weather, telemetry, convoy, or Dispatch conclusion it presents.

The registry validator rejects duplicate concept IDs, missing owners, persisted
state without an identified backend, and secure state assigned to the ordinary
nonsecure key-value adapter.

## Major state map

| Concept | Authoritative owner | Locality / persistence | Schema | Hydration | Write and conflict policy | Sensitivity |
| --- | --- | --- | --- | --- | --- | --- |
| Auth session and refresh credentials | Supabase Auth client | Cloud / provider secure storage | Provider-managed | AppProvider startup | Provider auth events; server authoritative | Secure |
| Remember-session preference | `sessionStore` | Local nonsecure key-value, `ecs_session_state` | 2 | Required startup | Sign-in/expiry/logout; local authoritative | Private |
| Setup progress | `setupStore` | Local nonsecure key-value, `ecs_setup_state` | 1 | Required startup | Setup commands; local authoritative | Ordinary |
| Active vehicle identity | `vehicleSetupStore` | Local nonsecure key-value, `ecs_vehicle_setup` | 2 | Required startup | Fleet selection/deletion reconciliation; local authoritative | Ordinary |
| Vehicle records | `vehicleStore` | Hybrid local snapshot and Supabase | Legacy normalizer | Required startup | Fleet commands; preserve newer dirty local records | Private |
| Vehicle specs/loadout/resources | Fleet support-state boundary, partitioned by vehicle and subdomain | Local nonsecure key-value | Mixed existing versions | Required startup | Domain commands; preserve dirty local data | Private |
| Saved/imported/built route assets | `routeStore` | Local nonsecure key-value, `ecs_route_store` | 2 | Lazy; required for restored guidance | Route commands; reject older incoming state | Private |
| Active guidance | `navigateRouteSessionStore` | Local nonsecure key-value | 1 | Navigate/restoration | Route-operation transitions; local authoritative | Private |
| Trip Builder plan | `tripBuilderPlanStore` | Local nonsecure key-value | 1 | Builder/handoff | Normalized plan commands; local authoritative | Private |
| Offline readiness package | `offlineReadinessCoordinator` | Files and IndexedDB | 1 | Optional startup/Offline Prep | Resumable package commands; local authoritative | Private |
| Planned expeditions | `expeditionStore` | Hybrid local cache and Supabase | Lifecycle v1 | Expedition entry/optional restore | Idempotent commands; domain conflict resolution | Private |
| Active expedition | `expeditionStateStore` | Local nonsecure key-value | Canonical lifecycle v1 adapter | Optional startup | Validated transitions; local authoritative while active | Private |
| Completed expedition outcome | `expeditionTripRecordStore` | Local nonsecure key-value | 2 | Completion/archive access | Idempotent append-only materialization | Private |
| Dashboard layout/profile | `dashboardStore` | Files and IndexedDB | 3 | Optional startup | Explicit UI commands; fingerprinted/coalesced writes | Ordinary |
| Weather/environment | Operational weather broker | Hybrid bounded cache | 1 | Lazy/offline snapshot | Provider authority and source-priority merge | Cache |
| Device telemetry | Unified device lifecycle plus source stores | Memory; bounded last-known snapshot only | Lifecycle v1 | After usable shell | Normalized frames; latest valid source sample | Ephemeral |
| Convoy locations | `convoyTrackingStore` | Restricted Supabase table | Migration 037 | Active permitted convoy | Server authoritative; opt-in only | Secure |
| Dispatch runtime | `dispatchEventStore` plus lifecycle adapters | Hybrid local/cloud | 2 | Dispatch/active expedition | Deterministic lifecycle merge and manual conflict handling | Private |
| General offline outbox | `syncActionQueue` | IndexedDB with web localStorage fallback | Account-scoped action v2 | Module bootstrap/IDB upgrade | Idempotency key plus account-scoped manual conflict handling | Private |
| Offline map assets | `tileCacheStore` plus `offlineTileSyncCoordinator` | Files and IndexedDB | 1 | Optional reconciliation | Local authoritative; active assets protected from eviction | Cache |
| Cross-domain event summaries | `ecsBus` | Memory only | Runtime only | After usable shell | Per-channel debounce; reject older source timestamps | Ephemeral |

The registry includes the complete hydration dependencies, subscribers, cleanup,
offline behavior, migration posture, retention, and transaction boundary for
each row. `buildECSStateOwnershipReport()` returns the same map as typed JSON for
development diagnostics and future readiness automation.

## Sensitivity classes

- **Secure**: credentials, refresh material, restricted convoy coordinates, or
  equivalent data. This must use provider/native secure storage or restricted
  RLS-backed cloud storage. It must never enter ordinary key-value snapshots.
- **Private**: vehicle, route, expedition, incident, queue, or planning state.
  It may be retained locally for offline operation, but must not appear in logs
  or diagnostics. Encryption/account partitioning requirements remain an owner
  and privacy approval decision.
- **Ordinary**: device-local setup and presentation preferences with no secret or
  restricted operational payload.
- **Cache**: recreatable provider or map data with attribution, freshness, TTL,
  quota, and deliberate eviction rules.
- **Ephemeral**: listeners, timers, handles, in-flight jobs, and high-rate values
  that reset safely on process restart.

## Hydration contract

`ECSStoreHydrationCoordinator` provides one flight per plan and store, explicit
dependency ordering, bounded timeouts, optional-store degradation, cycle
prevention, late-completion observation, and redacted diagnostics.

Required startup hydration includes session/setup state, active vehicle and its
support stores, runtime flags, shell restoration, and the legacy Fleet
reconciliation adapter. Dashboard, custom presets, and active expedition state
hydrate as an optional plan. Route assets, offline packages, weather, Dispatch,
and hardware sessions remain lazy unless a restored workflow requires them.

A timeout releases the shell in degraded mode; it does not cancel or discard the
underlying store load. A late successful load becomes observable as ready. A
failed optional store does not imply that safety or readiness data exists.

## Transaction and restart boundaries

`ECSStateTransactionCoordinator` supplies single-flight execution, optional
snapshot rollback, bounded redacted diagnostics, and named boundaries for active
vehicle switch, expedition start, route activation, expedition completion,
logout, and offline replay.

The logout path now uses this coordinator. Existing domain coordinators retain
their own validated/idempotent commands for vehicle switching, route lifecycle,
Expedition lifecycle/completion, and Dispatch replay. Those commands should be
migrated to the shared diagnostic wrapper only when their rollback and durable
recovery semantics can be preserved. The coordinator itself is memory-only;
restart safety comes from the domain's versioned persisted state or durable
outbox, not from an in-memory transaction journal.

## Conflict policy

ECS does not use one global last-write-wins rule.

- Local-first editable records reject older incoming timestamps even when the
  local record is already clean.
- Dirty Fleet/planning records preserve the local edit and surface a conflict.
- Auth and restricted realtime records are server authoritative after permission
  validation.
- Weather/environment records use provider authority and source priority.
- Completed outcomes and critical audit history are append-only and deduplicated
  by stable completion/event identity.
- Active guidance and active expedition state remain locally authoritative while
  offline, then reconcile through their domain lifecycle.
- Dispatch and the general outbox use stable IDs, idempotency keys, ordering, and
  explicit conflict handling.

## Account and logout policy

Logout is an account boundary, not a factory reset.

- Stop realtime, sync, BLE/cloud, convoy, and account-scoped listeners.
- Unbind the durable outbox and its conflicts before another account can read or
  replay them.
- Preserve queued operations under a pseudonymous account fingerprint. Raw user
  IDs and emails are not stored as outbox ownership metadata.
- Clear Supabase auth material and remember-session preferences.
- Preserve device-local Dashboard preferences, Fleet data, saved routes,
  completed records, and shared offline map assets. This preserves field use and
  avoids deleting a package required by an active expedition.
- Do not silently claim an unscoped legacy outbox when actions already identify a
  different account. Such actions remain held for explicit migration/support.

Whether private Fleet/route/expedition assets should be partitioned or removed on
shared-device logout requires product-owner and privacy approval. Until that
decision exists, the app must not describe logout as erasing all local data.

## Diagnostics

`getECSStateManagementDiagnostics()` exposes development/support-safe aggregate
counts for hydration, transactions, persistence writes, event-bus subscriptions,
realtime listeners, active-vehicle subscriptions, account-held outbox entries,
and outstanding async jobs. It returns no store values, payloads, raw identities,
credentials, coordinates, or exact trip traces.

## Implemented hardening

- Consolidated duplicate shell/AppProvider startup store hydration.
- Versioned setup and remember-session persistence.
- Migrated raw remembered user ID/email to a pseudonymous marker and removed the
  legacy values.
- Serialized native key-value snapshot writes and exposed coalescing/error counts.
- Prevented older cloud rows from replacing newer clean or dirty local rows in
  the operational Dexie/localStorage adapters.
- Bound durable outbox actions and conflict details to the active account.
- Returned an in-flight replay to pending when the account changes.
- Fixed debounced event summaries being rejected against receipt time and added
  alternating-source cycle detection.
- Added bounded transaction, hydration, subscription, and persistence diagnostics.

## Ranked follow-up work

1. Verify the actual native Supabase auth storage adapter uses approved secure
   storage on both Android and iOS. Do not infer this from provider defaults.
2. Obtain privacy/owner policy for local private data on shared devices, then add
   account partitioning or explicit removal without touching shared offline maps.
3. Add versioned envelopes and corruption fixtures to the remaining mixed legacy
   Fleet, weather, expedition, and Dispatch caches.
4. Adopt the transaction diagnostic boundary in active-vehicle, route,
   Expedition start/completion, and replay coordinators after domain rollback and
   restart tests exist.
5. Apply domain conflict selectors to every Supabase pull adapter; the generic
   operational stores are only the first bounded migration.
6. Replace private web outbox localStorage fallback with a reviewed durable
   storage policy if browser deployments are production-supported.
7. Audit all account/expedition/route/app-state subscription owners with the new
   diagnostics on real Android and iOS lifecycle transitions.
8. Add storage-pressure, process-kill, and two-client Supabase evidence. Unit and
   simulated tests cannot establish device filesystem durability or RLS behavior.

## Rollback

The ownership registry and diagnostics are additive. Startup callers can revert
to direct store hydration without changing persisted formats. Session schema 2
cannot restore the intentionally removed raw email/user ID; it preserves only the
pseudonymous prior-account marker. Account-scoped outbox records remain readable
by older code because the new field is additive. Rolling back replay isolation
would be unsafe on a shared-account device and should not be used as a production
rollback strategy.
