# GPX Run Detail Offline And Navigation Behavior

This note documents the final GPX Run Detail flow after the offline cache, segment risk, staged-route, navigation, and GPS repairs.

## Entry Points

- GPX/imported-route creation starts in `app/(tabs)/navigate.tsx`.
- Imported runs are persisted through `runStore` and staged as the active run.
- The map route indicator opens `app/navigate-run.tsx` with the active run id.
- Run Detail first loads live/in-memory run data from `runStore`.
- If live run data is missing or has no usable geometry, Run Detail falls back to `lib/offlineRouteCacheService.ts` by offline cache id or source route id.

## Offline Cache

- `lib/offlineRouteCacheService.ts` is the centralized route-data cache service.
- `cacheOfflineRoute(...)` saves route geometry, bounds, source metadata, GPX metadata, run-detail data, waypoints, segment risk data when available, and tile-cache status metadata.
- `offlineCachedRouteToRun(...)` hydrates Run Detail from local cached route data.
- `offlineCachedRouteToRunCacheManifest(...)` converts the centralized cached route record into the `runStore` offline manifest. Run Detail should use this helper rather than rebuilding the manifest inline.
- Map tile regions are cached separately by the existing tile-cache path. Cache messaging distinguishes route-only cache from route-plus-map-area cache.

## Segment Risk

- Segment risk data is computed or loaded in Run Detail.
- The Segment Risk Analysis section opens a React Native `Modal` with `presentationStyle="fullScreen"`.
- The modal owns its own full-screen container and scrollable content, so it is not clipped by the Run Detail panel.
- Closing the modal returns to Run Detail without changing the selected GPX route.

## Route Staged Indicator

- The Navigate tab computes staged-route indicator placement from the active top map control row and any measured top toolbox height.
- The indicator uses the shared `routeIndicatorTopOffset` calculation and should not reintroduce independent hardcoded top positions.
- When a campsite drawing or route-design toolbox is visible, the indicator falls below that toolbox stack.

## Navigate Route

- Pressing `NAVIGATE ROUTE` in Run Detail obtains a one-shot GPS fix with `requestImmediateGpsPosition(...)`.
- Run Detail does not maintain a continuous GPS watcher; the Navigate tab owns live map tracking through `useThrottledGPS(...)`.
- After a valid GPS fix is available, Run Detail upserts the run, marks it active, writes an active route session snapshot, and returns to the Navigate map.
- The Navigate tab builds navigation payloads for GPX and cached GPX routes from stored run geometry.
- GPX and cached GPX payloads set `requiresOnlineRouting: false`, so navigation follows stored geometry and does not require an online routing API.

## User Location Dot

- The Navigate tab uses `useThrottledGPS(...)`, which wraps `useGPSLocation(...)`, as the primary live user-location pipeline.
- `MapRenderer` receives `showUserLocation` and `userLocation` from the Navigate tab and sends coordinates to Mapbox in `[longitude, latitude]` order.
- The user dot is visible when location permission is granted and a valid GPS fix exists.
- During active GPX/cached GPX navigation, the stored route line and user dot remain visible even without online routing.
