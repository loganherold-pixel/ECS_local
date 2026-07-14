# ECS Offline Operational Mode

## Purpose

Offline operation is a planned expedition state, not a claim that every live provider remains available. ECS keeps locally prepared assets, manual plans, and queued writes usable while explicitly labeling stale, expired, missing, partial, corrupt, and provider-restricted data.

## Canonical Readiness Manifest

`OfflineReadinessManifest` schema version 1 is embedded in the existing Offline Prep Pack manifest. The outer Offline Prep Pack remains schema version 2 for backward compatibility. Legacy manifests are adapted on load; they are not destructively rewritten.

Each planned package records these asset classes:

- Route geometry
- Required map regions
- Navigation assets
- Camp candidates
- Weather snapshot
- Emergency and recovery packet
- Vehicle and loadout snapshot
- Waypoints and bailouts

Every asset records required/optional status, coverage, source timestamps, provider and authority labels, offline-use policy, size, downloaded bytes, expiry, storage references, dependencies, and integrity state. ECS-generated structured assets use SHA-256. Map regions use provider-managed tile-region completion evidence plus a checksum of stable region metadata.

The support-evidence selector removes exact route, trip, expedition, package, attempt, and storage identifiers. It reports integrity status without exporting checksum values or raw payloads.

## Preparation Lifecycle

Preparation is persisted by `offlineReadinessCoordinator` and is resumable:

1. `planned`
2. `preparing`
3. `paused` after interruption
4. `ready`, `partial`, or `failed` after deterministic audit

In-flight tile jobs restore as queued. Startup hydrates manifests and tile jobs without waiting for a network request. Route downloads resume only when the app is active and the connectivity monitor reports online.

## Departure Audit

The audit is deterministic. Required missing, corrupt, incomplete, expired, or partial assets block package readiness. Optional missing, stale, or expired assets produce warnings. Expired weather remains visible as last-known reference and is never labeled current or live.

The existing Dashboard Departure Audit layout is preserved. Its Offline map package row summarizes canonical blockers and warnings; its Weather snapshot row distinguishes ready, stale, expired, and unavailable states.

## Storage And Eviction

The configured map quota remains the operational limit. Preparation performs a quota preflight for full-route and critical-segment downloads. Low-space state is stored in the manifest and becomes an explained departure blocker.

`tileCacheStore` consults a protection resolver before manual deletion, clear-all, stale purge, quota cleanup, or region merge. Regions referenced by an active route, active expedition, or in-progress preparation are not eligible for eviction. There is no automatic deletion override for active assets.

## Queued Writes

The existing `syncActionQueue` remains the durable outbox. Each action now carries:

- A persisted backend idempotency key
- A stable outstanding-operation fingerprint
- A monotonic local sequence

Equivalent pending operations collapse to one action. Explicit caller idempotency keys also suppress completed duplicate replay. Reconnect processing retains the established priority policy and preserves FIFO sequence within priority. Conflicting entity changes remain held for explicit resolution.

Manual comms plans, recovery plans, and incident packets remain editable locally. Incident packets explicitly disable external sharing; ECS does not automatically contact emergency services or transmit the packet.

## Provider Restrictions

Map tiles remain in the map provider's managed offline cache and do not imply redistribution rights. Weather is a snapshot and cannot refresh offline. Provider absence, unknown policy, or unavailable data does not silently pass a required hard gate.

## Rollout

- Feature: `explore_offline_prep`
- Maturity: beta
- Default: enabled
- Enable flag: `EXPO_PUBLIC_ECS_EXPLORE_OFFLINE_PREP_PACK`
- Kill switch: `EXPO_PUBLIC_ECS_KILL_EXPLORE_OFFLINE_PREP`
- Readiness gate: `npm run gate:offline-navigation-production`

This change adds no new rollout flag and does not change the existing default.

## Repeatable Failure Drill

Run:

```bash
npm run drill:offline-operational
```

The deterministic CI drill writes `.smoke/offline-operational-failure-drill-result.json`. It covers no-network startup, interrupted preparation, low storage, corrupt assets, expired weather, missing geometry, partial map coverage, protected eviction, offline incident state, replay ordering, conflicts, duplicate replay, restart, migration, and network-loss navigation copy.

This result is not physical-device evidence. Release approval still requires Android and iOS radio-off cold starts, OS-terminated download restoration, real storage pressure, provider offline-cache/license validation, long-running offline guidance, and multi-client reconnect conflict testing.
