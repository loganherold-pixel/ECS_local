import React from 'react';

import BadgeUnlockCelebrationHost from './BadgeUnlockCelebrationHost';

/** Owns the single application-level badge presentation host. */
export function BadgeUnlockQueueProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <BadgeUnlockCelebrationHost />
    </>
  );
}
