# Fleet Source-of-Truth Contract

This note documents the current Fleet ownership model so new work does not
accidentally split user vehicle data, specs, active vehicle context, or weight
math across another store. It is a contract for stability, not a redesign.

## User-created vehicle profile source of truth

`vehicleStore` owns user-created vehicle profile records: identity, nickname,
type, year/make/model, local-only wizard config, accessory framework snapshots,
container zones, resource mirrors, and cloud/local merge behavior. It is
local-first and syncs to Supabase when the user and environment are syncable.

`vehicleSetupStore` owns the selected active vehicle id. It does not own the
vehicle profile or specs. Treat it as active selection state only.

The persisted selection adapter is schema version 2. It preserves the legacy
string key, normalizes malformed IDs, makes repeated writes idempotent, emits a
typed selection reason/revision, and can reconcile a missing or deleted ID
against the actual vehicle list without introducing another selection store.

UI screens that edit vehicles may call `vehicleStore` and `vehicleSpecStore`
through existing editor flows. Read-only consumers should prefer selectors
listed below instead of joining stores themselves.

## Normalized/spec/reference source of truth

`vehicleSpecStore` owns per-vehicle normalized specs: GVWR, base/net/curb
weight, fuel tank capacity/type, tire/lift mirrors, clearance, geometry/spec
fields, and OEM reference metadata saved against a specific vehicle id.

`oemVehicleSpecs` (`lib/fleet/oemVehicleSpecs.ts`) is the canonical bundled OEM
reference catalog for Fleet prefill/matching. Its records are reference inputs,
not user-confirmed truth until saved into `vehicleSpecStore` with source and
confidence metadata.

`VEHICLE_SPEC_PRESETS` inside `vehicleSpecStore` is a legacy quick-pick/backfill
adapter for setup surfaces. Keep it available for compatibility, but do not use
it as the canonical OEM catalog or as verification authority.

## Canonical consumer selectors

`activeVehicleContext` is the main cross-system consumption layer. It resolves
the active id from `vehicleSetupStore`, reads `vehicleStore` and
`vehicleSpecStore`, adds consumables, tires/lift, loadout, accessory framework,
and exposes a single `ActiveVehicleContext`.

Use these helpers for downstream reads:

- `getActiveVehicleContext()` for complete active Fleet context.
- `getActiveVehicle()` for the active vehicle record.
- `getActiveVehicleSpec()` for the active saved spec record.
- `getActiveVehicleTripBuilderProfile()` for trip/confidence vehicle input.
- `activeVehicleState` helpers (`getActiveVehicleState`,
  `getVehicleWeightSnapshot`, and `getVehicleCapabilitySnapshot`) for compact
  readiness, weight, and capability snapshots.

`fleetVehicleStateSelectors` is the canonical Fleet state selector layer. Its
`selectFleetVehicleState` and `selectFleetVehicleStateFromRecord` functions are
the safest way to assemble a vehicle, spec, resource profile, loadout, accessory
state, operating weight, scoring, and summary in one place.

Canonical selector results are memoized by a stable value fingerprint and
bounded to 24 vehicles. Consumers must not mutate returned states. Active-state
subscriptions are also centralized: consumer count does not multiply source
store subscriptions, unrelated vehicle changes are filtered, and related
same-tick source changes publish one coalesced event.

`fleetCommandSelectors` owns Fleet command/readiness view models. Use
`selectFleetCommandState` for the full command state and
`resolveFleetCommandProfile` for compact command/profile widget data.

`fleetFabricService` generates Fleet fabric payloads for AI/orchestrator and
dashboard handoff. It is an adapter over Fleet state and engines, not a profile
store.

## Derived calculations

Derived calculations belong in engines and selectors, not UI screens.

`lib/fleet/fleetOperatingWeight.ts` is the current Fleet operating-weight path
used by `fleetVehicleStateSelectors`.

`weightEngine` remains the compatibility layer for legacy build weight and CG
helpers. `computeFullBuildWeightBreakdown()` delegates to active Fleet fabric
when available so older widgets do not recompute live Fleet math differently.

`vehicleWeightEngine` is a pure zone/load-bias/attitude integration engine. It
does not read stores and should receive normalized inputs from selectors or
adapters.

`weightDashboardStore` is a dashboard adapter for CG, zone warnings, and weight
dashboard presentation. It can consume Fleet operating-weight results, but it is
not the source of vehicle profiles, saved specs, or active vehicle selection.

## Do not use directly from UI screens

Do not read these directly from general UI screens when active Fleet state is
needed:

- `vehicleStore.getById()` plus ad hoc `vehicleSpecStore.get()` joins for
  read-only dashboards, trip confidence, route confidence, telemetry summaries,
  or AI context. Use `activeVehicleContext`, `activeVehicleState`, or
  `fleetVehicleStateSelectors`.
- `oemVehicleSpecs` for user-confirmed specs. Save matched values and source
  metadata into `vehicleSpecStore` first.
- `VEHICLE_SPEC_PRESETS` for verified values. It is a legacy setup adapter.
- `vehicleAttitudeAssets` or other visual/image maps for Fleet truth. Attitude
  imagery is presentation-only and must not become Fleet profile or capability
  data.
- `weightDashboardStore` as a profile store. It is presentation aggregation.

## Duplicate or adapter systems

Known duplicate or adapter systems should remain explicit until a future
targeted consolidation pass:

- `oemVehicleSpecs` is canonical for bundled OEM references.
  `VEHICLE_SPEC_PRESETS` is legacy setup/backfill.
- `src/features/attitude/vehicleAttitudeAssets.ts` is the canonical attitude
  image registry for attitude surfaces. `lib/vehicles/vehicleAttitudeAssets.ts`
  is the resolver/adapter that maps vehicle profile text to that registry.
- `lib/vehicleIcons.ts`, `components/vehicle-wizard/WizardData.ts`, and
  `components/vehicle-wizard/WizardIconMap.ts` are UI classification/icon
  adapters. The persisted profile type still belongs to `vehicleStore`, and
  normalized capability/spec behavior belongs to selectors and specs.
- Dashboard-only vehicle visual maps such as `WidgetRenderers` profile images
  are presentation assets. They are not allowed to feed Fleet source-of-truth
  logic or Fleet fabric payloads.

## Repair guidance

When adding Fleet consumers, start with `getActiveVehicleContext()` or
`selectFleetVehicleState()`. Add a selector when a screen needs a new derived
shape. Add engine logic only when it is pure and reusable. Avoid new direct
store joins in route confidence, trip builder, telemetry, dashboard widgets,
or AI context unless the code is an editor saving explicit user input.
