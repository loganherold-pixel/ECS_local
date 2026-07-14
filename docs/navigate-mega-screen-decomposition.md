# Navigate Mega-Screen Decomposition Baseline

## Scope

This document records the pre-extraction state of `app/(tabs)/navigate.tsx` for the first bounded decomposition slice. The work preserves routing, copy, layout, status colors, interaction semantics, and store ownership.

Repository state at baseline:

- Repository root: `C:\Users\logan\Desktop\ECS_local`
- Branch: `codex/source-truth-foundation`
- Working tree: 0 staged, 322 tracked unstaged, and 97 untracked paths before this task
- Target: Navigate, selected from the four candidate screens because it has the largest concentration of local orchestration and presentation responsibilities

## Structural Baseline

AST-backed measurements:

| Measure | Baseline |
| --- | ---: |
| Lines | 31,469 |
| Imports | 234 |
| `useState` calls | 236 |
| `useEffect` calls | 148 |
| `useFocusEffect` calls | 8 |
| Explicit subscriptions/listeners | 15 |
| Modal/selection state bindings | 48 |

Effect responsibility inventory:

| Responsibility | Effects |
| --- | ---: |
| Route, guidance, and geometry | 44 |
| Camp layers and CampOps | 37 |
| Derived synchronization and other orchestration | 25 |
| Subscription and app lifecycle | 14 |
| Hydration, persistence, and cache | 11 |
| UI, modal, and animation | 9 |
| Convoy, Dispatch, and expedition | 7 |
| GPS, sensor, and camera | 5 |
| Weather and hazard | 4 |

Local-state responsibility inventory:

| Responsibility | State hooks |
| --- | ---: |
| Route, guidance, and geometry | 68 |
| Camp and CampOps | 64 |
| Other local orchestration | 68 |
| UI, modal, and selection | 19 |
| Convoy, Dispatch, and expedition | 7 |
| GPS and camera | 5 |
| Offline, cache, and hydration | 5 |

The 15 explicit subscription/listener sites cover expedition state, Dispatch events and profiles, AI routes, app state, MVUM selection, connectivity, tile cache and sync, recorded runs, campsite candidates, remoteness, Android back handling, and route state. Cleanup remains screen-owned in this slice.

Major effect families include startup/store hydration, route and active-guidance restoration, displayed-geometry synchronization, viewport layer requests, camp-provider/cache loading, corridor weather refresh, camera/recenter commands, offline tile synchronization, expedition/convoy replacement, and app-state/back cleanup.

The 48 modal/selection bindings include `activeTopPopup`, `topPopupHistory`, `toolsMenuOpen`, `campLayerMenuOpen`, preflight confirmation, selected convoy member/Dispatch ping, authentication, snapshot, recent search, pin editing, route-builder save/impact, export, tilt/weather detail, route/MVUM selection, Route Confidence Timeline selection, start decision, Camp Intel, and camp candidate/endpoint selections. These remain locally owned in the first slice.

## Domain Responsibilities

Navigate currently owns or composes:

- Map rendering, camera commands, map style, recentering, and search
- Road navigation, active guidance, route lifecycle, and session restoration
- GPX, KML, and GeoJSON import
- Route building, snapping, stitching, undo, redo, and save eligibility
- MVUM and ECS catalog viewport geometry
- Saved routes, runs, trail assets, pins, waypoints, and bailouts
- Established, dispersed, and community camps plus CampOps recommendations
- Weather, hazard, terrain, tilt, and remoteness overlays
- Offline tiles, cache readiness, sync, and departure support
- Convoy, Dispatch ping, and active expedition context
- Tools, popup stacking, detail panels, previews, and exports
- Navigate performance instrumentation

## Characterization Coverage

Existing regression coverage run before extraction:

- `npm run test:navigate-route-confidence`
- `npm run test:route-confidence-timeline`
- `npm run test:navigate-popup-layer-stack`
- `npm run test:navigate-operations-runtime`
- `npm run test:navigate-mobile-emulation-regressions`
- `npm run test:navigate-tools-search-hierarchy`

The first slice adds `test:navigate-decomposition-characterization` to execute pure popup-stack transitions and route-confidence presentation transformations with fixed fixtures.

## Dependency Map

Route Confidence Timeline:

`routeContext` deterministic contracts and builder -> Navigate input selection -> pure Navigate presentation adapter -> timeline presentation model -> feature panel -> screen-owned selection/camera command

Navigate surface layers:

user action -> pure stack transition -> screen-owned React state/history -> existing popup and sheet containers -> Android back dismissal

The extracted modules may depend on canonical route-context types or receive explicit typed inputs. They must not import stores, navigation, map providers, or the Navigate screen.

## First Slice

1. Extract route-confidence geometry, overlay, route-identity, and point-selection transformations into a cohesive pure presentation module, then move the existing timeline panel into a feature component with explicit props.
2. Extract popup-layer types and pure stack transitions into a small surface-layer state module while leaving React state, dismissal order, and all visible containers in Navigate.

These boundaries are low risk because they are deterministic, already exercised by focused tests, and do not own persistence, subscriptions, routing, or safety decisions.

## First-Slice Result

| Measure | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Navigate lines | 31,469 | 31,009 | -460 (-1.46%) |
| Import declarations | 234 | 237 | +3 |
| `useEffect` calls | 148 | 148 | 0 |
| `useFocusEffect` calls | 8 | 8 | 0 |
| `useState` calls | 236 | 236 | 0 |
| Explicit subscriptions/listeners | 15 | 15 | 0 |
| Navigate screen render-instrumentation call sites | 1 | 1 | 0 |

The import count rises because the screen now names three explicit ownership boundaries: the feature panel, its pure presentation adapter, and surface-layer state. No broad subscription, effect, state, persistence, routing, or camera orchestration moved in this slice.

Render-rate and startup timing are not claimed to improve. The existing `navigate_screen` render counter remains in place exactly once, and `MapRenderer` retains its existing first-meaningful-render instrumentation. Real render frequency, frame pacing, and memory still require Android/iOS profiling under representative map interaction.

The Route Confidence Timeline panel remains a static import, so this slice does not claim a lazy-load or startup-bundle reduction. The required Expo export produced a current `/navigate` static route of 178 kB and a 16.2 MB shared entry bundle; no pre-task bundle artifact was recorded, so these are reference values rather than before-and-after proof.

Behavior moved under test:

- Popup-stack raise, reorder, remove, and Tools-child classification
- Route-confidence thresholds, source timestamps, geometry filtering, route identity, overlay source freshness, and map-focus point selection
- Route Confidence Timeline source, freshness, missing-data, uncertainty, and non-authoritative safety copy
- Existing screen-owned feature gating, item selection, camera command, and Android-back ordering

## Ranked Follow-Up Boundaries

1. Route builder command handlers and undo/redo presentation model.
2. Viewport geometry request orchestration and layer presentation selectors.
3. Modal/sheet coordinator for tools, camp layers, and map selections.
4. Active-guidance camera command arbitration.
5. Camp overlay data pipeline and source-state adapter.
6. Import orchestration with cancellation, validation, and handoff adapters.
7. Convoy and Dispatch overlay presentation selectors.
8. Offline cache and sync presentation model.
