# Badge / Expedition Identity Source-of-Truth Contract

This readiness note prepares the Badge / Expedition Identity layer without changing current badge unlock behavior, UI layout, provider integrations, or scoring engines.

## Current Owners

- Badge definitions: `lib/expedition/expeditionBadgeRegistry.ts`
- Earned badge state: `lib/expedition/expeditionBadgeStore.ts`
- Completed trip records and post-processing trigger: `lib/expedition/expeditionTripRecordStore.ts`
- Current display surfaces: Dashboard Expedition Hub, Unlocked Badges collection, and completed trip detail.
- Readiness contract: `lib/expedition/badgeExpeditionIdentityReadiness.ts`

Badge persistence remains separate from Fleet, Active Trip, Offline Incident Packet, route catalog, and provider state. Future identity code should read earned badge summaries through the Expedition badge store or a thin selector, not by mutating those other systems.

## Safe Signals

The following signals are safe to consider for future deterministic badge or identity work because they are local, visible, and already source-labeled or deterministic:

- vehicle profile completed
- Trip Confidence Summary generated
- Active Trip activated
- Offline Incident Packet created
- Active Trip resumed after restart
- Terrain Risk evaluated
- Camp Viability evaluated
- route authority recognized
- clean trip stopped or completed
- local-only packet viewed
- unavailable state handled honestly

These signals are not all wired as unlock triggers today. The contract marks which ones are existing completed-trip badge paths and which ones are safe future signals.

## Deferred Signals

Do not unlock from unverified hardware, BLE, EcoFlow, Mopeka, Convoy, cloud sharing, or community publishing.

Deferred signals include unverified live hardware readings, connection presence alone, mock/demo fixtures, Convoy role or presence, cloud-shared packets, and public/community publishing. These can become eligible only after provider QA, privacy review, and explicit source labels exist.

## Title Model

Expedition titles are deterministic display labels derived from earned badge state and thresholds. They do not imply certification, official qualification, legal authority, rescue authority, medical authority, or public-safety status.

Prepared titles:

- Trail Scout
- Route Analyst
- Field Planner
- Terrain Watch
- Basecamp Ready
- Expedition Lead
- Recovery Minded
- Field Commander

Convoy may eventually show an optional title snapshot, but Convoy display integration stays deferred until Convoy privacy, role, and native QA are complete.

## UI Surface Guidance

- Safe now: Dashboard Expedition Hub, completed trip detail, Unlocked Badges collection.
- Safe later: future Expedition/Profile identity surface and future trip completion summary.
- Use sparingly: Active Trip summary, only if it does not distract from live trip state.
- Avoid badge noise: Offline Incident Packet. It should stay local-only, stale/unknown labeled, and recovery-focused.
- Deferred: Convoy Command title display until Convoy QA and privacy rules are reviewed.

## Production Guards

- Hidden locked badges stay hidden.
- Demo/mock/dev fixtures never unlock production identity.
- Stale, unknown, unavailable, and manual states must remain labeled.
- Missing user state must fall back without crashing.
- Title derivation must be pure and deterministic.
- Identity persistence must not mutate Fleet, Active Trip, Offline Incident Packet, route catalog, telemetry, or provider state.
