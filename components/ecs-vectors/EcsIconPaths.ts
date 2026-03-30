/**
 * ECS Icon Path Definitions
 * ─────────────────────────────────────────────────────────
 * All icons defined in a 48×48 viewBox coordinate space.
 * Designed to render cleanly at 44–48px.
 *
 * Each icon has:
 *   body   — primary filled shapes (medium stroke weight)
 *   detail — secondary detail shapes (thinner, subtler)
 *
 * DESIGN RULES:
 *   • Clean silhouette first, detail secondary
 *   • No thin micro details
 *   • All glyphs centered in square bounding frame
 *   • Optically equal weight across all icons
 *   • No text, no brand marks, no circular indicators
 */

export interface IconPathSet {
  /** Primary body shapes — filled with metallic gradient */
  body: string[];
  /** Secondary detail shapes — filled with depth color, lower opacity */
  detail: string[];
}

// ════════════════════════════════════════════════════════════
// HELPER: Rounded rect path generator
// ════════════════════════════════════════════════════════════
function rr(x: number, y: number, w: number, h: number, r: number = 2): string {
  return [
    `M ${x + r} ${y}`,
    `L ${x + w - r} ${y}`,
    `Q ${x + w} ${y} ${x + w} ${y + r}`,
    `L ${x + w} ${y + h - r}`,
    `Q ${x + w} ${y + h} ${x + w - r} ${y + h}`,
    `L ${x + r} ${y + h}`,
    `Q ${x} ${y + h} ${x} ${y + h - r}`,
    `L ${x} ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `Z`,
  ].join(' ');
}

// Simple rect (no radius)
function sr(x: number, y: number, w: number, h: number): string {
  return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
}

// Circle path
function cp(cx: number, cy: number, r: number): string {
  return [
    `M ${cx} ${cy - r}`,
    `A ${r} ${r} 0 1 1 ${cx} ${cy + r}`,
    `A ${r} ${r} 0 1 1 ${cx} ${cy - r}`,
    `Z`,
  ].join(' ');
}

// ════════════════════════════════════════════════════════════
// CAB RACK — Two vertical posts + horizontal beam + brackets
// ════════════════════════════════════════════════════════════
export const CAB_RACK: IconPathSet = {
  body: [
    // Top horizontal beam
    rr(10, 6, 28, 5, 1.5),
    // Left vertical post
    sr(14, 11, 4, 26),
    // Right vertical post
    sr(30, 11, 4, 26),
  ],
  detail: [
    // Left mounting bracket
    rr(11, 35, 10, 3, 1),
    // Right mounting bracket
    rr(27, 35, 10, 3, 1),
    // Cross brace detail
    sr(18, 18, 12, 2),
  ],
};

// ════════════════════════════════════════════════════════════
// STORAGE BOX — Pelican-style expedition cargo case
// ════════════════════════════════════════════════════════════
export const STORAGE_BOX: IconPathSet = {
  body: [
    // Main case body
    rr(6, 12, 36, 26, 2.5),
  ],
  detail: [
    // Lid seam line
    sr(6, 20, 36, 2),
    // Left latch clasp
    rr(14, 17, 4, 6, 1),
    // Right latch clasp
    rr(30, 17, 4, 6, 1),
    // Lid bevel edge
    sr(8, 13, 32, 1.5),
  ],
};

// ════════════════════════════════════════════════════════════
// RTT — Folded rooftop tent module + ladder
// ════════════════════════════════════════════════════════════
export const RTT: IconPathSet = {
  body: [
    // Lower mounting base rectangle
    rr(6, 26, 30, 12, 2),
    // Angular folded upper wedge
    `M 8 26 L 8 16 Q 8 14 10 14 L 32 14 Q 34 14 34 16 L 36 26 Z`,
  ],
  detail: [
    // Fold seam line
    sr(10, 24, 24, 1.5),
    // Ladder left rail
    sr(38, 22, 2, 18),
    // Ladder right rail
    sr(42, 22, 2, 18),
    // Ladder rung 1
    sr(38, 26, 6, 1.5),
    // Ladder rung 2
    sr(38, 32, 6, 1.5),
    // Ladder rung 3
    sr(38, 38, 6, 1.5),
  ],
};

// ════════════════════════════════════════════════════════════
// BED RACK — Rectangular perimeter + four posts + top rails
// ════════════════════════════════════════════════════════════
export const BED_RACK: IconPathSet = {
  body: [
    // Top rail
    rr(6, 8, 36, 4, 1.5),
    // Bottom perimeter base
    rr(6, 36, 36, 4, 1.5),
    // Left front post
    sr(8, 12, 3.5, 24),
    // Left rear post
    sr(19, 12, 3.5, 24),
    // Right front post
    sr(25.5, 12, 3.5, 24),
    // Right rear post
    sr(36.5, 12, 3.5, 24),
  ],
  detail: [
    // Mid cross rail
    sr(11.5, 22, 25, 2),
  ],
};

// ════════════════════════════════════════════════════════════
// BED COVER — Flat low-profile lid + rear lip + hinge seam
// ════════════════════════════════════════════════════════════
export const BED_COVER: IconPathSet = {
  body: [
    // Main flat lid
    rr(5, 18, 38, 12, 2),
  ],
  detail: [
    // Rear lip detail
    rr(39, 16, 4, 16, 1),
    // Hinge seam line
    sr(7, 23, 32, 1.5),
    // Front edge detail
    sr(7, 19, 30, 1),
  ],
};

// ════════════════════════════════════════════════════════════
// SMARTCAP — Fully enclosed canopy + window + roof overhang
// ════════════════════════════════════════════════════════════
export const SMARTCAP: IconPathSet = {
  body: [
    // Main canopy body
    rr(7, 12, 34, 28, 2),
    // Roof overhang
    rr(5, 10, 38, 5, 1.5),
  ],
  detail: [
    // Side window cutout (rendered as negative space indicator)
    rr(28, 18, 10, 8, 1.5),
    // Rear panel seam
    sr(7, 30, 34, 1.5),
  ],
};

// ════════════════════════════════════════════════════════════
// ALUCAB — Squared canopy, flatter, angular, utilitarian
// ════════════════════════════════════════════════════════════
export const ALUCAB: IconPathSet = {
  body: [
    // Main squared canopy body
    rr(7, 12, 34, 28, 1.5),
    // Flat roof line
    rr(7, 10, 34, 4, 1),
  ],
  detail: [
    // Side panel seam 1
    sr(7, 22, 34, 1.5),
    // Side panel seam 2
    sr(7, 32, 34, 1.5),
    // Panel rivet line
    sr(20, 14, 1.5, 24),
  ],
};

// ════════════════════════════════════════════════════════════
// TOPPER — Rounded canopy, simplified generic cap
// ════════════════════════════════════════════════════════════
export const TOPPER: IconPathSet = {
  body: [
    // Rounded canopy body
    `M 10 40 L 10 18 Q 10 10 18 10 L 30 10 Q 38 10 38 18 L 38 40 Z`,
  ],
  detail: [
    // Base mounting line
    sr(8, 38, 32, 2.5),
    // Subtle curve detail
    sr(14, 24, 20, 1.5),
  ],
};

// ════════════════════════════════════════════════════════════
// OPEN BED — Rectangular base, no top, empty configuration
// ════════════════════════════════════════════════════════════
export const OPEN_BED: IconPathSet = {
  body: [
    // Left wall
    sr(8, 12, 4, 28),
    // Right wall
    sr(36, 12, 4, 28),
    // Floor
    sr(8, 36, 32, 4),
  ],
  detail: [
    // Inner cavity suggestion — left rail
    sr(14, 16, 1.5, 18),
    // Inner cavity suggestion — right rail
    sr(32.5, 16, 1.5, 18),
    // Floor detail
    sr(14, 34, 20, 1),
  ],
};

// ════════════════════════════════════════════════════════════
// HALF BINS — Two stacked smaller storage modules
// ════════════════════════════════════════════════════════════
export const HALF_BINS: IconPathSet = {
  body: [
    // Top bin
    rr(10, 6, 28, 16, 2),
    // Bottom bin
    rr(10, 26, 28, 16, 2),
  ],
  detail: [
    // Divider line
    sr(10, 23, 28, 2),
    // Top bin handle
    sr(18, 12, 12, 2),
    // Bottom bin handle
    sr(18, 32, 12, 2),
  ],
};

// ════════════════════════════════════════════════════════════
// FULL BINS — Two large stacked rectangular modules
// ════════════════════════════════════════════════════════════
export const FULL_BINS: IconPathSet = {
  body: [
    // Top bin (larger)
    rr(6, 6, 36, 17, 2),
    // Bottom bin (larger)
    rr(6, 26, 36, 17, 2),
  ],
  detail: [
    // Divider/seam
    sr(6, 24, 36, 2),
    // Top seam lines
    sr(10, 12, 28, 1.5),
    // Bottom seam lines
    sr(10, 32, 28, 1.5),
    // Top handle
    sr(16, 8, 16, 2),
    // Bottom handle
    sr(16, 28, 16, 2),
  ],
};

// ════════════════════════════════════════════════════════════
// KITCHEN SLIDEOUT — Drawer frame extended + cooktop line
// ════════════════════════════════════════════════════════════
export const KITCHEN_SLIDEOUT: IconPathSet = {
  body: [
    // Drawer frame (housing)
    rr(6, 16, 28, 22, 2),
    // Extended slide-out tray
    rr(10, 8, 32, 10, 1.5),
  ],
  detail: [
    // Cooktop line 1 (crossed utensil / burner indicator)
    sr(16, 10, 8, 1.5),
    // Cooktop line 2
    sr(14, 14, 12, 1.5),
    // Slide rails left
    sr(6, 38, 12, 2),
    // Slide rails right
    sr(22, 38, 12, 2),
    // Handle
    sr(14, 28, 14, 2),
  ],
};

// ════════════════════════════════════════════════════════════
// DRAWER SINGLE — Single rectangular drawer with handle
// ════════════════════════════════════════════════════════════
export const DRAWER_SINGLE: IconPathSet = {
  body: [
    // Drawer body
    rr(8, 10, 32, 24, 2),
  ],
  detail: [
    // Pull handle
    rr(17, 20, 14, 3, 1),
    // Slide rail left
    sr(6, 34, 10, 2),
    // Slide rail right
    sr(32, 34, 10, 2),
    // Front protrusion edge
    sr(10, 10, 28, 1.5),
  ],
};

// ════════════════════════════════════════════════════════════
// DRAWER DUAL — Two side-by-side drawers + handles
// ════════════════════════════════════════════════════════════
export const DRAWER_DUAL: IconPathSet = {
  body: [
    // Left drawer
    rr(6, 10, 16, 24, 2),
    // Right drawer
    rr(26, 10, 16, 24, 2),
  ],
  detail: [
    // Center divider
    sr(22, 10, 4, 24),
    // Left handle
    rr(10, 20, 8, 3, 1),
    // Right handle
    rr(30, 20, 8, 3, 1),
    // Slide rails
    sr(6, 34, 36, 2),
  ],
};

// ════════════════════════════════════════════════════════════
// DRAWER + KITCHEN — Drawer base + kitchen indicator above
// ════════════════════════════════════════════════════════════
export const DRAWER_KITCHEN: IconPathSet = {
  body: [
    // Drawer base
    rr(6, 24, 36, 16, 2),
    // Kitchen module above
    rr(10, 8, 28, 13, 1.5),
  ],
  detail: [
    // Drawer handle
    rr(16, 30, 16, 3, 1),
    // Kitchen cooktop indicators
    sr(16, 12, 6, 1.5),
    sr(26, 12, 6, 1.5),
    // Divider seam
    sr(6, 22, 36, 2),
  ],
};

// ════════════════════════════════════════════════════════════
// HITCH NONE — Receiver tube only, clean square opening
// ════════════════════════════════════════════════════════════
export const HITCH_NONE: IconPathSet = {
  body: [
    // Receiver tube outer
    rr(12, 16, 24, 16, 2),
  ],
  detail: [
    // Square opening (inner cutout indicator)
    rr(18, 20, 12, 8, 1),
    // Pin hole
    sr(15, 23, 2, 2),
    // Mount plate
    sr(10, 14, 28, 3),
  ],
};

// ════════════════════════════════════════════════════════════
// HITCH TIRE CARRIER — Circular tire + mount arm + receiver
// ════════════════════════════════════════════════════════════
export const HITCH_TIRE_CARRIER: IconPathSet = {
  body: [
    // Tire outer circle
    cp(28, 22, 14),
    // Receiver tube
    rr(4, 32, 18, 8, 1.5),
  ],
  detail: [
    // Tire inner hub (cutout)
    cp(28, 22, 5),
    // Mount arm (vertical)
    sr(12, 16, 4, 16),
    // Minimal tread lines
    cp(28, 22, 11),
    // Pin detail
    sr(8, 36, 2, 2),
  ],
};

// ════════════════════════════════════════════════════════════
// HITCH CARGO CARRIER — Flat rectangular basket + receiver
// ════════════════════════════════════════════════════════════
export const HITCH_CARGO_CARRIER: IconPathSet = {
  body: [
    // Cargo basket platform
    rr(6, 12, 36, 6, 1.5),
    // Basket rail perimeter (left)
    sr(6, 8, 3, 10),
    // Basket rail perimeter (right)
    sr(39, 8, 3, 10),
    // Receiver mount below
    rr(16, 28, 16, 8, 1.5),
  ],
  detail: [
    // Cross bars on basket
    sr(14, 12, 2, 6),
    sr(24, 12, 2, 6),
    sr(34, 12, 2, 6),
    // Receiver arm
    sr(22, 18, 4, 10),
    // Front rail
    sr(9, 8, 30, 2),
  ],
};

// ════════════════════════════════════════════════════════════
// HITCH BIKE RACK — Simplified bicycle + vertical mount arm
// ════════════════════════════════════════════════════════════
export const HITCH_BIKE_RACK: IconPathSet = {
  body: [
    // Rear wheel
    cp(14, 28, 8),
    // Front wheel
    cp(34, 28, 8),
    // Receiver mount
    rr(8, 38, 16, 6, 1.5),
  ],
  detail: [
    // Wheel hubs
    cp(14, 28, 3),
    cp(34, 28, 3),
    // Frame — top tube
    `M 14 28 L 24 18 L 34 28`,
    // Frame — seat tube
    sr(22, 14, 3, 10),
    // Vertical mount arm
    sr(14, 34, 4, 8),
    // Handlebar
    sr(32, 14, 6, 2),
  ],
};

// ════════════════════════════════════════════════════════════
// HITCH RECOVERY — D-ring shackle + receiver block
// ════════════════════════════════════════════════════════════
export const HITCH_RECOVERY: IconPathSet = {
  body: [
    // D-ring shackle (U shape + top bar)
    `M 14 12 L 14 28 Q 14 36 24 36 Q 34 36 34 28 L 34 12 Z`,
    // Receiver block
    rr(10, 6, 28, 8, 2),
  ],
  detail: [
    // Shackle pin (horizontal through top)
    sr(10, 10, 28, 3),
    // Inner cutout indicator
    `M 18 16 L 18 26 Q 18 32 24 32 Q 30 32 30 26 L 30 16 Z`,
    // Pin hole
    sr(12, 11, 2, 2),
    sr(34, 11, 2, 2),
  ],
};

// ════════════════════════════════════════════════════════════
// BINS 1–4 — Visual count of vertical rectangular modules
// ════════════════════════════════════════════════════════════
export const BINS_1: IconPathSet = {
  body: [
    rr(16, 6, 16, 36, 2),
  ],
  detail: [
    sr(20, 20, 8, 2),
  ],
};

export const BINS_2: IconPathSet = {
  body: [
    rr(6, 6, 16, 36, 2),
    rr(26, 6, 16, 36, 2),
  ],
  detail: [
    sr(10, 20, 8, 2),
    sr(30, 20, 8, 2),
  ],
};

export const BINS_3: IconPathSet = {
  body: [
    rr(4, 6, 12, 36, 2),
    rr(18, 6, 12, 36, 2),
    rr(32, 6, 12, 36, 2),
  ],
  detail: [
    sr(7, 20, 6, 2),
    sr(21, 20, 6, 2),
    sr(35, 20, 6, 2),
  ],
};

export const BINS_4: IconPathSet = {
  body: [
    rr(4, 6, 9, 36, 1.5),
    rr(15, 6, 9, 36, 1.5),
    rr(26, 6, 9, 36, 1.5),
    rr(37, 6, 9, 36, 1.5),
  ],
  detail: [
    sr(6, 20, 5, 2),
    sr(17, 20, 5, 2),
    sr(28, 20, 5, 2),
    sr(39, 20, 5, 2),
  ],
};

// ════════════════════════════════════════════════════════════
// ICON REGISTRY — Lookup by string key
// ════════════════════════════════════════════════════════════
export type EcsIconKey =
  | 'cab-rack'
  | 'storage-box'
  | 'rtt'
  | 'bed-rack'
  | 'bed-cover'
  | 'smartcap'
  | 'alucab'
  | 'topper'
  | 'open-bed'
  | 'half-bins'
  | 'full-bins'
  | 'kitchen-slideout'
  | 'drawer-single'
  | 'drawer-dual'
  | 'drawer-kitchen'
  | 'hitch-none'
  | 'hitch-tire-carrier'
  | 'hitch-cargo-carrier'
  | 'hitch-bike-rack'
  | 'hitch-recovery'
  | 'bins-1'
  | 'bins-2'
  | 'bins-3'
  | 'bins-4';

export const ECS_ICON_REGISTRY: Record<EcsIconKey, IconPathSet> = {
  'cab-rack': CAB_RACK,
  'storage-box': STORAGE_BOX,
  'rtt': RTT,
  'bed-rack': BED_RACK,
  'bed-cover': BED_COVER,
  'smartcap': SMARTCAP,
  'alucab': ALUCAB,
  'topper': TOPPER,
  'open-bed': OPEN_BED,
  'half-bins': HALF_BINS,
  'full-bins': FULL_BINS,
  'kitchen-slideout': KITCHEN_SLIDEOUT,
  'drawer-single': DRAWER_SINGLE,
  'drawer-dual': DRAWER_DUAL,
  'drawer-kitchen': DRAWER_KITCHEN,
  'hitch-none': HITCH_NONE,
  'hitch-tire-carrier': HITCH_TIRE_CARRIER,
  'hitch-cargo-carrier': HITCH_CARGO_CARRIER,
  'hitch-bike-rack': HITCH_BIKE_RACK,
  'hitch-recovery': HITCH_RECOVERY,
  'bins-1': BINS_1,
  'bins-2': BINS_2,
  'bins-3': BINS_3,
  'bins-4': BINS_4,
};

/** Get icon paths by key, with fallback */
export function getIconPaths(key: string): IconPathSet | null {
  return ECS_ICON_REGISTRY[key as EcsIconKey] ?? null;
}



