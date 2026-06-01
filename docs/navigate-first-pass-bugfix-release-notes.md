# Navigate First-Pass Bugfix Release Notes

Date: 2026-04-27

## Summary

This pass fixes the most visible Navigate first-pass issues across Road Preview, route-step artifacts, app-process offline sync, saved offline route visibility, Active Guidance stationary noise, campsite discovery fallback scoring, and Build Route drawing.

The implementation stays within the existing ECS tactical shell and styling system. It does not add Navigate-only colors, duplicate top/bottom banners, or introduce hidden transparent route-step panels.

## Implemented Changes

- Road Preview now anchors bottom-left on phone, tablet, and wide layouts while respecting shell, CommandDock, safe-area, and map-control clearance.
- Road Preview actions are clearer: `DRAW AREA` is used for campsite/trail area search, and `BUILD ROUTE` is used for route drawing. Accessibility labels describe each action directly.
- The broken Road Preview `View Route Steps` action is hidden for this pass. The top-left route tab and hidden route-step overlay are disconnected.
- Offline Cache sync now continues while ECS remains active after the popup closes. Sync lifecycle is owned by `offlineTileSyncCoordinator.ts`, not the mounted modal.
- A compact global offline sync status chip shows progress/completion outside Offline Cache without duplicating shell banners.
- Offline Cache now shows `Downloaded Syncs` below Sync Current View, including persisted offline routes and completed current-view tile regions.
- Downloaded sync cards follow the Explore Hidden Gems route-card hierarchy: title, region, route/type badges, distance/area metadata, guidance details, cached date/status, and supported actions.
- Active Guidance no longer shows repeated user-facing `TRAIL AUTO-PAUSED (STATIONARY)` messages. Internal trail pause/movement state is preserved.
- Campsite/polygon discovery uses tiered fallback scoring so safe candidates below 70 can still appear as Good, Possible, or Limited confidence.
- Build Route now has a distinct route drawing mode where each pointer-down/pointer-up stroke becomes one segment.
- Build Route segment finalization attempts local snap-to-road/trail/path matching on pointer-up. Raw and snapped geometry, confidence, source, and snap status are stored per segment.
- Build Route undo removes only the latest segment and restores the drawing anchor to the previous segment endpoint.
- Build Route controls are compact, text-first, bottom-left aligned, and separate from Road Preview. Camp Search and Build Route modes now disable/clear each other to prevent conflicts.

## Background Sync Reality

Offline sync in this pass is app-process background sync only. Downloads continue while the ECS app process and JS runtime remain active. There is no true Android/iOS OS-level background download registration in this implementation.

Product copy should avoid implying OS-resilient background downloads until a native background task, WorkManager, TaskManager, or equivalent implementation exists.

## Manual QA Checklist

- [ ] Road Preview appears bottom-left on phone.
- [ ] Road Preview appears bottom-left on tablet, not bottom-middle.
- [ ] Road Preview respects bottom ECS banner/nav/safe area.
- [ ] Draw action is clearly labeled or uses a clearly matching icon.
- [ ] Build Route action is clearly labeled or uses a clearly matching icon.
- [ ] No poor/mismatched action icons remain.
- [ ] View Route Steps broken action is removed or fixed in a proper ECS sheet.
- [ ] No small top-left Route/Active tab appears.
- [ ] No hidden transparent route container appears behind Road Preview.
- [ ] Prepare Offline opens Offline Cache.
- [ ] Start Current Sync View begins sync.
- [ ] Closing Offline Cache does not cancel sync.
- [ ] User can continue using the app while sync runs.
- [ ] Progress/status indicator is visible outside the popup.
- [ ] Completion indicator appears.
- [ ] Completed offline sync appears in Offline Cache.
- [ ] Downloaded Syncs/Saved Offline Routes section shows route cards.
- [ ] Offline route cards match/reuse Explore Hidden Gems route-card hierarchy.
- [ ] Active Guidance starts normally.
- [ ] Trail Auto Pause / stationary indicator no longer repeatedly pops up.
- [ ] Important guidance alerts still appear.
- [ ] Draw Camp Search returns reasonable candidates with relaxed scoring.
- [ ] Safety/legal exclusions still apply.
- [ ] No-results state is helpful.
- [ ] Build Route enters route drawing mode.
- [ ] User can draw a segment.
- [ ] On finger lift, segment snaps to nearest road/trail where possible.
- [ ] Slight deviations are corrected.
- [ ] Bad/ambiguous segments fail gracefully.
- [ ] Multiple route segments are retained.
- [ ] Undo removes only the latest segment.
- [ ] Clear All removes the full draft route.
- [ ] Draw Camp Search and Build Route modes do not conflict.
- [ ] No duplicate ECS top/bottom banners.
- [ ] No Navigate-only colors or one-off container styles were added.

## Verification Run

Focused Navigate scripts:

- `npm run test:navigate-road-preview-layout` - passed
- `npm run test:navigate-active-guidance` - passed
- `npm run test:offline-sync-coordinator` - passed
- `npm run test:offline-readiness` - passed
- `npm run test:campsite-viability` - passed
- `npm run test:campsite-locator` - passed
- `npm run test:campsite-renderer` - passed
- `npm run test:campsite-navigation` - passed
- `npm run test:route-builder-snapping` - passed
- `npm run test:route-builder-undo` - passed
- `npm run test:route-builder-ux` - passed
- `npm run test:route-builder-trace-recovery` - passed
- `npm run test:route-builder-cancel-cleanup` - passed
- `npm run test:start-guidance-readiness` - passed
- `npm run test:route-confidence` - passed
- `npm run test:navigate-import-dedupe` - passed

Project checks:

- `npx tsc --noEmit --pretty false` - passed
- `npm run lint` - passed
- `npm run build` - passed

`npm run build` completed the Expo web export and returned exit code 0. Expo printed `Something prevented Expo from exiting, forcefully exiting now.` after `Exported: dist`; this was not a failing exit.

No dedicated `format` script exists in `package.json`, so there was no repo formatting check to run.

## Remaining Known Issues

- Offline sync is not OS-level background sync. Closing/killing the app process can still stop downloads.
- Road Preview route steps remain intentionally hidden until a useful route-step data path and proper ECS sheet/drawer are implemented.
- Build Route snapping currently uses locally available routeable map/payload geometry. A true network-backed or native map-matching service is not wired yet.
- Build Route low-confidence snapping keeps a smoothed raw segment with retry/undo guidance instead of asking through a richer accept/retry sheet.
- Campsite safety filtering still depends on available legal/access/restriction fields. More authoritative land-use data would improve confidence.
- Manual phone/tablet/device QA still needs to be performed on real target devices or simulator viewports.

## Suggested Next Pass

- Build a proper ECS route-steps sheet if route-step data is useful and reliable.
- Add native/background-task support for offline downloads if true OS-level continuation is a product requirement.
- Add richer offline route management actions, including refresh and open/use route handoff for every saved item type.
- Evaluate a dedicated map-matching/routing abstraction for Build Route snapping beyond locally rendered geometry.
- Add device/simulator visual QA coverage for Road Preview, Build Route controls, and Offline Cache responsive layouts.
- Improve campsite safety inputs with authoritative access, closure, land-management, and prohibited-camping datasets where available.
