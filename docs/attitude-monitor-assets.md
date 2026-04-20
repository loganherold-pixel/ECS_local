# Attitude Monitor Asset Pipeline

## Structure

- `assets/attitude/vehicles/default/`
  - approved fallback hero visuals that are always safe to ship
- `assets/attitude/vehicles/fleet/`
  - Fleet-linked hero family assets as they become available
- `assets/attitude/backgrounds/`
  - rendered background plates for the darker tactical canyon/desert family
- `assets/attitude/overlays/`
  - optional transparent overlays such as subtle topo texture

## Naming

- Hero assets: `<family>-hero.png`
- Background assets: `<background-name>.png`
- Overlay assets: `<overlay-name>.png`

Examples:

- `assets/attitude/vehicles/default/fullsize-truck-hero.png`
- `assets/attitude/vehicles/fleet/midsize-truck-hero.png`
- `assets/attitude/vehicles/fleet/heavy-duty-truck-hero.png`
- `assets/attitude/vehicles/fleet/suv-hero.png`
- `assets/attitude/vehicles/fleet/van-hero.png`
- `assets/attitude/backgrounds/darker-tactical-canyon.png`
- `assets/attitude/overlays/subtle-topo-overlay.png`

## Ownership

- Registry and fallback resolution live in [lib/attitudeMonitorAssets.ts](/C:/Users/logan/Desktop/ECS_local/lib/attitudeMonitorAssets.ts)
- Fleet visual-family normalization lives in [lib/attitudeMonitorVehicleVisual.ts](/C:/Users/logan/Desktop/ECS_local/lib/attitudeMonitorVehicleVisual.ts)
- Presentation surfaces consume the registry rather than hardcoding asset paths

## Current shipping state

- `default-truck` has approved hero art and is the guaranteed fallback
- `midsize-truck`, `heavy-duty-truck`, `suv`, `van`, and `crossover` currently resolve through the same fallback hero until family-specific approved art is added
- `darker-tactical-canyon` is the current shipped background plate
- `subtle-topo-overlay` is optional and intentionally faint
- The topo overlay can be disabled globally from the shared asset registry if it proves too busy in production

## Safe-render rules

- Hero assets should use transparent backgrounds when possible
- New family art must fit the existing safe render frame and use registry metadata rather than component-specific layout hacks
- Missing or failed hero/background loads must fall back to the default truck and generated surface styling without blanking the monitor
- Background crop, overlay restraint, and hero anchoring are tuned through shared registry metadata rather than per-screen overrides
