# Explore Rendering Performance Android QA

Use this checklist for the Explore route/trail rendering pass. Enable diagnostics only in a dev build:

`EXPO_PUBLIC_ECS_EXPLORE_PERF_DEBUG=true`

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
6. Scroll through at least 100 nearby route cards and confirm the list remains responsive.
7. Test 250 indexed route candidates through the debug fixture or local catalog area and confirm first visible results are not blocked by full result population.
8. Toggle airplane mode or block image hosts and confirm: Route images failing does not block cards.
9. Open the map handoff/preview path and confirm the route overlay uses shared preview geometry rather than excessive individual sources/layers.
10. Confirm Full geometry is not loaded for every nearby card on initial Explore load.
11. Select a route and confirm full-resolution route geometry is still available for preview, build route, stitch route, and active guidance actions.
12. Confirm no valid route disappears solely for performance reasons.

## Expected Evidence

- Time to first visible result is logged by the Explore performance diagnostics.
- Card metadata renders before image load completion.
- Image failures fall back to a neutral ECS route thumbnail/fallback state.
- Preview map overlays use simplified route geometry; guidance/navigation still receives original route data.
