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

As of 2026-07-14, ECS has no production Rive consumer. Power Monitor had already moved to its native telemetry panel, so its unreachable wrappers, duplicate `.riv` files, and Rive/Nitro dependencies were retired.

Route Guidance and Attitude continue to use their native Mapbox/minimap or dial implementations.

## Dependency Decision

`@rive-app/react-native`, `@rive-app/react-webgl2`, and `react-native-nitro-modules` are no longer direct dependencies. The retirement contract prevents dormant assets or dependencies from returning without an explicit implementation change.

## Ongoing Contract

1. Keep Power Monitor regression tests on the native telemetry presentation and source-state behavior.
2. Keep Convoy Command regression tests asserting that Dispatch does not import or render retired Convoy Rive wrappers/assets.
3. Reintroduce a Rive dependency only through a measured, user-visible requirement with Android/iOS size evidence.
