# Turn-By-Turn Android QA

Use this checklist for Android evidence collection after a fresh route request, a summary-only route, and one forced reroute. Capture screenshots or logs only from real app state; keep the run blocked when route artifacts or no-network evidence are missing.

## Manual Checklist

- Start navigation from current GPS to destination
- Confirm active card shows next maneuver
- Confirm road name appears
- Confirm unnamed road fallback appears
- Confirm dropdown lists upcoming directions
- Confirm current step advances
- Go off-route and confirm recalculating indicator
- Confirm route line updates
- Confirm dropdown refreshes
- Confirm ETA/mileage remains visible
- Confirm no crash when route has no steps
- Confirm summary-only fallback works

## Evidence Notes

- Primary target: Android.
- Preserve screenshots/logs that show `guidanceMode`, `routeId`, `rerouteGeneration`, current step, off-route status, and reroute status when dev diagnostics are enabled.
- Do not invent route JSON, no-network assertions, or readiness metadata. If the app cannot produce the artifact during the run, mark that portion blocked.
