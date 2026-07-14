# Operational Persistence Contract

ECS operational state should use existing storage adapters only. Non-sensitive local continuity uses `createPersistedKeyValueCache`, which writes through `localStorage` on web and a file-backed non-secure snapshot on native. Secrets, provider credentials, auth headers, API tokens, and refresh tokens must not be stored in these operational caches.

The authoritative ownership, hydration, sensitivity, conflict, retention, and
logout map is defined in `lib/state/stateOwnershipRegistry.ts` and documented in
`docs/state-management-ownership-and-persistence.md`. New stores must identify an
owner and register or adapt into that map instead of creating another writer for
an existing concept.

## Safe for non-secure local persistence

- `wizardDraftStore`: vehicle wizard draft step, selected answers, draft vehicle id/name, and saved timestamp. This lets an interrupted setup resume after app restart. It must not store account credentials, provider tokens, or sensitive payment/contact data.
- `PowerDeviceStore`: selected provider device ids plus safe known-device metadata: provider, device id, name, model, product type, supported metric labels, last known online/offline/unknown state, and last seen timestamp. Do not persist secrets, cloud tokens, auth headers, provider credentials, account identifiers, or hardware serial numbers here.
- `waypointProgressStore`: route id, current waypoint index, reached waypoint indices, and last advancement timestamp. This is operational navigation continuity and is expected to survive app restart.
- `weatherStore`: weather response cache, coordinate cache key, cached timestamp, and freshness/source labels. Cache consumers must keep labeling `cache_fresh`, `cache_stale`, and `fallback` honestly; stale weather is usable context, not live weather.

## Should use secure storage

- Power cloud/API access tokens, refresh tokens, provider secrets, and credential material belong in `TokenStore` or another secure storage path that prefers `expo-secure-store`. They must not be migrated into `PowerDeviceStore`, `weatherStore`, `wizardDraftStore`, or `waypointProgressStore`.
- Mapbox tokens and other API credentials should remain in their existing secure/token-specific paths.

## Intentionally memory-only

- Debounce timers, write queues, listener sets, in-flight weather request de-duplication, weather join-log throttles, and in-memory cache mirrors are runtime coordination state and should reset on restart.
- Live Bluetooth connection handles, active native BLE scan sessions, provider sockets, and transient polling promises should stay memory-only.
- Manual UI loading/error flags should remain memory-only unless a feature has a separate, explicit persisted state contract.

## Adapter Rules

- Use `createPersistedKeyValueCache` for non-sensitive operational continuity.
- Classify state as secure, private, ordinary, cache, or ephemeral before choosing a backend.
- Do not add a new persistence library for these stores.
- Do not reintroduce native-only memory fallbacks for state that the UI expects to survive restart.
- Expose `waitForHydration()` and `flush()` on stores whose startup or test behavior depends on persisted native snapshots.
- Join required startup work through `ECSStoreHydrationCoordinator`; do not add another shell-specific timeout wrapper.
- Include a schema version and a tested additive migration for new or changed persisted envelopes.
- Coalesce high-frequency writes and flush only at explicit lifecycle boundaries.
- Reject older incoming revisions before replacing either clean or dirty local state.
- Keep conflict resolution domain-specific; do not apply generic last-write-wins to safety or operational state.
- Scope durable private outbox records and conflict details to a pseudonymous account marker.
- Diagnostics may report counts, timings, status, and redacted errors only. They must not report stored values or raw payloads.
