/**
 * WidgetGrid — Multi-cell grid with drag-and-drop reordering
 *
 * Supports widget sizes: 1x1, 1x2, 2x1, 2x2
 * Uses absolute positioning with a placement algorithm that packs
 * widgets into a 2D grid, respecting each widget's colSpan/rowSpan.
 *
 * GRID ALIGNMENT FIX (Phase 2 / 2.5):
 * - Grid container is always full-width and horizontally centered
 * - Uses measured containerWidth (not SCREEN_W) for all placement math
 * - 1x2 layout: two widgets stacked vertically, each fills exactly 50%
 *   of the widget container height (minus gap), with equal spacing
 * - All layouts use pixel-based absolute positioning (no percentage hacks)
 * - containerHeight drives fill-height calculations for single-column
 *   and 2x1 layouts, ensuring no dead space
 * - Safe area / bottom bar accounted for via parent paddingBottom
 *
 * ROTATION / RESIZE HANDLING:
 * - useWindowDimensions hook provides reactive window width/height
 * - When dimensions change (rotation, split-screen, external display),
 *   self-measured width is invalidated and windowWidth is used as
 *   a dynamic fallback until the next onLayout fires
 * - Grid origin (screen-space position) is re-measured on layout change
 * - Placement useMemo recomputes automatically via containerWidth dep
 *
 * HIGHWAY PRECISION 2x3 MODE:
 * - Mathematically precise spacing (8px base unit)
 * - 24px outer padding, 16px gaps
 * - Equal-height rows computed from available container height
 * - Max-width constrained, horizontally + vertically centered
 * - No scroll, overflow hidden
 * - Widget content vertically centered within tiles
 *
 * ATTITUDE MONITOR MINIMUM SIZE (Phase 7):
 * - Featured (2x1) Attitude Monitor enforces min height:
 *   max(220px, 32% of container height)
 * - Non-featured rows compress before Attitude Monitor shrinks
 * - Landscape / short-height auto-reduces to 2-widget layout
 *   (Attitude Monitor + one compact widget) to avoid scrolling
 * - Non-featured widgets receive isCompressedRow flag for
 *   reduced padding when space is tight
 *
 * Layout mode features:
 * - Drag to reorder (PanResponder)
 * - Size picker button to cycle through available sizes
 * - Red X to remove widgets
 * - Tap empty cells to add widgets
 */

import React, { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ImageBackground,
  Pressable,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
  ScrollView,
  PanResponder,
  LayoutChangeEvent,
  LayoutAnimation,
  useWindowDimensions,
} from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import WidgetErrorBoundary from '../WidgetErrorBoundary';
import { TACTICAL, TYPO, DENSITY, GOLD_RAIL, getHierarchyStyle } from '../../lib/theme';
import { MOTION } from '../../lib/motion';
import { hapticMicro } from '../../lib/haptics';
import { useViewerSettings } from '../../context/ViewerSettingsContext';
import { useTheme } from '../../context/ThemeContext';
import { logWidgetEvent, logLayoutEvent } from '../../lib/viewerSettingsStore';
import type { ViewerStyleOverrides } from '../../lib/viewerSettingsStore';
import { consumablesStore } from '../../lib/consumablesStore';
import { useAdaptiveLayout } from '../../lib/useAdaptiveLayout';
import {
  DEPTH_SHADOWS,
  DEPTH_PANELS,
  DEPTH_INSETS,
  DEPTH_INTERACTION,
  DEPTH_TRANSITIONS,
  type DepthLevel,
} from '../../lib/depthSystem';
import { ECS_EASE, useReducedMotion, useStableAnimatedValue, useStableAnimatedValueXY } from '../../lib/ecsAnimations';
import { enableLegacyAndroidLayoutAnimation } from '../../lib/layoutAnimationCompat';



import {
  GRID_LAYOUT_CONFIG,
  WIDGET_SIZE_CONFIG,
  getAvailableSizes,
  getSlotSize,
  getFullWidgetCatalog,
  type WidgetSlot,
  type WidgetSize,
  type DashboardProfile,
  type GridLayout,
  type DashboardMode,
} from '../../lib/dashboardStore';
import {
  canResizeDashboardWidget,
  getDashboardSupportedSizes,
  getWidgetEntry,
  isRegistered,
} from '../../lib/widgetRegistry';
import { renderWidgetContent, type WidgetRenderOptions } from './WidgetRenderers';
import { DASHBOARD_WIDGET_GRAMMAR } from './widgetGrammar';
import type { Trip, LoadItem, RiskScore, Waypoint, UserSettings } from '../../lib/types';
import { ECSBadge } from '../ECSStatus';

const WIDGET_CONTAINER_BACKGROUND = require('../../assets/chrome/backgrounds/popup-container-bg.png');

function WidgetContainerBackground() {
  return (
    <View style={styles.widgetContainerBackgroundLayer} pointerEvents="none">
      <ImageBackground
        source={WIDGET_CONTAINER_BACKGROUND}
        resizeMode="cover"
        style={styles.widgetContainerBackground}
        imageStyle={styles.widgetContainerBackgroundImage}
      />
    </View>
  );
}


// ── Types ─────────────────────────────────────────────────
interface WidgetGridProps {
  slots: WidgetSlot[];
  profile: DashboardProfile;
  gridLayout: GridLayout;
  layoutMode: boolean;
  onEmptySlotPress: (slotIndex: number) => void;
  onWidgetLongPress: (slot: WidgetSlot) => void;
  onRemoveWidget: (slotIndex: number) => void;
  onSwapSlots: (from: number, to: number) => void;
  onResizeWidget?: (slotIndex: number, newSize: WidgetSize) => void;
  onRestoreDefaults?: () => void;
  widgetData: {
    activeTrip: Trip | null;
    loadItems: LoadItem[];
    riskScore: RiskScore | null;
    waypoints: Waypoint[];
    userSettings: UserSettings | null;
    syncStatus: string;
  };
  dashboardMode?: DashboardMode;
  isCompact?: boolean;
  rollDeg?: number | null;
  pitchDeg?: number | null;
  sensorStatus?: string;
  sampleTimestampMs?: number | null;
  isCalibrated?: boolean;
  onCalibrate?: () => void;
  onResetCalibration?: () => void;
  advancedModeEnabled?: boolean;
  perWidgetAutoCollapse?: Record<string, boolean>;
  containerHeight?: number;
  containerWidth?: number;
  gpsLatitude?: number;
  gpsLongitude?: number;
  gpsSpeedMph?: number | null;
  gpsHasFix?: boolean;
  gpsAccuracyM?: number | null;
  gpsAltitudeFt?: number | null;
  gpsTimestampMs?: number | null;
  onOpenCommandBrief?: () => void;
  /** Phase 6: Active expedition mode — locks layout, hides edit controls */
  isActiveMode?: boolean;
}



interface WidgetPlacement {
  slotIndex: number;
  slot: WidgetSlot;
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

// Fallback screen width — only used before first onLayout measurement
const SCREEN_W_FALLBACK = Dimensions.get('window').width;

// ── Standard spacing ──────────────────────────────────────
const GRID_PAD = 14;
const GRID_GAP = 10;

// ── Highway Precision spacing (8px base unit) ─────────────
const HWY_PAD = 16;
const HWY_GAP = 10;
const HWY_WIDGET_PAD = 14;
const HWY_BORDER_RADIUS = 14;
const HWY_MAX_WIDTH = 600; // Baseline max grid width on phone-scale layouts

const SWAP_ANIM_DURATION = 200;
const WIDGET_MODE_HANDOFF_OUT = 0.34;
const WIDGET_MODE_SETTLE_PX = 4;

function createWidgetModeLayoutAnimation(duration: number) {
  return {
    duration,
    create: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
      duration: Math.max(80, Math.round(duration * 0.68)),
    },
    update: {
      type: LayoutAnimation.Types.easeInEaseOut,
      duration,
    },
    delete: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
      duration: Math.max(70, Math.round(duration * 0.5)),
    },
  } as const;
}

// ── Attitude Monitor Minimum Size Constants (Phase 7) ─────
/** Absolute minimum height in pixels (phone baseline) */
const ATTITUDE_MIN_HEIGHT_ABS = 220;
/** Relative minimum as fraction of container height (30–35% range, using 32%) */
const ATTITUDE_MIN_HEIGHT_PCT = 0.32;
/** Container height threshold below which we auto-reduce to 2-widget landscape layout */
const LANDSCAPE_HEIGHT_THRESHOLD = 380;
/** Minimum height for non-featured (compressed) rows — prevents total collapse */
const COMPRESSED_ROW_MIN_HEIGHT = 48;

// ── Check if Highway Precision Mode ───────────────────────
function isHighwayPrecisionMode(dashboardMode?: DashboardMode, gridLayout?: GridLayout): boolean {
  return dashboardMode === 'highway' && gridLayout === '2x3';
}

function hasFixedDashboardMultiCellSlots(slots: WidgetSlot[]): boolean {
  return slots.some((slot) => !!slot.widgetType && getSlotSize(slot) !== '1x1');
}

function trimTrailingEmptySlots(slots: WidgetSlot[]): WidgetSlot[] {
  const activeSlots = slots.filter((slot) => !!slot.widgetType);
  if (activeSlots.length === 0) {
    return slots.slice(0, 1);
  }

  const usedRows = activeSlots.reduce((total, slot) => total + (getSlotSize(slot) === '2x2' ? 2 : 1), 0);
  if (usedRows >= 2) {
    return activeSlots;
  }

  const nextEmpty = slots.find((slot) => !slot.widgetType);
  return nextEmpty ? [...activeSlots, nextEmpty] : activeSlots;
}

function isFixedTwoByTwoDashboardMode(
  dashboardMode?: DashboardMode,
  gridLayout?: GridLayout,
  slots: WidgetSlot[] = [],
): boolean {
  return (
    gridLayout === '2x2' &&
    (dashboardMode === 'expedition' || dashboardMode === 'highway') &&
    !hasFixedDashboardMultiCellSlots(slots)
  );
}

function withPanelAlpha(color: string, alphaHex: string): string {
  if (color.startsWith('#') && color.length === 7) {
    return `${color}${alphaHex}`;
  }
  if (color.startsWith('#') && color.length === 9) {
    return `${color.slice(0, 7)}${alphaHex}`;
  }
  return color;
}


// ── Highway Precision Placement ───────────────────────────
function computeHighwayPlacements(
  slots: WidgetSlot[],
  containerHeight: number,
  containerWidth: number,
  pad: number = HWY_PAD,
  gap: number = HWY_GAP,
  maxWidth: number = HWY_MAX_WIDTH,
): { placements: WidgetPlacement[]; totalHeight: number; cellW: number; cellH: number; gridWidth: number; offsetX: number } {
  const gridCols = 2;
  const gridRows = 3;

  // Compute grid width (max-width constrained, centered)
  // Use containerWidth (measured) minus highway padding on each side
  const maxAvailW = containerWidth - pad * 2;
  const effectiveMaxWidth = Math.max(HWY_MAX_WIDTH, maxWidth);
  const gridWidth = Math.min(maxAvailW, effectiveMaxWidth);
  const offsetX = maxAvailW > effectiveMaxWidth ? (maxAvailW - effectiveMaxWidth) / 2 : 0;

  // Cell dimensions
  const cellW = (gridWidth - gap * (gridCols - 1)) / gridCols;
  const usableH = containerHeight > 0 ? containerHeight : 400;
  const cellH = (usableH - gap * (gridRows - 1)) / gridRows;

  const placements: WidgetPlacement[] = [];

  // Ensure we always have exactly 6 slots
  const ensuredSlots: WidgetSlot[] = [];
  for (let i = 0; i < gridCols * gridRows; i++) {
    if (i < slots.length) {
      ensuredSlots.push(slots[i]);
    } else {
      ensuredSlots.push({ slotIndex: i, widgetType: null, settings: {} });
    }
  }

  // Place widgets in strict 2x3 grid order (no implicit row creation)
  for (let i = 0; i < ensuredSlots.length; i++) {
    const slot = ensuredSlots[i];
    const row = Math.floor(i / gridCols);
    const col = i % gridCols;

    if (row >= gridRows) break; // No implicit rows

    const x = offsetX + col * (cellW + gap);
    const y = row * (cellH + gap);

    placements.push({
      slotIndex: slot.slotIndex,
      slot,
      col,
      row,
      colSpan: 1,
      rowSpan: 1,
      x,
      y,
      width: cellW,
      height: cellH,
    });
  }

  const totalHeight = gridRows * cellH + (gridRows - 1) * gap;
  return { placements, totalHeight, cellW, cellH, gridWidth, offsetX };
}

function computeFixedTwoByTwoPlacements(
  slots: WidgetSlot[],
  containerHeight: number,
  containerWidth: number,
  pad: number = GRID_PAD,
  gap: number = GRID_GAP,
): { placements: WidgetPlacement[]; totalHeight: number; cellW: number; cellH: number; gridWidth: number; offsetX: number } {
  const gridCols = 2;
  const gridRows = 2;
  const availableW = containerWidth - pad * 2;
  const cellW = (availableW - gap) / gridCols;
  const usableH = containerHeight > 0 ? containerHeight : cellW * 2 + gap;
  const cellH = (usableH - gap) / gridRows;

  const placements: WidgetPlacement[] = Array.from({ length: gridCols * gridRows }, (_, index) => {
    const slot = slots[index] ?? { slotIndex: index, widgetType: null, settings: {} };
    const row = Math.floor(index / gridCols);
    const col = index % gridCols;
    return {
      slotIndex: slot.slotIndex,
      slot,
      col,
      row,
      colSpan: 1,
      rowSpan: 1,
      x: col * (cellW + gap),
      y: row * (cellH + gap),
      width: cellW,
      height: cellH,
    };
  });

  return {
    placements,
    totalHeight: gridRows * cellH + gap,
    cellW,
    cellH,
    gridWidth: availableW,
    offsetX: 0,
  };
}

// ── Pre-scan effective row count ──────────────────────────
// Runs the placement algorithm in "dry run" mode to count how many
// rows the widgets actually occupy. Used to compute fill-height
// cellH for multi-column grids (e.g. 2x2 with 2x1 widgets
// that overflow to 3 rows).
function countEffectiveRows(
  slots: WidgetSlot[],
  gridCols: number,
  gridRows: number,
): number {
  const maxRows = gridRows * 2;
  const occupied: boolean[][] = Array.from({ length: maxRows }, () =>
    Array(gridCols).fill(false)
  );
  let highestRow = 0;

  for (const slot of slots) {
    const sizeKey = slot.widgetType ? getSlotSize(slot) : '1x1';
    const sizeConfig = WIDGET_SIZE_CONFIG[sizeKey];
    let colSpan = Math.min(sizeConfig.colSpan, gridCols);
    let rowSpan = sizeConfig.rowSpan;
    if (!slot.widgetType) { colSpan = gridCols >= 2 ? gridCols : 1; rowSpan = 1; }

    let placed = false;
    for (let r = 0; r < maxRows - rowSpan + 1 && !placed; r++) {
      for (let c = 0; c <= gridCols - colSpan && !placed; c++) {
        let fits = true;
        for (let dr = 0; dr < rowSpan && fits; dr++) {
          for (let dc = 0; dc < colSpan && fits; dc++) {
            if (occupied[r + dr][c + dc]) fits = false;
          }
        }
        if (fits) {
          for (let dr = 0; dr < rowSpan; dr++) {
            for (let dc = 0; dc < colSpan; dc++) {
              occupied[r + dr][c + dc] = true;
            }
          }
          highestRow = Math.max(highestRow, r + rowSpan);
          placed = true;
        }
      }
    }
    // Fallback: place as 1x1
    if (!placed) {
      for (let r = 0; r < maxRows && !placed; r++) {
        for (let c = 0; c < gridCols && !placed; c++) {
          if (!occupied[r][c]) {
            occupied[r][c] = true;
            highestRow = Math.max(highestRow, r + 1);
            placed = true;
          }
        }
      }
    }
  }

  return Math.max(highestRow, 1);
}

// ── Standard Placement Algorithm ──────────────────────────
function computePlacements(
  slots: WidgetSlot[],
  gridLayout: GridLayout,
  containerHeight?: number,
  isCompact?: boolean,
  containerWidth?: number,
  gridPad: number = GRID_PAD,
  gridGap: number = GRID_GAP,
): { placements: WidgetPlacement[]; totalHeight: number; cellW: number; cellH: number } {
  const config = GRID_LAYOUT_CONFIG[gridLayout];
  const gridCols = config.cols;
  const gridRows = config.rows;

  // Use measured containerWidth (minus padding) for available width.
  const effectiveWidth = containerWidth || SCREEN_W_FALLBACK;
  const availableW = effectiveWidth - gridPad * 2;
  const cellW = (availableW - gridGap * (gridCols - 1)) / gridCols;

  // ── Pre-count effective rows for fill-height calculation ──
  // When widgets use multi-cell sizes (e.g. 2x1), they may
  // overflow the nominal grid rows. We need the actual row count
  // to compute cellH that fits all content without scrolling.
  const effectiveRows = countEffectiveRows(slots, gridCols, gridRows);

  // Calculate base cell height
  let cellH: number;
  if (containerHeight && containerHeight > 0 && gridCols === 1) {
    // Single column: divide container height evenly among rows with gaps
    cellH = (containerHeight - gridGap * (gridRows - 1)) / gridRows;
  } else if (containerHeight && containerHeight > 0 && gridLayout === '2x1') {
    // 2x1: single row fills full container height
    cellH = containerHeight;
  } else if (containerHeight && containerHeight > 0 && gridCols >= 2 && effectiveRows > gridRows) {
    // ── Fill-height for multi-column grids with row overflow ──
    // (e.g. 2x2 grid with 2x1 widgets that create 3 rows)
    // Divide container height evenly among the effective rows.
    cellH = (containerHeight - gridGap * (effectiveRows - 1)) / effectiveRows;
  } else if (containerHeight && containerHeight > 0 && gridCols >= 2 && gridLayout === '2x2') {
    // ── Fill-height for standard 2x2 grid (2 rows) ──
    // Ensures the grid fills the container vertically with no dead space.
    cellH = (containerHeight - gridGap * (effectiveRows - 1)) / effectiveRows;
  } else {
    // Fallback: aspect-ratio-based heights (used before containerHeight is measured)
    switch (gridLayout) {
      case '1x1': cellH = cellW * 0.65; break;
      case '1x2': cellH = cellW * 0.48; break;
      case '1x3': cellH = cellW * 0.47; break;
      case '2x1': cellH = cellW * 1.05; break;
      case '2x2': cellH = cellW * 0.92; break;
      case '2x3': cellH = cellW * 0.82; break;
      default: cellH = cellW * 0.92;
    }
  }
  if (isCompact) cellH = Math.max(48, cellH * 0.35);

  // Build occupied grid
  const maxRows = gridRows * 2;
  const occupied: boolean[][] = Array.from({ length: maxRows }, () =>
    Array(gridCols).fill(false)
  );

  const placements: WidgetPlacement[] = [];

  for (const slot of slots) {
    const sizeKey = slot.widgetType ? getSlotSize(slot) : '1x1';
    const sizeConfig = WIDGET_SIZE_CONFIG[sizeKey];

    let colSpan = Math.min(sizeConfig.colSpan, gridCols);
    let rowSpan = Math.min(sizeConfig.rowSpan, gridRows);

    if (!slot.widgetType) {
      colSpan = gridCols >= 2 ? gridCols : 1;
      rowSpan = 1;
    }

    let placed = false;
    for (let r = 0; r < maxRows - rowSpan + 1 && !placed; r++) {
      for (let c = 0; c <= gridCols - colSpan && !placed; c++) {
        let fits = true;
        for (let dr = 0; dr < rowSpan && fits; dr++) {
          for (let dc = 0; dc < colSpan && fits; dc++) {
            if (occupied[r + dr][c + dc]) fits = false;
          }
        }
        if (fits) {
          for (let dr = 0; dr < rowSpan; dr++) {
            for (let dc = 0; dc < colSpan; dc++) {
              occupied[r + dr][c + dc] = true;
            }
          }
          const x = c * (cellW + gridGap);
          const y = r * (cellH + gridGap);
          const width = colSpan * cellW + (colSpan - 1) * gridGap;
          const height = rowSpan * cellH + (rowSpan - 1) * gridGap;

          placements.push({
            slotIndex: slot.slotIndex,
            slot,
            col: c,
            row: r,
            colSpan,
            rowSpan,
            x,
            y,
            width,
            height,
          });
          placed = true;
        }
      }
    }

    // Fallback
    if (!placed) {
      for (let r = 0; r < maxRows && !placed; r++) {
        for (let c = 0; c < gridCols && !placed; c++) {
          if (!occupied[r][c]) {
            occupied[r][c] = true;
            const x = c * (cellW + gridGap);
            const y = r * (cellH + gridGap);
            placements.push({
              slotIndex: slot.slotIndex,
              slot,
              col: c,
              row: r,
              colSpan: 1,
              rowSpan: 1,
              x,
              y,
              width: cellW,
              height: cellH,
            });
            placed = true;
          }
        }
      }
    }
  }

  // ── Compute total bounds ────────────────────────────────
  let maxRight = 0;
  let maxBottom = 0;
  for (const p of placements) {
    maxRight = Math.max(maxRight, p.x + p.width);
    maxBottom = Math.max(maxBottom, p.y + p.height);
  }

  // ── Center placements horizontally within available width ──
  if (maxRight > 0 && maxRight < availableW - 1) {
    const offsetX = (availableW - maxRight) / 2;
    for (const p of placements) {
      p.x += offsetX;
    }
  }

  return { placements, totalHeight: maxBottom, cellW, cellH };
}

function getStandardGridMaxWidth(
  gridLayout: GridLayout,
  isTabletWide: boolean,
): number {
  switch (gridLayout) {
    case '1x1':
      return isTabletWide ? 780 : 700;
    case '1x2':
      return isTabletWide ? 860 : 780;
    case '1x3':
      return isTabletWide ? 980 : 860;
    case '2x1':
      return isTabletWide ? 1180 : 1040;
    case '2x2':
      return isTabletWide ? 1480 : 1320;
    case '2x3':
    default:
      return isTabletWide ? 1380 : 1220;
  }
}

function getHighwayGridMaxWidth(
  isTablet: boolean,
  isTabletWide: boolean,
): number {
  if (isTabletWide) return 920;
  if (isTablet) return 780;
  return HWY_MAX_WIDTH;
}


// ══════════════════════════════════════════════════════════════
// ATTITUDE MONITOR MINIMUM SIZE ENFORCEMENT (Phase 7)
//
// Post-processes placements to guarantee the featured Attitude
// Monitor widget meets its minimum height constraint:
//   minHeight = max(ATTITUDE_MIN_HEIGHT_ABS, containerHeight * ATTITUDE_MIN_HEIGHT_PCT)
//
// Algorithm:
// 1. Find the attitude-monitor widget in a featured (colSpan > 1) placement
// 2. If its current height already meets the minimum → no-op
// 3. Otherwise, redistribute vertical space:
//    - Attitude Monitor row gets the enforced minimum height
//    - Remaining rows split the leftover container space equally
//    - Non-featured rows are clamped to COMPRESSED_ROW_MIN_HEIGHT minimum
// 4. Recompute y-positions for all placements based on new row heights
//
// Returns:
//   - adjusted: the modified placements array
//   - compressedRows: Set of row indices that were compressed
//     (used to pass isCompressedRow flag to widget renderers)
// ══════════════════════════════════════════════════════════════
function enforceFeaturedMinHeight(
  placements: WidgetPlacement[],
  containerHeight: number,
  gap: number,
): { adjusted: WidgetPlacement[]; compressedRows: Set<number> } {
  const compressedRows = new Set<number>();

  // Guard: need valid container height and placements
  if (containerHeight <= 0 || placements.length === 0) {
    return { adjusted: placements, compressedRows };
  }

  // Find the attitude-monitor in a featured (full-width) placement
  const attitudePlacement = placements.find(
    p => p.slot.widgetType === 'attitude-monitor' && p.colSpan > 1
  );
  if (!attitudePlacement) {
    return { adjusted: placements, compressedRows };
  }

  // Calculate the enforced minimum height
  const minHeight = Math.max(ATTITUDE_MIN_HEIGHT_ABS, containerHeight * ATTITUDE_MIN_HEIGHT_PCT);

  // If already meets minimum, no adjustment needed
  if (attitudePlacement.height >= minHeight) {
    return { adjusted: placements, compressedRows };
  }

  // ── Identify unique rows and their current heights ──
  const rowHeightMap = new Map<number, number>(); // row → height
  for (const p of placements) {
    const existing = rowHeightMap.get(p.row);
    if (existing == null || p.height > existing) {
      rowHeightMap.set(p.row, p.height);
    }
  }

  const attitudeRow = attitudePlacement.row;
  const sortedRows = Array.from(rowHeightMap.keys()).sort((a, b) => a - b);
  const numRows = sortedRows.length;
  const totalGaps = (numRows - 1) * gap;

  // ── Redistribute: give attitude row its minimum, divide rest ──
  const attitudeHeight = minHeight;
  const remainingHeight = containerHeight - attitudeHeight - totalGaps;
  const otherRowCount = numRows - 1;
  const otherRowHeight = otherRowCount > 0
    ? Math.max(COMPRESSED_ROW_MIN_HEIGHT, remainingHeight / otherRowCount)
    : 0;

  // Mark non-attitude rows as compressed if they shrank
  for (const row of sortedRows) {
    if (row !== attitudeRow) {
      const originalHeight = rowHeightMap.get(row) ?? 0;
      if (otherRowHeight < originalHeight - 2) {
        compressedRows.add(row);
      }
    }
  }

  // ── Build per-row height map ──
  const newRowHeights = new Map<number, number>();
  for (const row of sortedRows) {
    newRowHeights.set(row, row === attitudeRow ? attitudeHeight : otherRowHeight);
  }

  // ── Recompute y-positions and heights ──
  const adjusted = placements.map(p => ({ ...p }));
  let currentY = 0;
  for (const row of sortedRows) {
    const rowH = newRowHeights.get(row)!;
    for (const p of adjusted) {
      if (p.row === row) {
        p.y = currentY;
        p.height = rowH;
      }
    }
    currentY += rowH + gap;
  }

  return { adjusted, compressedRows };
}

// ══════════════════════════════════════════════════════════════
// LANDSCAPE AUTO-REDUCTION (Phase 7)
//
// When the container height is below LANDSCAPE_HEIGHT_THRESHOLD
// and the layout contains a featured attitude monitor, reduce
// to showing only the Attitude Monitor + one compact widget
// (first non-attitude widget found). This prevents scrolling
// on landscape/short-height screens.
//
// Returns the reduced slot array, or the original if no reduction needed.
// ══════════════════════════════════════════════════════════════
function computeLandscapeReducedSlots(
  slots: WidgetSlot[],
  containerHeight: number,
  gridLayout: GridLayout,
): WidgetSlot[] | null {
  // Only apply to 2x2 featured layouts with short container
  if (gridLayout !== '2x2' || containerHeight <= 0 || containerHeight >= LANDSCAPE_HEIGHT_THRESHOLD) {
    return null;
  }

  // Check if attitude-monitor exists in a featured (2x1) slot
  const hasFeatureAttitude = slots.some(
    s => s.widgetType === 'attitude-monitor' && getSlotSize(s) === '2x1'
  );
  if (!hasFeatureAttitude) return null;

  // Build reduced set: Attitude Monitor (featured) + first non-attitude widget (compact)
  const attitudeSlot = slots.find(s => s.widgetType === 'attitude-monitor');
  const compactSlot = slots.find(s => s.widgetType && s.widgetType !== 'attitude-monitor');

  if (!attitudeSlot) return null;

  const reduced: WidgetSlot[] = [
    { ...attitudeSlot, slotIndex: 0, widgetSize: '2x1' },
  ];
  if (compactSlot) {
    reduced.push({ ...compactSlot, slotIndex: 1, widgetSize: '2x1' });
  }

  return reduced;
}


// ── Empty Slot Plate ───────────────────────────────────
function getDashboardModeLabel(dashboardMode?: DashboardMode, isHighway?: boolean): string {
  if (dashboardMode === 'highway' || isHighway) return 'HIGHWAY';
  return 'EXPEDITION';
}

function EmptySlotPlate({
  onPress,
  compact,
  isHighway,
  dashboardMode,
  layoutMode,
  isDropTarget,
}: {
  onPress: () => void;
  compact?: boolean;
  isHighway?: boolean;
  dashboardMode?: DashboardMode;
  layoutMode?: boolean;
  isDropTarget?: boolean;
}) {
  const pulseAnim = useStableAnimatedValue(0.45);
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.72, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.45, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulseAnim]);

  return (
    <TouchableOpacity
      style={[
        styles.emptySlot,
        isHighway && styles.emptySlotHighway,
        layoutMode && styles.emptySlotLayout,
        isDropTarget && styles.emptySlotDropTarget,
      ]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <View style={styles.slotHeaderRow}>
        <ECSBadge
          label={isDropTarget ? 'DROP TARGET' : 'EMPTY SLOT'}
          tone={isDropTarget ? 'selected' : 'info'}
          compact
        />
        <Text style={styles.slotContextLabel}>
          {getDashboardModeLabel(dashboardMode, isHighway)}
        </Text>
      </View>

      <View style={styles.emptySlotMain}>
        <View style={styles.emptySlotIconWrap}>
          <Animated.View style={{ opacity: pulseAnim }}>
            <Ionicons
              name={isDropTarget ? 'arrow-down-outline' : 'add'}
              size={compact ? 18 : isHighway ? 20 : 24}
              color={TACTICAL.amber}
            />
          </Animated.View>
        </View>
        <Text style={[styles.emptyText, compact && { fontSize: 6.5 }, isHighway && { fontSize: 7, letterSpacing: 1.5 }]}>
          {isDropTarget ? 'DROP HERE' : 'ADD WIDGET'}
        </Text>
        <Text style={[styles.emptyHint, isHighway && styles.emptyHintHighway]}>
          {isDropTarget
            ? 'Release to keep this slot open and aligned.'
            : layoutMode
              ? 'Choose a widget for this open slot.'
              : 'Open the widget library for this slot.'}
        </Text>
      </View>

      <View style={styles.emptySlotFooter}>
        <Text style={styles.emptyFooterText}>
          {layoutMode ? 'Tap to Assign' : 'Tap to Add'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Size Picker Badge ─────────────────────────────────────
function SizePickerBadge({
  currentSize,
  availableSizes,
  onCycle,
}: {
  currentSize: WidgetSize;
  availableSizes: WidgetSize[];
  onCycle: () => void;
}) {
  if (availableSizes.length <= 1) return null;

  const sizeConfig = WIDGET_SIZE_CONFIG[currentSize];

  return (
    <Pressable
      style={styles.sizeBadge}
      onPress={onCycle}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
    >
      <Ionicons name="resize-outline" size={10} color={TACTICAL.amber} />
      <Text style={styles.sizeBadgeText}>{sizeConfig.label}</Text>
    </Pressable>
  );
}

function areRenderOptionsEqual(
  prev?: WidgetRenderOptions,
  next?: WidgetRenderOptions,
) {
  return (
    prev?.dashboardMode === next?.dashboardMode &&
    prev?.compact === next?.compact &&
    prev?.rollDeg === next?.rollDeg &&
    prev?.pitchDeg === next?.pitchDeg &&
    prev?.sensorStatus === next?.sensorStatus &&
    prev?.sampleTimestampMs === next?.sampleTimestampMs &&
    prev?.isCalibrated === next?.isCalibrated &&
    prev?.onCalibrate === next?.onCalibrate &&
    prev?.onResetCalibration === next?.onResetCalibration &&
    prev?.stabilityData === next?.stabilityData &&
    prev?.advancedMode === next?.advancedMode &&
    prev?.viewerOverrides === next?.viewerOverrides &&
    prev?.gpsLatitude === next?.gpsLatitude &&
    prev?.gpsLongitude === next?.gpsLongitude &&
    prev?.gpsSpeedMph === next?.gpsSpeedMph &&
    prev?.gpsHasFix === next?.gpsHasFix &&
    prev?.gpsAccuracyM === next?.gpsAccuracyM &&
    prev?.gpsAltitudeFt === next?.gpsAltitudeFt &&
    prev?.gpsTimestampMs === next?.gpsTimestampMs &&
    prev?.isFeatured === next?.isFeatured &&
    prev?.isCompressedRow === next?.isCompressedRow &&
    prev?.onOpenCommandBrief === next?.onOpenCommandBrief
  );
}

function getLoadItemsSignature(loadItems?: { deleted_at?: string | null; packed?: boolean; weight_lbs?: number | null }[]) {
  if (!loadItems?.length) return '0:0:0';
  let activeCount = 0;
  let packedCount = 0;
  let totalWeight = 0;
  for (const item of loadItems) {
    if (item.deleted_at) continue;
    activeCount += 1;
    if (item.packed) packedCount += 1;
    totalWeight += item.weight_lbs ?? 0;
  }
  return `${activeCount}:${packedCount}:${Math.round(totalWeight)}`;
}

function getWaypointSignature(waypoints?: { latitude?: number; longitude?: number }[]) {
  if (!waypoints?.length) return '0';
  const first = waypoints[0];
  const last = waypoints[waypoints.length - 1];
  return [
    waypoints.length,
    first?.latitude ?? '',
    first?.longitude ?? '',
    last?.latitude ?? '',
    last?.longitude ?? '',
  ].join(':');
}

function getCompactWidgetRenderKey(
  widgetType: string | undefined,
  widgetData: WidgetGridProps['widgetData'],
  renderOptions?: WidgetRenderOptions,
) {
  const data = widgetData as any;
  const trip = data?.activeTrip;
  const activeVehicleContext = data?.activeVehicleContext;
  const telemetry = data?.telemetry;
  const gps = data?.gps;
  const baseTripKey = [
    trip?.id ?? '',
    trip?.updated_at ?? '',
    trip?.active_mode ?? '',
    trip?.route_distance_miles ?? '',
  ].join(':');

  switch (widgetType) {
    case 'attitude-monitor':
    case 'attitude-command':
      return [
        renderOptions?.rollDeg ?? '',
        renderOptions?.pitchDeg ?? '',
        renderOptions?.sensorStatus ?? '',
        renderOptions?.sampleTimestampMs ?? '',
        renderOptions?.isCalibrated ?? '',
        renderOptions?.advancedMode ?? '',
        renderOptions?.isFeatured ?? '',
        renderOptions?.isCompressedRow ?? '',
        activeVehicleContext?.profileSignature ?? '',
        activeVehicleContext?.activeVehicleId ?? '',
      ].join(':');
    case 'vehicle-systems':
      return [
        activeVehicleContext?.profileSignature ?? '',
        activeVehicleContext?.activeVehicleId ?? '',
        getLoadItemsSignature(data?.loadItems),
        telemetry?.hasData ?? '',
        telemetry?.freshnessLabel ?? '',
        telemetry?.engineStatus ?? '',
        data?.powerFreshness ?? '',
        data?.powerProviderLabel ?? '',
      ].join(':');
    case 'sustainability':
    case 'resource-forecast':
    case 'expedition-risk':
    case 'ecs-power':
      return [
        baseTripKey,
        activeVehicleContext?.profileSignature ?? '',
        activeVehicleContext?.activeVehicleId ?? '',
        data?.aiState?.readiness ?? '',
        data?.aiDashboardView ?? '',
        data?.powerFreshness ?? '',
        getLoadItemsSignature(data?.loadItems),
      ].join(':');
    case 'status-overview':
    case 'mission-sustainment':
    case 'operational-readiness':
    case 'route-progress':
    case 'loadout-readiness':
    case 'water-projection':
    case 'fuel-range':
    case 'vehicle-health':
    case 'emergency-controls':
      return [
        baseTripKey,
        getLoadItemsSignature(data?.loadItems),
        getWaypointSignature(data?.waypoints),
        data?.riskScore?.terrain_complexity ?? '',
        data?.riskScore?.weather_exposure ?? '',
        data?.syncStatus ?? '',
      ].join(':');
    case 'progress':
      return [
        baseTripKey,
        getWaypointSignature(data?.waypoints),
        renderOptions?.gpsLatitude ?? '',
        renderOptions?.gpsLongitude ?? '',
        renderOptions?.gpsSpeedMph ?? '',
        renderOptions?.gpsHasFix ?? '',
      ].join(':');
    case 'navigate-surface':
      return [
        data?.aiCompactLine ?? '',
        data?.aiTopSignalTitle ?? '',
        data?.dashboardCommandState?.metaMode ?? '',
        data?.dashboardCommandState?.compactSummary ?? '',
        renderOptions?.gpsLatitude ?? '',
        renderOptions?.gpsLongitude ?? '',
        renderOptions?.gpsSpeedMph ?? '',
        gps?.hasFix ?? renderOptions?.gpsHasFix ?? '',
      ].join(':');
    case 'hwy-forward-weather':
    case 'hwy-wind-monitor':
    case 'hwy-road-hazards':
    case 'hwy-sun-glare':
    case 'hwy-daylight-remaining':
    case 'hwy-cell-coverage':
    case 'hwy-elevation-profile':
      return [
        getWaypointSignature(data?.waypoints),
        renderOptions?.gpsLatitude ?? '',
        renderOptions?.gpsLongitude ?? '',
        renderOptions?.gpsHasFix ?? '',
        renderOptions?.gpsAltitudeFt ?? '',
        renderOptions?.gpsTimestampMs ?? '',
        data?.weatherSnapshot?.status?.kind ?? '',
        data?.weatherSnapshot?.current?.temp ?? '',
        data?.weatherSnapshot?.alerts?.length ?? '',
      ].join(':');
    case 'remoteness':
      return [
        renderOptions?.gpsHasFix ?? '',
        renderOptions?.gpsAccuracyM ?? '',
        renderOptions?.gpsAltitudeFt ?? '',
      ].join(':');
    default:
      return [
        baseTripKey,
        getLoadItemsSignature(data?.loadItems),
        getWaypointSignature(data?.waypoints),
        data?.syncStatus ?? '',
      ].join(':');
  }
}

// ── Widget Plate Content ──────────────────────────────────
const WidgetPlateContent = React.memo(function WidgetPlateContent({
  slot, layoutMode, isDropTarget, isDragging,
  widgetData, compact, expanded, isCompact,
  renderOptions, gridLayout, onResizeWidget,
  slotIndex,
  placement, isHighway, viewerOverrides, isVeryShortHeight, highwayWidgetPad,
  screenWidth, screenHeight,
}: {
  slot: WidgetSlot;
  layoutMode: boolean;
  isDropTarget: boolean;
  isDragging: boolean;
  widgetData: WidgetGridProps['widgetData'];
  compact?: boolean;
  expanded?: boolean;
  isCompact?: boolean;
  renderOptions?: WidgetRenderOptions;
  gridLayout: GridLayout;
  onResizeWidget?: (slotIndex: number, size: WidgetSize) => void;
  slotIndex: number;
  placement?: WidgetPlacement;
  isHighway?: boolean;
  viewerOverrides?: ViewerStyleOverrides;
  isVeryShortHeight?: boolean;
  highwayWidgetPad?: number;
  screenWidth?: number;
  screenHeight?: number;
}) {
  const registryEntry = slot.widgetType ? getWidgetEntry(slot.widgetType) : null;
  const hasRegistryEntry = Boolean(registryEntry && slot.widgetType);
  const currentSize = getSlotSize(slot);
  const widgetName = registryEntry?.display_name ?? slot.widgetType;
  const widgetIcon = registryEntry?.icon ?? 'apps-outline';
  const { palette, colors, isLight } = useTheme();
  const reducedMotion = useReducedMotion();
  const currentRenderedContentRef = useRef<React.ReactNode>(null);
  const previousModeContentRef = useRef<{ mode: 'compact' | 'full'; content: React.ReactNode } | null>(null);
  const [transitionSnapshot, setTransitionSnapshot] = useState<{
    mode: 'compact' | 'full';
    content: React.ReactNode;
  } | null>(null);
  const headerProgress = useStableAnimatedValue(isCompact ? 0 : 1);
  const handoffProgress = useStableAnimatedValue(1);
  const headerTarget = isCompact ? 0 : 1;
  const widgetMode = isCompact ? 'compact' : 'full';
  const widgetModeDuration = isCompact ? MOTION.widgetCollapse : MOTION.widgetExpand;
  const headerMinHeight = DASHBOARD_WIDGET_GRAMMAR.headerMinHeight + 4;
  const headerMarginBottom = isHighway ? 5 : compact ? 4 : expanded ? 8 : 6;
  const headerPaddingBottom = isHighway ? 4 : compact ? 4 : expanded ? 6 : 4;
  const widgetSupportedSizes = useMemo(() => {
    if (!slot.widgetType) return [currentSize];
    const layoutAvailable = getAvailableSizes(gridLayout);
    const supported = getDashboardSupportedSizes(slot.widgetType).filter((size): size is WidgetSize =>
      layoutAvailable.includes(size as WidgetSize)
    );
    return supported.length > 0 ? supported : [currentSize];
  }, [currentSize, gridLayout, slot.widgetType]);
  const canResizeThisWidget = !!slot.widgetType &&
    canResizeDashboardWidget(slot.widgetType) &&
    widgetSupportedSizes.length > 1;
  const handleCycleSize = React.useCallback(() => {
    if (!onResizeWidget || widgetSupportedSizes.length <= 1) return;
    const currentIndex = widgetSupportedSizes.indexOf(currentSize);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % widgetSupportedSizes.length : 0;
    const newSize = widgetSupportedSizes[nextIndex] ?? currentSize;
    onResizeWidget(slotIndex, newSize);
  }, [currentSize, onResizeWidget, slotIndex, widgetSupportedSizes]);

  useLayoutEffect(() => {
    if (!hasRegistryEntry) return;

    if (reducedMotion) {
      headerProgress.stopAnimation();
      headerProgress.setValue(headerTarget);
      return;
    }

    Animated.timing(headerProgress, {
      toValue: headerTarget,
      duration: widgetModeDuration,
      easing: ECS_EASE.smooth,
      useNativeDriver: false,
    }).start();
  }, [hasRegistryEntry, headerProgress, headerTarget, reducedMotion, slot.widgetType, widgetModeDuration]);

  useLayoutEffect(() => {
    if (!hasRegistryEntry) return;

    const previous = previousModeContentRef.current;
    if (reducedMotion || !previous || previous.mode === widgetMode) {
      handoffProgress.stopAnimation();
      handoffProgress.setValue(1);
      setTransitionSnapshot((current) => (current === null ? current : null));
      return;
    }

    setTransitionSnapshot((current) => (current === previous ? current : previous));
    handoffProgress.stopAnimation();
    handoffProgress.setValue(0);

    Animated.timing(handoffProgress, {
      toValue: 1,
      duration: widgetModeDuration,
      easing: ECS_EASE.smooth,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setTransitionSnapshot((current) => (current === null ? current : null));
    });
  }, [handoffProgress, hasRegistryEntry, reducedMotion, slot.widgetType, widgetMode, widgetModeDuration]);

  useLayoutEffect(() => {
    if (!hasRegistryEntry) return;
    previousModeContentRef.current = { mode: widgetMode, content: currentRenderedContentRef.current };
  });

  const isNavigateSurfaceSlot = slot.widgetType === 'navigate-surface';
  // ── Safe fallback: widget type is set but not found in catalog/registry ──
  if (slot.widgetType && !registryEntry) {
    const isInRegistry = isRegistered(slot.widgetType);
    logWidgetEvent('WIDGET_UNAVAILABLE', { widgetType: slot.widgetType, isInRegistry });
    return (
      <View style={[
        { flex: 1, position: 'relative', overflow: 'visible' },
        isDragging && { opacity: 0.25 },
      ]}>
        <View style={[
          styles.widgetPlate,
          layoutMode && styles.widgetPlateLayout,
          isLight ? { backgroundColor: palette.panel, borderColor: palette.border } : null,
          viewerOverrides?.panelBgOverride ? { backgroundColor: viewerOverrides.panelBgOverride } : null,
          viewerOverrides?.borderColorOverride ? { borderColor: viewerOverrides.borderColorOverride } : null,
        ]}>
          <WidgetContainerBackground />
          <View style={[styles.widgetContent, styles.widgetUnavailableContent]}>
            <View style={styles.slotHeaderRow}>
              <ECSBadge label="UNAVAILABLE" tone="unavailable" compact />
              <Text style={styles.slotContextLabel}>WIDGET SLOT</Text>
            </View>
            <View style={styles.emptySlotMain}>
              <View style={styles.emptySlotIconWrap}>
                <Ionicons name="alert-circle-outline" size={24} color={TACTICAL.textMuted} />
              </View>
              <Text style={styles.emptyText}>WIDGET UNAVAILABLE</Text>
              <Text style={styles.emptyHint}>{slot.widgetType}</Text>
            </View>
            <View style={styles.emptySlotFooter}>
              <Text style={styles.emptyFooterText}>
                {layoutMode ? 'Replace This Slot' : 'Open Replace Flow'}
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  }

  if (!registryEntry || !slot.widgetType) return null;

  const isMultiCell = placement && (placement.colSpan > 1 || placement.rowSpan > 1);
  const isFeaturedWidget = placement ? placement.colSpan > 1 : false;
  const opts: WidgetRenderOptions = {
    ...renderOptions,
    compact: isCompact,
    viewerOverrides,
    isFeatured: isFeaturedWidget,
    widgetWidth: placement?.width ?? null,
    widgetHeight: placement?.height ?? null,
    screenWidth: screenWidth ?? null,
    screenHeight: screenHeight ?? null,
  };

  // Phase 8: Attitude Monitor primary instrument cluster detection
  const isAttitudeMonitor = slot.widgetType === 'attitude-monitor' || slot.widgetType === 'attitude-command';
  const isNavigateSurface = isNavigateSurfaceSlot;

  const isNavigateSurfaceFullBleed =
    isNavigateSurface && !layoutMode;

  // ── Phase 11: Instrument Hierarchy tier resolution ──
  // Resolves visual weight tier (primary/secondary/support) for core instruments.
  // Non-core widgets get null → use default styling.
  const hierarchyStyle = getHierarchyStyle(slot.widgetType);

  // Viewer-aware colors
  const amberColor = viewerOverrides?.amberOverride || TACTICAL.amber;
  const textMutedColor = viewerOverrides?.mutedColorOverride || (isLight ? colors.textSecondary : TACTICAL.textMuted);
  const headerBorderColor = viewerOverrides?.brightenBg
    ? 'rgba(0,0,0,0.08)'
    : isLight
      ? palette.border
      : 'rgba(255,255,255,0.04)';

  // ── Phase 11: Hierarchy-derived title color ──
  // Primary (Attitude) → brighter amber, Secondary → standard, Support → subdued
  const titleColor = hierarchyStyle?.titleColor ?? (isLight ? palette.amber : TACTICAL.amber);
  const incomingOpacity = transitionSnapshot
    ? handoffProgress.interpolate({
        inputRange: [0, 0.18, 1],
        outputRange: [0, 0.18, 1],
        extrapolate: 'clamp',
      })
    : 1;
  const outgoingOpacity = handoffProgress.interpolate({
    inputRange: [0, WIDGET_MODE_HANDOFF_OUT, 1],
    outputRange: [1, 0.12, 0],
    extrapolate: 'clamp',
  });
  const incomingTranslateY = transitionSnapshot
    ? handoffProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [isCompact ? -WIDGET_MODE_SETTLE_PX : WIDGET_MODE_SETTLE_PX, 0],
        extrapolate: 'clamp',
      })
    : 0;
  const outgoingTranslateY = handoffProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, isCompact ? -WIDGET_MODE_SETTLE_PX : WIDGET_MODE_SETTLE_PX],
    extrapolate: 'clamp',
  });
  const renderedContent = slot.widgetType
    ? renderWidgetContent(slot.widgetType, widgetData, opts)
    : null;
  currentRenderedContentRef.current = renderedContent;

  return (
    <View style={[
      { flex: 1, position: 'relative', overflow: 'visible' },
      isDragging && { opacity: 0.25 },
    ]}>
      {/* Lock badge removed — all widgets are now user-manageable */}


      {/* Size picker badge (bottom-left in layout mode) — hidden in Highway precision */}
      {layoutMode && !isDragging && !!onResizeWidget && !isHighway && canResizeThisWidget && (
        <View style={styles.sizeBadgeContainer}>
          <SizePickerBadge
            currentSize={currentSize}
            availableSizes={widgetSupportedSizes}
            onCycle={handleCycleSize}
          />
        </View>
      )}

      <View style={[
        styles.widgetPlate,
        isHighway && styles.widgetPlateHighway,
        // Phase 9: Attitude Monitor gets instrument cluster border (now subsumed by hierarchy)
        isAttitudeMonitor && !isLight && styles.widgetPlateInstrument,
        // Phase 11: Instrument Hierarchy — tier-specific panel bg, border, shadow
        // Applied AFTER base styles so hierarchy overrides take precedence.
        // Primary: darker bg + gold border; Secondary: standard; Support: lighter bg + softer border
        hierarchyStyle && !isHighway && !layoutMode && !isLight && {
          backgroundColor: withPanelAlpha(hierarchyStyle.panelBg, 'D8'),
          borderColor: hierarchyStyle.borderColor,
          borderWidth: hierarchyStyle.borderWidth,
          shadowOpacity: hierarchyStyle.shadowOpacity,
          elevation: hierarchyStyle.elevation,
        },
        layoutMode && styles.widgetPlateLayout,
        isDropTarget && styles.widgetPlateDropTarget,
        isLight ? { backgroundColor: palette.panel, borderColor: palette.border } : null,
        viewerOverrides?.panelBgOverride ? { backgroundColor: viewerOverrides.panelBgOverride } : null,
        viewerOverrides?.borderColorOverride ? { borderColor: viewerOverrides.borderColorOverride } : null,
      ]}>
        {/* Phase 8/9: Inset shadow simulation — top-left inner highlight, bottom-right inner shadow */}
        {/* Phase 11: Hierarchy-aware inset tinting (primary=gold, secondary=neutral, support=soft) */}
        <WidgetContainerBackground />
        {!isAttitudeMonitor ? (
          <>
            <View style={[
              styles.widgetInsetTop,
              hierarchyStyle && !isLight ? { backgroundColor: hierarchyStyle.insetTopColor } : null,
            ]} pointerEvents="none" />
            <View style={[
              styles.widgetInsetBottom,
              hierarchyStyle && !isLight ? { backgroundColor: hierarchyStyle.insetBotColor } : null,
            ]} pointerEvents="none" />
          </>
        ) : null}



        <View style={[
          styles.widgetContent,
          isHighway && styles.widgetContentHighway,
          isHighway && { padding: highwayWidgetPad },
          compact && !isHighway && {
            paddingHorizontal: DASHBOARD_WIDGET_GRAMMAR.grid.compactPadX,
            paddingVertical: DASHBOARD_WIDGET_GRAMMAR.grid.compactPadY,
          },
          expanded && !isHighway && {
            paddingHorizontal: DASHBOARD_WIDGET_GRAMMAR.grid.expandedPadX,
            paddingVertical: DASHBOARD_WIDGET_GRAMMAR.grid.expandedPadY,
          },
          isCompact && {
            paddingHorizontal: DASHBOARD_WIDGET_GRAMMAR.grid.collapsedPadX,
            paddingVertical: DASHBOARD_WIDGET_GRAMMAR.grid.collapsedPadY,
          },
          isVeryShortHeight && !isHighway && !expanded && !isCompact && { paddingHorizontal: 11, paddingVertical: 10 },
          isAttitudeMonitor && !layoutMode && styles.widgetContentAttitudeStage,
          isNavigateSurfaceFullBleed && styles.widgetContentAttitudeStage,
        ]}>
          {/* Widget Header */}
          <Animated.View
            pointerEvents={isCompact ? 'none' : 'auto'}
            style={[
              styles.widgetHeaderWrap,
              isAttitudeMonitor && !layoutMode && styles.widgetHeaderAttitudeHidden,
              isNavigateSurfaceFullBleed && styles.widgetHeaderAttitudeHidden,
              {
                opacity: headerProgress,
                maxHeight: headerProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, headerMinHeight + headerMarginBottom + headerPaddingBottom + 2],
                  extrapolate: 'clamp',
                }),
                marginBottom: headerProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, headerMarginBottom],
                  extrapolate: 'clamp',
                }),
                transform: [
                  {
                    translateY: headerProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-4, 0],
                      extrapolate: 'clamp',
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={[
              styles.widgetHeader,
              isHighway && styles.widgetHeaderHighway,
              // Phase 9→11: Header divider uses gold tint for primary, standard for others
              isAttitudeMonitor && !isHighway && { borderBottomColor: GOLD_RAIL.instrumentHeader },
              compact && !isHighway && { marginBottom: 4, paddingBottom: 4 },
              expanded && !isHighway && { marginBottom: 8, paddingBottom: 6 },
              {
                minHeight: headerMinHeight,
                marginBottom: 0,
                paddingBottom: headerPaddingBottom,
                borderBottomColor: headerBorderColor,
              },
            ]}>

              <View style={styles.widgetIconWrap}>
                <Ionicons
                  name={widgetIcon as any}
                  size={isHighway ? 12 : compact ? 10 : expanded ? 15 : 13}
                  color={titleColor}
                />
              </View>
              <Text
                style={[
                  styles.widgetTitle,
                  isHighway && styles.widgetTitleHighway,
                  // Phase 11: Hierarchy-derived title color
                  { color: titleColor },
                  compact && !isHighway && { fontSize: DASHBOARD_WIDGET_GRAMMAR.grid.titleCompactFont },
                  expanded && !isHighway && { fontSize: DASHBOARD_WIDGET_GRAMMAR.grid.titleExpandedFont },
                ]}
                numberOfLines={1}
              >
                {widgetName}
              </Text>

              {layoutMode && !isDragging && (
                <Ionicons name="reorder-three-outline" size={14} color={TACTICAL.textMuted} />
              )}
              {registryEntry?.requires_advanced_mode && (
                <View style={styles.advIndicator}>
                  <Text style={styles.advIndicatorText}>ADV</Text>
                </View>
              )}
              {isMultiCell && !layoutMode && (
                <View style={styles.spanIndicator}>
                  <Text style={styles.spanIndicatorText}>
                    {WIDGET_SIZE_CONFIG[currentSize].label}
                  </Text>
                </View>
              )}
            </View>
          </Animated.View>


          {/* Widget Content — vertically centered in Highway mode */}
          <View style={[
            styles.widgetBody,
            isCompact && { justifyContent: 'center' },
            isHighway && styles.widgetBodyHighway,
          ]}>
            <View style={styles.widgetBodyTransitionRoot}>
              {transitionSnapshot ? (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.widgetBodyLayer,
                    transitionSnapshot.mode === 'compact'
                      ? styles.widgetBodyLayerCompact
                      : styles.widgetBodyLayerFull,
                    styles.widgetBodyLayerOverlay,
                    {
                      opacity: outgoingOpacity,
                      transform: [{ translateY: outgoingTranslateY }],
                    },
                  ]}
                >
                  {transitionSnapshot.content}
                </Animated.View>
              ) : null}
              <Animated.View
                style={[
                  styles.widgetBodyLayer,
                  isCompact ? styles.widgetBodyLayerCompact : styles.widgetBodyLayerFull,
                  {
                    opacity: incomingOpacity,
                    transform: [{ translateY: incomingTranslateY }],
                  },
                ]}
              >
                {renderedContent}
              </Animated.View>
            </View>
          </View>
        </View>
      </View>

      {/* Drop target glow overlay */}
      {isDropTarget && (
        <View style={styles.dropTargetOverlay} pointerEvents="none">
          <View style={styles.dropTargetBorder} />
        </View>
      )}
    </View>
  );
}, (prev, next) => {
  const compactRenderStateEqual =
    prev.isCompact === next.isCompact &&
    (
      !prev.isCompact ||
      getCompactWidgetRenderKey(prev.slot.widgetType ?? undefined, prev.widgetData, prev.renderOptions) ===
        getCompactWidgetRenderKey(next.slot.widgetType ?? undefined, next.widgetData, next.renderOptions)
    );

  return (
    prev.slot === next.slot &&
    prev.layoutMode === next.layoutMode &&
    prev.isDropTarget === next.isDropTarget &&
    prev.isDragging === next.isDragging &&
    compactRenderStateEqual &&
    (!prev.isCompact ? prev.widgetData === next.widgetData : true) &&
    prev.compact === next.compact &&
    prev.expanded === next.expanded &&
    prev.isCompact === next.isCompact &&
    areRenderOptionsEqual(prev.renderOptions, next.renderOptions) &&
    prev.gridLayout === next.gridLayout &&
    prev.onResizeWidget === next.onResizeWidget &&
    prev.slotIndex === next.slotIndex &&
    prev.placement?.colSpan === next.placement?.colSpan &&
    prev.placement?.rowSpan === next.placement?.rowSpan &&
    prev.isHighway === next.isHighway &&
    prev.viewerOverrides === next.viewerOverrides &&
    prev.isVeryShortHeight === next.isVeryShortHeight &&
    prev.highwayWidgetPad === next.highwayWidgetPad
  );
});

// ── Ghost Widget (floating overlay during drag) ───────
function DragGhost({
  slot, position, width, height,
}: {
  slot: WidgetSlot;
  position: Animated.ValueXY;
  width: number;
  height: number;
}) {
  const widgetDef = getFullWidgetCatalog().find(w => w.type === slot.widgetType);
  if (!widgetDef) return null;

  return (
    <Animated.View
      style={[
        styles.dragGhost,
        {
          width,
          height: Math.min(height, 120),
          transform: position.getTranslateTransform(),
        },
      ]}
      pointerEvents="none"
    >
      <View style={styles.dragGhostInner}>
        <View style={styles.dragGhostHeader}>
          <Ionicons name={widgetDef.icon as any} size={16} color={TACTICAL.amber} />
          <Text style={styles.dragGhostTitle} numberOfLines={1}>
            {widgetDef.name}
          </Text>
        </View>
        <View style={styles.dragGhostBody}>
          <Ionicons name="move-outline" size={24} color={TACTICAL.amber + '60'} />
          <Text style={styles.dragGhostHint}>DROP TO REORDER</Text>
        </View>
      </View>
    </Animated.View>
  );
}

// ── Main Grid ──────────────────────────────────────────
export default function WidgetGrid({
  slots, profile, gridLayout, layoutMode,
  onEmptySlotPress, onWidgetLongPress,
  onRemoveWidget, onSwapSlots, onResizeWidget, onRestoreDefaults,
  widgetData, dashboardMode, isCompact,
  rollDeg, pitchDeg, sensorStatus,
  sampleTimestampMs, isCalibrated, onCalibrate, onResetCalibration,
  advancedModeEnabled, perWidgetAutoCollapse,
  containerHeight,
  containerWidth: containerWidthProp,
  gpsLatitude, gpsLongitude, gpsSpeedMph, gpsHasFix, gpsAccuracyM, gpsAltitudeFt, gpsTimestampMs,
  onOpenCommandBrief,
}: WidgetGridProps) {

  const reducedMotion = useReducedMotion();
  const config = GRID_LAYOUT_CONFIG[gridLayout];
  const compact = gridLayout === '2x3' && !isHighwayPrecisionMode(dashboardMode, gridLayout);
  const expanded = gridLayout === '1x1' || gridLayout === '1x2' || gridLayout === '1x3';
  const isSingleColumn = config.cols === 1;
  const isHighway = isHighwayPrecisionMode(dashboardMode, gridLayout);
  const fixedDashboardHasMultiCell = hasFixedDashboardMultiCellSlots(slots);
  const placementSlots =
    gridLayout === '2x2' && fixedDashboardHasMultiCell
      ? trimTrailingEmptySlots(slots)
      : slots;
  const isFixedTwoByTwo = isFixedTwoByTwoDashboardMode(dashboardMode, gridLayout, placementSlots);
  const hasDominantAttitudeCommandSurface = placementSlots.some(
    (slot) => slot.widgetType === 'attitude-command' && getSlotSize(slot) === '2x2',
  );

  // ── Consumables revision counter (Phase 5: Sustainability single source of truth) ──
  // Subscribes to consumablesStore so that when Sustainability widget saves
  // fuel% or water gal, ALL sibling widgets (especially Vehicle Systems)
  // re-render and pick up the new build_weight / payload_margin values.
  const [consumablesRev, setConsumablesRev] = useState(0);
  useEffect(() => {
    const unsub = consumablesStore.subscribe(() => {
      setConsumablesRev(v => v + 1);
    });
    return unsub;
  }, []);

  // ── Self-measured width (fallback if parent doesn't provide containerWidth) ──
  const [measuredWidth, setMeasuredWidth] = useState(0);


  // ── Window Dimensions (reactive — updates on rotation / resize) ──
  // useWindowDimensions re-renders the component whenever the window
  // size changes (device rotation, split-screen, external display).
  // We use windowWidth as a dynamic fallback instead of the static
  // SCREEN_W_FALLBACK constant captured once at module load time.
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isShortHeight = windowHeight < 760;
  const isVeryShortHeight = windowHeight < 700;

  // Effective container width priority:
  // 1. containerWidthProp (from parent onLayout — most accurate)
  // 2. measuredWidth (from self onLayout — fallback)
  // 3. windowWidth (from useWindowDimensions — reactive fallback)
  // 4. SCREEN_W_FALLBACK (static — last resort, only on first frame)
  const containerWidth = containerWidthProp || measuredWidth || windowWidth || SCREEN_W_FALLBACK;

  // Track previous window dimensions to detect rotation/resize
  const prevWindowDimsRef = useRef({ width: windowWidth, height: windowHeight });

  // ── Invalidate self-measured width on rotation / resize ──
  // When the window dimensions change, our self-measured width is stale.
  // Reset it to 0 so we fall through to windowWidth (which is already
  // updated) until the next onLayout fires with the correct value.
  // Also re-measure the grid origin (absolute position on screen)
  // since rotation shifts the grid's screen-space coordinates.
  useEffect(() => {
    const prev = prevWindowDimsRef.current;
    const widthChanged = Math.abs(prev.width - windowWidth) > 2;
    const heightChanged = Math.abs(prev.height - windowHeight) > 2;

    if (widthChanged || heightChanged) {
      // Invalidate stale self-measurement
      setMeasuredWidth(0);
      prevWindowDimsRef.current = { width: windowWidth, height: windowHeight };

      // Log dimension change for QA debugging
      logLayoutEvent('DIMENSION_CHANGE', {
        prevWidth: prev.width,
        prevHeight: prev.height,
        newWidth: windowWidth,
        newHeight: windowHeight,
        isRotation: Math.abs(prev.width - windowHeight) < 20 && Math.abs(prev.height - windowWidth) < 20,
      });
    }
  }, [windowWidth, windowHeight]);

  // ── Viewer Settings (global, reactive) ─────────────────
  const { overrides: viewerOverrides, revision: viewerRevision } = useViewerSettings();
  const adaptive = useAdaptiveLayout();
  // Determine if this layout should fill the container height
  // (single-column layouts, 2x1, and 2x2 use fill-height when containerHeight is available)
  // 2x2 fill-height ensures the featured Attitude Monitor layout fills
  // the container without scrolling (3 effective rows in a 2x2 grid).
  const isFillHeight = !isHighway && containerHeight != null && containerHeight > 0
    && (isSingleColumn || gridLayout === '2x1' || gridLayout === '2x2');
  const gridPad = isHighway
    ? adaptive.dashboard.highwayGridPadding
    : adaptive.dashboard.gridPadding;
  const isLandscapeConstrained =
    windowWidth > windowHeight &&
    typeof containerHeight === 'number' &&
    containerHeight > 0 &&
    containerHeight < 430;
  const isSmallSurfaceConstrained =
    typeof containerHeight === 'number' &&
    containerHeight > 0 &&
    (containerHeight < 360 || containerWidth < 340);
  const useTightWidgetFit = isLandscapeConstrained || isSmallSurfaceConstrained || isVeryShortHeight;
  const widgetFitScale = useTightWidgetFit
    ? containerHeight && containerHeight < 320
      ? 0.68
      : 0.78
    : 1;
  const fixedTwoByTwoGridPad = Math.max(8, Math.round(gridPad * 0.58));
  const attitudeCommandGridPad = Math.max(
    6,
    Math.round(gridPad * (adaptive.isTablet ? 0.52 : 0.46)),
  );
  const basePlacementGridPad = hasDominantAttitudeCommandSurface
    ? attitudeCommandGridPad
    : isFixedTwoByTwo
      ? fixedTwoByTwoGridPad
      : gridPad;
  const baseGridGap = isHighway
    ? adaptive.dashboard.highwayGridGap
    : adaptive.dashboard.gridGap;
  const placementGridPad = useTightWidgetFit
    ? Math.max(4, Math.round(basePlacementGridPad * widgetFitScale))
    : basePlacementGridPad;
  const gridGap = useTightWidgetFit
    ? Math.max(5, Math.round(baseGridGap * widgetFitScale))
    : baseGridGap;
  const highwayWidgetPad = Math.max(14, adaptive.dashboard.widgetPadding);
  const highwayGridMaxWidth = useMemo(
    () => getHighwayGridMaxWidth(adaptive.isTablet, adaptive.isTabletWide),
    [adaptive.isTablet, adaptive.isTabletWide],
  );
  const placementContainerWidth = useMemo(() => {
    if (hasDominantAttitudeCommandSurface) return containerWidth;
    if (isHighway || !adaptive.isTablet) return containerWidth;
    return Math.min(
      containerWidth,
      adaptive.dashboard.frameMaxWidth ?? containerWidth,
      getStandardGridMaxWidth(gridLayout, adaptive.isTabletWide),
    );
  }, [
    adaptive.dashboard.frameMaxWidth,
    adaptive.isTablet,
    adaptive.isTabletWide,
    containerWidth,
    gridLayout,
    hasDominantAttitudeCommandSurface,
    isHighway,
  ]);
  const gridOffsetX = useMemo(
    () => (isHighway ? 0 : Math.max(0, (containerWidth - placementContainerWidth) / 2)),
    [containerWidth, isHighway, placementContainerWidth],
  );


  const renderOptions: WidgetRenderOptions = useMemo(() => ({
    dashboardMode: dashboardMode || 'expedition',
    compact: isCompact,
    rollDeg: rollDeg ?? null,
    pitchDeg: pitchDeg ?? null,
    sensorStatus: sensorStatus || 'OFFLINE',
    sampleTimestampMs: sampleTimestampMs ?? null,
    isCalibrated,
    onCalibrate,
    onResetCalibration,
    advancedMode: advancedModeEnabled,
    viewerOverrides,
    gpsLatitude,
    gpsLongitude,
    gpsSpeedMph,
    gpsHasFix,
    gpsAccuracyM,
    gpsAltitudeFt,
    gpsTimestampMs,
    onOpenCommandBrief,
  }), [
    advancedModeEnabled,
    dashboardMode,
    gpsAccuracyM,
    gpsAltitudeFt,
    gpsHasFix,
    gpsLatitude,
    gpsLongitude,
    gpsSpeedMph,
    gpsTimestampMs,
    isCalibrated,
    isCompact,
    onCalibrate,
    onOpenCommandBrief,
    onResetCalibration,
    pitchDeg,
    rollDeg,
    sampleTimestampMs,
    sensorStatus,
    viewerOverrides,
  ]);


  // ── Compute Placements ─────────────────────────────────
  // Depends on containerWidth (which reactively updates via
  // useWindowDimensions when the device rotates or resizes).
  //
  // Phase 7: Integrates Attitude Monitor minimum size enforcement
  // and landscape auto-reduction for short-height screens.
  const placementResult = useMemo(() => {
    if (isHighway) {
      return {
        ...computeHighwayPlacements(
          placementSlots,
          containerHeight || 0,
          containerWidth,
          placementGridPad,
          gridGap,
          highwayGridMaxWidth,
        ),
        compressedRows: new Set<number>(),
        isLandscapeReduced: false,
      };
    }

    if (isFixedTwoByTwo) {
      return {
        ...computeFixedTwoByTwoPlacements(
          placementSlots,
          containerHeight || 0,
          placementContainerWidth,
          placementGridPad,
          gridGap,
        ),
        compressedRows: new Set<number>(),
        isLandscapeReduced: false,
      };
    }

    // ── Phase 7: Landscape auto-reduction ──
    // On short-height screens with a featured Attitude Monitor,
    // reduce to 2 widgets (Attitude + one compact) to prevent scrolling.
    const reducedSlots = computeLandscapeReducedSlots(placementSlots, containerHeight || 0, gridLayout);
    const effectiveSlots = reducedSlots || placementSlots;
    const isLandscapeReduced = reducedSlots !== null;

    // ── Compute standard placements ──
    const baseResult = computePlacements(
      effectiveSlots,
      gridLayout,
      containerHeight,
      isCompact,
      placementContainerWidth,
      placementGridPad,
      gridGap,
    );

    // ── Phase 7: Enforce Attitude Monitor minimum height ──
    // Post-process placements to guarantee the featured Attitude Monitor
    // meets its minimum height constraint. Non-featured rows compress first.
    const gap = gridGap;
    const { adjusted, compressedRows } = enforceFeaturedMinHeight(
      baseResult.placements,
      containerHeight || 0,
      gap,
    );

    // Recompute totalHeight from adjusted placements
    let adjustedTotalHeight = baseResult.totalHeight;
    if (adjusted !== baseResult.placements) {
      let maxBottom = 0;
      for (const p of adjusted) {
        maxBottom = Math.max(maxBottom, p.y + p.height);
      }
      adjustedTotalHeight = maxBottom;
    }

    return {
      placements: adjusted,
      totalHeight: adjustedTotalHeight,
      cellW: baseResult.cellW,
      cellH: baseResult.cellH,
      gridWidth: placementContainerWidth - placementGridPad * 2,
      offsetX: gridOffsetX,
      compressedRows,
      isLandscapeReduced,
    };
  }, [
    placementSlots,
    gridLayout,
    containerHeight,
    isCompact,
    isHighway,
    highwayGridMaxWidth,
    isFixedTwoByTwo,
    containerWidth,
    placementContainerWidth,
    gridOffsetX,
    placementGridPad,
    gridGap,
  ]);


  const { placements, totalHeight, cellW, cellH, compressedRows, isLandscapeReduced, offsetX } = placementResult;
  const layoutSignature = useMemo(
    () => placements.map((p) => `${p.slotIndex}:${Math.round(p.x)}:${Math.round(p.y)}:${Math.round(p.width)}:${Math.round(p.height)}`).join('|'),
    [placements],
  );
  const layoutTransitionRef = useRef<{ compact: boolean; signature: string } | null>(null);

  useEffect(() => {
    enableLegacyAndroidLayoutAnimation();
  }, []);

  useEffect(() => {
    const previous = layoutTransitionRef.current;
    if (
      !reducedMotion &&
      previous &&
      previous.compact !== Boolean(isCompact) &&
      previous.signature !== layoutSignature
    ) {
      LayoutAnimation.configureNext(
        createWidgetModeLayoutAnimation(isCompact ? MOTION.widgetCollapse : MOTION.widgetExpand),
      );
    }

    layoutTransitionRef.current = {
      compact: Boolean(isCompact),
      signature: layoutSignature,
    };
  }, [isCompact, layoutSignature, reducedMotion]);

  // Build a map from slotIndex to placement for quick lookup
  const placementMap = useMemo(() => {
    const map = new Map<number, WidgetPlacement>();
    for (const p of placements) map.set(p.slotIndex, p);
    return map;
  }, [placements]);


  // ── Drag State ─────────────────────────────────────────
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const dragPosition = useStableAnimatedValueXY({ x: 0, y: 0 });
  const gridOriginRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);

  // ── Swap Animation System ──────────────────────────────
  const prevWidgetPosRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const slideAnimsRef = useRef<Map<number, { x: Animated.Value; y: Animated.Value }>>(new Map());
  const [slideVersion, setSlideVersion] = useState(0);
  const skipNextTrackRef = useRef(true);

  // Reset drag state when exiting layout mode
  useEffect(() => {
    if (!layoutMode) {
      setDragIndex(null);
      setDropTarget(null);
      isDraggingRef.current = false;
    }
  }, [layoutMode]);

  // Skip animation on initial mount and when grid layout changes
  useEffect(() => {
    skipNextTrackRef.current = true;
  }, [gridLayout]);

  // ── Detect position changes and set up slide animations ──
  useLayoutEffect(() => {
    const prevMap = prevWidgetPosRef.current;
    const newAnims = new Map<number, { x: Animated.Value; y: Animated.Value }>();
    let hasChanges = false;

    if (!skipNextTrackRef.current && prevMap.size > 0) {
      for (const p of placements) {
        if (!p.slot.widgetType) continue;
        const key = p.slot.widgetType;
        const prev = prevMap.get(key);

        if (prev && (Math.abs(prev.x - p.x) > 1 || Math.abs(prev.y - p.y) > 1)) {
          const offsetX = prev.x - p.x;
          const offsetY = prev.y - p.y;
          newAnims.set(p.slotIndex, {
            x: new Animated.Value(offsetX),
            y: new Animated.Value(offsetY),
          });
          hasChanges = true;
        }
      }
    }

    // Update position map for next comparison
    const newMap = new Map<string, { x: number; y: number }>();
    for (const p of placements) {
      if (p.slot.widgetType) {
        newMap.set(p.slot.widgetType, { x: p.x, y: p.y });
      }
    }
    prevWidgetPosRef.current = newMap;

    if (skipNextTrackRef.current) {
      skipNextTrackRef.current = false;
    }

    if (hasChanges) {
      slideAnimsRef.current = newAnims;
      setSlideVersion(v => v + 1);
    }
  }, [placements]);

  // ── Start slide animations after re-render ──────────────
  useEffect(() => {
    const anims = slideAnimsRef.current;
    if (anims.size === 0) return;

    const animations: Animated.CompositeAnimation[] = [];
    anims.forEach((anim) => {
      animations.push(
        Animated.timing(anim.x, {
          toValue: 0,
          duration: SWAP_ANIM_DURATION,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(anim.y, {
          toValue: 0,
          duration: SWAP_ANIM_DURATION,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      );
    });

    Animated.parallel(animations).start(() => {
      slideAnimsRef.current = new Map();
    });
  }, [slideVersion]);

  // ── Measure grid container position ────────────────────
  const handleGridLayout = useCallback((e: LayoutChangeEvent) => {
    const { width } = e.nativeEvent.layout;
    // Self-measure width (used as fallback if containerWidth prop not provided)
    if (width > 0 && !containerWidthProp) {
      setMeasuredWidth((prev) => (Math.abs(prev - width) < 2 ? prev : width));
    }
    const ref = e.target;
    if (ref && typeof (ref as any).measureInWindow === 'function') {
      (ref as any).measureInWindow((x: number, y: number) => {
        gridOriginRef.current = { x: x || 0, y: y || 0 };
      });
    }
  }, [containerWidthProp]);

  // ── Find which slot a screen point is over ─────────────
  const findSlotAtPosition = useCallback((pageX: number, pageY: number): number | null => {
    const gridX = pageX - gridOriginRef.current.x - placementGridPad - offsetX;
    const gridY = pageY - gridOriginRef.current.y;

    let bestSlot: number | null = null;
    let bestDist = Infinity;

    for (const p of placements) {
      const hitPad = 8;
      if (
        gridX >= p.x - hitPad &&
        gridX <= p.x + p.width + hitPad &&
        gridY >= p.y - hitPad &&
        gridY <= p.y + p.height + hitPad
      ) {
        const cx = p.x + p.width / 2;
        const cy = p.y + p.height / 2;
        const dist = Math.sqrt((gridX - cx) ** 2 + (gridY - cy) ** 2);
        if (dist < bestDist) {
          bestDist = dist;
          bestSlot = p.slotIndex;
        }
      }
    }
    return bestSlot;
  }, [placementGridPad, offsetX, placements]);

  // ── Create PanResponder for a specific slot ────────────
  const createPanResponder = useCallback((slotIndex: number) => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) => {
        if (!layoutMode) return false;
        return Math.abs(gs.dx) > 5 || Math.abs(gs.dy) > 5;
      },
      onMoveShouldSetPanResponderCapture: (_, gs) => {
        if (!layoutMode) return false;
        return Math.abs(gs.dx) > 8 || Math.abs(gs.dy) > 8;
      },
      onPanResponderGrant: () => {
        if (!layoutMode) return;
        const slot = slots[slotIndex];
        if (!slot || !slot.widgetType) return;

        isDraggingRef.current = true;
        setDragIndex(slotIndex);

        const placement = placementMap.get(slotIndex);
        if (placement) {
          dragStartRef.current = { x: placement.x + placementGridPad + offsetX, y: placement.y };
          dragPosition.setValue({ x: placement.x + placementGridPad + offsetX, y: placement.y });
        }
      },
      onPanResponderMove: (_, gs) => {
        if (!isDraggingRef.current) return;

        dragPosition.setValue({
          x: dragStartRef.current.x + gs.dx,
          y: dragStartRef.current.y + gs.dy,
        });

        const target = findSlotAtPosition(gs.moveX, gs.moveY);
        setDropTarget(target !== null && target !== slotIndex ? target : null);
      },
      onPanResponderRelease: (_, gs) => {
        if (!isDraggingRef.current) return;

        const target = findSlotAtPosition(gs.moveX, gs.moveY);
        if (target !== null && target !== slotIndex) {
          onSwapSlots(slotIndex, target);
        }

        isDraggingRef.current = false;
        setDragIndex(null);
        setDropTarget(null);
        dragPosition.setValue({ x: 0, y: 0 });
      },
      onPanResponderTerminate: () => {
        isDraggingRef.current = false;
        setDragIndex(null);
        setDropTarget(null);
        dragPosition.setValue({ x: 0, y: 0 });
      },
    });
  }, [dragPosition, findSlotAtPosition, placementGridPad, layoutMode, offsetX, onSwapSlots, placementMap, slots]);

  // ── Memoize PanResponders per slot ─────────────────────
  const panResponders = useMemo(() => {
    const map = new Map<number, ReturnType<typeof PanResponder.create>>();
    for (const p of placements) {
      if (p.slot.widgetType && layoutMode) {
        map.set(p.slotIndex, createPanResponder(p.slotIndex));
      }
    }
    return map;
  }, [placements, layoutMode, createPanResponder]);

  // Ghost rendering data
  const draggedSlot = dragIndex !== null ? slots[dragIndex] : null;
  const draggedPlacement = dragIndex !== null ? placementMap.get(dragIndex) : null;

  // ── Compute grid container height style ────────────────
  // For fill-height layouts, use flex: 1 to fill the parent container.
  // For non-fill-height layouts, use the computed totalHeight.
  const gridHeightStyle = isHighway
    ? { flex: 1 as number }
    : isFillHeight
      ? { flex: 1 as number }
      : { height: totalHeight };

  // ── Centering pad — explicit offset replaces paddingHorizontal ──
  // Absolute children in React Native may not respect parent padding
  // consistently across platforms. Using an explicit left offset
  // guarantees widgets are centered within the container.
  // ── Render grid content ────────────────────────────────
  const gridContent = (
    <View
      style={[
        styles.grid,
        {
          width: '100%',
          alignSelf: 'stretch' as const,
        },
        gridHeightStyle,
      ]}
      onLayout={handleGridLayout}
    >
      {placements.map((p) => {
        const slot = p.slot;
        const isEmpty = !slot.widgetType;
        const isDragging = dragIndex === p.slotIndex;
        const isDropTargetSlot = dropTarget === p.slotIndex;
        const pr = panResponders.get(p.slotIndex);

        let widgetIsCompact = isCompact;
        if (slot.widgetType && perWidgetAutoCollapse && isCompact) {
          const override = perWidgetAutoCollapse[slot.widgetType];
          if (override === false) widgetIsCompact = false;
        }

        // Phase 7: Detect compressed rows (non-featured widgets that were
        // shrunk to accommodate the Attitude Monitor minimum height)
        const isInCompressedRow = compressedRows.has(p.row);

        const slotRenderOptions: WidgetRenderOptions = {
          ...renderOptions,
          compact: widgetIsCompact,
          isCompressedRow: isInCompressedRow,
        };

        const slideAnim = slideAnimsRef.current.get(p.slotIndex);
        const hasSlideAnim = !!slideAnim;

        // Check if widget can be removed
        const registryEntry = slot.widgetType ? getWidgetEntry(slot.widgetType) : null;
        const canRemove = registryEntry ? registryEntry.removable : true;
        const widgetMenuLongPressEnabled = slot.widgetType !== 'attitude-command';

        // Absolute positioning with explicit pad offset for centering.
        // p.x is in content-area coordinates (0-based within the padded zone).
        // Adding placementGridPad shifts widgets inward so they are visually centered.
        const positionStyle = {
          position: 'absolute' as const,
          left: p.x + placementGridPad + offsetX,
          top: p.y,
          width: p.width,
          height: p.height,
        };


        return (
          <Animated.View
            key={p.slotIndex}
            style={[
              positionStyle,
              { overflow: 'visible' },
              hasSlideAnim && {
                transform: [
                  { translateX: slideAnim!.x },
                  { translateY: slideAnim!.y },
                ],
              },
            ]}
          >
            {isEmpty ? (
              <EmptySlotPlate
                onPress={() => onEmptySlotPress(p.slotIndex)}
                compact={compact}
                isHighway={isHighway}
                dashboardMode={dashboardMode}
                layoutMode={layoutMode}
                isDropTarget={layoutMode && isDropTargetSlot}
              />
            ) : (
              <>
                <View style={{ flex: 1 }} {...(pr ? pr.panHandlers : {})}>
                  <TouchableOpacity
                    style={{ flex: 1 }}
                    onPress={() => {
                      if (!layoutMode && slot.widgetType === 'expedition-readiness') {
                        onOpenCommandBrief?.();
                        return;
                      }
                      if (!layoutMode && slot.widgetType === 'hwy-forward-weather') onWidgetLongPress(slot);
                    }}
                    onLongPress={
                      widgetMenuLongPressEnabled
                        ? () => {
                          if (!layoutMode) onWidgetLongPress(slot);
                        }
                        : undefined
                    }
                    delayLongPress={500}
                    activeOpacity={1}
                    disabled={isDragging}
                  >
                    <WidgetPlateContent
                      slot={slot}
                      layoutMode={layoutMode}
                      isDropTarget={isDropTargetSlot}
                      isDragging={isDragging}
                      widgetData={widgetData}
                      compact={compact}
                      expanded={expanded}
                      isCompact={widgetIsCompact}
                      renderOptions={slotRenderOptions}
                      gridLayout={gridLayout}
                      onResizeWidget={onResizeWidget}
                      slotIndex={p.slotIndex}
                      placement={p}
                      isHighway={isHighway}
                      viewerOverrides={viewerOverrides}
                      isVeryShortHeight={isVeryShortHeight}
                      highwayWidgetPad={highwayWidgetPad}
                      screenWidth={windowWidth}
                      screenHeight={windowHeight}
                    />

                  </TouchableOpacity>
                </View>

                {/* Remove button — rendered AFTER widget content so it's on top */}
                {layoutMode && canRemove && !isDragging && (
                  <Pressable
                    style={styles.removeBtn}
                    onPress={() => {
                      onRemoveWidget(p.slotIndex);
                    }}
                    hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                  >
                    <View style={styles.removeBtnInner}>
                      <Ionicons name="close" size={14} color="#FFF" />
                    </View>
                  </Pressable>
                )}
              </>
            )}
          </Animated.View>
        );
      })}

      {/* ── Drag Ghost Overlay ─────────────────────────── */}
      {dragIndex !== null && draggedSlot && draggedSlot.widgetType && (
        <DragGhost
          slot={draggedSlot}
          position={dragPosition}
          width={draggedPlacement?.width ?? cellW}
          height={draggedPlacement?.height ?? cellH}
        />
      )}
    </View>
  );

  // ── Highway Precision: no scroll, flex fill, centered ──
  if (isHighway) {
    return (
      <View style={styles.highwayContainer}>
        {gridContent}
      </View>
    );
  }

  // ── Fill-height: flex container, no scroll ─────────────
  if (isFillHeight) {
    return <View style={styles.fillHeightContainer}>{gridContent}</View>;
  }

  // ── Scrollable layouts (2x3, 1x3, or when content overflows) ──
  const needsScroll = gridLayout === '2x3' || gridLayout === '1x3' || totalHeight > (containerHeight || 400);
  if (needsScroll) {
    return (
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={false}
        scrollEnabled={dragIndex === null}
      >
        {gridContent}
      </ScrollView>
    );
  }

  return gridContent;
}

const styles = StyleSheet.create({
  grid: {
    position: 'relative',
    overflow: 'visible',
  },
  scrollContainer: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    paddingTop: 2,
    paddingBottom: DENSITY.screenPad + 6,
    width: '100%',
    alignItems: 'center',
  },

  // ── Fill-height container (single-column, 2x1) ─────
  fillHeightContainer: {
    flex: 1,
    width: '100%',
    alignSelf: 'stretch',
    paddingBottom: 2,
  },

  // ── Highway Precision Container ─────────────────────
  highwayContainer: {
    flex: 1,
    width: '100%',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'stretch',
    paddingTop: 2,
    paddingBottom: 2,
  },

  emptySlot: {
    flex: 1,
    borderRadius: 16,
    borderWidth: DENSITY.borderDefault,
    borderColor: 'rgba(196,138,44,0.14)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  emptySlotHighway: {
    borderRadius: HWY_BORDER_RADIUS,
    borderColor: 'rgba(196,138,44,0.12)',
    backgroundColor: 'rgba(255,255,255,0.018)',
  },
  emptySlotLayout: {
    borderColor: TACTICAL.accent + 'C0',
    backgroundColor: 'rgba(62,79,60,0.08)',
  },
  emptySlotDropTarget: {
    borderColor: TACTICAL.amber,
    borderWidth: 1.5,
    backgroundColor: 'rgba(181,139,58,0.06)',
  },
  emptySlotIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(196,138,44,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.18)',
  },
  emptySlotMain: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyText: {
    ...TYPO.U3,
    fontSize: 8,
    color: TACTICAL.textMuted,
    letterSpacing: 1.4,
  },
  emptyHint: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    opacity: 0.78,
    textAlign: 'center',
  },
  emptyHintHighway: {
    fontSize: 8,
    lineHeight: 11,
  },
  emptySlotFooter: {
    width: '100%',
    minHeight: 18,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(196,138,44,0.08)',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  emptyFooterText: {
    ...TYPO.U2,
    fontSize: 8,
    color: TACTICAL.amber,
    letterSpacing: 1.2,
  },
  slotHeaderRow: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  slotContextLabel: {
    ...TYPO.U2,
    fontSize: 8,
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },

  // ══════════════════════════════════════════════════════
  // ADAPTIVE DEPTH UI — Widget Instrument Panels
  //
  // Widget plates use the ECS Depth System for layered elevation:
  //   Level 2 — Standard widget container (instrument panel)
  //   Level 3 — Active/focused widget (elevated on interaction)
  //   Level 5 — Drag ghost (floating maximum elevation)
  //
  // Design: Soft shadow, slight elevation, tactical dark panel,
  //   10px corner radius, thin machined edge borders.
  //   Interactive: ~1.02 scale + increased shadow on press.
  // ══════════════════════════════════════════════════════

  widgetPlate: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: withPanelAlpha(DEPTH_PANELS[2].backgroundColor, 'D8'),
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.18)',
    overflow: 'hidden',
    // Adaptive Depth Level 2 — standard widget elevation
    shadowColor: DEPTH_SHADOWS[2].shadowColor,
    shadowOffset: DEPTH_SHADOWS[2].shadowOffset,
    shadowOpacity: DEPTH_SHADOWS[2].shadowOpacity,
    shadowRadius: DEPTH_SHADOWS[2].shadowRadius,
    elevation: DEPTH_SHADOWS[2].elevation,
  },

  // Adaptive Depth: Inset shadow simulation — top edge highlight
  widgetContainerBackgroundLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  widgetContainerBackground: {
    flex: 1,
  },
  widgetContainerBackgroundImage: {
    borderRadius: 16,
  },

  widgetInsetTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: DEPTH_INSETS[2].topHeight,
    backgroundColor: DEPTH_INSETS[2].topColor,
    zIndex: 1,
  },

  // Adaptive Depth: Inset shadow simulation — bottom edge shadow
  widgetInsetBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: DEPTH_INSETS[2].bottomHeight,
    backgroundColor: DEPTH_INSETS[2].bottomColor,
    zIndex: 1,
  },

  // Attitude Monitor — gold-tinted instrument cluster (Depth Level 3)
  widgetPlateInstrument: {
    borderWidth: 1,
    borderColor: GOLD_RAIL.instrument,
    backgroundColor: withPanelAlpha(DEPTH_PANELS[3].backgroundColor, 'DD'),
    // Depth Level 3 — primary instrument elevation
    shadowOpacity: DEPTH_SHADOWS[3].shadowOpacity,
    shadowRadius: DEPTH_SHADOWS[3].shadowRadius,
    shadowOffset: DEPTH_SHADOWS[3].shadowOffset,
    elevation: DEPTH_SHADOWS[3].elevation,
  },


  widgetPlateHighway: {
    borderRadius: 16,
    backgroundColor: withPanelAlpha(DEPTH_PANELS[1].backgroundColor, 'D0'),
    borderColor: 'rgba(196,138,44,0.14)',
    // Highway uses slightly reduced depth
    shadowOpacity: DEPTH_SHADOWS[1].shadowOpacity,
    shadowRadius: DEPTH_SHADOWS[1].shadowRadius,
    elevation: DEPTH_SHADOWS[1].elevation,
  },

  // Layout mode — Depth Level 3 (active/focused elevation)
  widgetPlateLayout: {
    borderColor: TACTICAL.amber + '80',
    borderWidth: 1.5,
    // Adaptive Depth Level 3 — elevated during interaction
    shadowColor: DEPTH_SHADOWS[3].shadowColor,
    shadowOffset: DEPTH_SHADOWS[3].shadowOffset,
    shadowOpacity: DEPTH_SHADOWS[3].shadowOpacity,
    shadowRadius: DEPTH_SHADOWS[3].shadowRadius,
    elevation: DEPTH_SHADOWS[3].elevation,
  },

  // Drop target — Depth Level 3 with amber accent
  widgetPlateDropTarget: {
    borderColor: TACTICAL.amber,
    borderWidth: 2,
    // Adaptive Depth Level 3
    shadowColor: DEPTH_SHADOWS[3].shadowColor,
    shadowOffset: DEPTH_SHADOWS[3].shadowOffset,
    shadowOpacity: DEPTH_SHADOWS[3].shadowOpacity,
    shadowRadius: DEPTH_SHADOWS[3].shadowRadius,
    elevation: DEPTH_SHADOWS[3].elevation,
  },


  widgetContent: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: DASHBOARD_WIDGET_GRAMMAR.grid.defaultPadX,
    paddingVertical: DASHBOARD_WIDGET_GRAMMAR.grid.defaultPadY,
    zIndex: 2,                               // Above inset shadow overlays
  },
  widgetContentAttitudeStage: {
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  widgetUnavailableContent: {
    justifyContent: 'space-between',
  },
  widgetContentHighway: {
    padding: HWY_WIDGET_PAD,
    justifyContent: 'flex-start',
    minHeight: 0,
  },
  widgetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: DASHBOARD_WIDGET_GRAMMAR.grid.headerGap,
    minHeight: DASHBOARD_WIDGET_GRAMMAR.headerMinHeight + 4,
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: DENSITY.borderDefault,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  widgetHeaderWrap: {
    overflow: 'hidden',
  },
  widgetHeaderAttitudeHidden: {
    display: 'none',
  },
  widgetHeaderHighway: {
    minHeight: 24,
    marginBottom: 5,
    paddingBottom: 4,
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  widgetIconWrap: {
    width: DASHBOARD_WIDGET_GRAMMAR.grid.headerIconSlot,
    alignItems: 'center',
    justifyContent: 'center',
  },
  widgetTitle: {
    ...TYPO.U2,
    fontSize: DASHBOARD_WIDGET_GRAMMAR.grid.titleFont,
    letterSpacing: DASHBOARD_WIDGET_GRAMMAR.grid.titleLetterSpacing,
    lineHeight: DASHBOARD_WIDGET_GRAMMAR.grid.titleLineHeight,
    color: TACTICAL.amber,
    flex: 1,
    flexShrink: 1,
  },
  widgetTitleHighway: {
    fontSize: 11,
    letterSpacing: 2,
  },

  widgetBody: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    justifyContent: 'flex-start',
  },
  widgetBodyHighway: {
    flex: 1,
    justifyContent: 'flex-start',
    overflow: 'hidden',
  },
  widgetBodyTransitionRoot: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
    justifyContent: 'center',
  },
  widgetBodyLayer: {
    flex: 1,
    minHeight: 0,
  },
  widgetBodyLayerCompact: {
    justifyContent: 'center',
  },
  widgetBodyLayerFull: {
    justifyContent: 'flex-start',
  },
  widgetBodyLayerOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },

  advIndicator: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: 'rgba(156,136,255,0.10)',
  },
  advIndicatorText: {
    ...TYPO.U2,
    fontSize: 6,
    color: '#9C88FF',
  },

  spanIndicator: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: 'rgba(181,139,58,0.08)',  // Phase 8: desaturated amber bg
  },
  spanIndicatorText: {
    fontSize: 7,
    fontWeight: '700',
    color: TACTICAL.amber + '70',
    letterSpacing: 1,
  },

  removeBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 9999,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnInner: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: TACTICAL.danger,
    alignItems: 'center',
    justifyContent: 'center',
    // Phase 8: Dark shadow only
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.6,
    shadowRadius: 3,
    elevation: 8,
  },

  lockBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    zIndex: 9999,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: TACTICAL.bg,
    borderWidth: DENSITY.borderDefault,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  sizeBadgeContainer: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    zIndex: 9999,
  },
  sizeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: TACTICAL.bg,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '50',      // Phase 8: muted solid edge
    // Phase 8: Dark shadow only
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 3,
    elevation: 6,
  },
  sizeBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1,
  },

  dropTargetOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 10,
    overflow: 'hidden',
  },
  // Phase 8: Drop target border — solid, no glow
  dropTargetBorder: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: TACTICAL.amber,
    borderStyle: 'dashed',
    backgroundColor: 'rgba(181,139,58,0.04)',  // Phase 8: subtle muted amber
  },

  // Adaptive Depth: Drag ghost — maximum elevation (Depth Level 5)
  dragGhost: {
    position: 'absolute',
    zIndex: 10000,
    borderRadius: DEPTH_PANELS[5].borderRadius,         // 12px — modal radius
    backgroundColor: DEPTH_PANELS[5].backgroundColor + 'E8',
    borderWidth: DEPTH_PANELS[5].borderWidth,
    borderColor: TACTICAL.amber + 'A0',
    // Depth Level 5 — maximum floating elevation
    shadowColor: DEPTH_SHADOWS[5].shadowColor,
    shadowOffset: DEPTH_SHADOWS[5].shadowOffset,
    shadowOpacity: DEPTH_SHADOWS[5].shadowOpacity,
    shadowRadius: DEPTH_SHADOWS[5].shadowRadius,
    elevation: DEPTH_SHADOWS[5].elevation,
    overflow: 'hidden',
  },

  dragGhostInner: {
    flex: 1,
    padding: 12,
  },
  dragGhostHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(181,139,58,0.15)', // Phase 8: muted amber
  },
  dragGhostTitle: {
    ...TYPO.U2,
    fontSize: 10,
    color: TACTICAL.amber,
    flex: 1,
  },
  dragGhostBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dragGhostHint: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.amber + '70',
    letterSpacing: 2,
  },
});
