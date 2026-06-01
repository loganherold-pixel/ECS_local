export type ECSResponsiveTier =
  | 'compact_phone'
  | 'large_phone'
  | 'standard_tablet'
  | 'wide_tablet';

export type ECSLayoutClass = 'compact' | 'medium' | 'expanded';
export type ECSOrientation = 'portrait' | 'landscape';

export interface ECSViewportMetrics {
  width: number;
  height: number;
  safeWidth: number;
  safeHeight: number;
  shortestSide: number;
  longestSide: number;
  aspectRatio: number;
  orientation: ECSOrientation;
  isLandscape: boolean;
  isTabletScale: boolean;
}

export interface ECSSurfaceLayoutProfile {
  horizontalPadding: number;
  contentMaxWidth?: number;
  panelGap: number;
  sectionGap: number;
  headerGap: number;
  typeScale: number;
  densityScale: number;
  maxReadableLineLength: number;
  shell: {
    headerMaxWidth?: number;
    headerHorizontalPadding: number;
    headerMinHeight: number;
    dockMaxWidth?: number;
    dockHorizontalPadding: number;
    dockOuterGutter: number;
    profilePanelWidth: number;
    profilePanelMaxHeight: number;
  };
  overlay: {
    sideClearance: number;
    expandedWidthBias: number;
    sheetMaxWidth?: number;
    dialogMaxWidth?: number;
    headerPaddingHorizontal: number;
    headerPaddingVertical: number;
    bodyPadding: number;
    footerPaddingHorizontal: number;
    titleSize: number;
    subtitleSize: number;
    eyebrowSize: number;
    controlSize: number;
    iconGlyphSize: number;
    actionGlyphSize: number;
  };
  dashboard: {
    frameMaxWidth?: number;
    gridPadding: number;
    gridGap: number;
    highwayGridPadding: number;
    highwayGridGap: number;
    widgetPadding: number;
  };
  navigate: {
    overlayEdge: number;
    overlayGap: number;
    overlayGroupGap: number;
    popupWidth?: number;
    routeSurfacePreviewHeight: number;
    routeSurfaceActiveHeight: number;
    routeSurfaceArrivedHeight: number;
  };
  fleet: {
    multiPane: boolean;
    previewMinWidth: number;
    previewMaxWidth: number;
  };
  setup: {
    fixedStepMaxWidth: number;
    fixedStepHorizontalPadding: number;
  };
  explore: {
    supportColumns: 1 | 2;
    routeColumns: 1 | 2;
    utilityCardWidth: number;
    routeCardMaxWidth: number;
  };
  alert: {
    dualPane: boolean;
  };
}
