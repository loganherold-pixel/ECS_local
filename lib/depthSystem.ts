/**
 * ECS Adaptive Depth UI System
 * ═══════════════════════════════════════════════════════════════
 *
 * Creates a premium layered interface with subtle depth separation
 * between UI layers. Widgets appear as slightly elevated instrument
 * panels rather than flat UI elements.
 *
 * Depth Hierarchy (lowest → highest):
 *   Level 0 — Background (base canvas)
 *   Level 1 — Map / content layer
 *   Level 2 — Widget containers (instrument panels)
 *   Level 3 — Active / focused widgets
 *   Level 4 — Intelligence bar, overlays
 *   Level 5 — Modals, drag ghosts
 *
 * Design Principles:
 *   - Subtle, not exaggerated — no heavy 3D effects
 *   - Dark shadows only (no colored glow)
 *   - 8–12px corner radius for instrument panel feel
 *   - Interactive elevation: ~1.02 scale on press
 *   - Smooth fade transitions between states
 *   - Engineered, precise, professional
 *
 * Inspired by: Tesla UI, Garmin aviation, modern avionics
 */

import { ViewStyle, Platform } from 'react-native';

// ── Depth Level Type ─────────────────────────────────────────
export type DepthLevel = 0 | 1 | 2 | 3 | 4 | 5;

// ── Shadow Configuration per Level ───────────────────────────
// Each level has progressively stronger shadow to create
// visual separation. All shadows are dark (no colored glow).

export interface DepthShadow {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

/**
 * Depth shadow configurations for each elevation level.
 * Progressive shadow strength creates visual hierarchy.
 */
export const DEPTH_SHADOWS: Record<DepthLevel, DepthShadow> = {
  // Level 0 — Background: no shadow (base canvas)
  0: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },

  // Level 1 — Map / content layer: minimal shadow
  1: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 1,
  },

  // Level 2 — Widget containers: soft instrument panel shadow
  2: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },

  // Level 3 — Active / focused widgets: elevated instrument
  3: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 6,
  },

  // Level 4 — Intelligence bar, overlays: prominent elevation
  4: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.50,
    shadowRadius: 14,
    elevation: 8,
  },

  // Level 5 — Modals, drag ghosts: maximum elevation
  5: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.60,
    shadowRadius: 20,
    elevation: 12,
  },
};

// ── Panel Styling per Depth Level ────────────────────────────
// Background colors get progressively lighter with elevation
// to simulate light hitting raised surfaces.

export interface DepthPanel {
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
}

export const DEPTH_PANELS: Record<DepthLevel, DepthPanel> = {
  0: {
    backgroundColor: '#0B0E12',    // base canvas
    borderColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
  },
  1: {
    backgroundColor: '#0E1218',    // slightly elevated
    borderColor: 'rgba(255,255,255,0.02)',
    borderWidth: 0.5,
    borderRadius: 8,
  },
  2: {
    backgroundColor: '#111418',    // widget container
    borderColor: 'rgba(62,79,60,0.45)',
    borderWidth: 1,
    borderRadius: 10,
  },
  3: {
    backgroundColor: '#131820',    // active widget
    borderColor: 'rgba(62,79,60,0.55)',
    borderWidth: 1,
    borderRadius: 10,
  },
  4: {
    backgroundColor: '#141A22',    // intelligence bar
    borderColor: 'rgba(212,160,23,0.15)',
    borderWidth: 0.75,
    borderRadius: 10,
  },
  5: {
    backgroundColor: '#161C24',    // modal / ghost
    borderColor: 'rgba(212,160,23,0.25)',
    borderWidth: 1.5,
    borderRadius: 12,
  },
};

// ── Composite Depth Style ────────────────────────────────────
/**
 * Get the complete depth style for a given elevation level.
 * Combines shadow + panel styling into a single ViewStyle.
 */
export function getDepthStyle(level: DepthLevel): ViewStyle {
  const shadow = DEPTH_SHADOWS[level];
  const panel = DEPTH_PANELS[level];

  return {
    backgroundColor: panel.backgroundColor,
    borderColor: panel.borderColor,
    borderWidth: panel.borderWidth,
    borderRadius: panel.borderRadius,
    ...shadow,
  };
}

/**
 * Get only the shadow portion of a depth level.
 * Useful when you want to apply shadow without changing bg/border.
 */
export function getDepthShadow(level: DepthLevel): ViewStyle {
  return { ...DEPTH_SHADOWS[level] };
}

// ── Interactive Depth Animation Constants ────────────────────
// When a widget is interacted with, it briefly elevates.

export const DEPTH_INTERACTION = {
  /** Scale factor on press (1.02 = 2% larger) */
  pressScale: 1.02,
  /** Duration of scale-up animation (ms) */
  pressInDuration: 120,
  /** Duration of scale-down return (ms) */
  pressOutDuration: 200,
  /** Shadow transition from level 2 → level 3 on press */
  pressElevationFrom: 2 as DepthLevel,
  pressElevationTo: 3 as DepthLevel,
} as const;

// ── Depth Transition Constants ───────────────────────────────
// Smooth transitions between dashboard states.

export const DEPTH_TRANSITIONS = {
  /** Fade duration for state transitions (ms) */
  fadeDuration: 250,
  /** Micro-movement distance for state transitions (px) */
  microMovePx: 3,
  /** Duration for micro-movement (ms) */
  microMoveDuration: 300,
} as const;

// ── Inset Shadow Simulation ──────────────────────────────────
// Creates the illusion of depth within panels using top/bottom
// edge highlights. These are rendered as thin View overlays.

export interface InsetShadow {
  topColor: string;
  bottomColor: string;
  topHeight: number;
  bottomHeight: number;
}

export const DEPTH_INSETS: Record<DepthLevel, InsetShadow> = {
  0: { topColor: 'transparent', bottomColor: 'transparent', topHeight: 0, bottomHeight: 0 },
  1: { topColor: 'rgba(255,255,255,0.02)', bottomColor: 'rgba(0,0,0,0.06)', topHeight: 0.5, bottomHeight: 0.5 },
  2: { topColor: 'rgba(255,255,255,0.04)', bottomColor: 'rgba(0,0,0,0.15)', topHeight: 1, bottomHeight: 1 },
  3: { topColor: 'rgba(255,255,255,0.06)', bottomColor: 'rgba(0,0,0,0.20)', topHeight: 1, bottomHeight: 1 },
  4: { topColor: 'rgba(255,255,255,0.05)', bottomColor: 'rgba(0,0,0,0.18)', topHeight: 1, bottomHeight: 1 },
  5: { topColor: 'rgba(255,255,255,0.08)', bottomColor: 'rgba(0,0,0,0.25)', topHeight: 1.5, bottomHeight: 1.5 },
};

// ── Widget Container Depth Presets ───────────────────────────
// Pre-composed styles for common dashboard elements.

/** Standard widget container — elevated instrument panel */
export const WIDGET_DEPTH: ViewStyle = {
  ...getDepthStyle(2),
  overflow: 'hidden',
};

/** Active/focused widget — slightly more elevated */
export const WIDGET_DEPTH_ACTIVE: ViewStyle = {
  ...getDepthStyle(3),
  overflow: 'hidden',
};

/** Intelligence bar — prominent elevation above widgets */
export const INTEL_BAR_DEPTH: ViewStyle = {
  ...getDepthShadow(4),
};

/** Drag ghost — maximum elevation for floating elements */
export const DRAG_GHOST_DEPTH: ViewStyle = {
  ...getDepthStyle(5),
  overflow: 'hidden',
};

/** Dashboard background — base canvas depth */
export const DASHBOARD_BG_DEPTH: ViewStyle = {
  backgroundColor: DEPTH_PANELS[0].backgroundColor,
};

// ── Depth-Aware Border Radius ────────────────────────────────
// Consistent corner radius across the depth system.
export const DEPTH_RADIUS = {
  /** Widget container corner radius */
  widget: 10,
  /** Active widget corner radius */
  widgetActive: 10,
  /** Intelligence bar corner radius */
  intelBar: 10,
  /** Modal corner radius */
  modal: 12,
  /** Small element corner radius */
  small: 8,
} as const;

