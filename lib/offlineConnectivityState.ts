export type OfflineConnectivityState =
  | 'online'
  | 'offline'
  | 'reconnecting'
  | 'limited'
  | 'unknown';

export const CONNECTIVITY_STATE_DISPLAY: Record<
  OfflineConnectivityState,
  {
    label: string;
    description: string;
  }
> = {
  online: {
    label: 'Online',
    description: 'Connection is active.',
  },
  offline: {
    label: 'Offline',
    description: 'No internet connection.',
  },
  reconnecting: {
    label: 'Reconnecting',
    description: 'Trying to restore connection.',
  },
  limited: {
    label: 'Limited',
    description: 'Connection is unstable or limited.',
  },
  unknown: {
    label: 'Unknown',
    description: 'Connection state unavailable.',
  },
};
