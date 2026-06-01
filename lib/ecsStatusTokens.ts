import { ECS, TACTICAL } from './theme';

export type ECSStatusTone =
  | 'active'
  | 'ready'
  | 'live'
  | 'warning'
  | 'unavailable'
  | 'info'
  | 'category'
  | 'selected';

export type ECSIconTier = 'navigation' | 'action' | 'compact' | 'status';

export const ECS_ICON = {
  size: {
    navigation: 22,
    action: 16,
    compact: 12,
    status: 8,
  },
  hitSlop: {
    action: 8,
    compact: 6,
  },
} as const;

export const ECS_STATUS = {
  radius: {
    badge: 999,
    pill: 999,
  },
  padding: {
    badgeX: 8,
    badgeY: 4,
    compactBadgeX: 6,
    compactBadgeY: 3,
  },
  gap: {
    icon: 5,
    dot: 6,
  },
  dot: {
    size: 7,
    compactSize: 5,
  },
  tone: {
    active: {
      background: 'rgba(212,160,23,0.14)',
      border: 'rgba(212,160,23,0.28)',
      text: TACTICAL.amber,
      icon: TACTICAL.amber,
      dot: TACTICAL.amber,
    },
    ready: {
      background: 'rgba(212,160,23,0.08)',
      border: 'rgba(212,160,23,0.20)',
      text: '#E0BE6A',
      icon: '#E0BE6A',
      dot: '#E0BE6A',
    },
    live: {
      background: 'rgba(90,200,250,0.10)',
      border: 'rgba(90,200,250,0.24)',
      text: '#5AC8FA',
      icon: '#5AC8FA',
      dot: '#5AC8FA',
    },
    warning: {
      background: 'rgba(230,126,34,0.10)',
      border: 'rgba(230,126,34,0.24)',
      text: '#FFB74D',
      icon: '#FFB74D',
      dot: '#FFB74D',
    },
    unavailable: {
      background: 'rgba(192,57,43,0.10)',
      border: 'rgba(192,57,43,0.24)',
      text: TACTICAL.danger,
      icon: TACTICAL.danger,
      dot: TACTICAL.danger,
    },
    info: {
      background: 'rgba(255,255,255,0.05)',
      border: 'rgba(255,255,255,0.12)',
      text: TACTICAL.textMuted,
      icon: TACTICAL.textMuted,
      dot: TACTICAL.textMuted,
    },
    category: {
      background: 'rgba(62,79,60,0.12)',
      border: 'rgba(62,79,60,0.24)',
      text: ECS.text,
      icon: ECS.text,
      dot: TACTICAL.amber,
    },
    selected: {
      background: 'rgba(212,160,23,0.12)',
      border: 'rgba(212,160,23,0.30)',
      text: TACTICAL.amber,
      icon: TACTICAL.amber,
      dot: TACTICAL.amber,
    },
  },
} as const;
