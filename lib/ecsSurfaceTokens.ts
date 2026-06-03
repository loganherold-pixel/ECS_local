import { ECS, TACTICAL } from './theme';
import { ECS_STATUS } from './ecsStatusTokens';

export const ECS_SURFACE = {
  radius: {
    primary: 18,
    secondary: 16,
    compact: 14,
  },
  padding: {
    primary: 14,
    secondary: 12,
    compact: 10,
  },
  gap: {
    section: 12,
    stack: 10,
    group: 8,
    row: 10,
  },
  border: {
    default: ECS.strokeMuted,
    strong: ECS.strokeSoft,
    selected: 'rgba(212,160,23,0.34)',
    warning: 'rgba(192,57,43,0.24)',
    quiet: ECS.strokeMuted,
  },
  background: {
    primary: 'rgba(17,22,26,0.94)',
    secondary: 'rgba(0,0,0,0.22)',
    compact: 'rgba(0,0,0,0.18)',
    quiet: 'rgba(0,0,0,0.15)',
    selected: ECS.goldWash,
    warning: 'rgba(192,57,43,0.06)',
  },
  headerAccent: TACTICAL.goldMedium,
  textMuted: ECS.muted,
} as const;

export const ECS_VISUAL_SURFACE = {
  appShell: {
    background: 'transparent',
    scrimOwner: 'ShellBodyBackground',
  },
  panel: {
    primary: ECS_SURFACE.background.primary,
    secondary: ECS_SURFACE.background.secondary,
    compact: ECS_SURFACE.background.compact,
    quiet: ECS_SURFACE.background.quiet,
    muted: ECS_SURFACE.background.compact,
    border: ECS_SURFACE.border.default,
    strongBorder: ECS_SURFACE.border.strong,
  },
  overlay: {
    backdrop: 'rgba(0,0,0,0.85)',
    sheet: ECS_SURFACE.background.primary,
    border: ECS_SURFACE.border.selected,
  },
  pill: {
    active: ECS_STATUS.tone.active.background,
    selected: ECS_STATUS.tone.selected.background,
    muted: ECS_STATUS.tone.info.background,
    border: ECS_STATUS.tone.info.border,
  },
  divider: {
    section: ECS.goldSoft,
    quiet: ECS.strokeMuted,
  },
} as const;
