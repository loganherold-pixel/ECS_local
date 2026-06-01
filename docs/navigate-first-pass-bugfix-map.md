# Navigate First-Pass Bugfix Map

Date: 2026-04-27

Scope: living map for the first Navigate bugfix pass. This file now tracks inspected surfaces, completed fixes, remaining follow-ups, and QA notes.

## Current Relevant Files

- `app/(tabs)/navigate.tsx`
  - Main Navigate orchestration, map overlay layout, Road Preview wiring, top popup rendering, offline cache popup entry, campsite polygon flow, Build Route state, active guidance toast messages, and route indicator badge.
- `components/navigate/RoadNavigationOverlay.tsx`
  - Road Preview card, Active Guidance card, route step drawer, and preview/active action wiring.
- `components/navigate/MapRenderer.tsx`
  - WebView/Mapbox map rendering, route/trail layers, campsite polygon rendering, Build Route pointer tracing, routeable feature snapping, and map event bridge.
- `components/navigate/OfflineCacheModal.tsx`
  - Embedded Offline Cache UI, current-view tile region creation, download progress UI, region list, cancel/delete/check actions.
- `components/navigate/RouteTileCacheCard.tsx`
  - Existing route-specific offline preparation card with progress/cached states. It is not currently used by `app/(tabs)/navigate.tsx`.
- `components/offline-maps/StorageDashboardModal.tsx`
  - Existing storage management popup.
- `lib/tileCacheStore.ts`
  - Tile region metadata, download engine, module-level active download cancellation map, quota cleanup, progress callbacks.
- `lib/routeTileCacheEngine.ts`
  - Route corridor analysis and route tile caching via `tileCacheStore`.
- `lib/offlineRouteCacheService.ts`
  - Persistent offline route metadata, cached route listing, cached route to run/manifest adapters.
- `lib/offlineCacheAwarenessEngine.ts`, `lib/offlineReadinessPresentation.ts`, `lib/startGuidanceReadinessPresentation.ts`
  - Offline readiness/status decisions used by Road Preview.
- `lib/useRoadNavigation.ts`, `lib/mapboxRoadNavigation.ts`, `lib/roadNavigationStore.ts`
  - Road route search/preview/active session, route steps, persistence, route fetching.
- `lib/campsiteCandidateEngine.ts`, `lib/campsites/campsiteThresholds.ts`, `lib/campsites/campsiteViabilityFilter.ts`, `lib/campsites/campsiteLocatorService.ts`, `lib/campsites/routeCampsiteLocatorAdapter.ts`
  - Route/polygon campsite candidate scoring, fallback stages, viability filtering, route/polygon locator adapters.
- `components/discover/EnrichedRouteCard.tsx`, `components/discover/AIRouteCard.tsx`, `app/(tabs)/discover.tsx`
  - Existing Explore route/Hidden Gems card visual language to reuse for downloaded offline route cards.
- `components/ECSSurface.tsx`, `components/ECSButton.tsx`, `components/ECSStatus.tsx`, `components/ECSText.tsx`, `components/ECSModalShell.tsx`, `components/TacticalPopupShell.tsx`
  - Existing tactical surfaces/buttons/badges/text/modal shells to reuse.
- `lib/theme.ts`, `lib/ecsSurfaceTokens.ts`, `lib/ecsTypographyTokens.ts`, `lib/ecsStatusTokens.ts`, `lib/shellLayout.ts`, `lib/ui/adaptiveLayoutProfiles.ts`
  - Existing ECS theme, surface, type, status, shell clearance, and adaptive sizing tokens.

## Bugs Found

1. Road Preview placement
   - `RoadNavigationOverlay` uses `bottomWrap` with `alignItems: 'center'` and `bottomCard` has `maxWidth: 392`.
   - `app/(tabs)/navigate.tsx` passes full-width left/right overlay insets and a right inset for the compass rail.
   - Result: on wide/tablet layouts the preview card is centered inside the bottom overlay instead of anchoring bottom-left.
   - Keep using `routeSurfaceBottomOffset = getCommandDockHeight(insets.bottom) + adaptive.navigate.overlayGroupGap + PAGE_FRAME_BOTTOM_GAP`; this already accounts for the ECS CommandDock/bottom safe area.

2. Road Preview action clarity
   - First pass updated the right-side quick controls to text-first tactical pills: `DRAW AREA` and `BUILD ROUTE`.
   - Build Route no longer uses the ambiguous `git-branch-outline` icon in this quick action.
   - Accessibility labels are now `Draw area to search for campsites` and `Build a route`.
   - Follow-up visual QA should confirm the text-pill width is clean on phone/tablet and does not cover critical controls.

3. View Route Steps / route tab artifact
   - First pass disconnected the broken Road Preview route-step path.
   - Road Preview preview contexts now set `showSteps: false`, and `RoadNavigationOverlay.PreviewCard` does not render the inline route-step action.
   - `RoadNavigationOverlay` no longer mounts `StepList` as an overlay behind Road Preview.
   - `app/(tabs)/navigate.tsx` now forces stale `roadNavigation.stepListExpanded` closed while in preview mode.
   - The top-left route indicator badge is suppressed during Road Preview so the duplicate `ROUTE / PREVIEW` tab does not appear.
   - Follow-up: build a proper route-step ECS sheet only if route step data is useful and the sheet can open above the preview without hidden transparent panels or duplicated route tabs.

4. Offline Cache / Prepare Offline
   - `renderMapPopup` returns `null` when closed, so embedded `OfflineCacheModal` unmounts.
   - First pass added `lib/offlineTileSyncCoordinator.ts` as the owner of app-process offline tile sync jobs.
   - `OfflineCacheModal` now creates tile regions, then starts/resumes downloads through `offlineTileSyncCoordinator.startRegionSync()` instead of awaiting `tileCacheStore.startDownloadWithQuota()` in component-local state.
   - Sync job status/progress is persisted in `ecs_offline_tile_sync`, and the tile region metadata remains persisted through `tileCacheStore`.
   - Closing the Offline Cache popup does not cancel the coordinator job. Reopening the popup resubscribes to the coordinator snapshot and shows active progress.
   - `components/navigate/OfflineSyncStatusChip.tsx` is mounted from the root shell to show a compact app-level progress/completion/cancel surface without duplicating shell banners.
   - There is no true OS-level background sync implementation here. This is app-process background sync only. Downloads can continue while the JS runtime stays alive; they are not registered as Android/iOS background tasks and should not be represented as OS-resilient background downloads.
   - Completed current-view tile regions and persisted route records now appear in the Offline Cache `Downloaded Syncs` section after completion/reopen.
   - `Downloaded Syncs` cards mirror the Explore route-card hierarchy: left accent rail, type/status badges, title/region, compact metrics, guidance chips, and action row.
   - Saved offline route records come from `offlineRouteCacheService.listOfflineCachedRoutes()`; current-view/map-region syncs come from completed `tileCacheStore` regions not already claimed by a route record.
   - `offlineRouteCacheService.removeOfflineCachedRoute()` was added so route cards can remove saved metadata, and region cards delete their tile region through `tileCacheStore.deleteRegion()`.
   - `tileCacheStore.startDownload()` now preserves explicit `cancelled` status instead of overwriting cancellation as an error after the download loop exits.

5. Active Guidance trail auto-pause noise
   - First pass removed the user-facing `TRAIL AUTO-PAUSED (STATIONARY)` toast from `app/(tabs)/navigate.tsx`.
   - `trailStore.checkMovement()` still runs, and `refreshTrailState()` still fires when the internal auto-pause state changes.
   - Internal trail pause/recording state remains intact; only the repeated stationary toast was suppressed.

6. Campsite/draw search filtering too strict
   - First pass replaced the final single `>= 70` hard gate with a tiered fallback in `lib/campsites/campsiteViabilityFilter.ts`.
   - Current tiers: `preferred >= 70`, `good >= 60`, `possible >= 55`, and `limited_confidence >= 50` for UI/debug labeling.
   - If no preferred/good/possible candidates exist, safe lower-score candidates can surface as `limited_confidence` instead of returning an empty result solely because the score is below 70.
   - Missing or non-numeric inferred scores no longer fail a candidate by themselves; missing access/legal evidence caps the candidate at `possible` or `limited_confidence`.
   - Explicit safety/access/legal failures still reject the candidate. Access confidence or legal access below `MIN_CAMPSITE_SAFETY_SCORE = 50`, private/no-access restrictions, closures, prohibited camping, trespass/illegal signals, and similar safety text remain hard exclusions.
   - `lib/campsiteCandidateEngine.ts` now selects the highest non-empty safe tier for a result set, enriches accepted candidates with `viabilityTier` and `viabilityConfidenceLabel`, and logs `totalBeforeFiltering`, `afterSafetyCount`, `afterScoreCount`, `activeThreshold`, `fallbackTier`, and `tierCounts`.
   - `components/navigate/CampsiteCandidatePanel.tsx` surfaces the tier label as `Preferred`, `Good`, `Possible`, or `Limited`.
   - Polygon no-results copy now says: `No strong matches found. Try expanding the drawn area or lowering constraints.`
   - `campsiteLocatorService` also excludes candidates within `MAJOR_ROADWAY_EXCLUSION_MILES = 1`, which is safety-aligned and should remain.

7. Build Route freehand drawing and snapping
   - `MapRenderer` already snaps live trace points to rendered routeable road/trail/path features with fallback free geometry.
   - First pass removed the `ROUTE_BUILDER_CONTINUE_PX` merge path. Every pointer-down/pointer-up stroke now creates a distinct draft segment.
   - New strokes anchor from the previous draft endpoint when one exists, so the route remains continuous while still storing strokes independently.
   - Undo in `app/(tabs)/navigate.tsx` removes one drawable segment from React state, and `MapRenderer.syncRouteBuilderTraceAnchorFromDraft()` restores the WebView trace anchor from the remaining endpoint so the next stroke can retrace from there.
   - Undo now restores previous segment snap metadata (`snapSource`, `snapStatus`, `snapMessage`) and segment equality checks include full `coordinates`, `rawSegment`, and `snappedSegment` geometry so snapped/raw pointer-up corrections cannot be missed.
   - WebView sync clears stale raw trace sessions before rebuilding the trace anchor from React state after undo/clear.
   - Starting Draw Camp Search while Build Route is active clears/disconnects the Build Route draft so the two draw modes do not overlap.
   - Pointer-up finalization now runs `MapRenderer.finalizeRouteBuilderSegmentSnap()` against the raw stroke. It stores `rawSegment`, `snappedSegment`, `snapConfidence`, `snapSource`, `snapStatus`, and `snapMessage` on each segment.
   - Final snap matching uses locally available routeable geometry from the active route/trail/segment payload and rendered map road/trail/path features. No OS/native or external map-matching service is currently wired.
   - Final snap tolerance is bounded (`ROUTE_BUILDER_FINAL_SNAP_PX = 64`) with high/medium confidence thresholds. Low-confidence, ambiguous, too-short, or no-match strokes keep a smoothed raw line instead of jumping to a distant road.
   - Routeable feature filtering excludes private/no-access/prohibited/closed tokens when the rendered map data exposes those properties.
   - The Build Route status chip shows `Snapping segment...` during finalization and `Raw kept - undo and retry if needed` for low-confidence/ambiguous fallbacks.
   - Route drawing controls are now separated from Road Preview and anchored bottom-left using the same bottom/safe map clearance as Road Preview. If Road Preview is visible, the route drawing strip rises above it.
   - The route drawing strip uses clear text actions: `UNDO`, `CLEAR ALL`, `PREVIEW`, and `EXIT`, with accessibility labels for each.
   - While Build Route is active, campsite polygon controls are hidden and unfinished campsite drawing state is cleared. Starting Draw Area disables/clears route drawing state before entering polygon mode.

## Proposed File Changes

1. `components/navigate/RoadNavigationOverlay.tsx`
   - Add a bottom-left preview placement style or prop for preview mode. Keep existing `ECSCard`, `ECSPanel`, `ECSButton`, `ECSBadge`, `TACTICAL`, and typography tokens.
   - Hide `View route steps` when `session.route?.steps?.length` is zero or when a new `previewContext.showSteps` is false.
   - If steps are kept, render them only through `StepList` when useful steps exist. Avoid transparent/empty containers.

2. `app/(tabs)/navigate.tsx`
   - Set Road Preview `showSteps` from a real `hasUsefulRoadSteps` predicate, not just `!!route`.
   - Disable/remove the top-left `routeIndicatorBadge` for preview/route-step-expanded states where Road Preview already owns the state.
   - Rename/change Draw and Build Route quick controls using existing icon/text patterns.
   - Suppress only the `TRAIL AUTO-PAUSED (STATIONARY)` toast; leave `trailStore.checkMovement()` and `trailStore.recordPoint()` unchanged unless later evidence shows state is wrong.
   - Wire offline sync progress to a parent/store-level state if a sync coordinator is added.

3. `components/navigate/OfflineCacheModal.tsx`
   - Consume `offlineTileSyncCoordinator` for download progress instead of owning long-running downloads in mounted component state.
   - Add a `Downloaded Views` container directly below Sync Current View in embedded mode.
   - Reuse `ECSPanel`/`ECSCard` or the Explore route card visual language. Do not introduce Navigate-only colors; replace existing raw success/error colors where touched with ECS status tokens where practical.

4. `lib/offlineTileSyncCoordinator.ts`
   - Added for app-process offline tile sync job ownership.
   - Responsibilities: start current-view sync, track active/completed/failed jobs by region id, expose subscribe/getSnapshot/cancel APIs, and let UI unmount/remount without losing progress.
   - This should remain app-process background sync only unless native OS background task support is intentionally added later.

5. `lib/offlineRouteCacheService.ts`
   - Use `listOfflineCachedRoutes()` for downloaded route visibility.
   - If current-view tile sync does not create a route cache, keep it as a map region card. If route-specific sync is used, create/update `OfflineCachedRoute` records with tile region id/status.

6. `lib/campsites/campsiteViabilityFilter.ts`, `lib/campsites/campsiteThresholds.ts`, `lib/campsiteCandidateEngine.ts`, `lib/campsites/campsiteLocatorService.ts`
   - Completed: added tiered fallback evaluation for inferred/polygon candidates.
   - Completed: kept explicit low legal access/access confidence, private/no-access, closure, prohibited camping, and similar restriction text as rejection.
   - Completed: `viabilitySummary` documents generated count, post-safety count, post-score/tier count, selected fallback tier, active threshold, tier counts, and diagnostic factors.
   - Follow-up: connect more authoritative land-use/legal data sources if available so safety filters are based on better inputs, not just inferred score/restriction text.

7. `components/navigate/MapRenderer.tsx`
   - Completed: every pointer-down/up is treated as an independent segment; nearby strokes are no longer merged into the previous segment.
   - Completed: new segments start from the previous endpoint when one exists.
   - Completed: after React-side undo/clear sync, the WebView trace anchor is rebuilt from the remaining draft endpoint.
   - Completed: added end-of-stroke snap normalization using the raw trace segment, rendered routeable features, existing route/trail payload geometry, and bounded confidence scoring.
   - Follow-up: evaluate a true map-matching/routing service abstraction if product wants network-backed road matching beyond locally rendered/payload geometry.

8. `components/discover/EnrichedRouteCard.tsx` or a new shared compact route card
   - Prefer a small shared route asset/offline route card if reuse is feasible.
   - Otherwise mirror the Explore Hidden Gems card structure: left accent rail, badge row, compact route title/meta, metrics, and action row using ECS tokens.

## Existing Components / Tokens / Containers To Reuse

- Shell/bottom clearance: `getCommandDockHeight()`, `getShellBottomClearance()`, adaptive layout values from `useAdaptiveLayout()`.
- Surfaces: `ECSCard`, `ECSPanel`, `ECSSection`, `ECSSectionHeader`, `ECSSectionBadge`.
- Buttons/actions: `ECSButton`, existing `SafeIcon`/Ionicons, `ECSActionRow` inside RoadNavigationOverlay.
- Status/chips: `ECSBadge`, `ECSIcon`, `ECSStatus` helpers where available.
- Typography: `ECS_TEXT`, `TYPO`, `ECSText` components, `ecsTypographyTokens`.
- Modals/popups: current `renderMapPopup` wrapper should be either reused or replaced with existing `TacticalPopupShell`/`ECSModalShell` patterns if the codebase has already standardized those surfaces.
- Theme: `TACTICAL`, `ECS`, `GOLD_RAIL`, `ECS_SURFACE`, `ecsStatusTokens`. Avoid new raw hex colors in changed Navigate UI.

## Existing Map / Route / Offline Services

- Map rendering and event bridge: `components/navigate/MapRenderer.tsx`.
- Road search/routing: `lib/useRoadNavigation.ts`, `lib/mapboxRoadNavigation.ts`.
- Active route session persistence: `lib/roadNavigationStore.ts`, `lib/navigateRouteSessionStore.ts`.
- Route/run storage: `lib/routeStore.ts`, `lib/runStore.ts`, `lib/savedRouteAssets.ts`.
- Offline tiles: `lib/tileCacheStore.ts`, `lib/routeTileCacheEngine.ts`, `components/navigate/RouteTileCacheCard.tsx`.
- Offline routes: `lib/offlineRouteCacheService.ts`.
- Offline readiness presentation: `lib/offlineCacheAwarenessEngine.ts`, `lib/offlineReadinessPresentation.ts`, `lib/startGuidanceReadinessPresentation.ts`.
- Campsite/trail discovery: `lib/campsiteCandidateEngine.ts`, `lib/campsites/*`, `components/navigate/CampsiteCandidatePanel.tsx`, `components/navigate/CampIntelMarkerLayer.tsx`.

## Background Sync Reality

- Current implementation supports app-process continuation only. The sync job/progress state lives in `offlineTileSyncCoordinator.ts`, and the tile download loop/cancellation state lives in JS module scope in `tileCacheStore.ts`.
- There is no inspected Android/iOS OS-level background download task, background fetch registration, WorkManager job, or Expo TaskManager job for offline tile sync.
- Product copy should say "continues while ECS stays open/active" unless true native background sync is added later.

## Final Implemented Changes

- Road Preview now anchors from the bottom-left usable map/body area on phone, tablet, and wide layouts. The tablet-centered preview breakpoint was removed, while existing shell, CommandDock, and safe-area clearance remain in use.
- Road Preview quick actions are text-first and accessible: `DRAW AREA` for campsite/trail area search and `BUILD ROUTE` for freehand route building. The ambiguous Build Route icon path was removed from the quick action.
- Broken Road Preview route-step behavior is disconnected for this pass. `View Route Steps` is hidden, the hidden route-step overlay is not mounted behind Road Preview, stale step-expanded state is closed during preview, and the top-left route tab is suppressed.
- Offline tile sync is owned by `offlineTileSyncCoordinator.ts`, not by the mounted Offline Cache popup. Closing the popup no longer cancels active app-process sync jobs; explicit cancel still cancels.
- Root-level `OfflineSyncStatusChip` exposes active/completed sync state outside Offline Cache without duplicating ECS shell banners.
- Offline Cache now includes a `Downloaded Syncs` section below Sync Current View. It lists persisted offline route records and completed current-view tile regions using the Explore Hidden Gems route-card hierarchy.
- Active Guidance no longer shows repeated user-facing `TRAIL AUTO-PAUSED (STATIONARY)` noise, while internal movement and pause state remain intact.
- Campsite/draw search now uses tiered score fallbacks: preferred `>= 70`, good `>= 60`, possible `>= 55`, and limited confidence `>= 50`. Explicit safety/legal/access exclusions still win over score fallback.
- Build Route now has a separate freehand route mode where each pointer-down/pointer-up stroke becomes one segment. Camp Search polygon mode and Build Route mode clear/disable each other to prevent conflicts.
- On pointer-up, Build Route stores both raw and snapped segment geometry plus snap status/source/confidence. It snaps to local routeable road/trail/path geometry when confidence is sufficient and keeps a smoothed raw segment on low-confidence, ambiguous, too-short, or no-match strokes.
- Build Route undo removes only the latest segment, restores previous snapped/raw segment metadata, and returns the drawing anchor to the previous segment endpoint. Clear All remains the full draft reset.
- Build Route controls are compact, text-first, ECS tactical, and bottom-left aligned using the same map-safe clearance family as Road Preview. The strip rises above Road Preview when both are visible.
- Final release notes were added at `docs/navigate-first-pass-bugfix-release-notes.md`.

## Final QA Status

- Focused Navigate regression scripts passed:
  - `npm run test:navigate-road-preview-layout`
  - `npm run test:navigate-active-guidance`
  - `npm run test:offline-sync-coordinator`
  - `npm run test:offline-readiness`
  - `npm run test:campsite-viability`
  - `npm run test:campsite-locator`
  - `npm run test:campsite-renderer`
  - `npm run test:campsite-navigation`
  - `npm run test:route-builder-snapping`
  - `npm run test:route-builder-undo`
  - `npm run test:route-builder-ux`
  - `npm run test:route-builder-trace-recovery`
  - `npm run test:route-builder-cancel-cleanup`
  - `npm run test:start-guidance-readiness`
  - `npm run test:route-confidence`
  - `npm run test:navigate-import-dedupe`
- Project checks passed:
  - `npx tsc --noEmit --pretty false`
  - `npm run lint`
  - `npm run build`
- `npm run build` exited successfully with Expo web export output. Expo printed `Something prevented Expo from exiting, forcefully exiting now.` after `Exported: dist`, but the command returned exit code 0.
- No dedicated formatting script is defined in `package.json`; no repo formatting check was available to run.

## Test Strategy

- Static/unit regression scripts:
  - `npm run test:navigate-active-guidance`
  - `npm run test:route-builder-snapping`
  - `npm run test:route-builder-ux`
  - `npm run test:route-builder-undo`
  - `npm run test:route-builder-trace-recovery`
  - `npm run test:route-builder-cancel-cleanup`
  - `npm run test:campsite-locator`
  - `npm run test:campsite-viability`
  - `npm run test:campsite-renderer`
  - `npm run test:campsite-navigation`
  - `npm run test:offline-readiness`
  - `npm run test:offline-sync-coordinator`
  - `npm run test:start-guidance-readiness`
  - `npm run test:route-confidence`
- Add focused tests for:
  - Road Preview left anchoring/step action visibility by static component assertions if no renderer test harness exists.
  - Offline sync coordinator persistence after `OfflineCacheModal` unmounts.
  - Downloaded offline current-view/region visibility from `tileCacheStore.getRegions()` and route visibility from `listOfflineCachedRoutes()` when route-specific sync is added.
  - Trail auto-pause toast suppression while internal paused state remains intact.
  - Campsite relaxed fallback accepting missing inferred non-safety scores while rejecting explicit unsafe legal/access scores.
  - Campsite tier fallback cases: preferred candidates, good-only candidates, possible-only candidates, limited-confidence-only candidates, and truly unsafe/no-safe candidates.
  - Build Route one-stroke-per-segment and undo restoring the previous endpoint.
- Manual/device QA:
  - Road Preview alignment pass: phone, tablet, and desktop/wide should all anchor the preview card from the bottom-left usable map/app body, with existing bottom safe-area and CommandDock clearance preserved.
  - Confirm tablet no longer uses a bottom-middle/centered Road Preview placement.
  - Confirm phone still looks like the previous good layout: bottom safe position, responsive width, no vertical overflow.
  - Confirm desktop/wide uses the same bottom-left rule and does not introduce a centered breakpoint.
  - Confirm `DRAW AREA` and `BUILD ROUTE` are readable on phone, tablet, and desktop/wide; no ambiguous route-building icon remains in the quick action.
  - Confirm screen-reader labels announce `Draw area to search for campsites` and `Build a route`.
  - Confirm no duplicated top/bottom ECS shell chrome, no overlap with CommandDock/compass, and no critical map controls are covered beyond the existing defined safe zones.
  - Confirm Active Guidance still uses its existing placement and has no visual regression.
  - Open Offline Cache, start current-view sync, close popup, confirm visible progress elsewhere, reopen popup, confirm same job progress, completion indicator, and saved/downloaded route/region visibility.
  - Active trail guidance while stationary: no repeated auto-pause toast.
  - Draw campsite area in California and verify fallback candidates appear when safe.
  - In the campsite panel, verify lower-tier candidates are labeled clearly as Good, Possible, or Limited rather than high-confidence results.
  - Build Route: draw multiple strokes, finger-lift snap, undo only last segment, retrace from previous endpoint.
- Final checks after implementation:
  - `npm run lint`
  - `npm run build` if the pass touches cross-platform rendering or TS module boundaries.

## Old / Orphaned Route-Step Or Tab Pieces To Remove Or Disconnect

- `RoadNavigationOverlay.StepList` is disconnected for this pass and should remain off until there is a proper ECS sheet for useful route steps.
- `previewContext.showSteps` assignments in `app/(tabs)/navigate.tsx` are now false for Road Preview/hybrid preview contexts, and `stepListLabel` is not advertised.
- `roadNavigation.stepListExpanded` is forced closed during Road Preview so stale state cannot reveal a hidden route panel.
- The top-left `routeIndicatorBadge` is suppressed during Road Preview. Keep route state visible in the Road Preview or Active Guidance cards instead.
