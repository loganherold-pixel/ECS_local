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
    background: TACTICAL.amber,
    border: TACTICAL.amber,
    text: '#0B0F12',
  },
  secondary: {
    background: 'rgba(212,160,23,0.08)',
    border: 'rgba(212,160,23,0.28)',
    text: TACTICAL.amber,
  },
  tertiary: {
    background: 'rgba(255,255,255,0.02)',
    border: ECS.strokeSoft,
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
    text: TACTICAL.amber,
  },
  chipSelected: {
    background: 'rgba(212,160,23,0.14)',
    border: 'rgba(212,160,23,0.34)',
    text: TACTICAL.amber,
  },
  chipDefault: {
    background: ECS.bgElev,
    border: ECS.stroke,
    text: TACTICAL.textMuted,
  },
  disabled: {
    background: 'rgba(62,79,60,0.16)',
    border: 'rgba(62,79,60,0.30)',
    text: TACTICAL.textMuted,
  },
} as const;
