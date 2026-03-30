/**
 * ECS UI Consistency Constants
 * ════════════════════════════════════════════════════════════════
 * Standardized presets for common UI patterns.
 * All values derived from existing ECS / DENSITY / TYPO / SPACING tokens.
 *
 * PURPOSE:
 *   Eliminate ad-hoc spacing, sizing, and styling across the app.
 *   Every button, card, list row, close button, and modal header
 *   should reference these presets for visual consistency.
 *
 * USAGE:
 *   import { UI } from '../lib/uiConstants';
 *   <View style={UI.card}> ... </View>
 *   <TouchableOpacity style={UI.closeBtnCircle}> ... </TouchableOpacity>
 * ════════════════════════════════════════════════════════════════
 */

import { ViewStyle, TextStyle, Platform } from 'react-native';
import { ECS, DENSITY, TYPO, SPACING, RADIUS, GOLD_RAIL } from './theme';

// ── Tap Target Minimums (WCAG / Apple HIG) ──────────────────
export const TAP_MIN = 44; // Minimum touch target (px)
export const TAP_COMFORTABLE = DENSITY.iconBtnTap; // 46px

// ── Standardized Close Button ────────────────────────────────
// Every close / dismiss button across ECS should use these values.
export const CLOSE_BTN = {
  /** Circle size for close buttons */
  size: 32,
  /** Border radius (half of size) */
  radius: 16,
  /** Icon size inside close button */
  iconSize: 16,
  /** Background color */
  bg: 'rgba(255,255,255,0.06)',
  /** Border */
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.08)',
  /** Hit slop for easier tapping */
  hitSlop: { top: 10, bottom: 10, left: 10, right: 10 } as const,
} as const;

// ── Standardized Icon Containers ─────────────────────────────
// Icon wrapper boxes used in tiles, list rows, and cards.
export const ICON_BOX = {
  /** Small icon box (list rows, compact elements) */
  sm: { size: 32, radius: 8, iconSize: 16 },
  /** Medium icon box (cards, tiles) */
  md: { size: 40, radius: 10, iconSize: 20 },
  /** Large icon box (feature tiles, hero elements) */
  lg: { size: 48, radius: 12, iconSize: 24 },
} as const;

// ── Standardized Button Presets ──────────────────────────────
export const BTN = {
  /** Primary action button (gold background, dark text) */
  primary: {
    height: DENSITY.buttonHeight, // 54
    borderRadius: ECS.radius, // 14
    paddingHorizontal: 24,
    iconSize: 16,
  },
  /** Secondary / outline button */
  secondary: {
    height: DENSITY.buttonHeight, // 54
    borderRadius: ECS.radius, // 14
    paddingHorizontal: 20,
    borderWidth: 1,
    iconSize: 16,
  },
  /** Compact button (inside cards, footers) */
  compact: {
    height: 40,
    borderRadius: 10,
    paddingHorizontal: 16,
    iconSize: 14,
  },
  /** Small pill button (chips, tags) */
  pill: {
    height: DENSITY.chipHeight, // 34
    borderRadius: 17,
    paddingHorizontal: 14,
    iconSize: 12,
  },
} as const;

// ── Standardized Section Spacing ─────────────────────────────
export const SECTION = {
  /** Gap between major sections on a screen */
  gap: DENSITY.sectionGap, // 16
  /** Gap between cards within a section */
  cardGap: DENSITY.cardGap, // 14
  /** Gap between a section title and its content */
  titleGap: DENSITY.titleBodyGap, // 8
  /** Screen edge padding */
  screenPad: DENSITY.screenPad, // 18
  /** Card internal padding */
  cardPad: DENSITY.cardPad, // 16
  /** Modal internal padding */
  modalPad: DENSITY.modalPad, // 18
} as const;

// ── Standardized List Row ────────────────────────────────────
export const LIST_ROW = {
  /** Minimum row height for comfortable tapping */
  minHeight: DENSITY.listRowHeight, // 72
  /** Compact row height */
  compactHeight: 56,
  /** Horizontal padding inside rows */
  paddingH: 16,
  /** Vertical padding inside rows */
  paddingV: 12,
  /** Gap between icon and text in a row */
  iconTextGap: DENSITY.iconTextGap, // 12
  /** Gap between rows */
  rowGap: DENSITY.internalRowGap, // 10
  /** Divider color */
  dividerColor: GOLD_RAIL.subsection,
  /** Divider width */
  dividerWidth: GOLD_RAIL.subsectionWidth, // 0.75
} as const;

// ── Standardized Modal / Sheet Header ────────────────────────
export const MODAL_HEADER = {
  /** Padding horizontal */
  paddingH: 16,
  /** Padding top */
  paddingTop: 16,
  /** Padding bottom */
  paddingBottom: 12,
  /** Title font style — use TYPO.T4 for modal titles */
  titleStyle: {
    ...TYPO.T4,
    fontSize: 12,
    letterSpacing: 3,
  } as TextStyle,
  /** Subtitle font style */
  subtitleStyle: {
    fontSize: 11,
    fontWeight: '500' as TextStyle['fontWeight'],
    color: ECS.muted,
    marginTop: 2,
  } as TextStyle,
  /** Border bottom */
  borderBottomWidth: 1,
  borderBottomColor: GOLD_RAIL.subsection,
  /** Drag handle dimensions */
  handleWidth: 36,
  handleHeight: 4,
  handleRadius: 2,
  handleColor: 'rgba(255,255,255,0.15)',
  handlePaddingTop: 10,
  handlePaddingBottom: 6,
} as const;

// ── Standardized Modal / Sheet Footer ────────────────────────
export const MODAL_FOOTER = {
  paddingH: 16,
  paddingTop: 12,
  paddingBottom: 16,
  borderTopWidth: 1,
  borderTopColor: 'rgba(255,255,255,0.06)',
  /** Gap between footer buttons */
  buttonGap: DENSITY.internalRowGap, // 10
} as const;

// ── Standardized Card ────────────────────────────────────────
export const CARD = {
  /** Background color */
  bg: ECS.bgPanel,
  /** Border radius */
  radius: ECS.radius, // 14
  /** Internal padding */
  padding: DENSITY.cardPad, // 16
  /** Border */
  borderWidth: DENSITY.borderDefault, // 1
  borderColor: ECS.stroke,
  /** Gap between cards */
  gap: DENSITY.cardGap, // 14
} as const;

// ── Standardized Badge / Chip ────────────────────────────────
export const BADGE = {
  /** Height */
  height: DENSITY.chipHeight, // 34
  /** Border radius */
  radius: 17,
  /** Horizontal padding */
  paddingH: 10,
  /** Vertical padding */
  paddingV: 4,
  /** Font style */
  textStyle: {
    ...TYPO.U2,
    fontSize: 9,
    letterSpacing: 1.5,
  } as TextStyle,
  /** Dot indicator size */
  dotSize: 6,
  dotRadius: 3,
} as const;

// ── Standardized Status Pill ─────────────────────────────────
export const STATUS_PILL = {
  paddingH: 10,
  paddingV: 4,
  radius: 10,
  borderWidth: 1,
  dotSize: 6,
  dotRadius: 3,
  gap: 5,
  textStyle: {
    fontSize: 9,
    fontWeight: '800' as TextStyle['fontWeight'],
    letterSpacing: 1.5,
  } as TextStyle,
} as const;

// ── Safe Area Fallbacks ──────────────────────────────────────
// Conservative estimates for safe area insets.
export const SAFE_AREA = {
  top: Platform.select({ ios: 50, android: 24, default: 0 }) ?? 0,
  bottom: Platform.select({ ios: 34, android: 24, default: 0 }) ?? 0,
} as const;

// ── Standardized Transition Durations ────────────────────────
// Re-exported from motion.ts for convenience; ensures all
// components reference the same timing values.
export { MOTION, EASING, PRESS } from './motion';

// ── Pre-built Style Objects ──────────────────────────────────
// Ready-to-use styles for the most common patterns.

/** Standard close button circle style */
export const closeBtnCircleStyle: ViewStyle = {
  width: CLOSE_BTN.size,
  height: CLOSE_BTN.size,
  borderRadius: CLOSE_BTN.radius,
  backgroundColor: CLOSE_BTN.bg,
  borderWidth: CLOSE_BTN.borderWidth,
  borderColor: CLOSE_BTN.borderColor,
  alignItems: 'center',
  justifyContent: 'center',
};

/** Standard card container style */
export const cardStyle: ViewStyle = {
  backgroundColor: CARD.bg,
  borderRadius: CARD.radius,
  padding: CARD.padding,
  borderWidth: CARD.borderWidth,
  borderColor: CARD.borderColor,
};

/** Standard list row style */
export const listRowStyle: ViewStyle = {
  flexDirection: 'row',
  alignItems: 'center',
  minHeight: LIST_ROW.compactHeight,
  paddingHorizontal: LIST_ROW.paddingH,
  paddingVertical: LIST_ROW.paddingV,
  gap: LIST_ROW.iconTextGap,
};

/** Standard modal header container style */
export const modalHeaderStyle: ViewStyle = {
  flexDirection: 'row',
  alignItems: 'center',
  paddingHorizontal: MODAL_HEADER.paddingH,
  paddingTop: MODAL_HEADER.paddingTop,
  paddingBottom: MODAL_HEADER.paddingBottom,
  borderBottomWidth: MODAL_HEADER.borderBottomWidth,
  borderBottomColor: MODAL_HEADER.borderBottomColor,
};

/** Standard modal footer container style */
export const modalFooterStyle: ViewStyle = {
  flexDirection: 'row',
  paddingHorizontal: MODAL_FOOTER.paddingH,
  paddingTop: MODAL_FOOTER.paddingTop,
  paddingBottom: MODAL_FOOTER.paddingBottom,
  borderTopWidth: MODAL_FOOTER.borderTopWidth,
  borderTopColor: MODAL_FOOTER.borderTopColor,
  gap: MODAL_FOOTER.buttonGap,
};

