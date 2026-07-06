export interface MobileOverlayBoundsInput {
  viewportWidth: number;
  viewportHeight: number;
  requestedTopClearance: number;
  requestedBottomClearance: number;
  requestedSideClearance: number;
  maxWidth: number;
  maxHeightFraction: number;
  minHeightFraction?: number;
  expandedWidthBias?: number;
  minSideClearance?: number;
  minShellWidth?: number;
  minReadableHeight?: number;
  maxReadableHeight?: number;
}

export interface MobileOverlayBounds {
  viewportWidth: number;
  viewportHeight: number;
  sideClearance: number;
  topClearance: number;
  bottomClearance: number;
  availableHeight: number;
  shellWidth: number;
  shellMaxHeight: number;
  shellMinHeight?: number;
}

const DEFAULT_MIN_SIDE_CLEARANCE = 8;
const DEFAULT_MIN_SHELL_WIDTH = 280;
const DEFAULT_MIN_READABLE_HEIGHT = 180;
const DEFAULT_MAX_READABLE_HEIGHT = 260;
const MIN_HEIGHT_FRACTION = 0.1;

function finiteNumber(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function reduceClearance(
  topClearance: number,
  bottomClearance: number,
  overflow: number,
  clearanceFloor: number,
): { topClearance: number; bottomClearance: number } {
  let remainingOverflow = Math.max(0, overflow);
  let nextTop = topClearance;
  let nextBottom = bottomClearance;

  const topReduction = Math.min(remainingOverflow, Math.max(0, nextTop - clearanceFloor));
  nextTop -= topReduction;
  remainingOverflow -= topReduction;

  const bottomReduction = Math.min(remainingOverflow, Math.max(0, nextBottom - clearanceFloor));
  nextBottom -= bottomReduction;
  remainingOverflow -= bottomReduction;

  if (remainingOverflow > 0) {
    const finalTopReduction = Math.min(remainingOverflow, Math.max(0, nextTop));
    nextTop -= finalTopReduction;
    remainingOverflow -= finalTopReduction;
  }

  if (remainingOverflow > 0) {
    nextBottom = Math.max(0, nextBottom - remainingOverflow);
  }

  return {
    topClearance: nextTop,
    bottomClearance: nextBottom,
  };
}

export function resolveMobileOverlayBounds(input: MobileOverlayBoundsInput): MobileOverlayBounds {
  const viewportWidth = Math.max(0, finiteNumber(input.viewportWidth));
  const viewportHeight = Math.max(0, finiteNumber(input.viewportHeight));
  const minSideClearance = clamp(
    finiteNumber(input.minSideClearance ?? DEFAULT_MIN_SIDE_CLEARANCE),
    0,
    viewportWidth / 2,
  );
  const requestedSideClearance = Math.max(0, finiteNumber(input.requestedSideClearance));
  const minShellWidth = Math.min(
    Math.max(0, finiteNumber(input.minShellWidth ?? DEFAULT_MIN_SHELL_WIDTH)),
    Math.max(0, viewportWidth - minSideClearance * 2),
  );
  const maxSideClearanceForMinWidth = Math.max(
    minSideClearance,
    (viewportWidth - minShellWidth) / 2,
  );
  const sideClearance = clamp(
    requestedSideClearance,
    minSideClearance,
    maxSideClearanceForMinWidth,
  );
  const widthAllowance = Math.max(0, viewportWidth - sideClearance * 2);
  const expandedWidthBias = Math.max(0, finiteNumber(input.expandedWidthBias ?? 0));
  const biasedWidthAllowance = Math.max(
    Math.min(minShellWidth, widthAllowance),
    widthAllowance - expandedWidthBias,
  );
  const shellWidth = Math.min(
    Math.max(0, finiteNumber(input.maxWidth)),
    Math.min(widthAllowance, biasedWidthAllowance),
  );

  const clearanceFloor = Math.min(minSideClearance, viewportHeight / 2);
  const requestedTopClearance = Math.max(0, finiteNumber(input.requestedTopClearance));
  const requestedBottomClearance = Math.max(0, finiteNumber(input.requestedBottomClearance));
  const minReadableHeight = Math.max(0, finiteNumber(input.minReadableHeight ?? DEFAULT_MIN_READABLE_HEIGHT));
  const maxReadableHeight = Math.max(
    minReadableHeight,
    finiteNumber(input.maxReadableHeight ?? DEFAULT_MAX_READABLE_HEIGHT),
  );
  const heightScaledReadableFloor = Math.round(viewportHeight * 0.45);
  const targetReadableHeight = Math.min(
    Math.max(0, viewportHeight - clearanceFloor * 2),
    Math.max(minReadableHeight, Math.min(maxReadableHeight, heightScaledReadableFloor)),
  );
  const maxTotalClearance = Math.max(0, viewportHeight - targetReadableHeight);
  const requestedTotalClearance = requestedTopClearance + requestedBottomClearance;
  const boundedClearance =
    requestedTotalClearance > maxTotalClearance
      ? reduceClearance(
          requestedTopClearance,
          requestedBottomClearance,
          requestedTotalClearance - maxTotalClearance,
          clearanceFloor,
        )
      : {
          topClearance: requestedTopClearance,
          bottomClearance: requestedBottomClearance,
        };

  const topClearance = boundedClearance.topClearance;
  const bottomClearance = boundedClearance.bottomClearance;
  const availableHeight = Math.max(0, viewportHeight - topClearance - bottomClearance);
  const maxHeightFraction = clamp(
    finiteNumber(input.maxHeightFraction, 1),
    MIN_HEIGHT_FRACTION,
    1,
  );
  const shellMaxHeight = Math.min(
    availableHeight,
    Math.max(0, Math.round(viewportHeight * maxHeightFraction)),
  );

  const minHeightFraction = typeof input.minHeightFraction === 'number'
    ? clamp(finiteNumber(input.minHeightFraction), 0, 1)
    : null;
  const shellMinHeight = minHeightFraction == null
    ? undefined
    : Math.min(
        shellMaxHeight,
        Math.max(Math.min(DEFAULT_MAX_READABLE_HEIGHT, shellMaxHeight), Math.round(availableHeight * minHeightFraction)),
      );

  return {
    viewportWidth,
    viewportHeight,
    sideClearance,
    topClearance,
    bottomClearance,
    availableHeight,
    shellWidth,
    shellMaxHeight,
    shellMinHeight,
  };
}
