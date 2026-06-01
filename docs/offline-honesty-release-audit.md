# ECS Offline Honesty And Failure-State Release Audit

## Summary

ECS already has strong offline-readiness, weather freshness, cached route, and telemetry fallback infrastructure. This pass tightened the remaining low-risk overclaims in the shared offline profile engine and documented the active behavior across Weather, Navigate, Explore, Campsite intelligence, Remoteness, Telemetry, Power/Bluetooth, Auth, and ECS Brief.

## Patched Low-Risk Items

- Weather offline profile now checks for an actual cached weather record before claiming cached weather is available.
- Weather offline profile now labels stale and very stale cached weather distinctly.
- Route navigation offline profile no longer says a loaded route is fully `available offline`; it now says saved route geometry is loaded and map cache coverage is not confirmed.
- Reconnect messages no longer claim all services are restored immediately. They now say live services are refreshing.

## Confirmed Honest Behavior

- Navigate separates cached route guidance, cached map coverage, partial cached maps, and offline-unavailable states.
- Offline readiness distinguishes `Ready`, `Partial`, `Not Prepared`, `Route Not Cached`, `Style Not Cached`, and `Layer Not Cached`.
- Weather freshness uses canonical source/timestamp handling and distinguishes fresh cache, stale cache, missing weather, and live weather.
- ECS Brief weather context consumes unified weather freshness instead of treating missing route weather as stale current weather.
- Campsite/CampOps tests cover stale/offline source handling and avoid presenting inferred or missing legal/resource data as verified.
- Vehicle telemetry widgets distinguish live telemetry, last-known telemetry, manual fallback, stale telemetry, and unavailable state.
- Dispatch/CAD and auth/session restore tests already preserve offline/queued honesty.

## Needs Review

- Some broader dashboard strings still use optimistic readiness language when multiple systems are recovering. They are currently guarded by source state, but product review should confirm the exact tone.
- Internal route keys still use legacy names (`discover`, `alert`) for compatibility; visible labels are Explore and Dispatch.
- Future integrations such as Garmin, MapShare, KML, BLU/BLE, and campsite intelligence should remain visible only with explicit unavailable/inferred/cached labels until live provider data is present.

## Risk

- Low: offline profile copy and cache presence checks.
- Medium: deeper changes to Navigate guidance availability, campsite provider confidence, or ECS Brief deterministic wording.
