# Explore Rendering Performance Android QA

Use this checklist for the Explore route/trail rendering pass. Enable diagnostics only in a dev build:

`EXPO_PUBLIC_ECS_EXPLORE_PERF_DEBUG=true`

## Current Fieldtest Build

- Build ID: `1c4d048c-b7a2-4245-9a2b-9be6d5c9967d`
- Build profile: `fieldtest`
- Version code: `35`
- Commit: `0110e7bb`
- Build message: `Explore route discovery stability 0110e7bb`
- Status at queue time: `IN_PROGRESS`
- Logs: `https://expo.dev/accounts/expeditioncommand/projects/planning-offline-sync/builds/1c4d048c-b7a2-4245-9a2b-9be6d5c9967d`

## Automated Test Path

- `npm run test:explore-rendering-performance`
- `npm run test:route-discovery-index-performance`
- `npm run test:explore-performance-diagnostics`
- `npm run test:trail-packs`
- `npx tsc --noEmit --pretty false`

## Android QA Path

1. Launch a dev client on Android with Explore performance debug enabled.
2. Open Explore near a dense Northern California route area.
3. Select a 100 mi radius and a guidance-ready refinement.
4. Confirm cached Explore results appear before any background refresh completes.
5. Confirm first route card text, metadata, distance, and actions appear before thumbnails finish.
6. Leave the device in the same area for 2-3 minutes and confirm routes do not appear, disappear, then reappear while GPS/location refreshes occur.
7. Move slightly within the same nearby area, or replay nearby mock GPS points, and confirm the Trail Pack list keeps the same results visible while refreshing.
8. Change radius/refinement intentionally and confirm the list updates only for that user-controlled query change.
9. Confirm the Trail Pack panel shows the inline refresh notice while existing cards remain visible.
10. Scroll through at least 100 nearby route cards and confirm the list remains responsive.
11. Test 250 indexed route candidates through the debug fixture or local catalog area and confirm first visible results are not blocked by full result population.
12. Toggle airplane mode or block image hosts and confirm: Route images failing does not block cards.
13. Open the map handoff/preview path and confirm the route overlay uses shared preview geometry rather than excessive individual sources/layers.
14. Confirm Full geometry is not loaded for every nearby card on initial Explore load.
15. Select a route and confirm full-resolution route geometry is still available for preview, build route, stitch route, and active guidance actions.
16. Confirm no valid route disappears solely for performance reasons.

## Expected Evidence

- Time to first visible result is logged by the Explore performance diagnostics.
- Card metadata renders before image load completion.
- Image failures fall back to a neutral ECS route thumbnail/fallback state.
- Preview map overlays use simplified route geometry; guidance/navigation still receives original route data.
- Route catalog refreshes do not replace visible cards with a blocking loading state when cached/current results exist.
- Repeated identical route catalog refreshes are deduped while the first request is still in flight.
