# Fleet Tactical UI Contract

This contract governs the Fleet premium redesign. It defines which existing ECS tactical surfaces, tokens, shell components, and overlay rules Fleet must inherit before any visible Fleet card redesign happens.

## Product Intent

Fleet is the ECS vehicle command center. It should feel premium, guided, tactical, compact, and personal while preserving readiness, payload, confidence, source, scoring, and fabric data clarity. Fleet must stay visually aligned with the app shell and must not create a separate visual language.

## No-Media Rule

Fleet premium cards must not use:

- OEM vehicle photographs.
- Dealer images.
- Scraped vehicle media.
- User-uploaded vehicle imagery.
- Remote vehicle image URLs.
- Vehicle photo manifests.
- Photo resolvers.
- Image carousels.
- Large hero photo cards or image-heavy backgrounds.

Allowed visual identity is limited to existing ECS icon-system assets, vehicle class icons, nickname and year/make/model/trim text, use-case chips, metric tiles, readiness/confidence/payload badges, and compact status strips.

## OEM Reference Presentation

Fleet may surface a compact OEM-reference panel when a year/make/model/trim match exists. That panel must stay data-forward and source-labeled: matched vehicle reference, confidence, verification reminder, fuel capacity, ground clearance, wheelbase, width/height/length where known, off-road angles, and turning diameter. It must not introduce OEM photos, scraped images, dealer media, or image-heavy vehicle identity. Door placard values, user-entered specs, VIN/OEM matches, and scale tickets remain higher authority than the bundled reference catalog.

## Required Shared UI Mapping

| Fleet need | Required ECS source | Contract |
| --- | --- | --- |
| Page background | `app/_layout.tsx`, `components/ShellBodyBackground.tsx`, `components/TopoBackground.tsx`, `lib/ui/shellChromeTheme.ts`, `lib/chromeAssets.ts` | Fleet must inherit the root shell body background. Keep page containers transparent unless a shared ECS surface primitive owns the fill. Do not add Fleet-only page gradients, photo backgrounds, or hero image backgrounds. |
| Section background | `components/ECSSurface.tsx`, `lib/ecsSurfaceTokens.ts` | Use `ECSSection`, `ECSPanel`, or `ECSCard` with `ECS_SURFACE` roles. Do not create one-off section fills when an ECS surface primitive fits. |
| Cards/panels | `ECSCard`, `ECSPanel`, `ECSCardFooter`, `ECS_SURFACE` | Premium Fleet vehicle cards and details must be built from shared ECS card/panel primitives or extracted wrappers that compose them. |
| Compact metric tiles | `ECSPanel`, `ECSCard`, `ECSBadge`, `ECSText`, `ECS_SURFACE`, `ECS_TEXT` | Metric tiles should be compact ECS panels with shared typography and status badges. Use documented ECS spacing/radius rather than Fleet-only tile chrome. |
| Chips/badges | `ECSBadge`, `ECSStatusPill`, `ECSStatusDot`, `ECS_STATUS` | Readiness, confidence, payload, source, and use-case chips must use shared status components and tones. |
| Buttons/actions | `ECSButton`, `ECSIconButton`, `ECSActionRow`, `ECS_BUTTON_COLORS`, `ECS_INTERACTION`, `SafeIcon`, `ECSIcon` | Use ECS buttons/action rows for primary, secondary, compact, icon, and destructive actions. Use existing icons through `SafeIcon` or `ECSIcon`. |
| Warning/success/neutral states | `ECS_STATUS.tone`, `TACTICAL`, `ECS`, `ECSBadge`, `ECSStatusPill` | Map warning/risk to `warning` or `unavailable`, success/ready to `ready` or `active`, live telemetry to `live`, and neutral metadata to `info` or `category`. Do not invent Fleet-only state colors. |
| Pop-up, drawer, modal, sheet containers | `ECSModalShell`, `TacticalPopupShell`, `ECSModal`, `ECSShellTexture`, `ECSOverlayFooter` | Fleet overlays must use shared shell containers. Use `workflow` for required setup/loadout flows, `editor` for editable sheets, `action` for compact action sheets, and `dialog` for confirmations/info. |
| Overlay/backdrop | `ECSModal`, `ECSModalShell`, `lib/overlayCoordinator.ts` | Use shared overlay registration, backdrop, animation, dismiss, and stack behavior. Do not implement custom Fleet overlay/backdrop layers. |
| Top ECS banner/header | `components/Header.tsx`, `TopBannerBackground`, `TabHeaderTitleImage`, `lib/shellLayout.ts` | Fleet must use the shared `Header` while top banners remain screen-rendered. Do not create a Fleet-only top banner. If root shell later owns the top banner, Fleet should remove local rendering instead of duplicating it. |
| Bottom ECS banner/navigation/footer | `components/CommandDock.tsx`, `app/_layout.tsx`, `lib/shellLayout.ts` | The root app shell owns bottom navigation. Fleet must not render another bottom dock or bottom ECS navigation banner. Local status strips may exist only inside Fleet content and must not compete with the global dock. |
| Mobile safe-area handling | `useSafeAreaInsets`, `getShellBottomClearance`, `getCommandDockHeight`, `ECSModalShell` safe-area calculations | Fleet screens must reserve dock clearance and safe-area space through existing shell helpers. Fleet sheets must inherit safe-area behavior from `ECSModalShell`. |

## Shared Layout And Shell Rules

- `app/_layout.tsx` is the owner of root shell behavior, route gating, shared shell body background, and global `CommandDock`.
- `app/(tabs)/_layout.tsx` registers the `Fleet` tab and hides the native tab bar. Keep the tab label `Fleet`.
- `components/Header.tsx` is the shared top ECS banner while headers remain screen-rendered.
- `components/CommandDock.tsx` is the shared bottom ECS banner/navigation surface and must remain root-shell owned.
- `components/ShellBodyBackground.tsx` owns the page/app tactical background for Fleet shell routes.
- `components/TopoBackground.tsx` is a transparent compatibility wrapper. It may remain around Fleet content, but it must not become a Fleet-specific background system.
- Fleet content should use `getShellBottomClearance(insets.bottom, extraPadding)` instead of hard-coded bottom padding around the global dock.
- Fleet overlays should use `ECSModalShell` or `TacticalPopupShell`; do not create local `Modal` containers unless a shared shell component cannot support the required behavior and the gap is documented first.

## Token Rules

- Use existing ECS tokens before adding anything:
  - `ECS`, `TACTICAL`, `TACTICAL_LIGHT`, `TACTICAL_DRIVING`, `GOLD_RAIL`, `TYPO`, `DENSITY`, `ICON_GRID`, and `ZONE_ACCENT` from `lib/theme.ts`.
  - `ECS_SURFACE` from `lib/ecsSurfaceTokens.ts`.
  - `ECS_STATUS` and `ECS_ICON` from `lib/ecsStatusTokens.ts`.
  - `ECS_TEXT` from `lib/ecsTypographyTokens.ts`.
  - `ECS_INTERACTION` and `ECS_BUTTON_COLORS` from `lib/ecsInteractionTokens.ts`.
- Do not add raw hex values in Fleet UI when an ECS token or shared component already expresses the role.
- Do not invent Fleet-only gradients, overlays, shadows, borders, or modal chrome.
- If a new semantic alias becomes unavoidable, it must map to an existing ECS role and be added in the relevant shared token module, not inside Fleet component styles.
- No new semantic aliases are required for the contract pass. Existing surface, status, typography, interaction, and shell tokens are sufficient to begin the redesign.

## Fleet State Semantics

- Payload safe/ready: use `ready` or `active` status tones.
- Payload caution or estimate uncertainty: use `warning`.
- Payload over limit, missing required weight data, or blocking readiness issue: use `unavailable`.
- Live telemetry/sync/active sensor context: use `live`.
- Source, estimate, category, drivetrain, trim, use case, and neutral metadata: use `info` or `category`.
- Selected vehicle or active setup context: use `selected` or `active`.
- Weight Summary must keep the AGENTS Fleet math legible: operating weight is base net/empty plus installed accessories plus current loadout, payload remaining is GVWR minus operating weight, and GVWR usage is operating weight divided by GVWR. Saved fuel and water may be counted as current-loadout inputs only when they are visible as explicit, source/confidence-labeled consumables.
- Android QA state must remain visible without changing the Fleet layout: Fleet should expose local/offline/sync state, source labels, confidence labels, estimated or missing-data status, and the no-photo contract through compact badges or helper lines on the existing overview/card surfaces.

## Modal And Sheet Contracts

- Required setup and loadout editing flows should use `overlayClass="workflow"` so they inherit large-sheet sizing, non-dismiss behavior, and safe-area clearances.
- Optional edit/details flows should use `overlayClass="editor"`.
- Compact action menus should use `overlayClass="action"`.
- Confirmations and small information panels should use `overlayClass="dialog"`, `info`, or `support`.
- Fleet must rely on `ECSModalShell` for panel border, radius, shadow, elevation, backdrop, scroll behavior, keyboard behavior, swipe dismissal, and mobile safe-area behavior.
- Fleet must rely on `overlayCoordinator` behavior through `ECSModal` rather than adding custom overlay stacks.

## Banner Ownership

- Top banner: Fleet currently renders shared `Header` locally because top header ownership is screen-level. Fleet may pass Fleet-specific command context into `Header`, but must not fork the header visuals.
- Bottom banner: Fleet must inherit the root-rendered `CommandDock`. Do not render a second bottom navigation bar, bottom ECS banner, or Fleet-only dock.
- Status/footer strips inside Fleet cards are allowed only when they are content-level status strips, not app-level navigation or chrome.

## Current Fleet Shell Audit

- `app/(tabs)/fleet.tsx` uses `TopoBackground` as a transparent compatibility wrapper while the root `ShellBodyBackground` remains active for `/fleet`.
- Fleet sets its route container background to transparent and uses `getShellBottomClearance(insets.bottom, 8)` for bottom dock clearance.
- Fleet renders the shared `Header` once per route state. This is the only top ECS banner for the Fleet route while header ownership remains screen-level.
- Fleet does not render `CommandDock`, a bottom tab bar, or any Fleet-only bottom banner. Bottom navigation remains root-owned in `app/_layout.tsx`.
- Fleet setup, profile, Build & Loadout, checklist confirmation, legacy loadout, and sync overlays use `ECSModalShell` or `TacticalPopupShell`, which provide the shared backdrop, overlay stack registration, close control, scroll behavior, keyboard-aware sheet behavior, swipe/backdrop dismissal policy, and mobile safe-area clearances.
- Fleet confirmation prompts must go through `showEcsConfirmDialog`; validation messages must use `ECSInlineHelper`, `ECSStateMessage`, shared toasts, or shared modal footer actions.
- Fleet modal body overrides may only adjust layout density, flex behavior, or padding. They must not re-skin the modal shell or add local backdrop/page colors.

## Mobile Safe-Area And Scroll QA Checklist

- On a device with a bottom inset, Fleet list content must remain scrollable above the root `CommandDock`; no vehicle card action row should sit behind the dock.
- On a device with a top inset, the Fleet `Header` must remain the only top ECS banner and must not overlap the first Fleet overview card.
- `workflow` Fleet overlays must clear the top header and bottom dock/safe area via `ECSModalShell`; footer buttons should remain reachable on small screens.
- `editor` Fleet overlays must scroll when content exceeds available height, keep keyboard input usable, and dismiss only according to the overlay preset.
- Backdrop, close button, swipe dismissal, Android back/Escape routing, and overlay stack behavior must be inherited from `ECSModal`/`overlayCoordinator`, not recreated in Fleet.

## Component Extraction Rules For Redesign

When visible Fleet redesign begins, extracted Fleet components should be small compositions of shared primitives:

- `FleetVehicleCard` should compose `ECSCard` or `ECSPanel`, `ECSBadge`, `ECSStatusPill`, `ECSButton` or `ECSIconButton`, `ECSText`, and vehicle class icons from the existing icon system.
- `FleetMetricTile` should compose `ECSPanel`, `ECSText`, and `ECSBadge` or `ECSStatusDot`. If it becomes reusable outside Fleet, place it outside `components/fleet`.
- `FleetReadinessPanel` should compose shared status and surface primitives; readiness color must come from `ECS_STATUS`.
- `FleetLoadoutModal` should continue using `ECSModalShell`.
- `FleetSyncModal` should continue using `TacticalPopupShell`.

## Test Guard

The lightweight static test for this contract is `scripts/test-fleet-tactical-ui-contract.js`.

It checks that:

- This contract documents the required shared primitives and the no-media rule.
- Fleet still uses the shared `Header`, `TopoBackground`, ECS surface primitives, buttons/actions, badges, and shell dock clearance.
- Fleet modals use shared modal/sheet shells.
- Root shell remains the owner of `ShellBodyBackground` and `CommandDock`.
- Fleet modal bodies do not add local modal skin colors, and Fleet sync/footer actions use shared ECS buttons.
- The contract keeps a mobile safe-area and scroll QA checklist for manual device passes.

This test is a lightweight static guard. It does not replace a device pass for small-screen safe areas, keyboard behavior, or overlay scrolling.
