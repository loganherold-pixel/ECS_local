import { ECS, TACTICAL } from './theme';

export const ECS_INTERACTION = {
  height: {
    large: 48,
    medium: 42,
    compact: 34,
    chip: 34,
    iconMedium: 40,
    iconCompact: 34,
  },
  radius: {
    button: 12,
    compactButton: 10,
    chip: 11,
    pill: 999,
  },
  gap: {
    row: 8,
    compactRow: 6,
    icon: 6,
  },
  padding: {
    largeHorizontal: 16,
    mediumHorizontal: 14,
    compactHorizontal: 11,
    chipHorizontal: 10,
  },
} as const;

export const ECS_BUTTON_COLORS = {
  primary: {
    background: TACTICAL.goldStrong,
    border: TACTICAL.goldStrong,
    text: '#0B0F12',
  },
  secondary: {
    background: TACTICAL.goldWash,
    border: TACTICAL.goldSoft,
    text: TACTICAL.goldMedium,
  },
  tertiary: {
    background: 'rgba(255,255,255,0.02)',
    border: ECS.strokeMuted,
    text: TACTICAL.text,
  },
  destructive: {
    background: 'rgba(192,57,43,0.06)',
    border: 'rgba(192,57,43,0.28)',
    text: TACTICAL.danger,
  },
  active: {
    background: 'rgba(212,160,23,0.12)',
    border: 'rgba(212,160,23,0.34)',
    text: TACTICAL.goldStrong,
  },
  chipSelected: {
    background: 'rgba(212,160,23,0.14)',
    border: 'rgba(212,160,23,0.34)',
    text: TACTICAL.goldStrong,
  },
  chipDefault: {
    background: ECS.bgPanelInactive,
    border: ECS.strokeMuted,
    text: TACTICAL.textMuted,
  },
  disabled: {
    background: ECS.bgPanelInactive,
    border: ECS.strokeMuted,
    text: TACTICAL.textMuted,
  },
} as const;
