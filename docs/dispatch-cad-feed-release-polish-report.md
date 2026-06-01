# Dispatch CAD Feed Release Polish Report

## Summary

Dispatch remains wired through the legacy `alert` route for Expo Router compatibility, but the user-facing tab title and screen title are Dispatch. The active CAD feed is rendered by `components/dispatch/DispatchCadCommandCenter.tsx`.

## Patched Low-Risk Items

- Updated the Dispatch tab screen header from `Dispatch Center` to `Dispatch`.
- Kept the CAD feed on the shared ECS popup surface tokens: `ECS_POPUP_SURFACE_DARK.shellBg`, `headerBg`, `footerBg`, `controlBg`, and `divider`.
- Made team-only quick actions visibly inactive when no team channel is active:
  - Check In
  - Ping
  - Rally
- Left Assist and Recovery available because they can still create local/queued CAD coordination events and surface GPS failures honestly.

## Confirmed Recovery And Hazard Flow

- The Recovery rail button opens the dedicated hazard/recovery CAD workflow.
- The hazard/recovery workflow uses `ECSModalShell` with the title `Recovery CAD Event`.
- GPS is captured only when `Create CAD Event` is tapped.
- GPS failures are shown as command errors and do not create fake CAD locations.
- Recovery CAD events include:
  - `severity: critical`
  - `status: recovery_critical`
  - `priority: Recovery Critical`
  - `category: recovery_assist` for Recovery
  - current GPS coordinates, accuracy, timestamp, and source when available
  - team/session/channel context when available

## Confirmed Feed Behavior

- Recovery-critical events display `Recovery Critical` severity.
- Recovery-critical rows use the ECS danger semantic token and a dedicated feed style.
- Recovery-critical copy states `Recovery Assist Requested from Current GPS Position`.
- Recovery detail includes coordinate, accuracy, GPS fix timestamp, source, and recovery notes.

## Needs Review

- `MoreActionsModal` exists but no active trigger was found in `DispatchCadCommandCenter`. This may be retained for a future overflow menu, but it should either be reconnected intentionally or removed in a separate cleanup pass.
- The route filename remains `app/(tabs)/alert.tsx` for backward compatibility. A full internal route rename from Alert to Dispatch should be handled as a separate migration because saved shell route restoration may still reference `alert`.

## Risk

- Low: screen title and disabled-state polish.
- Medium: reconnecting or removing the dormant More Actions modal.
- Medium: internal route rename from `alert` to `dispatch`.
