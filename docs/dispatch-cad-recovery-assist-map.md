# Dispatch CAD Recovery Assist Map

Date: 2026-04-27

## Scope

This pass covers the Dispatch tab running CAD feed surface cleanup and the planned Recovery action/event flow. This inspection did not change runtime code. The implementation must keep the ECS tactical/global shell, popup, banner, modal, and semantic color rules intact, must not add mock GPS data, and must not start navigation unless the user explicitly taps the recovery navigation action.

## Current Relevant Files

- `app/(tabs)/alert.tsx`
  - Dispatch tab entry point.
  - Renders `Header title="Dispatch Center"` inside the existing `TopoBackground`.
  - Mounts `DispatchCadCommandCenter`.
  - Applies shell bottom clearance with `getShellBottomClearance`; Dispatch should not add its own top or bottom ECS banners.
- `components/dispatch/DispatchCadCommandCenter.tsx`
  - Main CAD command center, running feed, command rail, More action panel, hazard/resource command form, Recovery Assist GPS helper, CAD event rows, event detail modal, and threat map drilldown.
- `components/dispatch/DispatchEventCard.tsx`
  - Separate Dispatch event card component used outside the main CAD feed.
- `components/dispatch/ComposeEventModal.tsx`
  - Existing modal-style compose surface worth checking before adding a dedicated Hazard/Recovery form.
- `components/ECSModalShell.tsx`, `components/ECSModal.tsx`, `components/TacticalPopupShell.tsx`, `components/ui/ECSPopupPanel.tsx`, `components/ui/ECSBottomSheet.tsx`
  - Existing global modal/sheet/popup surface primitives to reuse.
- `lib/theme.ts`
  - ECS, TACTICAL, and GOLD_RAIL tokens already imported by Dispatch.
- `lib/dispatchLiveEvents.ts`
  - `DispatchEvent` type, validation/normalization, labels, sort helpers, live event aggregation shape.
- `lib/dispatchEventStore.ts`
  - In-memory CAD event store with validation, semantic equality, dedupe, append, replace, and subscriptions.
- `lib/dispatchEventDetailPresentation.ts`
  - Normalizes event detail text, coordinates, reference IDs, recovery notes, and labels for `EventDetailModal`.
- `lib/dispatchEventDedupe.ts`
  - Existing dedupe key/signature logic used by `dispatchEventStore`.
- `lib/dispatchPersistenceAdapter.ts`
  - Local-first persisted dispatch state for pings, queue items, assignments, and timeline events. It currently has a TODO for dedicated backend Dispatch tables and does not persist generic `DispatchEvent` CAD feed events.
- `lib/dispatchRealtimeAdapter.ts`
  - Supabase broadcast adapter for `ping_upsert`, `queue_item_upsert`, `assignment_upsert`, `team_member_upsert`, and `timeline_event_added`. It does not currently broadcast generic CAD feed `DispatchEvent` records.
- `lib/dispatchSyncAdapter.ts`, `lib/dispatchOfflineReplayAdapter.ts`
  - Existing retry/offline replay infrastructure for supported dispatch record types.
- `lib/dispatchRoutingAdapter.ts`, `lib/dispatchPermissionAdapter.ts`
  - Team routing/permission helpers to reuse for recovery audience and access checks.
- `lib/teamStore.ts`, `lib/dispatchProfileStore.ts`
  - Current team/member identity and Dispatch profile/rig identity sources.
- `lib/useGPSLocation.ts`, `lib/useThrottledGPS.ts`
  - Shared current GPS hooks. Dispatch currently has its own one-shot `getCurrentPosition` helper.
- `lib/navigationHandoffStore.ts`
  - Existing persisted navigation handoff contract used by Navigate. Current `NavigationHandoffSource` is `search | explore | saved | import`; it has no dispatch/recovery source yet.
- `lib/useRoadNavigation.ts`, `lib/useTrailNavigation.ts`
  - Active guidance hooks. Road navigation exposes preview/start/end/clear/reroute and active session state.
- `lib/roadNavigationStore.ts`, `lib/trailNavigationStore.ts`, `lib/navigateRouteSessionStore.ts`
  - Persisted active/preview route session stores.
- `app/(tabs)/navigate.tsx`
  - Consumes `navigationHandoffStore`, stages previews, and starts road/trail navigation.
- `components/navigate/PinDetailsModal.tsx`, `components/navigate/PinDrawer.tsx`, `components/navigate/PinTypes.ts`, `lib/pinStore.ts`
  - Navigate pin/detail system to evaluate for reuse in recovery event detail.

## Current CAD Feed and Surface Findings

- `DispatchCadCommandCenter` renders the running CAD feed in `styles.feedPanel`.
- `feedPanel`, `liveChip`, event rows, command rail, command buttons, and local action panels use several local `rgba(...)` backgrounds. These do not clearly map to the shared ECS global popup/surface treatment.
- The top "connect/profile/advisory/channel" containers above the feed are also styled locally and should be compared against the global popup/surface interior rules.
- `DispatchActionPanel` is a local absolute-position panel with its own overlay and card styling. It is used by More Actions, command forms, profile setup, and expedition invite. This is a likely source of inconsistent popup/background treatment.
- `EventDetailModal` already uses `ECSModalShell` with `overlayClass="info"`, so it is the cleanest existing pattern inside this file.
- `ThreatDrilldownModal` uses a raw React Native `Modal` and custom full-screen styles. Its map HTML also hard-codes colors inside the Leaflet document. It is functional but should be treated as a legacy/local surface until it is wrapped or replaced with a shared ECS modal/sheet pattern.

### Surface Fix Implemented

- `lib/theme.ts` now exports `ECS_POPUP_SURFACE_DARK`, the shared dark popup surface recipe used by `ECSModalShell`.
- `components/ECSModalShell.tsx` now consumes `ECS_POPUP_SURFACE_DARK` for the dark global modal shell, preserving the existing visual output while making the surface recipe reusable.
- `components/dispatch/DispatchCadCommandCenter.tsx` now imports and applies `ECS_POPUP_SURFACE_DARK` plus `ECSShellTexture` to the CAD feed panel, live/channel chips, advisory strip, and lower command rail.
- The CAD feed panel now uses the same dark popup shell background, gold-tinted border, header background, and divider treatment as the global ECS modal shell.
- The upper channel/status containers and advisory strip now use the same popup shell surface treatment instead of the previous grayed/transparent container backgrounds.
- The lower command rail now behaves as a shared popup/action surface with a shell background, border, texture, and internal tactical controls.
- CAD event data/rendering behavior was intentionally left unchanged in this surface pass.

### Action Row Fix Implemented

- `components/dispatch/DispatchCadCommandCenter.tsx` replaces the lower-row `More` button with a text-only `Recovery` button.
- The `Recovery` button uses the ECS danger semantic token for its border/background/text treatment.
- Pressing `Recovery` calls the existing hazard command path directly with `openCommand('hazard')`.
- The old More menu is not opened from the Dispatch action row.
- Existing `Check In`, `Ping`, `Assist`, and `Rally` actions continue to use their existing command handlers.

### Hazard/Recovery Creation Flow Implemented

- `components/dispatch/DispatchCadCommandCenter.tsx` now opens a dedicated `HazardRecoveryCadEventModal` for the Recovery action.
- The modal uses `ECSModalShell`, not the legacy local `DispatchActionPanel`.
- The form exposes the requested hazard types and defaults to `Recovery`.
- The default editable message is `Recovery assist requested from current GPS position.`
- Changing hazard type updates the generated message while preserving user edits.
- The form displays fixed `Recovery Critical` status instead of exposing normal/high/critical severity choices.
- GPS is acquired only inside `submitCommand` after the user taps `Create CAD Event`.
- GPS failures are shown in the form error state and do not create a CAD event.
- Created hazard/recovery events use critical severity, `recovery_critical` status, `Recovery Critical` priority, the selected hazard title, creator identity, and the captured GPS location.

### GPS Recovery CAD Event Payload Implemented

- `components/dispatch/DispatchCadCommandCenter.tsx` now uses `createRecoveryCadEventFromCurrentGps` for the Recovery form submit path.
- `getCurrentPosition` records current GPS latitude, longitude, accuracy, altitude, heading, timestamp, and `source: current_gps` where the platform provides those values.
- Recovery CAD events now include:
  - `category: recovery_assist` for Recovery type, or `category: hazard_recovery` for other hazard types.
  - Normalized `hazardType` values: `weather`, `terrain`, `trail_blockage`, `water_crossing`, `recovery`, `visibility`, `other`.
  - `teamId`, `sessionId`, and `channelId` from the active team/expedition context when available.
  - Structured location metadata: latitude, longitude, accuracyMeters, altitude, heading, timestamp, and source.
  - Display/detail copy: `Recovery Assist Requested from Current GPS Position`.
- `lib/dispatchLiveEvents.ts` now preserves the structured recovery category, hazard type, team/session/channel IDs, and GPS metadata through validation/normalization.
- `lib/dispatchEventStore.ts` now includes these fields in semantic equality checks so meaningful recovery metadata changes are preserved without causing duplicate no-op updates.
- Generic CAD event backend/team sync is still limited by the existing adapter surface; the event now carries the data required for a sync payload, but the dedicated generic CAD event realtime/persistence path remains a follow-up unless mapped into an existing synced dispatch record type.

### Recovery Critical CAD Feed Rendering Implemented

- `components/dispatch/DispatchCadCommandCenter.tsx` now detects recovery-critical CAD events through `recovery_critical` status, `Recovery Critical` priority, `recovery_assist` category, or `hazard_recovery` category combined with critical severity.
- Recovery-critical feed rows use a dedicated danger-token style so they do not look like normal low-priority CAD items.
- Recovery-critical rows display `Recovery Critical` as the severity/status label.
- Recovery-critical rows display `Recovery Assist Requested from Current GPS Position` and preserve the user message as preview text when it differs.
- Location-bearing recovery events display a compact text-only GPS indicator such as `GPS +/- 12m` or `GPS PIN`.
- Clicking a recovery-critical CAD feed row opens event detail directly instead of opening the older threat drilldown first.
- Normal CAD event rendering and ordering remain on the existing `sortDispatchEvents` path.

### Recovery Critical Event Detail Implemented

- `components/dispatch/DispatchCadCommandCenter.tsx` now renders a `RecoveryAssistPinDetail` block inside the existing `ECSModalShell` event detail when a recovery-critical CAD event is opened.
- The detail view reuses the existing Map Intelligence `ThreatMapSurface`/Leaflet-WebView pin behavior for location-bearing recovery events, so the CAD event detail shows the same pin/drop context without sending the user through the older full-screen threat drilldown.
- If a recovery event is missing valid coordinates, the detail shows a clear `Pin location unavailable` fallback instead of a hidden or transparent map container.
- The detail shows recovery-critical status, hazard type, coordinates, accuracy, GPS fix timestamp, and GPS source where available.
- `Ping Threat`, `Mark Hazard`, and `Request Assist` are preserved in the recovery event detail and continue to use the existing threat action creation path.
- A red ECS danger-token primary action labeled `Navigate Assist` is visible in the detail, but it currently only fires the explicit button handler. Opening a recovery event does not auto-start or stage navigation.
- The older `Map Drilldown` button is suppressed for recovery-critical detail because the pin is displayed inline; normal non-recovery threat events can still open the existing drilldown.

### Navigate Assist Action Implemented

- `Navigate Assist` now validates the recovery CAD event GPS coordinate and refuses to continue with a clear error when the event has no valid location.
- Dispatch builds a dedicated navigation handoff payload with:
  - `source: dispatch`
  - `routeSource: dispatch_recovery`
  - `navigationMode: recovery_assist`
  - `recoveryAssistEventId` / `dispatchEventId`
  - GPS accuracy and timestamp metadata when available.
- The button saves the handoff, stages a Navigate flow with `autoStartNavigation: true`, closes the event detail, and transitions to Navigate.
- `lib/navigationHandoffStore.ts` and `lib/mapboxRoadNavigation.ts` now recognize `dispatch` / `dispatch_recovery` as a first-class road destination source.
- `app/(tabs)/navigate.tsx` only auto-starts navigation for explicit recovery-assist handoffs with `autoStartNavigation: true`.
- Navigate replaces any current road preview/active route through the existing road preview/start path, ends active trail guidance for the recovery assist handoff, and starts road guidance after the route preview is successfully built.
- Route calculation failures stay visible in Navigate as `RECOVERY ASSIST ROUTE UNAVAILABLE`; opening or merely viewing a recovery event still does not auto-start navigation.

## Current Action Row and More Menu

- The lower action row now renders `Check In`, `Ping`, `Assist`, `Rally`, and `Recovery`.
- `Recovery` is text-only, uses the existing ECS danger/recovery semantic token, and opens the existing hazard CAD event form directly.
- The action row no longer opens `MoreActionsModal`.
- `MoreActionsModal` still exists in the file for now but is disconnected from the Dispatch lower action row.
- Previous behavior before this pass: `More` opened `MoreActionsModal`.
- `MoreActionsModal` contains:
  - `Recovery Assist`: immediately attempts GPS capture and creates a recovery event.
  - `Hazard`: opens the existing hazard CAD event form.
  - `Resource`: opens the resource form.

## Current Hazard/Recovery Creation Flow

- `CommandFormState` already includes `hazardType` with the requested values:
  - Weather
  - Terrain
  - Trail Blockage
  - Water Crossing
  - Recovery
  - Visibility
  - Other
- `DispatchCommandModal` renders hazard type options when `command === 'hazard'`.
- The current hazard form uses the local `DispatchActionPanel`, not `ECSModalShell`.
- Current hazard event creation:
  - Does not capture GPS.
  - Does not force `Recovery Critical`.
  - Uses user-selected severity (`normal`, `high`, `critical`).
  - Builds titles as `${hazardType} Hazard`, which makes `Recovery` become `Recovery Hazard` instead of the requested `Recovery Assist`.
  - Maps `Weather` to `weather`, `Recovery` to `recovery`, and all other hazard types to `terrain`.
- Current validation requires a message, but no default hazard/recovery message is prefilled.

## Current GPS/Location Capture

- `DispatchCadCommandCenter` has a local one-shot GPS path:
  - `getCurrentPosition()`
  - `validateRecoveryGpsFix()`
  - `RecoveryAssistGpsFix`
- The helper uses browser geolocation on web and `expo-location` on native with foreground permission and `BestForNavigation` accuracy.
- It rejects missing/invalid coordinates, `0,0`, missing timestamp, and fixes older than 30 seconds.
- Current structured recovery event location only stores:
  - `location.latitude`
  - `location.longitude`
- Accuracy, fix age, and notes are embedded in message/details/recoveryNotes text, not structured event metadata.
- The shared `useGPSLocation` hook already normalizes latitude, longitude, altitude, heading, accuracy, timestamp, live status, refresh, retry, and permission denied state. It is a better long-term GPS source, but the create action needs a one-shot current-position service function so event creation is not tied to a mounted hook.

## Current Recovery Assist Event Creation

- `handleRecoveryAssist` currently lives in `DispatchCadCommandCenter`.
- It prevents double-submit with `recoveryAssistSubmittingRef`.
- It captures GPS immediately, calls `createRecoveryAssistEvent`, appends to `dispatchEventStore`, closes More, and shows a toast.
- `createRecoveryAssistEvent` creates:
  - `type: 'recovery'`
  - `severity: 'critical'`
  - `title: 'Recovery Assist'`
  - `status: 'active'`
  - `priority: 'critical'`
  - `cadReferenceId: RA-...`
  - `dedupeKey` based on recovery assist, actor, and coordinate fingerprint
  - `requiresMapDrilldown: true`
  - `createdBy`, `rig`, and `location`
- Gaps against the requested CAD event:
  - No `hazardType` field.
  - No category such as `recovery_assist` or `hazard_recovery`.
  - No structured `accuracyMeters`, altitude, heading, location timestamp, or `source: current_gps`.
  - No team/session/channel ID on the generic CAD event.
  - Display copy is close but should be standardized as "Recovery Assist Requested from Current GPS Position".
  - The direct action bypasses editable hazard/message selection.

## Current CAD Event Rendering

- CAD feed rows are rendered by `EventRow` inside `DispatchCadCommandCenter`.
- Any `severity === 'critical'` event gets `styles.eventRowCritical`.
- The critical style is generic; there is no recovery-critical branch.
- `getDispatchSeverityLabel(event.severity)` currently produces generic critical labeling. A recovery event still shows generic severity rather than "Recovery Critical".
- Event rows show title, message, created time, source/type, sender/rig, status, and a `DRILLDOWN` hint when map drilldown is possible.
- Rows are clickable. Threat/recovery events with a resolvable location open the threat drilldown first; otherwise they open the detail modal.
- Current location/accuracy indicator is weak because accuracy is not structured.

## Current Event Detail and Map Pin Behavior

- `EventDetailModal` uses `ECSModalShell` and `createDispatchEventDetailPresentation`.
- It shows coordinates when `normalizeDispatchEventCoordinates` can find them.
- It shows recovery notes, action buttons, and `Map Drilldown` for map-drilldown-capable events.
- It does not render a red `Navigate Assist` primary action.
- `ThreatDrilldownModal` and `ThreatMapSurface` implement the current Map Intelligence-style pin behavior:
  - Pulls coordinates from event location or route segment midpoint.
  - Renders Leaflet map HTML on web/native WebView where available.
  - Shows lower actions: `Ping Threat`, `Mark Hazard`, `Request Assist`, and Event Detail.
- The lower actions are already implemented as `ThreatActionId` handlers:
  - `ping_threat`
  - `mark_hazard`
  - `request_assist`
- These actions currently create follow-up events through `createEventFromThreatAction`.
- The requested detail view should preserve these lower actions while adding a visually dominant red `Navigate Assist` action.

## Current Navigation/Active Route Services

- Navigate uses `navigationHandoffStore` to persist and restore handoff payloads.
- `app/(tabs)/navigate.tsx` loads handoff payloads and stages road/trail preview through `applyExploreNavigationPayload`.
- Road guidance is controlled through `useRoadNavigation`:
  - `previewDestination(destination, createdFrom)`
  - `startNavigation()`
  - `endNavigation()`
  - `clearDestination()`
  - `reroute()`
- Trail guidance is controlled through `useTrailNavigation`.
- `NavigationHandoffSource` does not currently include `dispatch` or `recovery_assist`.
- `NavigationRouteSource` does not currently include `dispatch_recovery` or similar.
- The current handoff flow stages previews; the requested `Navigate Assist` needs an explicit route-start/override path after the user taps the red button.
- Proposed direction:
  - Add or reuse a shared recovery navigation action that validates event coordinates, ends/replaces any active route, builds/stages a route to the event pin, and starts guidance only after explicit user confirmation/tap.
  - Extend route metadata with `mode: 'recovery_assist'` and `eventId` if the active route state supports it.
  - Avoid auto-starting from event creation or event open.

## Current Team/CAD Event Store and Sync

- `dispatchEventStore` is an in-memory generic CAD event store with validation, dedupe, append, replace, and subscription.
- Existing live/system events are built from local adapters and merged into the store.
- `dispatchPersistenceAdapter` persists pings, queue items, assignments, and timeline events per expedition. It does not persist generic CAD `DispatchEvent` records.
- `dispatchRealtimeAdapter` broadcasts pings, queue items, assignments, team members, and timeline events. It does not broadcast generic CAD feed events.
- `dispatchSyncAdapter` and offline replay appear aligned with the same dispatch record types, not generic recovery CAD events.
- Therefore, a new recovery-critical CAD event currently appears to the creator locally, but generic team/session propagation is not guaranteed from the existing `DispatchEvent` path.
- The implementation must either:
  - Add a generic CAD event sync/persistence payload to the existing Dispatch adapters, or
  - Represent recovery-critical CAD events through an existing team-synced record type while still rendering them in the CAD feed.
- Permissions/access must be handled before exposing GPS coordinates to team/session members.

## Proposed File Changes

1. `components/dispatch/DispatchCadCommandCenter.tsx`
   - Replace action row `More` with a no-icon `Recovery` button.
   - Use existing critical/danger semantic button styling based on `TACTICAL.danger` or a shared button variant if one exists.
   - Open a hazard/recovery form directly.
   - Move recovery event creation out of the old More immediate-submit path.
   - Render recovery-critical feed rows with explicit "Recovery Critical" labeling and GPS/accuracy metadata where available.
   - Add a red primary `Navigate Assist` action in recovery event detail only.
   - Preserve `Ping Threat`, `Mark Hazard`, and `Request Assist`.
   - Prefer `ECSModalShell` or the existing global popup/sheet primitive over `DispatchActionPanel` for the recovery form and detail.
2. `components/dispatch/HazardRecoveryCadEventForm.tsx` (new, if extraction is cleaner than extending the existing command modal)
   - Dedicated form for hazard type selection, editable message, create/cancel, GPS acquisition state, and errors.
   - Reuse ECS global modal/sheet surface and tactical field/button styles.
3. `lib/dispatchRecoveryCadEvent.ts` (new pure helper recommended)
   - Map hazard types to titles.
   - Build default message.
   - Normalize structured GPS fix metadata.
   - Create `recovery_critical`/recovery CAD event payload.
   - Generate stable idempotency/dedupe keys.
4. `lib/dispatchLiveEvents.ts`
   - Extend `DispatchEvent` with optional structured fields:
     - `category?: 'recovery_assist' | 'hazard_recovery'`
     - `hazardType?: 'weather' | 'terrain' | 'trail_blockage' | 'water_crossing' | 'recovery' | 'visibility' | 'other'`
     - `location.accuracyMeters?`
     - `location.altitude?`
     - `location.heading?`
     - `location.timestamp?`
     - `location.source?: 'current_gps' | 'last_known_gps'`
     - `teamId/sessionId/channelId` if existing team/session context supports it
     - `syncStatus?: 'local' | 'pending' | 'synced' | 'failed'`
   - Keep validation strict for coordinates and timestamps.
   - Add/reuse label helper for "Recovery Critical" when event category/severity indicates recovery critical.
5. `lib/dispatchEventDetailPresentation.ts`
   - Surface structured accuracy/timestamp/staleness/source text.
   - Preserve coordinate normalization.
6. `lib/dispatchEventStore.ts`
   - Preserve existing dedupe/equality behavior.
   - Include new structured recovery location/team fields in semantic signatures so updates are stable but meaningful.
7. `lib/dispatchPersistenceAdapter.ts`, `lib/dispatchRealtimeAdapter.ts`, `lib/dispatchSyncAdapter.ts`
   - Add a team/session-safe generic CAD event upsert/broadcast path, or document/implement an approved mapping into existing synced dispatch records.
   - Include pending/failed sync status and retry without duplicate event creation.
8. `lib/dispatchPermissionAdapter.ts`, `lib/dispatchRoutingAdapter.ts`
   - Verify authorized team/session audience before broadcasting or revealing location-bearing recovery events.
9. `lib/navigationHandoffStore.ts`
   - Add a dispatch/recovery source or route metadata convention if handoff is used.
   - Include `eventId`, `mode: 'recovery_assist'`, target coordinate, and route title.
10. `app/(tabs)/navigate.tsx`
   - Consume recovery-assist handoff/action and replace active navigation only after `Navigate Assist` is tapped.
   - Ensure active route metadata is visible to Dashboard Route Progress if that integration is present.
11. Tests/scripts
   - Add focused unit tests for recovery event payload creation, GPS validation/failure, event rendering labels, dedupe, team payload, and navigation handoff.

## Surface/Style Components and Tokens to Reuse

- `ECSModalShell` for recovery form and event detail where possible.
- Existing app shell from `app/(tabs)/alert.tsx`: `TopoBackground`, `Header`, and shell bottom clearance.
- `TACTICAL` and `ECS` semantic tokens from `lib/theme.ts`.
- Existing `TACTICAL.danger`/critical semantics for Recovery button, Recovery Critical status, and Navigate Assist.
- Existing button, chip, badge, and modal styles from ECS global/tactical components before adding new local style objects.
- Avoid new raw hex/rgba colors in Dispatch-specific code unless refactoring an existing local style into a token-backed shared style.

## Risks and Unknowns

- Generic `DispatchEvent` records are currently in-memory only; team/session propagation for recovery CAD events requires adapter work.
- There is no obvious backend table/migration for generic CAD events. `dispatchPersistenceAdapter` explicitly notes a TODO for dedicated Dispatch backend tables.
- Existing threat map drilldown uses local full-screen modal styling and hard-coded Leaflet HTML colors. Reuse it cautiously or wrap it in the global ECS modal/sheet system.
- Current `NavigationHandoffSource` does not include Dispatch, and Navigate handoff generally stages previews. Starting guidance directly for recovery assist likely needs a deliberate extension.
- Current recovery event only structures latitude/longitude; accuracy and freshness are text-only. This must be normalized before team members depend on the pin.
- The old More menu may still be useful elsewhere, but the Dispatch lower action row should no longer open it.
- Location permission behavior differs by web/native/iPad runtime. No mock fallback should be added.

## Test Strategy

Automated tests to add or update:

- Recovery form:
  - Opens from the action row Recovery button.
  - Renders all hazard types.
  - Prefills editable default message.
  - Blocks creation without valid hazard type or GPS result.
  - Prevents double-submit while GPS acquisition is pending.
- GPS/event creation:
  - Successful current GPS event includes structured latitude, longitude, accuracy, timestamp, source, creator, and team/session IDs where available.
  - Permission denied, timeout, unavailable, and invalid `0,0` coordinates show errors and do not create events.
  - Event id/dedupe key prevents duplicate retries/double taps.
- CAD feed:
  - Recovery critical events render with "Recovery Assist Requested from Current GPS Position".
  - Severity/status displays "Recovery Critical".
  - Title maps correctly for every hazard type.
  - Normal CAD events are unaffected.
  - Event row click opens the detail/pin view.
- Event detail:
  - Valid GPS shows pin/coordinates/accuracy/timestamp.
  - Missing or stale/low-accuracy location shows safe fallback text.
  - `Ping Threat`, `Mark Hazard`, and `Request Assist` remain visible and receive current event context.
  - `Navigate Assist` is visible and red/critical styled.
- Navigation:
  - `Navigate Assist` with valid coordinates starts/overrides guidance after explicit tap.
  - Existing active route is replaced.
  - Invalid/missing coordinates show failure state.
  - Route calculation failure is handled clearly.
  - Active route metadata includes recovery assist/event ID where possible.
- Team/session:
  - Creator sees local event immediately.
  - Authorized team receiver can render event and location.
  - Unauthorized context does not expose coordinates.
  - Pending/failed sync status is visible.
  - Retry does not duplicate events.
- Surface/regression:
  - CAD feed, upper containers, lower action row, recovery form, and event detail use ECS global/tactical surfaces.
  - No duplicate top/bottom banners.
  - No one-off transparent containers.

Existing scripts to run during implementation QA where relevant:

- `npm run test:dispatch-helpers`
- `npm run test:dispatch-live`
- `npm run test:dispatch-scenarios`
- `npm run test:dispatch-profile-setup`
- `npm run test:dispatch-event-detail`
- `npm run test:dispatch-action-dedupe`
- `npm run test:dispatch-action-row-recovery`
- `npm run test:dispatch-hazard-recovery-flow`
- `npm run test:dispatch-recovery-critical-feed`
- `npm run test:dispatch-expedition-create`
- `npm run test:dispatch-connectivity-state`
- `npm run lint`

Manual QA checklist for implementation pass:

- Dispatch running CAD feed interior background matches ECS global popup surface.
- Upper grayed-out containers match ECS global popup/surface treatment.
- Bottom action container/buttons match ECS global popup/action surface treatment.
- Action row shows Check-In, Ping, Assist, Rally, Recovery.
- Recovery button is red/critical styled and has no icon.
- Recovery opens the hazard/recovery form, not the old More menu.
- Hazard types are selectable and message is editable.
- Create CAD Event captures current GPS only on submit.
- GPS unavailable/permission denied shows a clear error and creates no fake location event.
- New event appears immediately as Recovery Critical.
- Event title matches selected hazard type.
- Event detail shows pin/drop location or safe unavailable state.
- Ping Threat, Mark Hazard, and Request Assist remain accessible.
- Navigate Assist starts route guidance only after tap and replaces current route.
- Team/session visibility follows existing permissions and sync status is honest.

Surface pass manual QA notes:

- Verify the Dispatch channel chips above the feed sit on the same textured popup surface as the feed interior.
- Verify the ECS Advisory strip, when present, uses the same popup surface and keeps amber advisory text readable.
- Verify the command rail has a visible ECS popup/action container surface behind Check In, Ping, Assist, Rally, and Recovery.
- Verify CAD feed scrolling and empty state remain unchanged.
- Verify phone/tablet layouts do not overflow after the command rail padding/border change.

## Recovery Critical Team Visibility Implementation Notes

- `lib/dispatchRealtimeAdapter.ts` now supports a generic `cad_event_upsert` broadcast envelope carrying the normalized `DispatchEvent` payload for active app-process realtime sharing.
- `lib/dispatchLiveEvents.ts` now carries `syncState` on CAD events: `local`, `queued`, `sending`, `sent`, `failed`, or `received`.
- `lib/dispatchEventStore.ts` now exposes `upsertEvent` so sync-state changes and received same-ID events update in place instead of creating duplicate CAD feed rows.
- `components/dispatch/DispatchCadCommandCenter.tsx` gates recovery CAD sharing through active team, active expedition/session, authorized member identity, and valid coordinates before location-bearing events are published or accepted.
- Locally created recovery-critical events are visible to the creator immediately. If the active team/session context is not valid, the event is marked `LOCAL ONLY` and coordinates are not broadcast.
- When the current app process has a connected Dispatch realtime session, recovery-critical events publish as `cad_event_upsert` and receivers import them as `TEAM EVENT` after the same authorization/context checks.
- Offline, queued, or failed sync states are visible in the CAD feed and event detail. Failed publish attempts do not pretend team delivery; the event remains local and is eligible for guarded retry without creating duplicate rows.
- Pending/failed retry is app-process only. A future backend-backed CAD table or durable offline outbox would be needed for guaranteed delivery after app termination.
- Recovery Critical event detail preserves `Ping Threat`, `Mark Hazard`, and `Request Assist` below the red primary `Navigate Assist` action. These secondary actions create follow-up team ping/hazard/assistance CAD events scoped to the current recovery event location, target event ID, and team/session/channel context; they do not create duplicate Recovery Critical events or stage navigation.

Added regression coverage:

- `npm run test:dispatch-recovery-team-visibility`
- `npm run test:dispatch-recovery-event-detail`

Additional manual QA:

- Create a Recovery Critical CAD event with an active team and active expedition; confirm the creator sees it immediately with a queued/sending/sent status according to connectivity.
- In another authorized team/session client, confirm the event imports as `TEAM EVENT`, shows the GPS pin, and `Navigate Assist` can route to the pin.
- Attempt to receive an event for a mismatched team/session and confirm it is blocked and does not expose coordinates in the CAD feed.
- Force realtime publish failure and confirm `SYNC FAILED` is visible, no team-delivery claim is shown, and retry does not duplicate the CAD event.

## Durable Backend CAD Event Storage and Offline Outbox Update

- `supabase/migrations/005_dispatch_cad_events.sql` adds `public.dispatch_cad_events` for durable recovery/hazard CAD event storage.
- The backend table stores event ID, team/session/channel scope, category, hazard type, severity/status, title/message, creator identity, authorized user IDs, structured GPS location, dedupe key, sync state, and the full normalized CAD payload.
- Row-level security is enabled. Location-bearing recovery events are readable/writable only when `auth.uid()` is the creator UUID or is included in the event-scoped `authorized_user_ids` array.
- `lib/dispatchCadEventBackendAdapter.ts` adds:
  - `upsertDispatchCadEventToBackend`
  - `fetchDispatchCadEventsFromBackend`
  - UUID filtering for event-scoped authorized user lists
  - safe unavailable results when Supabase is not configured
- `lib/dispatchPersistenceAdapter.ts` now persists `cadEvents` alongside pings, queue items, assignments, and timeline events.
- `lib/dispatchOfflineReplayAdapter.ts` can replay queued/failed CAD events through a durable backend persistence hook and the existing `cad_event_upsert` realtime envelope.
- `components/dispatch/DispatchCadCommandCenter.tsx` now:
  - Writes recovery-critical CAD events into the local persisted outbox immediately after creation/state changes.
  - Hydrates persisted recovery CAD events back into the feed on active expedition/session load.
  - Fetches durable backend recovery CAD events for the active authorized team/session when online.
  - Refreshes backend recovery CAD events every 30 seconds while the authorized team/session is active so already-open teammate clients can hydrate durable events even if app-process realtime broadcast is missed.
  - Upserts recovery CAD events to the backend before marking them sent.
  - Keeps failed sends in the local outbox for retry instead of dropping them or claiming team delivery.
- Durable storage requires the migration to be applied to the configured Supabase backend. Without Supabase configuration or with a missing migration/table, the creator still gets local durable outbox behavior and a visible failed/queued sync state, but multi-device delivery cannot be guaranteed.
- Event-scoped RLS depends on authenticated UUID user IDs. Local-only callsigns/emails remain valid for local display, but durable cross-device access requires real authenticated user IDs for the creator/team members.

Added regression coverage:

- `npm run test:dispatch-cad-durable-outbox`

Real multi-device GPS/team-session QA status:

- Not executed from this local workspace because only one Android device was visible to ADB (`SM_X230`, serial `R5GL13VYSRY`), and no paired second device, authenticated team accounts, applied Supabase migration, or confirmed real GPS team session were available to this agent.
- Required real-device QA:
  - Apply `005_dispatch_cad_events.sql` to the target backend.
  - Sign into two authorized team/session devices with real auth UUIDs.
  - Device A creates a Recovery CAD event from current GPS.
  - Device A force-closes/reopens before and after sync to verify local outbox durability.
  - Device B receives the event through realtime or backend fetch, opens the pin detail, and taps `Navigate Assist`.
  - Verify unauthorized or mismatched team/session accounts cannot fetch or view GPS coordinates.
  - Repeat with offline creation, reconnect, failed sync retry, GPS denied, and low-accuracy GPS states.

## Final Implemented Changes

- Dispatch CAD feed, advisory/channel surfaces, and lower action container now use the same ECS tactical popup/surface treatment.
- Dispatch lower action row now shows `Check-In`, `Ping`, `Assist`, `Rally`, and a no-icon red/critical `Recovery` action. The row no longer opens the old `More` menu from this placement.
- `Recovery` opens the hazard/recovery CAD event form in the ECS modal shell with the required hazard types, editable message, critical status, GPS acquisition state, and validation/error handling.
- Recovery event creation captures current GPS only when `Create CAD Event` is tapped. It rejects missing/stale/invalid GPS and prevents duplicate submission during acquisition.
- Recovery Critical CAD events include structured category, hazard type, title, display copy, creator, rig, team/session/channel context, coordinates, accuracy, altitude, heading, timestamp, source, and sync state.
- CAD feed rows render Recovery Critical events with critical styling, `Recovery Assist Requested from Current GPS Position`, title/status metadata, sender, GPS accuracy label, and team sync state.
- Event detail opens in the ECS modal shell, shows the recovery pin using the existing threat/map surface where available, and falls back to coordinates/accuracy/timestamp text when map preview is unavailable.
- Event detail preserves `Ping Threat`, `Mark Hazard`, and `Request Assist` below the red primary `Navigate Assist` action.
- `Navigate Assist` is explicit only: opening or creating a recovery event does not start navigation. Tapping the button stages a dispatch recovery navigation handoff and routes the user to Navigate for recovery-assist guidance.
- Recovery CAD events share through the existing Dispatch realtime channel when active team/session authorization checks pass. Local, queued, sending, sent, failed, and received states are visible and retry is guarded against duplicate rows.
- Recovery CAD events now also persist to a local durable CAD outbox and can be stored/fetched through the Supabase `dispatch_cad_events` backend table when configured and migrated.

## Final QA Results

Automated checks run:

- `npm run test:dispatch-helpers`
- `npm run test:dispatch-live`
- `npm run test:dispatch-scenarios`
- `npm run test:dispatch-profile-setup`
- `npm run test:dispatch-event-detail`
- `npm run test:dispatch-action-dedupe`
- `npm run test:dispatch-action-row-recovery`
- `npm run test:dispatch-hazard-recovery-flow`
- `npm run test:dispatch-recovery-critical-feed`
- `npm run test:dispatch-recovery-event-detail`
- `npm run test:dispatch-navigate-assist`
- `npm run test:dispatch-recovery-team-visibility`
- `npm run test:dispatch-cad-durable-outbox`
- `npm run test:dispatch-expedition-create`
- `npm run test:dispatch-weather-events`
- `npm run test:dispatch-connectivity-state`
- `npm run test:realtime-sync-recovery`
- `npx tsc --noEmit --pretty false`
- `npm run lint`
- `npm run build`

Formatting check:

- No dedicated `format`, `format:check`, or Prettier script is present in `package.json`.

Notes:

- `npm run test:dispatch-expedition-create` passes but logs missing Supabase environment/fs compatibility warnings in the local Node test harness.
- `npm run build` passes and exports `dist`; Expo prints `Something prevented Expo from exiting, forcefully exiting now.` after export but returns exit code 0.
