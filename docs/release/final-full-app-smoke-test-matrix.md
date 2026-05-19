# ECS Final Full-App Smoke Test Matrix

Date: 2026-05-17

## Summary

Automated release smoke coverage is green for the static/source-contract checks captured here. Closed field testing is now **risk-accepted for a restricted scope only** through the release readiness gate; this matrix does not mark ECS ready for public release, broad rollout, provider influence, AI assist, telemetry, or community publishing.

Status key:

- Passed: Covered by an automated check or static config/source check in this audit.
- Restricted: The check ran and permits only the approved restricted closed-field scope.
- Blocked: The check ran and correctly reports a production or broader rollout blocker.
- Needs Device: Requires Android device/emulator runtime, live auth/session state, Mapbox WebView rendering, or physical offline/network toggling.
- Failed: Currently failing and requiring a code fix. No scenario remains failed after this pass.

## Required Scenario Matrix

| # | Scenario | Status | Evidence | Notes |
| --- | --- | --- | --- | --- |
| 1 | Fresh install / no session | Passed | `npm run test:auth-startup-route-selection`, `npm run test:auth-loading-flow` | Contract verifies unauthenticated startup routes to login/setup paths without shell flash. Device install remains recommended. |
| 2 | Valid session restore | Passed | `npm run test:auth-startup-route-selection`, `npm run test:connectivity-startup` | Restore decision path is covered at source-contract level. |
| 3 | Offline session restore | Passed | `npm run test:connectivity-startup`, `npm run test:offline-readiness` | Offline restore posture is represented honestly in startup/offline checks. |
| 4 | Login -> loading video -> Dashboard | Passed | `npm run test:auth-loading-flow`, `npm run test:no-global-refresh-overlay` | Loading video remains isolated to pre-shell holding route; no global overlay over app chrome. |
| 5 | Dashboard tab loads | Passed | `npm run test:dashboard-widgets`, `npm run test:dashboard-live-state-refresh` | Widget registry and live refresh contracts pass. |
| 6 | Fleet tab loads | Passed | `npm run test:fleet-full-flow` | Fleet full-flow integration regression passes. |
| 7 | Navigate tab loads | Passed | `npm run test:navigate-active-guidance`, `npm run test:navigate-road-preview-layout` | Navigate active guidance and road preview layout contracts pass. |
| 8 | Explore tab loads | Passed | `npm run test:explore-refinement-filter`, `npm run test:explore-route-preview-regression` | Explore filtering and route preview contracts pass. |
| 9 | Dispatch tab loads | Passed | `npm run test:dispatch-helpers`, `npm run test:dispatch-live` | Dispatch helper and live conversion checks pass. |
| 10 | Map renders with Mapbox token | Needs Device | `npx expo config --type public --json`, `npm run test:navigate-map-style-3d` | Config and style contract are valid, but real WebView/Mapbox tile rendering requires device/emulator with a valid token. |
| 11 | Map fallback works without Mapbox token if supported | Passed | `components/navigate/MapRenderer.tsx` static check during audit | MapRenderer renders a tactical "Map unavailable" placeholder when token is missing. Device visual QA still recommended. |
| 12 | Route preview works | Passed | `npm run test:navigate-road-preview-layout`, `npm run test:explore-analysis-route-preview`, `npm run test:explore-route-preview-regression` | Navigate and Explore route-preview contracts pass. |
| 13 | Begin route works | Passed | `npm run test:start-guidance-readiness`, `npm run test:navigate-tools-search-route-flow` | Start-guidance readiness and route-flow contracts pass. |
| 14 | Active guidance appears in correct priority position | Passed | `npm run test:navigate-active-guidance` | Active guidance priority surface passes. |
| 15 | Temporary notification appears below active guidance | Passed | `npm run test:navigate-active-guidance`, `npm run test:no-global-refresh-overlay` | Source-contract checks preserve active guidance priority and prevent global overlays. |
| 16 | Offline cache state displays honestly | Passed | `npm run test:offline-readiness`, `npm run test:offline-remote-cache`, `npm run test:navigate-offline-route-flow` | Offline/cache copy and route-flow contracts pass. |
| 17 | Weather widget handles live, stale, and unavailable states | Passed | `npm run test:weather-freshness`, `npm run test:weather-cache-hydration`, `npm run test:weather-request-dedupe` | Weather freshness, cache, and request-dedupe checks pass. |
| 18 | ECS Brief logs advisories without duplicate spam | Passed | `npm run test:ecs-brief-guidance-dedupe` | Guidance duplicate suppression passes. |
| 19 | Explore radius filter works | Passed | `npm run test:explore-refinement-filter` | Radius/refinement filter contract passes. |
| 20 | Explore route handoff to Navigate works | Passed | `npm run test:explore-analysis-route-preview`, `npm run test:explore-route-preview-regression`, `npm run test:navigate-tools-search-route-flow` | Preview and handoff-adjacent route flow checks pass. |
| 21 | Dispatch recovery event flow works | Passed | `npm run test:dispatch-hazard-recovery-flow`, `npm run test:dispatch-recovery-critical-feed`, `npm run test:dispatch-cad-durable-outbox` | Recovery event creation/feed/outbox contracts pass. |
| 22 | Widget manager opens and closes correctly | Passed | `npm run test:dashboard-widgets` | Widget catalog/manager contract passes. |
| 23 | Quick Actions opens and closes correctly | Passed | `npm run test:field-utilities-regression` | Field utilities/quick-action regression passes. |
| 24 | App survives reload | Needs Device | `npm run smoke`, `npm run test:startup-warning-hygiene` | Headless project smoke and startup warning checks pass; actual app reload must be confirmed on Android runtime. |
| 25 | TypeScript passes | Passed | `npx tsc --noEmit --pretty false` | Direct TypeScript check passes. |
| 26 | Lint passes | Passed | `npm run lint` | Expo lint passes. |
| 27 | Release readiness checks run | Restricted | `npm run test:release-readiness`, `npm run gate:closed-field-test:json` | Diagnostic sweep passes, and the closed-field gate reports `ready_with_restrictions` / `risk_accepted_restricted_closed_field_test`. Provider influence, AI assist, telemetry, community publishing, broad privacy/storage rollout, and public release remain blocked unless separately approved. |

## Checks Run

Startup/auth:

- `npm run smoke` - passed; internal child-process config/type/lint stages were sandbox-skipped with `spawn EPERM`.
- `npx expo config --type public --json` - passed.
- `npm run test:auth-loading-flow` - passed.
- `npm run test:auth-startup-route-selection` - passed.
- `npm run test:connectivity-startup` - passed.
- `npm run test:startup-warning-hygiene` - passed.
- `npm run test:auth-single-login-request` - passed after source-contract update.
- `npm run test:auth-log-redaction` - passed.
- `npm run test:auth-audit-logging` - passed.

Tabs, shell, and widgets:

- `npm run test:dashboard-widgets` - passed.
- `npm run test:dashboard-live-state-refresh` - passed.
- `npm run test:fleet-full-flow` - passed.
- `npm run test:top-banner-title-layout` - passed.
- `npm run test:no-global-refresh-overlay` - passed after source-contract update.
- `npm run test:field-utilities-regression` - passed.
- `npm run test:command-state-hardening` - passed.

Navigate, map, route, and offline:

- `npm run test:navigate-active-guidance` - passed.
- `npm run test:navigate-road-preview-layout` - passed.
- `npm run test:navigate-tools-search-route-flow` - passed.
- `npm run test:navigate-offline-route-flow` - passed.
- `npm run test:navigate-route-confidence` - passed.
- `npm run test:navigate-map-style-3d` - passed.
- `npm run test:start-guidance-readiness` - passed.
- `npm run test:offline-readiness` - passed.
- `npm run test:offline-remote-cache` - passed.

Weather and ECS Brief:

- `npm run test:weather-request-dedupe` - passed.
- `npm run test:weather-freshness` - passed.
- `npm run test:weather-cache-hydration` - passed.
- `npm run test:ecs-brief-guidance-dedupe` - passed.

Explore:

- `npm run test:explore-refinement-filter` - passed.
- `npm run test:explore-analysis-route-preview` - passed.
- `npm run test:explore-route-preview-regression` - passed.
- `npm run test:explore-route-preview-metadata` - passed.

Dispatch:

- `npm run test:dispatch-helpers` - passed.
- `npm run test:dispatch-live` - passed.
- `npm run test:dispatch-recovery-critical-feed` - passed.
- `npm run test:dispatch-hazard-recovery-flow` - passed.
- `npm run test:dispatch-cad-durable-outbox` - passed.

Release gates:

- `npm run test:release-readiness` - passed.
- `npm run gate:closed-field-test:json` - passed with `ready_with_restrictions` / `risk_accepted_restricted_closed_field_test`.
- `npx tsc --noEmit --pretty false` - passed.
- `npm run lint` - passed.

## Failures Found And Fixed

| Check | Initial result | Fix |
| --- | --- | --- |
| `npm run test:no-global-refresh-overlay` | Failed because it banned any root-shell `LoadingTransitionVideo` import. | Updated `scripts/test-no-global-refresh-overlay.js` to require the loading video only in the pre-shell `postAuthRedirectHoldingScreenActive` branch and still ban overlay containers over chrome. |
| `npm run test:auth-single-login-request` | Failed because it expected direct `console.log` after release logging was moved behind `logAuthDev`. | Updated `scripts/test-auth-single-login-request.js` to verify the rapid-press suppression log is dev-gated and still prevents duplicate auth requests. |

No scenario remains in `Failed` status.

## Device-Only Manual Checks

These require Android device/emulator runtime and should be run before release candidate sign-off:

1. Fresh install on Android: no session lands on login/setup without intermediate shell flash.
2. Valid Supabase session restore lands on Dashboard or saved shell route.
3. Offline restored session is honest and does not claim live readiness.
4. Login with a real test account shows loading video for at least 2 seconds, then Dashboard.
5. Mapbox token build renders map tiles and supports pan/zoom/recenter.
6. No-token build shows the supported fallback without crashing.
7. Begin route from a real preview and verify active guidance is top priority.
8. Temporary notification appears below active guidance.
9. App process reload survives and restores route/session/offline state.
10. Background location and Bluetooth permission prompts match Play disclosure expectations.

## Release Readiness

Current release readiness is **risk-accepted for restricted closed field testing only**.

The restricted state is intentional and honest. The latest gate reports:

- Closed-field status: `ready_with_restrictions`.
- Effective status: `risk_accepted_restricted_closed_field_test`.
- Android/device QA evidence: complete for the current restricted QA packet, with real provider-backed route candidate validation still required before broader rollout.
- Provider readiness: not approved for real target-region/category influence.
- Privacy/storage: approved for guarded closed-field posture only; broad real trip/debrief rollout remains blocked.
- AI assist, telemetry, and community publishing: disabled unless separately approved.

Passing this smoke matrix does not waive public release, provider influence, AI assist, telemetry, community publishing, or broad privacy/storage gates.
