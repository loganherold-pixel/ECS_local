# Navigate Release Polish Report

Date: 2026-05-03

## Summary

The Navigate tab remains map-primary with route preview, active guidance, Tools search, GPX/import utilities, pin drop, offline cache controls, campsite overlays, and style switching wired through the active Expo Router tab at `app/(tabs)/navigate.tsx`.

Low-risk patch applied:
- Full-body Navigate popups now reserve the active-guidance band while guidance is active. Tools and other map popups no longer mount over the active guidance banner.
- The Campsite area quick action now uses the direct `DRAW AREA` label and campsite-search accessibility label expected by the Navigate release regression.
- `scripts/test-navigate-active-guidance.js` now guards that popup top bounds stay below active guidance during active navigation.

## Findings By Surface

### MapRenderer Stability

Risk: Low

Status: Retain.

`components/navigate/MapRenderer.tsx` keeps Mapbox WebView recovery, progress failsafes, camera command dedupe, style fallback chaining, and a token-missing placeholder. No release-blocking duplicate overlay issue was found in the renderer itself.

### Mapbox Token Fallback

Risk: Low

Status: Retain.

`lib/mapConfig.ts` resolves tokens from memory, secure/native storage, non-secure fallback storage, constants, environment, and Supabase. `MapRenderer` renders a clear "Map unavailable" placeholder when a token is unavailable instead of implying online map readiness.

### Route Preview And Begin Route

Risk: Low

Status: Retain.

Route preview still receives Start, Review Route, Prepare Offline, readiness, and offline context from `RoadNavigationOverlay`. The existing regression checks cover the Tools search-to-preview handoff and preview action wiring.

### Active Guidance Priority

Risk: Low

Status: Patched.

Active guidance already renders at the top of the map body and transient toasts attach beneath it during active navigation. The newly patched popup bound protects the same top band from full-body Tools and utility popups.

### Temporary Notifications

Risk: Low

Status: Retain.

Toasts use `mapToastAttachedToGuidance` during active guidance and sit below the active route surface. The active-guidance regression now also verifies popup bounds.

### Compass And Recenter

Risk: Low

Status: Retain.

`CompassRose` shows heading degrees and cardinal direction only. It does not render latitude/longitude. Tap-to-center remains wired through `handleRecenter`.

### Tools Dropdown

Risk: Low

Status: Patched for active-guidance overlap.

Tools remains a central map popup with search, style switching, saved routes, import, offline cache, pin drop, Camp Scout, and other utilities. During active navigation it now starts below the active guidance band.

### Address/Place Search

Risk: Low

Status: Retain.

The prominent Tools search field remains wired to `roadNavigation.query`, live suggestions, recent searches, and `handleRoadOverlaySelectSuggestion`.

### GPX Import And Pin Drop

Risk: Low

Status: Retain.

Import route and pin editor flows are still routed through map-bounded ECS popups. Pin drop remains in the Tools utility grid and map placement banner.

### Offline Cache Honesty

Risk: Low

Status: Retain.

Navigate distinguishes live, syncing, degraded, cached route, cached maps, and offline-unavailable states. Offline cache Tools copy reports `READY`, `PARTIAL`, `ROUTE ONLY`, `LIVE`, or `NONE` from actual cache coverage and connectivity.

### Campsite Pin Overlays

Risk: Medium

Status: Needs visual QA, retained.

Community/private/group/review campsite layers are state-driven and exposed through one Tools layer section. Detail cards are bounded by the map body, but dense campsite overlays on small screens should still receive device QA during active navigation.

### Map Style Switching

Risk: Low

Status: Retain.

Day/TAC/SAT/3D style switching is centralized in the Tools popup. No active rendered duplicate Day/TAC/SAT control was found. Some unused legacy style selector styles remain as cleanup candidates, but they do not render duplicate controls.

### Route Confidence UI

Risk: Low

Status: Retain.

The stale standalone Route Confidence pill/container is absent. Route confidence remains available inside preview readiness logic and active context data, where it supports Start Guidance readiness without creating a competing map overlay.

## Follow-Up Candidates

- Medium: Perform device visual QA for campsite detail cards and large Tools child panels during active navigation on small portrait screens.
- Low: Remove unused legacy map style selector style blocks in a later dead-code pass.
- Low: Add an interactive/mobile screenshot smoke once the project has a stable in-app route-preview fixture.
