import { useSyncExternalStore } from 'react';

import { badgeUnlockQueueStore } from '../../lib/expedition/badgeUnlockQueueStore';

export function useBadgeUnlockQueue() {
  return useSyncExternalStore(
    badgeUnlockQueueStore.subscribe,
    badgeUnlockQueueStore.getSnapshot,
    badgeUnlockQueueStore.getSnapshot,
  );
}
