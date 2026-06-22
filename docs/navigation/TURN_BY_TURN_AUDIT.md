# Turn-by-Turn Navigation Audit

Audit date: 2026-06-22

Scope: audit only. This document identifies why ECS can show remaining mileage and ETA while not consistently showing turn-by-turn route maneuvers. No navigation code was changed.

## Current Files Involved

- `app/(tabs)/navigate.tsx` - wires destination search, route preview/start, active guidance context, shared route session snapshots, and `MapRenderer` route props.
- `lib/mapboxRoadNavigation.ts` - owns Mapbox Searchbox/geocoding, Mapbox Directions requests, route normalization, cached geometry route rebuilds, and `RoadNavRoute`/`RoadNavStep` types.
- `lib/useRoadNavigation.ts` - owns road guidance state, route preview/start, reroute, restore, persistence, progress recomputation, ETA/distance remaining, and off-route confidence.
- `lib/roadNavigationProgress.ts` - projects live GPS onto route and step geometry, advances `currentStepIndex`, computes next instruction distance, remaining distance, progress geometry, and off-route distance.
- `components/navigate/RoadNavigationOverlay.tsx` - renders the active guidance banner and the active `Directions` dropdown from `session.route.steps`; contains a disabled preview step drawer.
- `lib/activeGuidanceDirections.ts` - builds the active dropdown maneuver list from flattened road steps.
- `lib/navigateRouteSessionStore.ts` - persists a lightweight Navigate route snapshot for dashboard/restore consumers, but only stores summary guidance, geometry, ETA/distance fields, and route status flags.
- `lib/activeRouteProgress.ts` - adapts the active road/trail/shared Navigate session into dashboard route-progress summaries.
- `components/navigate/MapRenderer.tsx` - renders route and progress line geometry from `points` and `progressPoints`; it does not consume step or maneuver data.
- `lib/roadNavigationStore.ts` - persists road navigation restore metadata and route geometry, but not step/leg maneuver details.

## Current Active Guidance Flow

1. Route creation/request:
   - Search and manual selections enter through `useRoadNavigation` in `app/(tabs)/navigate.tsx`.
   - `selectSuggestion`, `previewDestination`, and `reroute` call `requestRouteForDestination`.
   - `requestRouteForDestination` calls `fetchRoadRouteAlternatives` in `lib/mapboxRoadNavigation.ts`.

2. Mapbox route response parsing:
   - `normalizeMapboxRoadRoute` requires top-level route geometry.
   - It iterates `route.legs` and `leg.steps`, then flattens all steps into `RoadNavRoute.steps`.
   - It does not preserve a leg model or rich Mapbox instruction payloads.

3. Active trip/navigation state:
   - `useRoadNavigation` holds the road session with `route`, `currentStepIndex`, `nextInstruction`, `nextInstructionDistanceM`, `remainingDistanceM`, `remainingDurationS`, `etaIso`, confidence/off-route state, and `rerouteCount`.
   - The shared `navigateRouteSessionStore` stores only a lightweight snapshot for other surfaces.

4. ETA/distance remaining:
   - `resolveRoadNavigationProgress` computes remaining distance from projected route progress.
   - `useRoadNavigation` estimates remaining duration by scaling route duration by remaining distance.
   - `etaIso` is derived from remaining duration.
   - The dashboard and active banner can keep showing these because they depend on geometry and summary fields, not a full maneuver list.

5. Map route rendering:
   - `app/(tabs)/navigate.tsx` maps `roadNavigation.session.route.geometry` to `roadRoutePoints` and `session.progressGeometry` to `roadRouteProgressPoints`.
   - `MapRenderer` receives `points={displayedRoutePoints}` and `progressPoints={displayedRouteProgressPoints}`.
   - `MapRenderer` renders lines from coordinates only.

6. Directions dropdown:
   - Active road guidance has a `Directions` button in `RoadNavigationOverlay`.
   - The dropdown is built from `session.route.steps` through `buildActiveRoadDirectionList`.
   - If steps are absent, the overlay falls back to one status-style instruction.
   - The preview step drawer exists, but `routeStepOverlayEnabled` is hard-coded to `false`.

7. Off-route and reroute logic:
   - `useRoadNavigation` computes off-route distance in `resolveRoadNavigationProgress`.
   - It tracks confidence states such as `low_confidence`, `temporary_deviation`, `off_route`, `rerouting`, `rejoined`, `approaching`, and `arrived`.
   - Confirmed off-route state can call `reroute('off_route')` after a cooldown when live services are available.
   - `rerouteCount` increments, but no route generation id or persisted maneuver generation exists.

## Mapbox Directions Request Parameters

| Parameter | Current state |
| --- | --- |
| `steps=true` | Yes |
| `banner_instructions=true` | No. Current request sets `banner_instructions=false`. |
| `voice_instructions=true` | No. Current request sets `voice_instructions=false`. |
| `roundabout_exits=true` | No. Not sent. |
| `overview=full` | Yes |
| `geometries=geojson` or `polyline6` | Yes. Uses `geometries=geojson`. |
| `language=en` | Yes |
| `voice_units=imperial` | No. Not sent. |

## Mapbox Response Parsing

| Field | Current parsing |
| --- | --- |
| `routes[0].legs[]` | Iterated, but not preserved as legs. |
| `legs[].steps[]` | Yes, flattened into `RoadNavRoute.steps`. |
| `step.maneuver.instruction` | Yes. |
| `step.maneuver.type` | Yes, as `maneuverType`. |
| `step.maneuver.modifier` | Yes, as `modifier`. |
| `step.name` | Yes, as `roadName`. |
| `step.distance` | Yes. |
| `step.duration` | Yes. |
| `step.geometry` | Yes, as step coordinate geometry when present. |
| `step.bannerInstructions` | No. Not requested and not stored. |
| `step.voiceInstructions` | No. Not requested and not stored. |

## Active State Tracking

| State | Current tracking |
| --- | --- |
| Current leg index | No. Steps are flattened across legs. |
| Current step index | Yes, in `useRoadNavigation` road session. |
| Distance to next maneuver | Yes, as `nextInstructionDistanceM`. |
| Upcoming maneuver list | Derived in `RoadNavigationOverlay` from `session.route.steps`; not stored as active state or shared snapshot. |
| Route generation/reroute count | `rerouteCount` exists in the road session; no route generation id and not shared through `navigateRouteSessionStore`. |
| Off-route status | Yes, via confidence state, `isOffRoute`, and `offRouteDistanceM`. |
| Rerouting status | Yes, via `status === 'rerouting'` and shared `isRerouting`. |

## What Is Working

- Mapbox road routes request basic `steps=true`.
- Live road route parsing creates a flattened step list with instruction, maneuver type/modifier, road name, distance, duration, location, and geometry.
- Active road guidance computes current step, next instruction, distance to next maneuver, remaining distance, remaining duration, ETA, progress geometry, and off-route distance.
- Route and progress lines render independently from maneuver data.
- The active guidance banner can show the next instruction, turn distance, remaining mileage, ETA, and route status.
- The active `Directions` dropdown can show upcoming flattened steps when the live `session.route.steps` array is available.
- Focused regression scripts already exist for active directions and turn progress, including `scripts/test-active-guidance-directions-list.js` and `scripts/test-road-navigation-turn-progress.js`.

## What Is Missing

- The Mapbox request does not ask for rich turn-by-turn instruction payloads: banner instructions, voice instructions, roundabout exits, or imperial voice units.
- The parser drops leg structure and does not store banner or voice instruction arrays.
- Persisted road sessions store route geometry, distance, duration, and route identity, but not maneuvers.
- Restored cached road routes rebuild from geometry into a single generic step, so the route line, mileage, and ETA can survive while real maneuvers disappear.
- The shared Navigate route snapshot stores only one instruction plus summary fields. It cannot supply a maneuver list to dashboard/restore consumers.
- The preview step drawer is disabled by `routeStepOverlayEnabled = false`.
- There is no route generation id tying active maneuvers to the current route after reroutes, so future work needs a stale-maneuver guard.

## Root Cause

ECS currently has enough data and state for route progress, mileage, ETA, and one next-instruction prompt. It does not have a durable, rich turn-by-turn contract.

Live Mapbox road routes may have a basic flattened `steps` list, which is enough for the active dropdown in the same in-memory session. But rich Mapbox TBT fields are disabled at request time, discarded at parse time, and not persisted or shared. Once guidance is restored, mirrored, or consumed through the lightweight Navigate snapshot, ECS keeps drawable geometry and summary progress but loses real maneuver detail.

## Safest Implementation Path

1. Keep the existing ETA/mileage and map rendering path intact.
2. Update the Mapbox Directions request to include:
   - `banner_instructions=true`
   - `voice_instructions=true`
   - `roundabout_exits=true`
   - `voice_units=imperial`
3. Extend `RoadNavStep` additively to store compact `bannerInstructions` and `voiceInstructions`; preserve the existing flattened `steps` API.
4. Add an optional `legs` model or leg metadata without breaking current consumers.
5. Persist a bounded maneuver payload in `roadNavigationStore`, including a route generation id or route fingerprint.
6. Extend `navigateRouteSessionStore` only after the road session contract is stable, likely with a compact upcoming-maneuvers snapshot rather than full Mapbox responses.
7. Enable the UI path conservatively: active road dropdown first, then preview drawer behind an explicit QA/dev gate if needed.
8. Treat cached/offline geometry-only restores truthfully: show "maneuvers unavailable from cached geometry" instead of fabricating turn-by-turn steps.

## Risks

- Rich Mapbox instruction fields increase route payload and persistence size.
- Banner and voice instructions may still be absent for some routes; UI must tolerate missing arrays.
- Persisted maneuvers can become stale after reroute unless route generation/fingerprint checks are strict.
- Cached/offline geometry-only routes cannot safely produce true maneuvers.
- Android layout needs QA so the active dropdown does not collide with weather/readiness/route overlays.
- Roundabouts, ramps, and unnamed roads need fixture coverage because generic instruction parsing can be misleading.

## Test Plan

- Add a Mapbox request contract test for the Directions URL parameters listed above.
- Add a parser fixture test with multiple legs, multiple steps, banner instructions, voice instructions, roundabout exit metadata, and step geometry.
- Extend `scripts/test-road-navigation-turn-progress.js` to cover leg-to-step metadata once legs are preserved.
- Extend `scripts/test-active-guidance-directions-list.js` to verify the dropdown prefers rich maneuver display data when present and falls back to current text fields when not.
- Add a persistence/restore test proving stored maneuvers survive app restart when the route fingerprint matches.
- Add a stale-reroute test proving old maneuvers are replaced or suppressed after reroute count/generation changes.
- Add a geometry-only restore test proving ETA/mileage still work and maneuvers are explicitly unavailable.
- Android QA should cover live route start, active dropdown, off-route reroute, app restart restore, no-network cached restore, and route overview without replacing the map engine.
