export type DispersedCampingRegionPanelMode =
  | 'centered'
  | 'right_of_route_summary'
  | 'stacked_above_route_summary';

export type DispersedCampingRegionPanelLayout = {
  mode: DispersedCampingRegionPanelMode;
  left: number;
  right: number;
  maxWidth: number;
  bottomOffset: number;
  cardAlignSelf: 'center' | 'flex-start';
};

export type DispersedCampingRegionPanelLayoutInput = {
  windowWidth: number;
  overlayEdge: number;
  overlayGap: number;
  routeSummaryVisible: boolean;
  routeSummaryLeft: number;
  defaultBottomOffset: number;
  compactBottomOffset: number;
  rightControlInset: number;
  routeSummaryWidth?: number;
  minAdjacentWidth?: number;
  maxPanelWidth?: number;
};

export const DISPERSED_CAMPING_ROUTE_SUMMARY_WIDTH = 286;
export const DISPERSED_CAMPING_ROUTE_SUMMARY_MAX_WIDTH_RATIO = 0.78;
export const DISPERSED_CAMPING_REGION_PANEL_MAX_WIDTH = 430;
export const DISPERSED_CAMPING_REGION_PANEL_MIN_ADJACENT_WIDTH = 300;

function finiteNumber(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function rounded(value: number): number {
  return Math.max(0, Math.round(value));
}

export function resolveDispersedCampingRouteSummaryWidth(windowWidth: number): number {
  const safeWidth = finiteNumber(windowWidth, DISPERSED_CAMPING_ROUTE_SUMMARY_WIDTH);
  return Math.min(
    DISPERSED_CAMPING_ROUTE_SUMMARY_WIDTH,
    Math.max(0, safeWidth * DISPERSED_CAMPING_ROUTE_SUMMARY_MAX_WIDTH_RATIO),
  );
}

export function resolveDispersedCampingRegionPanelLayout(
  input: DispersedCampingRegionPanelLayoutInput,
): DispersedCampingRegionPanelLayout {
  const windowWidth = finiteNumber(input.windowWidth, 0);
  const overlayEdge = rounded(finiteNumber(input.overlayEdge, 12));
  const overlayGap = rounded(finiteNumber(input.overlayGap, 10));
  const routeSummaryLeft = rounded(finiteNumber(input.routeSummaryLeft, overlayEdge));
  const defaultBottomOffset = rounded(finiteNumber(input.defaultBottomOffset, 0));
  const compactBottomOffset = rounded(finiteNumber(input.compactBottomOffset, defaultBottomOffset));
  const maxPanelWidth = rounded(finiteNumber(input.maxPanelWidth ?? DISPERSED_CAMPING_REGION_PANEL_MAX_WIDTH, DISPERSED_CAMPING_REGION_PANEL_MAX_WIDTH));
  const minAdjacentWidth = rounded(finiteNumber(input.minAdjacentWidth ?? DISPERSED_CAMPING_REGION_PANEL_MIN_ADJACENT_WIDTH, DISPERSED_CAMPING_REGION_PANEL_MIN_ADJACENT_WIDTH));
  const routeSummaryWidth = rounded(
    finiteNumber(input.routeSummaryWidth ?? resolveDispersedCampingRouteSummaryWidth(windowWidth), 0),
  );
  const rightControlInset = Math.max(
    overlayEdge,
    rounded(finiteNumber(input.rightControlInset, overlayEdge)),
  );

  if (input.routeSummaryVisible) {
    const adjacentLeft = routeSummaryLeft + routeSummaryWidth + overlayGap;
    const adjacentWidth = windowWidth - adjacentLeft - rightControlInset;
    if (adjacentWidth >= minAdjacentWidth) {
      return {
        mode: 'right_of_route_summary',
        left: rounded(adjacentLeft),
        right: rounded(rightControlInset),
        maxWidth: Math.min(maxPanelWidth, rounded(adjacentWidth)),
        bottomOffset: compactBottomOffset,
        cardAlignSelf: 'flex-start',
      };
    }

    return {
      mode: 'stacked_above_route_summary',
      left: overlayEdge,
      right: overlayEdge,
      maxWidth: Math.min(maxPanelWidth, Math.max(0, rounded(windowWidth - overlayEdge * 2))),
      bottomOffset: defaultBottomOffset,
      cardAlignSelf: 'center',
    };
  }

  return {
    mode: 'centered',
    left: overlayEdge,
    right: overlayEdge,
    maxWidth: Math.min(maxPanelWidth, Math.max(0, rounded(windowWidth - overlayEdge * 2))),
    bottomOffset: defaultBottomOffset,
    cardAlignSelf: 'center',
  };
}
