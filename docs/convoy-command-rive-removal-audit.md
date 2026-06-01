# Convoy Command Rive Removal Audit

Date: 2026-05-21

## Result

Convoy Command no longer owns or renders a Rive surface. The Dispatch Convoy Command panel now routes through `components/convoy/ConvoyCommandMap.tsx` with `components/convoy/ConvoyMapFallback.tsx` as the no-token/no-live-data fallback.

## Removed Convoy Rive Files

- `components/rive/ECSConvoyCommandPanelRive.tsx`
- `components/rive/ECSConvoyCommandPanelRive.native.tsx`
- `assets/rive/ConvoyCommand_Panel.riv`
- `public/rive/ConvoyCommand_Panel.riv`

## Current Rive Usage

Rive dependencies remain required because Power Monitor still uses Rive:

- Power module: `components/dashboard/PowerModuleRiveWidget.tsx`, `components/dashboard/PowerModuleRiveWidget.native.tsx`, `components/dashboard/BluPowerModuleRive.tsx`, `components/dashboard/BluPowerModuleRive.native.tsx`, `lib/bluPowerModuleRive.ts`, `lib/powerModuleRiveTelemetry.ts`, `assets/power/blu_power_module.riv`, and `public/rive/blu_power_module.riv`.

Route Guidance and Attitude Rive wrappers/assets have been retired; those features now use their native Mapbox/minimap or dial implementations.

## Dependency Decision

Keep `@rive-app/react-native` and `@rive-app/react-webgl2` in `package.json` while Power Monitor uses Rive. Removing those packages now would break the Power Monitor module.

## Future Removal Plan

1. Replace or retire the power module Rive widgets and preserve their telemetry fallback behavior.
2. Re-run all Power Monitor checks, then remove `@rive-app/react-native`, `@rive-app/react-webgl2`, remaining `.riv` assets, and lockfile entries only when Power Monitor no longer uses Rive.
