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
    default: 'rgba(62,79,60,0.24)',
    strong: 'rgba(196,138,44,0.22)',
    selected: 'rgba(196,138,44,0.34)',
    warning: 'rgba(192,57,43,0.24)',
    quiet: 'rgba(62,79,60,0.16)',
  },
  background: {
    primary: 'rgba(17,22,26,0.94)',
    secondary: 'rgba(0,0,0,0.22)',
    compact: 'rgba(0,0,0,0.18)',
    quiet: 'rgba(0,0,0,0.15)',
    selected: 'rgba(196,138,44,0.05)',
    warning: 'rgba(192,57,43,0.06)',
  },
  headerAccent: TACTICAL.amber,
  textMuted: ECS.muted,
} as const;
