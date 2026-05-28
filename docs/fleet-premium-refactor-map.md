# Fleet Premium Refactor Map

Discovery document for the ECS Fleet premium refactor. This pass is inventory only: no Fleet product behavior, UI, routing, data, or service code was changed.

## App Framework, Router, State, API, And Tests

- Framework: Expo React Native app using Expo SDK 54, React 19, React Native 0.81, and NativeWind.
- Router: Expo Router. `package.json` uses `expo-router/entry`; root stack lives in `app/_layout.tsx`; tab routing lives in `app/(tabs)/_layout.tsx`.
- Fleet route: `app/(tabs)/fleet.tsx`. The route is registered as `name="fleet"` with tab title `Fleet`.
- Global shell: `app/_layout.tsx` owns the root stack, shared shell body background, auth gating, command dock visibility, and bottom dock rendering.
- Tab shell: `app/(tabs)/_layout.tsx` hides the native tab bar and leaves bottom navigation to the custom `CommandDock`.
- State management: React context plus local offline-first stores. `context/AppContext.tsx` provides auth, connectivity, active trip, settings, and toast state. Store modules use local persisted key-value caches, subscriptions, and optional Supabase sync.
- API layer: Supabase client in `lib/supabase.ts`, with deployed edge-function allowlist. Vehicle and loadout stores call Supabase tables when the user is syncable and the client is configured.
- Database schema: Fleet cloud tables are defined in `supabase/migrations/004_ecs_fleet_schema.sql`.
- Test framework: no Jest or Vitest dependency was found in `package.json`. Current tests are Node-based scripts under `scripts/`, plus `npm run lint`. Future pure domain tests should follow the existing script style unless a test runner is added intentionally.

## Current Fleet Files

- `app/(tabs)/fleet.tsx`
  - Main Fleet tab screen.
  - Renders the shared `Header` with title `Fleet Operations`.
  - Uses the root-owned `CommandDock` clearance through `getShellBottomClearance`.
  - Fetches vehicles from `vehicleStore`, active vehicle from `vehicleSetupStore`, specs from `vehicleSpecStore`, consumables from `consumablesStore`, tire/lift data from `tiresLiftStore`, and loadouts from `loadoutStore`.
  - Opens setup through `/setup?mode=fleet-add` and `/setup?mode=fleet-edit&vehicleId=...`.
  - Opens `FleetLoadoutModal` for vehicle loadout editing.
  - Connects Fleet context to `useECSAI` and `selectFleetCommandState`.
  - Contains current vehicle card, command surface, readiness, loadout, and empty-state presentation in one large screen file.
- `components/fleet/FleetLoadoutModal.tsx`
  - Fleet-specific loadout modal wrapper.
  - Uses `ECSModalShell` with `overlayClass="workflow"`.
  - Embeds `LoadoutWizardStep` in `mode="fleet-edit"`.
  - Resolves container zones from stored vehicle zones, accessory framework data, wizard config, and defaults.
- `components/fleet/FleetBuildLoadoutModal.tsx`
  - Fleet accessory framework sheet for Build & Loadout.
  - Uses tactical accessory tiles, compact compartment groups, a shared `ECSModalShell` workflow container, and `overlayClass="editor"` edit sheets for accessories and loadout items.
  - Stores accessory installs, generated compartments, active loadout preset, and compartment-aware loadout items in the local vehicle `wizard_config.fleet_build_loadout` extension.
- `components/fleet/FleetVehicleProfileModal.tsx`
  - Guided Fleet vehicle profile setup/edit sheet.
  - Uses `ECSModalShell` for the main profile flow and an `overlayClass="editor"` Advanced Specs sheet.
  - Lets ECS suggest base net weight and GVWR from configuration defaults, then asks the user to confirm specs.
- `components/fleet/FleetSyncModal.tsx`
  - Sync-management modal used by the shared top `Header`.
  - Uses `TacticalPopupShell`, `ECSOverlayFooter`, and `SyncQueueManager`.
- `components/fleet/FleetSyncStatusIndicator.tsx`
  - Fleet sync-status UI component.
- `app/(tabs)/vehicle-config.tsx`, `app/setup.tsx`, and `components/vehicle-wizard/*`
  - Vehicle setup and configuration path used by Fleet add/edit actions.
- `components/vehicle-wizard/LoadoutWizardStep.tsx`
  - Loadout editing UI reused by `FleetLoadoutModal`.
- `components/vehicle-config/VehicleSpecsSection.tsx`
  - Existing vehicle spec and payload-margin UI.

## Related Data Model Files

- `lib/types.ts`
  - Defines `Vehicle`, `Loadout`, `LoadoutItem`, `VehicleZone`, and related domain types.
  - Current `Vehicle` includes name, type, make/model/year, notes, fuel, water, battery, and timestamps.
  - Current `LoadoutItem` includes `weight_lbs`, `weight_source`, `storage_location`, critical/packed flags, quantity, and notes.
- `lib/vehicleStore.ts`
  - Offline-first local vehicle store with optional Supabase sync.
  - Public flow includes `waitForHydration`, `subscribe`, `getAll`, `getById`, `create`, `update`, `delete`, `syncToCloud`, and `finalizeConfig`.
  - Preserves local extension fields such as `wizard_config`, `zones`, `accessoryFramework`, and `containerZones` when merging with cloud rows.
- `lib/vehicleSetupStore.ts`
  - Stores active vehicle id and onboarding/setup state in persisted local storage.
- `lib/vehicleSpecStore.ts`
  - Stores local vehicle specs and presets, including `gvwr_lb`, `base_weight_lb`, fuel tank, fuel type, and hardware additions.
  - Provides helpers such as `computePayloadMargin`, `computeBuildWeight`, `computeFuelWeightLb`, and `findPreset`.
- `lib/loadoutStore.ts`
  - Offline-first loadout and loadout-item stores with optional Supabase sync and sync queue integration.
  - Provides `loadoutStore`, `loadoutItemStore`, and local helpers used by Fleet.
- `lib/loadoutSyncQueue.ts`, `lib/loadoutWeightCache.ts`, `lib/syncActionQueue.ts`
  - Loadout sync status, cached loadout weight, and queued action plumbing.
- `lib/consumablesStore.ts`
  - Current vehicle fuel, water, and consumables support data.
- `lib/tiresLiftStore.ts`
  - Tire and lift state used by Fleet readiness and AI context.
- `lib/activeVehicleContext.ts`
  - Consolidates active vehicle, specs, consumables, tires/lift, accessory framework, and loadout weight into an active context.
- `lib/keyValuePersistence.ts`
  - Shared persisted key-value cache utility used by local stores.
- `supabase/migrations/004_ecs_fleet_schema.sql`
  - Creates `vehicles`, `loadouts`, and `loadout_items` cloud tables with RLS.
  - Cloud `vehicles` currently does not include all local Fleet extension fields.

## Existing Scoring/Fabric Files

- `lib/fleet/fleetCommandSelectors.ts`
  - Existing pure Fleet command/readiness selector.
  - Produces readiness status, confidence, badges, missing critical items, limitations, and helper text.
  - Uses `evaluateECSConfidence` and `explainRecommendation`.
- `lib/ai/useECSAI.ts`
  - React hook connecting Fleet screen context to the ECS AI orchestrator.
  - Returns `fleetView`, diagnostics, target view, live status, and summary.
- `lib/ai/aiOrchestrator.ts`
  - Builds orchestrator candidates and fallback context from active run, vehicle config, telemetry, resources, and user preferences.
  - Includes Fleet as a target view.
- `lib/rigCompatibilityEngine.ts`
  - Builds vehicle profile data and scores opportunity compatibility.
  - Uses vehicle specs, active setup, tire/lift data, resources, and stores.
- `lib/vehicleWeightEngine.ts`
  - Existing pure vehicle-zone and loadout weight engine.
  - Provides zone weights, GVWR percentage, remaining payload, bias profile, attitude alert signals, and stability calculations.
  - Current total weight flow centers on base weight plus loadout; premium refactor math should add explicit installed accessory weight and active loadout weight boundaries.
- `lib/fleet/fleetOperatingWeight.ts`
  - Current Fleet Weight Summary aggregation helper.
  - Combines Vehicle Profile specs, saved Build & Loadout accessories, compartment loadout items, and active/legacy loadout items into one operating-weight result.
  - Feeds the Weight Summary dashboard with real base weight, installed accessory weight, loadout/cargo weight, payload margin, confidence, partial-data reasons, and center-of-gravity inputs.
- `lib/vehicleSystemsIntegration.ts`
  - Maps accessory framework data into systems overview, zone summaries, and tactical readiness structures.
- `lib/ai/confidenceEngine.ts`
  - Existing ECS confidence evaluation.
- `lib/ai/scoreStability.ts`, `lib/stabilityEngine.ts`, `lib/ai/vehicleFitEngine.ts`, `lib/ai/signalProcessor.ts`
  - Adjacent scoring, stability, fit, and AI signal modules.
- Fabric status:
  - `lib/fleet/fleetPremiumDomain.ts` now defines `FleetFabricPayload` and `generateFleetFabricPayload`.
  - The payload builder is pure and keeps Fleet fabric output free of media fields.

## Existing ECS Tactical Theme Files/Tokens/Components

- `lib/theme.ts`
  - Primary ECS theme tokens: `ECS`, `TACTICAL`, `TACTICAL_LIGHT`, `TACTICAL_DRIVING`, `GOLD_RAIL`, `INSTRUMENT_HIERARCHY`, `TYPO`, `DENSITY`, `ICON_GRID`, `ZONE_ACCENT`, legacy `COLORS`, spacing, radius, shadows, and zone constants.
- `context/ThemeContext.tsx`
  - Provides effective theme mode, palette, visual theme readiness, and theme controls.
- `lib/ui/shellChromeTheme.ts`
  - Resolves top/bottom banner washes, body scrim, gold rail, dock labels, and shell chrome values by theme.
- `lib/chromeAssets.ts`
  - Defines shared chrome image assets for top banner, bottom banner, body background, and popup container background.
- `lib/ecsSurfaceTokens.ts`
  - Shared card, panel, section, and surface token values.
- `lib/ecsInteractionTokens.ts`
  - Shared button and interaction sizing/color tokens.
- `lib/ecsStatusTokens.ts`
  - Shared semantic status tones for badges, chips, dots, and pills.
- `lib/ecsTypographyTokens.ts`
  - Shared tactical text sizes, weights, labels, titles, body, chip, button, and dialog typography.
- `components/ECSSurface.tsx`
  - `ECSCard`, `ECSPanel`, `ECSCardFooter`, `ECSSection`, `ECSSectionHeader`, `ECSSectionBadge`, and list row surfaces.
- `components/ECSButton.tsx`
  - `ECSButton` and `ECSIconButton`.
- `components/ECSStatus.tsx`
  - `ECSIcon`, `ECSStatusDot`, `ECSBadge`, `ECSStatusPill`, and status indicators.
- `components/ECSActionRow.tsx`
  - Shared action row layout.
- `components/ECSText.tsx`
  - Shared typography component.
- `components/ECSLoading.tsx`, `components/ECSStateMessage.tsx`
  - Shared loading and empty/error state presentation.
- `components/SafeIcon.tsx`
  - Safe icon wrapper used across Fleet and shell components.
- `lib/vehicleIcons.ts`
  - Existing vehicle class icon mapping. Premium Fleet should use these or other existing ECS icon-system assets instead of vehicle photos.

## Existing Global Background Rules

- `app/_layout.tsx`
  - Root container background comes from the active visual palette.
  - Pre-auth screens use `AdaptiveBackground`.
  - Shell routes render `ShellBodyBackground` when the route is part of the shared app shell or command dock surface.
  - `showSharedShellBodyBackground` currently includes `/fleet`, `/navigate`, `/dashboard`, `/discover`, `/explore`, `/alert`, `/vehicle-config`, `/route`, `/safety`, `/intel`, `/more`, and command dock screens.
- `components/ShellBodyBackground.tsx`
  - Uses the global body background asset from `BODY_BG`.
  - Applies theme-specific shell body scrim from `resolveShellChromeTheme`.
  - Clips the background between top and bottom shell insets.
- `components/TopoBackground.tsx`
  - Current transparent compatibility wrapper. Fleet wraps its screen in this component, but global shell background is actually owned by `ShellBodyBackground`.
- `app/(tabs)/_layout.tsx`
  - Tab scene content is transparent once theme is ready, allowing the shared shell background to show through.

## Existing Popup/Modal/Drawer/Sheet Rules

- `components/ECSModal.tsx`
  - Global transparent React Native `Modal` wrapper.
  - Handles animated backdrop, fade/rise animation, reduced motion, Android hardware back, close cooldown, and overlay stack registration.
  - Uses overlay tiers `global` and `safety`.
- `lib/overlayCoordinator.ts`
  - Coordinates overlay stack behavior and replacement.
- `components/ECSModalShell.tsx`
  - Primary popup/sheet/dialog container.
  - Overlay classes:
    - `workflow`: sheet, high max-height, no handle, no swipe dismiss, no backdrop dismiss.
    - `editor`: sheet, handle, swipe dismiss, backdrop dismiss, scrollable body.
    - `action`: smaller sheet with handle and dismiss gestures.
    - `dialog`: centered dialog with constrained width/height.
    - `info` and `support`: centered informational/support dialogs.
  - Computes safe-area top and bottom clearance, including shell dock clearance for sheets.
  - Owns backdrop behavior, panel border/radius/shadow/elevation, scrollability, keyboard avoiding, footer/header slots, and mobile swipe behavior.
- `components/TacticalPopupShell.tsx`
  - Thin tactical wrapper over `ECSModalShell`; default overlay class is `editor`.
- `components/ECSShellTexture.tsx`
  - Shared popup container texture/background layer.
- `components/ProfileSettingsPanel.tsx`
  - Header profile popover implemented with a native `Modal`, themed popup texture, backdrop, constrained viewport, and safe-area-aware positioning.
- `components/QuickActionsSheet.tsx`
  - Dashboard long-press/action sheet using the ECS modal shell pattern.
- Fleet modal inheritance:
  - `FleetLoadoutModal` already uses `ECSModalShell`.
  - `FleetSyncModal` already uses `TacticalPopupShell`.

## Existing Top/Bottom ECS Banner Behavior

- Top banner/header:
  - `components/Header.tsx` is the shared top ECS banner component, but it is rendered by screens rather than globally by `app/_layout.tsx`.
  - Fleet currently renders `Header` locally with `title="Fleet Operations"` and Fleet AI command context.
  - Header uses `TopBannerBackground`, `TabHeaderTitleImage`, shared status pills, profile/settings controls, theme controls, online/offline/sync state, and `FleetSyncModal`.
  - Header layout uses shell constants from `lib/shellLayout.ts`.
  - Recommendation: Fleet should continue to render the shared `Header` component unless the app later centralizes top-banner ownership in the root shell. Do not create a Fleet-only top banner.
- Bottom banner/navigation:
  - `components/CommandDock.tsx` is rendered by `app/_layout.tsx` and is the global bottom ECS navigation/dock.
  - The native Expo tab bar is hidden in `app/(tabs)/_layout.tsx`.
  - Dock routes include Fleet, Navigate, Dashboard, Explore, and Dispatch.
  - Fleet uses `getShellBottomClearance` so content clears the global dock.
  - Recommendation: bottom navigation/bottom banner remains root-shell owned. Fleet must not render a duplicate bottom dock or bottom ECS banner.
- Route shell wrapping:
  - Existing shell routes, including `/fleet`, are already wrapped by the root `app/_layout.tsx` stack and shell background behavior.
  - Top banner is not root-owned yet; bottom banner and shared body background are root-owned.

## Recommended File Additions

- Implemented foundation:
  - `lib/fleet/fleetPremiumDomain.ts`
    - Defines `FleetVehicle`, `VehicleBuildProfile`, `AccessoryCatalogItem`, `FleetAccessoryInstall`, `FleetCompartment`, `FleetLoadoutItem`, `FleetChecklistItem`, `WeightVerification`, `FleetWeightResult`, `FleetScoringResult`, and `FleetFabricPayload`.
    - Adds load-zone and use-case constants.
    - Adds pure weight math for base net weight, installed accessory weight, active loadout weight, operating weight, payload remaining, GVWR use, zone weights, and axle/top-heavy risk.
    - Adds `VEHICLE_WEIGHT_DEFAULTS_CATALOG`, `FLEET_CONFIDENCE_TIERS`, and `resolveVehicleWeightDefault` for configuration-aware defaults, including RAM 2500 variants.
    - Adds pure confidence/source normalization and legacy adapters for existing vehicle, spec, zone, and loadout-item shapes.
    - Adds pure Fleet fabric payload generation with no media fields.
  - `lib/fleet/fleetVehicleProfile.ts`
    - Adds profile presets, ECS spec suggestions, validation for impossible values, confidence explanation text, and payload remaining recalculation for the guided Vehicle Profile flow.
  - `lib/fleet/fleetBuildLoadout.ts`
    - Adds the Fleet accessory catalog, accessory install model, compartment generation, grouped compartment loadout, preset application, removal behavior, scoring effects, and live weight/scoring summaries for Build & Loadout.
    - Keeps compartment loadout text/chip/icon based with no image fields or media asset dependency.
  - `lib/fleet/fleetWeightSummary.ts`
    - Adds pure Fleet Weight Summary view-model math for operating weight, payload remaining, GVWR usage, estimated axle weight, high-mounted/rear-hitch risk flags, confidence, and verification-driven confidence upgrades.
    - Keeps Weight Summary UI inputs data-only with no media fields or remote image dependencies.
  - `lib/fleet/fleetChecklist.ts`
    - Adds the optional "What Did I Forget?" recommendation module with readiness categories, Have it / Need it / Not needed / Not sure statuses, prep-list state, suppression, and optional linked loadout item generation.
    - Stores checklist state separately from required setup under `wizard_config.fleet_checklist`; linked loadout weight is added only when the user chooses to do so.
  - `lib/fleet/fleetFabricService.ts`
    - Adds the durable premium Fleet fabric payload generator (`fleet.fabric.v2`) with vehicle/build profile data, accessories, compartments, active loadout state, checklist statuses, weight verifications, scoring, risk flags, confidence breakdown, and limited tactical routing state.
    - Explicitly rejects media-like payload fields and keeps Fleet fabric output free of vehicle image/photo/CDN/OEM/upload metadata.
  - `lib/fleet/fleetTelemetryEvents.ts`
    - Adds optional Fleet event hooks for vehicle added, specs confirmed, accessory added, loadout item added, weight verified, and checklist completed events.
- Future extraction, if the domain file grows:
  - `lib/fleet/fleetWeightMath.ts`
  - `lib/fleet/fleetConfidence.ts`
  - `lib/fleet/fleetFabricPayload.ts`
  - `lib/fleet/fleetAdapters.ts`
- Implemented production hardening files:
  - `lib/fleet/fleetMigration.ts`
  - `lib/fleet/fleetPremiumReleaseConfig.ts`
  - `docs/fleet-premium-release.md`
- `components/fleet/FleetVehicleCard.tsx`
  - Extract premium compact card UI from the current large Fleet screen once behavior is ready to change.
- `components/fleet/FleetReadinessPanel.tsx`
  - Extract readiness, payload, confidence, source, and scoring clarity UI.
- `components/fleet/FleetProgressiveFields.tsx`
  - Progressive disclosure for advanced vehicle fields.
- `scripts/test-fleet-premium-domain.js`
  - Script-style unit tests for the new domain model, adapters, weight math, scoring, and fabric payload generation.
- Later release docs required by the repo-level Fleet guidance:
  - `docs/fleet-tactical-ui-contract.md`
  - `docs/fleet-premium-release.md`

## Risk Notes

- Evidence-ready status: implementation/static checks can pass while production remains blocked. The Fleet production gate now requires `.smoke/fleet-production-evidence.json` to include Android build/device metadata, source/confidence/offline QA state proof, artifact references, reviewer signoff, and a pending/accepted production decision.
- Current Fleet empty state references `assets/attitude/vehicles/fleet/heavy-duty-truck-hero.png`. Premium Fleet rules disallow vehicle images/photo-heavy Fleet treatment, so this should be replaced in the refactor with icon/token-based empty state UI.
- Current Fleet styles contain local raw hex and rgba values. Refactor work should migrate touched UI to existing ECS tokens and components instead of adding one-off colors.
- `FleetLoadoutModal` uses `ECSModalShell`, but still has some local background and badge styling that should be token-aligned when touched.
- The top banner is shared but screen-rendered. Fleet should reuse `Header`; do not add a Fleet-specific top banner. If top banner ownership moves into the root shell later, Fleet should remove the local render at that time.
- The bottom command dock is root-owned. Fleet content should keep using shell bottom clearance and must not duplicate bottom navigation.
- Existing cloud `vehicles` schema does not persist all local Fleet extension fields. Compatibility adapters or migrations are needed before relying on new Fleet fields in synced environments.
- `vehicleStore.finalizeConfig` references `setup-vehicle-zones`, but that function is not in the deployed edge-function allowlist in `lib/supabase.ts`. Verify service availability before depending on it for Fleet setup.
- Existing `vehicleWeightEngine` has useful zone and payload logic, but premium Fleet math must explicitly separate base net/curb/empty weight, installed accessory weight, active loadout weight, and GVWR.
- No existing Fleet fabric payload module was found. Adding one is a new integration point and should be kept pure, tested, and image-field-free.
- `showFleetPreviewPane` is currently false in `app/(tabs)/fleet.tsx`, leaving older guarded UI paths in the file. Future extraction should avoid preserving dead UI paths.
- Specs appear local-store-first. Confidence/source UI must account for local preset, user estimate, manufacturer spec, VIN/OEM match, and verified scale-ticket tiers.

## Test Strategy

- Discovery pass:
  - No tests were required or run because this pass only creates this map.
- First implementation pass:
  - Added `scripts/test-fleet-premium-domain.js` for Fleet weight math, confidence/source mapping, RAM 2500 default resolution, risk zone classification, legacy adapters, scoring, and fabric payload generation.
  - Extended `scripts/test-fleet-premium-domain.js` for compartment-aware loadout, including bed-low versus roof risk changes, preset accumulation, and loadout effects on operating weight and payload remaining.
  - Extended `scripts/test-fleet-premium-domain.js` for Weight Summary math, risk flags, and confidence improvement after scale-ticket verification.
  - Extended `scripts/test-fleet-premium-domain.js` for optional checklist behavior, including towing recommendations, linked loadout creation, prep-list-only Need it status, and Not needed suppression.
  - Extended `scripts/test-fleet-premium-domain.js` for premium Fleet fabric payload generation, scoring changes from accessories/loadout/checklist, telemetry events, payload extraction, and no-media serialization.
  - Use the existing script-based testing pattern unless the repo adopts Jest/Vitest first.
  - Run `npm run lint`.
  - Run targeted existing scripts that cover affected domains, especially AI/scoring, route intelligence, or vehicle/loadout scripts if the touched code overlaps them.
  - Run TypeScript checking with `npx tsc --noEmit` if the repo configuration supports it cleanly.
- UI pass:
  - Verify Fleet on mobile and wider layouts.
  - Confirm the tab label remains `Fleet`.
  - Confirm the global body background, shared top `Header`, and root-owned `CommandDock` still render once.
  - Confirm modals/sheets use `ECSModalShell` or `TacticalPopupShell` and respect safe-area, scroll, backdrop, and dock clearance.
  - Confirm no vehicle images, image upload fields, remote image URLs, image manifests, image resolvers, or carousels are introduced.

## OEM Spec Reference Prefill

Fleet now has an offline OEM-reference seed catalog in `lib/fleet/oemVehicleSpecs.ts`. The catalog is intended to prefill expedition-relevant vehicle baseline fields when a user enters year, make, model, trim, and vehicle type. The first pass is deliberately conservative: entries carry source/confidence metadata, warnings to verify trim/package and door-placard values, and manual profile values remain authoritative.

The profile flow uses the OEM reference to suggest base net/empty weight, GVWR, payload context, fuel capacity, ground clearance, wheelbase, width/height/length where known, track width, off-road angles, and turning diameter. Unsupported model-year combinations are not silently matched. For example, a 2021+ Ford Bronco can match the modern Bronco reference, while a 2019 Ford Bronco is surfaced as outside the bundled OEM reference window.

Future expansion should add verified source notes per catalog entry and grow coverage toward the common pickup, van, SUV, and crossover set. Do not treat the catalog as a scale ticket or VIN-specific payload authority; door placard and measured weights remain higher confidence.
