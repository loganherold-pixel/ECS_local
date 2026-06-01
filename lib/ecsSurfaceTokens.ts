import { ECS, TACTICAL } from './theme';

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
