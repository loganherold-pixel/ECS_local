# ECS Dashboard Widget And Modal Release Polish Report

Date: 2026-05-03

## Summary

This pass focused on low-risk Dashboard release polish: canonical widget sizing, widget library modal copy, modal tile text clipping risk, and central popup placement behavior. No Dashboard surfaces were redesigned.

## Patched Low-Risk Items

### Widget Size Canon

- Attitude Monitor remains fixed at `2x1`.
- Attitude Command remains fixed at `2x2`.
- Navigate Surface remains fixed at `2x1`.
- Vehicle Systems now uses its release-canonical `1x1` footprint in both catalog and registry metadata.
- Power Systems keeps its `2x1` default while retaining the `1x1` fallback in the size picker.
- Dashboard size normalization now preserves canonical `1x1`, `2x1`, and `2x2` footprints instead of collapsing every non-command widget to `2x1`.

Risk: low. This aligns registry metadata with the release rules and does not remove any widgets.

### Widget Modals

- Add Widget modal footer now reports the compatible widget count for the current slot instead of the stale "11 field-ready widgets" copy.
- Widget Library and Widget Manager failure messages now describe canonical widget size compatibility instead of a hard-coded `2x1`/`2x2` rule.
- Widget Library uses the current dashboard mode's profile when checking placement compatibility.
- Widget Library and Widget Manager tile titles/descriptions now have line limits to reduce clipping and overflow in constrained modal widths.

Risk: low. These are copy, placement-check, and text-fit improvements inside existing modal shells.

### Modal Bounds

- Add Widget and Widget Manager already use `TacticalPopupShell` with `overlayClass="workflow"`.
- `TacticalPopupShell` delegates to `ECSModalShell`, which calculates top and bottom clearances from the shell/safe-area metrics and constrains modal height inside the central body region.

Risk: none for this pass. No modal shell geometry changes were required.

## Needs Review

### Mixed `1x1` Dashboard Packing

The Dashboard renderer can display `1x1`, `2x1`, and `2x2` cells, but the store's fixed Dashboard admission model still budgets by row count. That keeps the release defaults stable, but it may reject some future mixed layouts that could physically fit, such as two `1x1` widgets above one `2x1` widget.

Recommendation: review whether the Dashboard should support true cell-level packing for curated fixed layouts before expanding the library with more simultaneous `1x1` widgets.

Risk: medium. This touches persisted layout behavior and should not be changed silently during release polish.

### Retired Standalone Widgets

Remoteness, Route Progress, Route Confidence, Weather-forward, and several Highway-era widgets remain in the registry for migration/replacement and legacy data paths, but they are not offered as curated Dashboard picker items.

Recommendation: retain for this release. Their replacement mappings prevent stale persisted layouts from breaking.

Risk: medium if removed.

### ECS Brief Advisory Dedupe

Existing ECS Brief dedupe coverage remains in `scripts/test-ecs-brief-guidance-dedupe.js`. This pass did not alter ECS Brief advisory logic because no duplicate user-facing advisory source was isolated in the Dashboard widget/modal surface.

Risk: low to retain; medium to alter without a focused brief-source audit.

## Active Files To Retain

- `app/(tabs)/dashboard.tsx`: active Dashboard tab shell and modal layer.
- `components/dashboard/WidgetGrid.tsx`: active widget grid renderer.
- `components/dashboard/WidgetLibrary.tsx`: active Add Widget modal.
- `components/dashboard/WidgetLibraryManager.tsx`: active Dashboard Manager modal.
- `components/TacticalPopupShell.tsx` and `components/ECSModalShell.tsx`: active global popup/modal bounds system.
- `lib/widgetRegistry.ts`: canonical Dashboard widget catalog and migration map.
- `lib/dashboardStore.ts`: persisted Dashboard layout state and widget placement rules.

## Duplicate Or Visual-Debt Candidates

- Legacy Dashboard mode naming still uses `highway` internally while the visible tab is `Widgets`. This appears intentional for persisted state and migration compatibility.
- Several retired standalone widgets still have registry entries but are hidden from the curated picker. This is migration support, not safe dead code.
- Some Dashboard modal strings still reference "curated" and "field-ready" broadly. This is consistent with ECS terminology and does not expose AI terminology.

## Verification Targets

- `npm run test:dashboard-widgets`
- `npm run test:dashboard-attitude-active-vehicle`
- `npm run test:dashboard-attitude-command-interactions`
- `npm run test:dashboard-power-systems`
- `npm run test:dashboard-remoteness-confidence-widgets`
- `npm run test:dashboard-route-progress`
- `npm run test:ecs-brief-guidance-dedupe`
- `npx tsc --noEmit --pretty false`
- `npm run lint`
