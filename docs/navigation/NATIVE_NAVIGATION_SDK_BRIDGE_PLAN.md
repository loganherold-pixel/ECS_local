# Native Navigation SDK Bridge Plan

Audit date: 2026-06-22

Scope: investigation and plan only. No native Mapbox Navigation SDK dependency was added.

## Recommendation

Do not replace the current React Native Directions API plus ECS guidance controller path yet.

ECS can support a future native Mapbox Navigation SDK bridge, especially on Android, but the repo does not currently contain a Mapbox Navigation SDK dependency, native bridge module, or iOS native project. The safest next step is a feature-flagged Android proof-of-life bridge that emits native navigation state into the existing `EcsGuidanceRoute` and `EcsActiveGuidanceProgress` contracts. The current app-level guidance path should remain the production path until native route progress, reroute, route line, and no-network behavior are proven with Android evidence.

## Current ECS Architecture

| Area | Finding | Evidence |
| --- | --- | --- |
| Expo managed | Partially. ECS uses Expo SDK 54, `expo-router`, `app.json`, config plugins, EAS profiles, and Expo prebuild conventions. | `package.json`, `app.json`, `app.config.js`, `eas.json` |
| Expo Go compatibility | Native Mapbox maps are not Expo Go-compatible. ECS already documents that `@rnmapbox/maps` requires a development/EAS/local native build. | `docs/mapbox-native-convoy-command.md` |
| Expo dev client | EAS has a `development` profile with `"developmentClient": true`, but `expo-dev-client` is not installed in `package.json`. Treat current local native builds as Expo prebuild/run builds, not a guaranteed dev-client package. | `eas.json`, `npm ls expo-dev-client` |
| Bare React Native | Not a classic bare app. The repo has a checked-in Android project, but the app still uses Expo config/plugins and Expo CLI entry resolution. | `android/`, `android/app/build.gradle` |
| Android native module support | Yes. Android native code exists for Android Auto and the app has a checked-in Gradle project. A native navigation bridge is technically feasible on Android without ejecting, using Expo prebuild/config-plugin style wiring. | `android/app/src/main/java`, `plugins/android-auto` |
| iOS native module support | Partial. A CarPlay config plugin and Swift sources exist, but there is no checked-in `ios/` directory. iOS bridge work would need Expo prebuild/EAS plus native dependency wiring through a config plugin or generated Xcode project. | `plugins/carplay`, no `ios/` directory |
| React Native architecture | New Architecture and Hermes are enabled. Any native bridge should be tested under RN 0.81/Expo 54 with the new architecture enabled. | `app.json`, `android/gradle.properties` |

## Current Mapbox Native State

Installed or configured:

- `@rnmapbox/maps@10.3.1` is installed.
- `@rnmapbox/maps` Expo config plugin is present in `app.json`.
- Android Gradle already includes the Mapbox downloads Maven repository and reads `MAPBOX_DOWNLOADS_TOKEN`.
- Runtime token handling is guarded through `lib/mapbox/mapboxConfig.ts` and `lib/mapbox/rnMapboxModule.ts`.
- Android and iOS location permission strings are already present.

Not installed:

- No `com.mapbox.navigationcore:*` Android dependency was found.
- No `MapboxNavigation`, `RouteProgressObserver`, `OffRouteObserver`, `RerouteStateObserver`, or `RoutesObserver` usage was found.
- No iOS Mapbox Navigation SDK dependency was found.
- No React Native/Expo bridge module exists for native navigation state.

Conclusion: ECS has native Mapbox Maps support, but not native Mapbox Navigation SDK support.

## Feasibility

### Android

Android is feasible as a phased bridge because ECS already has:

- A checked-in Android Gradle project.
- Kotlin native code.
- Android Auto native code and manifest wiring.
- Mapbox downloads repository configuration.
- Android as the primary QA target.

Android is still not ready for immediate production integration because adding the Navigation SDK would introduce new native artifacts, lifecycle responsibilities, foreground-service/notification behavior, and a second route-progress authority. That needs a feature flag and dedicated QA.

### iOS

iOS is feasible later, but higher-friction right now because:

- The repo does not contain a generated `ios/` project.
- Mapbox Navigation SDK v3 for iOS requires native dependency setup and Mapbox download credentials outside source control.
- CarPlay plugin code exists, but it is not proof that a native navigation bridge is currently building in a checked-in iOS target.

Use Android-first bridge validation before building the iOS equivalent.

## Keep Current Path For Now

Until a bridge exists and passes Android evidence collection, keep:

- `lib/mapboxRoadNavigation.ts` for Directions API route requests.
- `lib/navigation/ecsGuidanceModel.ts` for normalized route/step data.
- `lib/navigation/ecsActiveGuidanceController.ts` for app-level progress/off-route/reroute state.
- `lib/useRoadNavigation.ts` as the active road-navigation session owner.
- `components/navigate/RoadNavigationOverlay.tsx` and `lib/activeGuidanceDirections.ts` as the UI/dropdown consumers.
- `components/navigate/MapRenderer.tsx` and `@rnmapbox/maps` for map rendering.

Native bridge work must feed these contracts first instead of replacing the UI, route line, or tab architecture.

## Phased Bridge Plan

### Phase 0: Decision Gate

Goal: approve a contained Android spike before adding dependencies.

- Confirm Mapbox Navigation SDK version compatible with Expo SDK 54, RN 0.81, Android Gradle plugin, Kotlin version, and `@rnmapbox/maps` native Maps SDK version.
- Confirm Mapbox billing/product implications for Navigation SDK active guidance, voice, offline routing, and Android Auto.
- Confirm fieldtest build secrets include `MAPBOX_DOWNLOADS_TOKEN` with Downloads:Read scope and that public runtime tokens remain `pk.*`.
- Add a feature flag such as `EXPO_PUBLIC_ECS_NATIVE_NAVIGATION_BRIDGE=android_spike`.
- Keep the current ECS guidance controller as the fallback and default.

### Phase 1: Android Native Module Skeleton

Goal: prove ECS can start, stop, and observe a native navigation session without changing the visible UI.

Proposed native surface:

```ts
type EcsNativeNavigationBridgeStatus =
  | 'unavailable'
  | 'idle'
  | 'initializing'
  | 'ready'
  | 'active'
  | 'stopped'
  | 'error';

type EcsNativeNavigationEvent =
  | 'ecsNativeNavigationStatus'
  | 'ecsNativeRouteProgress'
  | 'ecsNativeManeuver'
  | 'ecsNativeTripProgress'
  | 'ecsNativeOffRoute'
  | 'ecsNativeRerouteState'
  | 'ecsNativeRoutesChanged'
  | 'ecsNativeVoiceInstruction'
  | 'ecsNativeRouteLine';
```

Bridge methods:

- `isNativeNavigationAvailable()`
- `initializeNativeNavigation(options)`
- `startNativeGuidance(routeRequest | routeId)`
- `stopNativeGuidance()`
- `setNativeRoutes(routes)`
- `setRerouteEnabled(enabled)`
- `disposeNativeNavigation()`

Rules:

- The bridge must emit plain JSON only.
- The JS layer must validate every native event before updating ECS state.
- Failure must return to `summary_only` or app-level `turn_by_turn`, not blank UI.
- No native package should be enabled in production until Android QA proves parity.

### Phase 2: Route Progress Observer

Goal: map native route progress into `EcsActiveGuidanceProgress`.

Native event fields:

- `routeId`
- `routeUuid`
- `rerouteGeneration`
- `currentLegIndex`
- `currentStepIndex`
- `distanceToNextManeuverMeters`
- `distanceRemainingMeters`
- `durationRemainingSeconds`
- `distanceFromRouteMeters`
- `confidence`
- `updatedAt`

JS adapter:

- Add `lib/navigation/nativeNavigationProgressAdapter.ts`.
- Convert native progress into the existing ECS progress shape.
- Reject events when route id or generation does not match the active route.
- Keep existing ETA/mileage display unchanged.

### Phase 3: Maneuver Instructions

Goal: source current and upcoming maneuvers from native SDK output without exposing raw native response shape to UI.

Native event fields:

- `instruction`
- `shortInstruction`
- `maneuverType`
- `maneuverModifier`
- `roadName`
- `displayRoadName`
- `distanceMeters`
- `durationSeconds`
- `bannerInstructions`
- `voiceInstructions`

Rules:

- Reuse `EcsGuidanceStep`.
- Preserve unnamed-road fallback.
- Never render `null`, `undefined`, or blank names.
- Keep the current dropdown refresh rules tied to `routeId` and `rerouteGeneration`.

### Phase 4: Trip Progress

Goal: compare native trip progress with current ECS summary calculations.

Native event fields:

- `distanceRemainingMeters`
- `durationRemainingSeconds`
- `etaIso`
- `fractionTraveled`
- `routeDistanceMeters`
- `routeDurationSeconds`

Rules:

- ECS UI keeps showing miles remaining, ETA, and time remaining.
- During the spike, log divergence between native and app-level calculations in dev diagnostics.
- Promote native trip progress only after Android evidence shows stable values through route start, step advancement, reroute, and restore.

### Phase 5: Off-Route And Reroute Observers

Goal: let native SDK detect off-route/reroute while ECS remains honest and recoverable.

Native events:

- `offRoute: boolean`
- `rerouteState`
- `rerouteFailureReason`
- `rerouteGeneration`
- `routesChanged`

Rules:

- Native off-route should map into ECS statuses: `on_route`, `off_route_candidate`, `off_route_confirmed`, `rerouting`, `reroute_failed`, `reroute_applied`.
- Keep the old route visible while rerouting.
- On reroute success, replace route geometry, steps, progress, and dropdown together.
- On reroute failure, preserve the previous route and show "Unable to recalculate route" plus "Return to the highlighted route when safe".
- Do not mix native and app-level reroute results for one active route generation.

### Phase 6: Route Line Updates

Goal: keep the visible line, active card, and dropdown synchronized.

Options:

1. Keep React Native `@rnmapbox/maps` rendering and feed it native route geometry events.
2. Later, if needed, expose native route-line styling results, but only if it does not fight the existing RN Mapbox map.

Rules:

- `MapRenderer` remains the visible map owner during the first bridge phase.
- Native route-line events must include `routeId`, `rerouteGeneration`, and geometry fingerprint.
- Camera behavior remains controlled by the existing ECS follow/manual-explore logic.
- No native route-line overlay should be added until it can prove it will not double-render with the current route source/layer.

### Phase 7: Voice Instructions

Goal: evaluate native voice prompts without disrupting ECS audio/Android Auto behavior.

Plan:

- Start with emitted voice instruction metadata only; do not auto-play audio in the first bridge phase.
- Add a JS-level setting for voice guidance before enabling playback.
- On Android, verify foreground-service notification behavior and background location implications.
- On iOS, verify silent switch, audio session, and CarPlay expectations before enabling.

### Phase 8: Offline And Predictive Caching Later

Goal: consider native offline routing only after online native guidance is stable.

Rules:

- Current ECS offline packets and restore behavior remain authoritative until native offline routing is proven.
- Offline/predictive cache evidence must distinguish:
  - cached ECS geometry
  - cached Mapbox tiles
  - native offline route calculation
  - unavailable native guidance
- No offline claim should be shown unless produced by real artifacts.

## Migration Requirements If Approved Later

Android:

- Add Navigation SDK dependencies through a config plugin or controlled Gradle edit.
- Add required foreground-service/location/notification permissions as needed.
- Add an `ECSNativeNavigationModule` Kotlin module and event emitter.
- Register the module through Expo Modules or a React Native package compatible with the current new architecture.
- Add unit tests for JS adapters and native event validation.
- Add Android emulator/device QA for route start, maneuver advance, off-route, reroute success/failure, route-line sync, voice metadata, and no-network fallback.

iOS:

- Generate or maintain the iOS native project through Expo prebuild/EAS.
- Add Mapbox Navigation SDK dependency through SPM or CocoaPods according to the chosen Expo/iOS workflow.
- Keep secret download credentials outside source control.
- Add Swift bridge module and event emitter.
- Verify background modes, location permission copy, audio session, and CarPlay interactions.
- Add iOS QA only after Android validates the architecture.

Shared JS:

- Add a native guidance adapter behind a feature flag.
- Keep `EcsGuidanceRoute` and `EcsActiveGuidanceProgress` as the UI-facing contracts.
- Add stale route generation guards to every native event path.
- Extend diagnostics to include native bridge status, native route UUID, observer health, and last native error.
- Preserve summary-only fallback for missing native steps.

## Risks

- Native SDK adds dependency and build complexity to an already Expo-configured app.
- Mapbox Navigation SDK lifecycle can conflict with existing JS-owned GPS, reroute, and route-line state if introduced as a second authority.
- Android foreground-service and notification behavior may affect fieldtest UX.
- iOS bridge work is speculative until the iOS native project is generated and verified.
- Native route line APIs may not compose cleanly with the current RN Mapbox map source/layer ownership.
- Offline native routing could create confusing evidence unless ECS clearly labels which artifact produced the guidance.

## Test And QA Plan

For the current non-native path:

- Continue running `npm run test:turn-by-turn-navigation-qa`.
- Continue running active guidance parser/progress/off-route/dropdown/route-line regression scripts.
- Use `docs/navigation/TURN_BY_TURN_QA.md` for Android manual evidence.

For a future native bridge:

- Add JS adapter tests with mocked native events.
- Add a native availability test that proves production stays on the current guidance path when the bridge is absent.
- Add Android build checks for Mapbox downloads token separation.
- Add Android emulator/device QA for native observer events.
- Add a no-network run proving ECS does not invent native offline guidance when native artifacts are missing.

## Source References

- Mapbox Android Navigation SDK installation: https://docs.mapbox.com/android/navigation/guides/install/
- Mapbox Android route progress: https://docs.mapbox.com/android/navigation/guides/turn-by-turn-navigation/route-progress/
- Mapbox Android route updates and rerouting: https://docs.mapbox.com/android/navigation/guides/turn-by-turn-navigation/rerouting-and-refresh/
- Mapbox Android route line API: https://docs.mapbox.com/android/navigation/guides/ui-components/route-line/
- Mapbox Android maneuver UI: https://docs.mapbox.com/android/navigation/guides/ui-components/maneuver/
- Mapbox iOS Navigation SDK installation: https://docs.mapbox.com/ios/navigation/guides/install/
- Mapbox iOS turn-by-turn navigation: https://docs.mapbox.com/ios/navigation/guides/turn-by-turn-navigation/
- Mapbox iOS rerouting: https://docs.mapbox.com/ios/navigation/guides/turn-by-turn-navigation/rerouting/
- Expo development builds: https://docs.expo.dev/develop/development-builds/introduction/
- Expo custom native code: https://docs.expo.dev/workflow/customizing/
- Expo Continuous Native Generation: https://docs.expo.dev/workflow/continuous-native-generation/
