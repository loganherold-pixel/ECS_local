/**
 * useSheetLayout — Shared hook for bottom sheet / popup panel layout
 *
 * Provides safe area-aware dimensions for bottom sheets and modal panels
 * so content is never hidden behind the Android navigation bar, iOS home
 * indicator, or the ECS CommandDock.
 *
 * NOTE: React Native <Modal> renders in a separate window, so
 * useSafeAreaInsets() from react-native-safe-area-context may not be
 * available. This hook uses conservative platform-based fallbacks
 * that work reliably inside Modals on all platforms.
 *
 * Usage:
 *   const { sheetMaxHeight, contentBottomPadding, safeBottom } = useSheetLayout();
 *
 *   <View style={{ maxHeight: sheetMaxHeight }}>
 *     <ScrollView contentContainerStyle={{ paddingBottom: contentBottomPadding }}>
 *       ...
 *     </ScrollView>
 *   </View>
 */
import { useState, useEffect } from 'react';
import { Dimensions, Platform } from 'react-native';

// ── Default safe area fallbacks ──────────────────────────────
// Conservative estimates that cover the most common device configurations.
// These are intentionally generous to prevent content clipping.
const FALLBACK_BOTTOM_INSET = Platform.select({
  ios: 34,      // iPhone with home indicator (X and later)
  android: 48,  // Android gesture navigation bar (3-button nav is ~48dp)
  default: 0,   // Web
}) ?? 0;

// Extra breathing room above the bottom inset
const EXTRA_BOTTOM_MARGIN = 12;

// Maximum fraction of screen height a sheet should occupy
const MAX_SHEET_FRACTION = 0.92;

// Minimum fraction of screen height a sheet should occupy
const MIN_SHEET_FRACTION = 0.50;

export interface SheetLayout {
  /** Maximum height for the sheet container */
  sheetMaxHeight: number;
  /** Bottom padding for ScrollView contentContainerStyle */
  contentBottomPadding: number;
  /** Raw safe area bottom inset */
  safeBottom: number;
  /** Full screen height */
  screenHeight: number;
  /** Full screen width */
  screenWidth: number;
  /** Whether the device is in landscape orientation */
  isLandscape: boolean;
}

export function useSheetLayout(options?: {
  /** Override max fraction (default 0.92) */
  maxFraction?: number;
  /** Override min fraction (default 0.50) */
  minFraction?: number;
  /** Extra bottom padding beyond safe area (default 12) */
  extraBottomMargin?: number;
}): SheetLayout {
  const maxFraction = options?.maxFraction ?? MAX_SHEET_FRACTION;
  const minFraction = options?.minFraction ?? MIN_SHEET_FRACTION;
  const extraMargin = options?.extraBottomMargin ?? EXTRA_BOTTOM_MARGIN;

  const safeBottom = FALLBACK_BOTTOM_INSET;

  // Track screen dimensions for orientation changes
  const [dims, setDims] = useState(() => Dimensions.get('window'));

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => {
      setDims(window);
    });
    return () => sub.remove();
  }, []);

  const screenHeight = dims.height;
  const screenWidth = dims.width;
  const isLandscape = screenWidth > screenHeight;

  // Calculate sheet max height — leave room for status bar + safe area
  const sheetMaxHeight = Math.max(
    screenHeight * minFraction,
    Math.min(screenHeight * maxFraction, screenHeight - safeBottom)
  );

  // Content bottom padding = safe area + extra margin
  // This ensures the last item in a ScrollView is fully visible
  // above the device's bottom safe area
  const contentBottomPadding = safeBottom + extraMargin;

  return {
    sheetMaxHeight,
    contentBottomPadding,
    safeBottom,
    screenHeight,
    screenWidth,
    isLandscape,
  };
}

/**
 * getStaticSheetLayout — Non-hook version for use outside components
 *
 * Uses Dimensions API only (no safe area context).
 * Useful for StyleSheet.create() or static calculations.
 */
export function getStaticSheetLayout(): {
  sheetMaxHeight: number;
  contentBottomPadding: number;
  safeBottom: number;
} {
  const { height } = Dimensions.get('window');
  const safeBottom = FALLBACK_BOTTOM_INSET;
  return {
    sheetMaxHeight: Math.min(height * MAX_SHEET_FRACTION, height - safeBottom),
    contentBottomPadding: safeBottom + EXTRA_BOTTOM_MARGIN,
    safeBottom,
  };
}

/**
 * getDynamicMaxHeight — Calculate a safe maxHeight for any popup/panel
 *
 * Replaces hardcoded pixel values (e.g., maxHeight: 400) with a
 * screen-relative value that respects safe areas and never exceeds
 * the available viewport.
 *
 * @param fraction - Fraction of screen height (default 0.75)
 * @returns A pixel value safe for use as maxHeight
 */
export function getDynamicMaxHeight(fraction: number = 0.75): number {
  const { height } = Dimensions.get('window');
  const safeBottom = FALLBACK_BOTTOM_INSET;
  const safeTop = Platform.select({ ios: 50, android: 24, default: 0 }) ?? 0;
  const available = height - safeTop - safeBottom;
  return Math.min(available * fraction, height - safeTop - safeBottom - 20);
}

/**
 * useDynamicMaxHeight — Hook version of getDynamicMaxHeight
 *
 * Listens for dimension changes (orientation, window resize) and
 * returns an up-to-date maxHeight value.
 *
 * Usage:
 *   const maxH = useDynamicMaxHeight(0.70);
 *   <ScrollView style={{ maxHeight: maxH }}>...</ScrollView>
 */
export function useDynamicMaxHeight(fraction: number = 0.75): number {
  const [dims, setDims] = useState(() => Dimensions.get('window'));

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => {
      setDims(window);
    });
    return () => sub.remove();
  }, []);

  const safeBottom = FALLBACK_BOTTOM_INSET;
  const safeTop = Platform.select({ ios: 50, android: 24, default: 0 }) ?? 0;
  const available = dims.height - safeTop - safeBottom;
  return Math.min(available * fraction, dims.height - safeTop - safeBottom - 20);
}

/**
 * SAFE_BOTTOM — Exported constant for components that need raw safe area bottom inset
 */
export const SAFE_BOTTOM_INSET = FALLBACK_BOTTOM_INSET;

