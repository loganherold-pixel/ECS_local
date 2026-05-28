# Explore Planning Final Integration

## Implemented

- Explore now exposes four top-level options in this order: Suggested Routes, Route Filters, Trip Builder, and Offline Prep Pack.
- Suggested Routes and Route Filters continue to use the existing Explore route and refinement pipelines.
- Route readiness remains owned by the existing route card/details logic. Trip Builder only attaches readiness as a reference.
- Trip Builder can launch from the Explore planning tile or a selected route handoff, generate a structured trip plan, and render itinerary, camps, exit access, notes, items to verify, and Smart Resupply output.
- Smart Resupply Planner is a Trip Builder sub-feature only. It renders Fuel, Water, Food/Supplies, Repair, Medical, and Exit Access with conservative good, medium, low, or unknown states.
- Offline Prep Pack can launch from Explore, selected route details, or Trip Builder results. It renders a manifest of route essentials and distinguishes ready, pending, unavailable, partial, and needs-review states.
- Offline Prep Pack now creates a route-corridor tile-cache region from Explore, starts the shared offline sync coordinator, persists route-cache metadata to Navigate, and shows queued, downloading, complete, cancelled, failed, and retryable map-prep states in the current ECS UI.
- Interrupted route map-prep jobs rehydrate as queued on app restart and are resumed by the root shell when ECS becomes active again.

## Intentionally Unavailable

- GPX export and Trip Sheet items are marked ready only when they can be generated from supplied route or Trip Builder data. File-save/share adapters are not claimed as complete from this screen.
- Weather snapshots, emergency points, provider-backed campsite data, and real resupply points only appear when upstream systems supply them.
- No community comments, ratings, reports, submissions, or moderation workflows were added.

## Future Infrastructure

- Add a native OS background downloader only if product requirements need downloads to continue while the app process is fully suspended or killed. Current behavior is honest app-restart resume, not silent OS continuation.
- Wire GPX, Trip Sheet, and route-summary actions into the existing native/web export and share adapters.
- Add Android visual QA evidence for the Explore tile, selected route detail action, Trip Builder results CTA, and Offline Prep Pack partial/unavailable states.
