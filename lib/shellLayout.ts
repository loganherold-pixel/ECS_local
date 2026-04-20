import { Platform } from 'react-native';

export const ECS_COMMAND_DOCK_BAR_HEIGHT = 68;
export const ECS_COMMAND_DOCK_MIN_BOTTOM_PADDING = 4;
export const ECS_TOP_SHELL_EDGE_SLOT_WIDTH = 52;
export const ECS_TOP_SHELL_PROFILE_BUTTON_SIZE = 40;
export const ECS_COMMAND_DOCK_LABEL_HEIGHT = 13;

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

export function getShellBottomClearance(
  bottomInset: number,
  breathingRoom = 8,
): number {
  return getCommandDockHeight(bottomInset) + breathingRoom;
}
