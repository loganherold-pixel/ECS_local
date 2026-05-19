import { Platform } from 'react-native';

export const ECS_COMMAND_DOCK_BAR_HEIGHT = 80;
export const ECS_COMMAND_DOCK_MIN_BOTTOM_PADDING = 4;
export const ECS_TOP_SHELL_EDGE_SLOT_WIDTH = 52;
export const ECS_TOP_SHELL_PROFILE_BUTTON_SIZE = 40;
export const ECS_COMMAND_DOCK_LABEL_HEIGHT = 16;
export const ECS_COMMAND_DOCK_CENTER_SLOT_WIDTH = 126;
export const ECS_COMMAND_DOCK_OUTER_ITEM_MAX_WIDTH = 126;
export const ECS_COMMAND_DOCK_EDGE_SLOT_FLEX = 1;
export const ECS_COMMAND_DOCK_INNER_SLOT_FLEX = 1;
export const ECS_COMMAND_DOCK_CENTER_SLOT_FLEX = 1.08;
export const ECS_TOP_SHELL_CONTROL_SLOT_WIDTH = 158;
export const ECS_TOP_SHELL_STATUS_PILL_HEIGHT = 28;
export const ECS_TOP_SHELL_COMMAND_PILL_HEIGHT = 32;
export const ECS_TOP_BANNER_TITLE_LEFT_SLOT_WIDTH = 144;
export const ECS_TOP_BANNER_TITLE_RIGHT_SLOT_WIDTH = 144;
export const ECS_TOP_BANNER_TITLE_DONE_RIGHT_SLOT_WIDTH = 198;
export const ECS_TOP_BANNER_TITLE_CENTER_PADDING = 2;

type HeaderTopPaddingOptions = {
  webPadding?: number;
  nativeOffset?: number;
  minPadding?: number;
};

type HeaderAnchorOptions = {
  webTop?: number;
  nativeOffset?: number;
  minTop?: number;
};

type TopBannerLayoutMetricsOptions = {
  isTablet?: boolean;
  shortHeight?: boolean;
};

export type EcsTopBannerLayoutMetrics = {
  topPadding: number;
  visibleHeight: number;
  bannerOverscan: number;
  bannerOffset: number;
};

export function getShellHeaderTopPadding(
  topInset: number,
  {
    webPadding = 12,
    nativeOffset = 2,
    minPadding = 10,
  }: HeaderTopPaddingOptions = {},
): number {
  if (Platform.OS === 'web') return webPadding;
  return Math.max(topInset + nativeOffset, minPadding);
}

export function getShellHeaderAnchorTop(
  topInset: number,
  {
    webTop = 54,
    nativeOffset = 40,
    minTop = 52,
  }: HeaderAnchorOptions = {},
): number {
  if (Platform.OS === 'web') return webTop;
  return Math.max(topInset + nativeOffset, minTop);
}

export function getEcsTopBannerLayoutMetrics(
  topInset: number,
  topBannerHeight: number,
  {
    isTablet = false,
    shortHeight = false,
  }: TopBannerLayoutMetricsOptions = {},
): EcsTopBannerLayoutMetrics {
  const topPadding = getShellHeaderTopPadding(topInset, {
    webPadding: 4,
    nativeOffset: -4,
    minPadding: 4,
  });
  const minimumVisibleHeight = isTablet ? 88 : 76;
  const croppedBannerHeight = topBannerHeight - (shortHeight ? 30 : 24);
  const contentDrivenHeight = topPadding + (shortHeight ? 44 : 50);

  return {
    topPadding,
    visibleHeight: Math.max(
      minimumVisibleHeight,
      Math.min(croppedBannerHeight, contentDrivenHeight),
    ),
    bannerOverscan: isTablet ? 28 : 24,
    bannerOffset: isTablet ? -18 : -16,
  };
}

export function getCommandDockBottomPadding(bottomInset: number): number {
  const normalizedBottomInset = Platform.OS === 'web' ? 0 : bottomInset;

  if (Platform.OS === 'android') {
    return Math.max(Math.min(normalizedBottomInset, 8), ECS_COMMAND_DOCK_MIN_BOTTOM_PADDING);
  }

  return normalizedBottomInset > 0
    ? normalizedBottomInset
    : ECS_COMMAND_DOCK_MIN_BOTTOM_PADDING;
}

export function getCommandDockHeight(bottomInset: number): number {
  return ECS_COMMAND_DOCK_BAR_HEIGHT + getCommandDockBottomPadding(bottomInset);
}

export function getShellBodyBackgroundTopInset(
  topInset: number,
  headerMinHeight: number,
): number {
  const headerTopPadding = getShellHeaderTopPadding(topInset);
  return Math.max(headerTopPadding + 26, headerMinHeight + 10);
}

export function getShellBottomClearance(
  bottomInset: number,
  breathingRoom = 8,
): number {
  return getCommandDockHeight(bottomInset) + breathingRoom;
}
