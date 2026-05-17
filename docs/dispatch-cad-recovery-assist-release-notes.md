# Dispatch CAD Recovery Assist Release Notes

## Summary

This pass updates Dispatch CAD with a Recovery-first assist flow, GPS-backed Recovery Critical events, explicit Navigate Assist routing, and honest team/session sync visibility while preserving existing CAD event behavior.

## User-Facing Changes

- Dispatch CAD feed and surrounding containers now use ECS tactical popup/surface styling.
- The Dispatch action row now shows `Check-In`, `Ping`, `Assist`, `Rally`, and red `Recovery`.
- `Recovery` opens the Hazard/Recovery CAD event creation form directly. It no longer opens the old More menu from the action row.
- Hazard/Recovery form supports:
  - Weather
  - Terrain
  - Trail Blockage
  - Water Crossing
  - Recovery
  - Visibility
  - Other
- Recovery CAD event creation captures current GPS on submit, stores structured location metadata, and blocks event creation when current GPS is unavailable.
- Recovery Critical events appear in the CAD feed with critical styling and the display copy `Recovery Assist Requested from Current GPS Position`.
- Opening a Recovery Critical event shows the pin/drop location, coordinates, accuracy, timestamp, message, hazard type, and sync status.
- Event detail preserves `Ping Threat`, `Mark Hazard`, and `Request Assist` as secondary actions.
- Red `Navigate Assist` starts recovery-assist guidance only after explicit tap and replaces the active navigation route.

## Team and Sync Behavior

- Recovery CAD events include team/session/channel context when available.
- Recovery CAD events now persist to a durable local CAD outbox and can be stored in the Supabase `dispatch_cad_events` table once migration `005_dispatch_cad_events.sql` is applied.
- Authorized active team/session members can receive location-bearing Recovery Critical events through the existing Dispatch realtime channel.
- Authorized team/session members can also hydrate durable recovery events from backend storage when online, including a conservative 30-second refresh while the session is active.
- Unauthorized or mismatched team/session contexts are blocked before event insertion.
- Sync state is visible as local, queued, sending, sent, failed, or received.
- Failed/queued sync retries are guarded to avoid duplicate CAD feed rows, and failed events remain in the local outbox for retry.

## Backend and QA Notes

- Durable multi-device delivery requires the new Supabase migration to be applied to the target backend.
- Backend row-level security uses event-scoped authenticated UUID user IDs. Local callsigns/emails remain valid for display, but cross-device backend visibility requires real authenticated team users.
- Real multi-device GPS/team-session QA was not executed in this local workspace because ADB exposed only one Android device (`SM_X230`, serial `R5GL13VYSRY`); paired devices, live GPS team sessions, authenticated team accounts, and an applied backend migration were not available to the agent.
- Required field QA is documented below and should be run on two authorized devices before release sign-off.

## Manual QA Checklist

Surface/background:

- Dispatch running CAD feed interior background matches ECS global popup surface.
- Grayed-out containers above CAD feed match ECS global popup/surface treatment.
- Bottom action container/buttons match ECS global popup/action surface treatment.
- No one-off transparent/mismatched container remains.
- No duplicate ECS top/bottom banners.

Action row:

- Dispatch action row shows Check-In, Ping, Assist, Rally, Recovery.
- Recovery button is red/critical styled.
- Recovery button has no icon.
- Recovery opens Hazard/Recovery CAD event flow.
- Old More menu does not open from Dispatch action row.
- Existing Check-In, Ping, Assist, Rally still work.

Hazard/Recovery event creation:

- Hazard types are available: Weather, Terrain, Trail Blockage, Water Crossing, Recovery, Visibility, Other.
- Message can be edited.
- Create CAD Event captures current GPS.
- Create CAD Event prevents duplicate submissions.
- GPS permission denied/unavailable shows clear error.
- No mock/fake GPS coordinates are used.

CAD feed event:

- New event appears immediately.
- Event shows `Recovery Assist Requested from Current GPS Position`.
- Event status/severity shows `Recovery Critical`.
- Event title matches selected hazard type.
- Event is red/critical styled.
- Event is clickable.

Event detail:

- Opening event shows pin/drop location.
- Pin behavior matches/reuses Map Intelligence Recovery Assist pattern where possible.
- Event shows coordinates/accuracy/timestamp where appropriate.
- Ping Threat is available.
- Mark Hazard is available.
- Request Assist is available.
- Red Navigate Assist button is available.

Navigation:

- Tapping Navigate Assist starts guidance to event GPS pin.
- Existing active navigation is overridden/replaced.
- Route target is the recovery CAD event coordinates.
- Active route metadata includes recovery assist/event ID if possible.
- Dashboard Route Progress can reflect assist route if the route-progress integration is present.
- No navigation starts unless user taps Navigate Assist.

Team/session:

- Recovery event syncs or queues according to existing CAD/team behavior.
- Authorized team members can see event and location.
- Unauthorized users/contexts do not expose location.
- Pending/failed sync status is clear.
- Sync retry does not duplicate event.
- Force-close/reopen after offline recovery event creation and confirm the durable local outbox retries after reconnect.
- Confirm Device B receives the recovery event through realtime or backend fetch after Device A creates it.
- Confirm Device B can open the pin and tap Navigate Assist to route to the CAD event GPS coordinate.

## QA Run

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

No dedicated formatting check script exists in `package.json`.

## Suggested Follow-Up Items

- Apply `005_dispatch_cad_events.sql` to staging/production Supabase and run real two-device team-session QA.
- Add device/manual QA for iOS/Android GPS permission denial, timeout, low-accuracy, force-close, and reconnect states.
- Add multi-client realtime/backend QA for authorized receiver, mismatched session rejection, RLS denial, and failed publish retry.
- Wire Dashboard Route Progress verification specifically against recovery-assist route metadata in an end-to-end navigation test.
