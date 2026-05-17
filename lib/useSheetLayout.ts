/**
 * useSheetLayout — Shared hook for bottom sheet / popup panel layout
 *
 * Keeps sheets bounded between the ECS top shell and the CommandDock so
 * overlay content scrolls internally instead of drifting under chrome.
 */
import { useEffect, useState } from 'react';
import { Dimensions, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getShellBottomClearance } from './shellLayout';

const FALLBACK_BOTTOM_INSET = Platform.select({
  ios: 34,
  android: 24,
  default: 0,
}) ?? 0;

const FALLBACK_TOP_INSET = Platform.select({
  ios: 16,
  android: 12,
  default: 22,
}) ?? 0;

const EXTRA_BOTTOM_MARGIN = 12;
const MAX_SHEET_FRACTION = 0.92;
const MIN_SHEET_FRACTION = 0.5;

export interface SheetLayout {
  sheetMaxHeight: number;
  contentBottomPadding: number;
  safeBottom: number;
  topClearance: number;
  bottomClearance: number;
  screenHeight: number;
  screenWidth: number;
  isLandscape: boolean;
}

export function useSheetLayout(options?: {
  maxFraction?: number;
  minFraction?: number;
  extraBottomMargin?: number;
}): SheetLayout {
  const insets = useSafeAreaInsets();
  const maxFraction = options?.maxFraction ?? MAX_SHEET_FRACTION;
  const minFraction = options?.minFraction ?? MIN_SHEET_FRACTION;
  const extraMargin = options?.extraBottomMargin ?? EXTRA_BOTTOM_MARGIN;

  const [dims, setDims] = useState(() => Dimensions.get('window'));

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => {
      setDims(window);
    });
    return () => sub.remove();
  }, []);

  const safeBottom = Math.max(insets.bottom || 0, FALLBACK_BOTTOM_INSET);
  const safeTop = Math.max(insets.top || 0, FALLBACK_TOP_INSET);

  const screenHeight = dims.height;
  const screenWidth = dims.width;
  const isLandscape = screenWidth > screenHeight;
  const topClearance = safeTop + (isLandscape ? 8 : 12);
  const bottomClearance = getShellBottomClearance(safeBottom, extraMargin);
  const availableHeight = Math.max(280, screenHeight - topClearance - bottomClearance);

  const sheetMaxHeight = Math.max(
    availableHeight * minFraction,
    Math.min(availableHeight * maxFraction, availableHeight),
  );

  const contentBottomPadding = safeBottom + extraMargin;

  return {
    sheetMaxHeight,
    contentBottomPadding,
    safeBottom,
    topClearance,
    bottomClearance,
    screenHeight,
    screenWidth,
    isLandscape,
  };
}

export function getStaticSheetLayout(): {
  sheetMaxHeight: number;
  contentBottomPadding: number;
  safeBottom: number;
} {
  const { height } = Dimensions.get('window');
  const safeBottom = FALLBACK_BOTTOM_INSET;
  const topClearance = FALLBACK_TOP_INSET + 12;
  const bottomClearance = getShellBottomClearance(safeBottom, EXTRA_BOTTOM_MARGIN);
  const availableHeight = Math.max(280, height - topClearance - bottomClearance);

  return {
    sheetMaxHeight: Math.min(availableHeight * MAX_SHEET_FRACTION, availableHeight),
    contentBottomPadding: safeBottom + EXTRA_BOTTOM_MARGIN,
    safeBottom,
  };
}

export function getDynamicMaxHeight(fraction: number = 0.75): number {
  const { height } = Dimensions.get('window');
  const safeBottom = FALLBACK_BOTTOM_INSET;
  const topClearance = FALLBACK_TOP_INSET + 12;
  const bottomClearance = getShellBottomClearance(safeBottom, EXTRA_BOTTOM_MARGIN);
  const available = height - topClearance - bottomClearance;
  return Math.min(available * fraction, available - 20);
}

export function useDynamicMaxHeight(fraction: number = 0.75): number {
  const insets = useSafeAreaInsets();
  const [dims, setDims] = useState(() => Dimensions.get('window'));

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => {
      setDims(window);
    });
    return () => sub.remove();
  }, []);

  const safeBottom = Math.max(insets.bottom || 0, FALLBACK_BOTTOM_INSET);
  const safeTop = Math.max(insets.top || 0, FALLBACK_TOP_INSET);
  const topClearance = safeTop + 12;
  const bottomClearance = getShellBottomClearance(safeBottom, EXTRA_BOTTOM_MARGIN);
  const available = dims.height - topClearance - bottomClearance;
  return Math.min(available * fraction, available - 20);
}

export const SAFE_BOTTOM_INSET = FALLBACK_BOTTOM_INSET;
