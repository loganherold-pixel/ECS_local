# ECS Silhouette System Specification

## Overview

Semi-realistic side-profile solid-fill vehicle silhouette system for the Expedition Command System. Modular, scalable, production-ready SVG.

## Coordinate System

```
ViewBox: 0 0 1024 1024

┌──────────────────────────────────────────────────┐
│                                                  │ Y=0
│              Safe Padding (128px)                 │
│  ┌──────────────────────────────────────────┐    │ Y=128
│  │                                          │    │
│  │          CARGO MAX ─────────────          │    │ Y=360
│  │                                          │    │
│  │          ROOF MAX ──────────────          │    │ Y=460
│  │                                          │    │
│  │    ┌─────────────────────────────┐       │    │
│  │    │     VEHICLE SILHOUETTE      │       │    │
│  │    │                             │       │    │
│  │    │   ◯                    ◯    │       │    │ Y=780 (wheels)
│  │    └─────────────────────────────┘       │    │
│  │          GROUND ────────────────          │    │ Y=820
│  │                                          │    │
│  └──────────────────────────────────────────┘    │ Y=896
│              Safe Padding (128px)                 │
└──────────────────────────────────────────────────┘ Y=1024
     X=128                              X=896
```

## Vertical Limit System

| Anchor          | Y Value | Purpose                              |
|-----------------|---------|--------------------------------------|
| SAFE_TOP        | 128     | Minimum safe padding from top        |
| CARGO_MAX       | 360     | Maximum height for cargo/tent        |
| ROOF_MAX        | 460     | Maximum roofline for any vehicle     |
| WHEEL_CENTER    | 780     | Wheel axle center for all vehicles   |
| GROUND          | 820     | Ground contact / baseline            |
| SAFE_BOTTOM     | 896     | Minimum safe padding from bottom     |

## Wheel Specification

All vehicles share identical wheel geometry:

| Parameter | Value | Description              |
|-----------|-------|--------------------------|
| TIRE_R    | 44    | Outer tire radius        |
| RIM_R     | 28    | Inner rim radius         |
| HUB_R     | 10    | Hub center radius        |
| ARCH_R    | 54    | Body arch clearance      |
| CY        | 780   | Wheel center Y           |

## Base Vehicles

### 1. Full-Size Truck (`fullsize_truck`)
- **Inspiration**: RAM 2500 / F-250
- **Profile**: Crew cab, long bed, overland stance
- **Front wheel X**: 280
- **Rear wheel X**: 730
- **Roof Y**: 451
- **Bed**: X 556–838, Top Y 518

### 2. Mid-Size Truck (`midsize_truck`)
- **Inspiration**: Tacoma / Colorado
- **Profile**: Crew cab, shorter bed
- **Front wheel X**: 295
- **Rear wheel X**: 710
- **Roof Y**: 457
- **Bed**: X 544–814, Top Y 522

### 3. Boxy SUV (`suv_boxy`)
- **Inspiration**: 4Runner / Bronco / Land Cruiser
- **Profile**: Flat roof, squared-off rear, no bed
- **Front wheel X**: 275
- **Rear wheel X**: 720
- **Roof Y**: 453

### 4. Overland Van (`overland_van`)
- **Inspiration**: Sprinter / Transit
- **Profile**: Tall roof, long wheelbase, sliding door
- **Front wheel X**: 280
- **Rear wheel X**: 700
- **Roof Y**: 424

## Module Alignment Coordinates

### Bed Modules (Truck Only)

Bed modules align to the vehicle's `bedStartX`, `bedEndX`, and `bedTopY` anchors.

| Module       | File              | Description                    |
|--------------|-------------------|--------------------------------|
| `bed_open`   | (empty)           | No overlay — open bed          |
| `bed_rack`   | modules.ts        | Simplified mass shape rack     |
| `bed_shell`  | modules.ts        | Continuous roof block          |

### Roof Modules

Roof modules align to `roofFrontX`, `roofRearX`, and `roofY` anchors.

| Module       | File              | Description                    |
|--------------|-------------------|--------------------------------|
| `roof_none`  | (empty)           | No overlay                     |
| `roof_rack`  | modules.ts        | Simplified rectangle base      |
| `roof_tent`  | modules.ts        | Rectangular block, max Y=360   |

### Hitch Modules

Hitch modules align to `hitchX` and `hitchY` anchors.
Maximum rear extension: 8% of vehicle width.

| Module       | File              | Description                    |
|--------------|-------------------|--------------------------------|
| `hitch_none` | (empty)           | No overlay                     |
| `hitch_tire` | modules.ts        | Perfect circle mass            |
| `hitch_box`  | modules.ts        | Rectangular block              |

## Programmatic Stacking

Modules are composed in this order:

```tsx
<VehicleCompositor
  base="fullsize_truck"    // 1. Base vehicle
  bed="bed_rack"           // 2. Bed module
  roof="roof_tent"         // 3. Roof module
  hitch="hitch_tire"       // 4. Hitch module
  width={300}
  height={300}
/>
```

Internally, the compositor:
1. Loads the base vehicle definition (body path + windows + wheels)
2. Generates module paths using the vehicle's anchor coordinates
3. Collects all shapes into a single SVG render pass
4. No module requires scaling or repositioning

## SVG Technical Rules

- Side profile only — no 3/4 perspective, no tilt
- Solid fill shapes only — no strokes, gradients, or shadows
- Primary fill: `#D4AF37` (gold)
- Alternate: `currentColor` (CSS-overridable)
- Clean `<path>` commands with minimal node count
- Fill-rule: `evenodd` for compound paths with cutouts
- No inline styles — fill via attributes
- No transforms — absolute coordinates only
- Target file size: under 8KB per shape set

## Validation Checklist

- [x] All wheels align on Y=780
- [x] All bases share Y=820 ground baseline
- [x] All modules overlay without adjustment
- [x] No visible scaling distortion
- [x] No internal detail lines (solid fill only)
- [x] Window areas as negative space cutouts
- [x] Wheel arches integrated into body path
- [x] Corner radius 6–8px on body panels
- [x] True-to-life proportions
