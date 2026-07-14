# ECS Automotive Driver-Safe Release Contract

## Scope

The reduced Vehicle Display, Android Auto bridge, and CarPlay bridge are projections of existing ECS state. They do not own route guidance, route safety, telemetry conclusions, weather conclusions, exit-plan conclusions, or drive-mode policy.

Canonical inputs are selected from Navigate, Fleet/telemetry, the operational weather broker, deterministic exit planning, and the persisted Vehicle Display mode override. AI support may explain those values on the mobile reduced display, but it cannot replace the deterministic value or actionable state sent to an automotive surface.

## Safe Projection

Every automotive domain value uses `ecs.automotive-safe.v1` and carries:

- value
- source and source label
- origin
- freshness
- confidence
- availability
- actionable status
- last update

Manual, cached, and inferred origins are never presented as live. Expired last-good data may remain visible only with stale/expired labeling and a degraded or unavailable actionable state. Missing data stays unavailable.

Weather labels identify the operational weather provider rather than GPS, which supplies only the lookup location. Mixed resource summaries remain labeled mixed/recent while fuel, water, power, and alternate-fluid values retain their individual source states.

## Lifecycle And Update Policy

- The shell owns a lightweight connection probe only when the applicable rollout policy passes.
- Vehicle Display stores, sensors, mode evaluation, and companion synchronization start only while the reduced display route is open or an approved head unit is connected.
- Disconnect, logout/reset, background transitions, route end, and owner release clean up timers and listeners deterministically.
- Logout clears native automotive projections after session restoration confirms that no shell identity remains.
- Foreground semantic state publication is scheduled every 15 seconds, background publication every 30 seconds, with a 60-second heartbeat and a five-second minimum between changed full-state payloads. A trailing publication preserves changes suppressed by that minimum.
- Unchanged five-second Vehicle Display ticks publish to UI subscribers only on the 60-second heartbeat. Persisted mode/screen preferences are written only when their payload changes.
- Noncritical support-summary evaluation is bounded to one attempt per 30 seconds for changed inputs and one heartbeat refresh per two minutes for unchanged inputs.
- Material position changes are independently throttled; unchanged coordinates, heading, and speed are not republished.
- Native templates poll shared storage every five seconds but invalidate only when the semantic payload changes.
- Core navigation recording remains independent from automotive display throttles.

The deterministic cadence harness reduces thirteen unchanged five-second ticks over one minute from thirteen eligible publications to two: the initial state and one heartbeat. This is scheduling evidence only; no frame-rate, memory, CPU, or battery-life improvement is claimed without real-device profiling.

## Rollout

All automotive capabilities are restricted field-test features and default off:

| Feature | Enable flag | Native requirement | Evidence requirement |
| --- | --- | --- | --- |
| Reduced Vehicle Display | `EXPO_PUBLIC_ECS_AUTOMOTIVE_VEHICLE_DISPLAY` | Android Auto or CarPlay surface | reduced UI, distraction review, owner acceptance |
| Android Auto bridge | `EXPO_PUBLIC_ECS_ANDROID_AUTO_BRIDGE` | Android Auto module | Android head-unit, distraction review, owner acceptance |
| CarPlay bridge | `EXPO_PUBLIC_ECS_CARPLAY_BRIDGE` | CarPlay module | CarPlay head-unit, distraction review, owner acceptance |

Kill switches are `EXPO_PUBLIC_ECS_KILL_AUTOMOTIVE_VEHICLE_DISPLAY`, `EXPO_PUBLIC_ECS_KILL_ANDROID_AUTO_BRIDGE`, and `EXPO_PUBLIC_ECS_KILL_CARPLAY_BRIDGE`. Missing, malformed, production-environment, native-module, or evidence configuration fails closed. `/vehicle-display` returns safely to Fleet when unavailable.

## Driver Interaction Contract

- Automotive surfaces remain glanceable and use bounded, non-scroll-dependent primary content.
- Stale values use "last known", stale, expired, cached, manual, or unavailable language as appropriate.
- Mode controls preserve explicit manual override and never silently return to automatic switching after restoration.
- The automotive emergency item is informational and disabled. ECS coordinates the team; it does not contact emergency services. The driver is directed to a phone or radio.
- No new text-entry, setup, or unsupported touch workflow is permitted on the head unit.

## Verification Boundary

CI and local simulation can verify projection truth, lifecycle transitions, semantic deduplication, update thresholds, route begin/end, missing/stale states, feature access, native source-label contracts, and conservative emergency wording.

Production promotion still requires:

1. Android Auto DHU and at least one physical compatible head unit across connect, disconnect, background, route begin/end, and stale-data scenarios.
2. CarPlay simulator and at least one physical compatible head unit across the same scenarios.
3. Real-device battery, CPU, memory, and update-rate traces during a representative drive.
4. Driver-distraction review of glance time, control count, text length, and unavailable states.
5. Product, safety, privacy, and owner acceptance of the restricted field-test evidence packet.
