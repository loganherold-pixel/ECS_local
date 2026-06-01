# Attitude Monitor Implementation Map

## What Replaced The Legacy Monitor

The legacy inclinometer-style Attitude Monitor was replaced by one shared production surface built around:

- a darker tactical canyon/desert background
- a centered hero vehicle layer
- native ECS roll, pitch, posture, severity, and trust-state UI
- one shared motion and severity model across widget, detail, tablet, and automotive presentations

The main live surface now lives in [components/attitude/AttitudeMonitorSurface.tsx](/C:/Users/logan/Desktop/ECS_local/components/attitude/AttitudeMonitorSurface.tsx).

## Main Implementation Pieces

- Surface rendering:
  - [components/attitude/AttitudeMonitorSurface.tsx](/C:/Users/logan/Desktop/ECS_local/components/attitude/AttitudeMonitorSurface.tsx)
  - [components/attitude/AttitudeMonitorBackgroundLayer.tsx](/C:/Users/logan/Desktop/ECS_local/components/attitude/AttitudeMonitorBackgroundLayer.tsx)
  - [components/attitude/AttitudeMonitorHeroLayer.tsx](/C:/Users/logan/Desktop/ECS_local/components/attitude/AttitudeMonitorHeroLayer.tsx)
- Expanded/detail presentation:
  - [components/attitude/AttitudeMonitorExpandedView.tsx](/C:/Users/logan/Desktop/ECS_local/components/attitude/AttitudeMonitorExpandedView.tsx)
  - [components/detail/AttitudeMonitorWidget.tsx](/C:/Users/logan/Desktop/ECS_local/components/detail/AttitudeMonitorWidget.tsx)
- Dashboard widget integration:
  - [components/dashboard/WidgetRenderers.tsx](/C:/Users/logan/Desktop/ECS_local/components/dashboard/WidgetRenderers.tsx)
- Automotive/wide presentation:
  - [components/vehicle-display/VehicleAttitudeScreen.tsx](/C:/Users/logan/Desktop/ECS_local/components/vehicle-display/VehicleAttitudeScreen.tsx)

## Runtime State Ownership

- Motion smoothing and animation timing:
  - [lib/attitudeMotionEngine.ts](/C:/Users/logan/Desktop/ECS_local/lib/attitudeMotionEngine.ts)
- Display-state derivation:
  - [lib/useAttitudeMonitorDisplayState.ts](/C:/Users/logan/Desktop/ECS_local/lib/useAttitudeMonitorDisplayState.ts)
- Severity, posture labels, trust/source metadata, and formatting:
  - [lib/attitudeMonitorModel.ts](/C:/Users/logan/Desktop/ECS_local/lib/attitudeMonitorModel.ts)
- Post-field-test tuning entry point:
  - [lib/attitudeMonitorTuning.ts](/C:/Users/logan/Desktop/ECS_local/lib/attitudeMonitorTuning.ts)

## Asset And Fleet Resolver Flow

1. Fleet or active-vehicle context is normalized in [lib/attitudeMonitorVehicleVisual.ts](/C:/Users/logan/Desktop/ECS_local/lib/attitudeMonitorVehicleVisual.ts).
2. That resolver returns a normalized visual-family descriptor with family id, asset source, and fit metadata.
3. Asset sources and usage-specific background/overlay presentation come from [lib/attitudeMonitorAssets.ts](/C:/Users/logan/Desktop/ECS_local/lib/attitudeMonitorAssets.ts).
4. Presentation surfaces consume the normalized descriptor and registry output instead of importing raw asset paths.

## Fallback Behavior

- No active vehicle:
  - Attitude Monitor resolves to the default truck family.
- Unsupported or unmapped Fleet vehicle:
  - resolver falls back to `default-truck`.
- Missing family-specific hero art:
  - registry falls back to the approved default truck hero.
- Background or overlay failure:
  - the surface still renders with generated ECS styling and native UI.
- Missing telemetry:
  - the surface remains intact and shows stale or unavailable messaging rather than reverting to legacy placeholder UI.

## How To Add Future Vehicle Hero Assets

1. Add the approved hero file under `assets/attitude/vehicles/fleet/`.
2. Update the matching asset definition in [lib/attitudeMonitorAssets.ts](/C:/Users/logan/Desktop/ECS_local/lib/attitudeMonitorAssets.ts).
3. If the new family needs a distinct family id, add it in [lib/attitudeMonitorVehicleVisual.ts](/C:/Users/logan/Desktop/ECS_local/lib/attitudeMonitorVehicleVisual.ts).
4. Add or adjust the family `fit` metadata there rather than adding one-off layout conditionals in rendering components.
5. Extend `resolveFamilyId()` only if Fleet normalization truly needs a new mapping rule.

## Where Future Tuning Should Happen

Start in [lib/attitudeMonitorTuning.ts](/C:/Users/logan/Desktop/ECS_local/lib/attitudeMonitorTuning.ts).

Most likely post-field-test adjustments:

- `motion.deadZoneDeg`
- `motion.filterAlpha`
- `motion.animation.*`
- `motion.visible.*`
- `severity.thresholds.*`
- `severity.exitBufferDeg.*`
- `severity.upgradeDwellMs.*`
- `severity.downgradeDwellMs.*`
- `visual.backgroundByUsage.*`
- `visual.overlayByUsage.*`

Avoid changing per-surface presentation code first unless the issue is clearly compositional rather than tuning-related.

## Responsive Intent

- `widgetCompact`:
  - preserve hero vehicle, roll, pitch, and posture with minimal chrome
- `widget`:
  - default dashboard production surface
- `detail` / expanded:
  - same visual family with more breathing room and restrained support cards
- `vehicle` / `automotive`:
  - same core monitor, rebalanced for wide glanceable presentation rather than stretched widget spacing

## Current Watch Items

- Dedicated non-default Fleet-family hero art is still pending, so several families still fall back to the default truck.
- [components/dashboard/WidgetRenderers.tsx](/C:/Users/logan/Desktop/ECS_local/components/dashboard/WidgetRenderers.tsx) still contains older Attitude helper code outside the active production path; the live dashboard widget now uses `AttitudeMonitorSurface`, but that file should be treated carefully if a future cleanup removes fully legacy helper blocks.
