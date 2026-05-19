import { useEffect, useState } from 'react';

import {
  briefCadLogStore,
  getCurrentBriefCadTopBannerMessage,
  type BriefCadTopBannerMessage,
} from './briefCadLogStore';

export function useEcsBriefTopBannerMessage(
  tickMs: number = 1000,
): BriefCadTopBannerMessage | null {
  const [message, setMessage] = useState<BriefCadTopBannerMessage | null>(() =>
    getCurrentBriefCadTopBannerMessage(),
  );

  useEffect(() => {
    const refresh = () => {
      const nextMessage = getCurrentBriefCadTopBannerMessage();
      setMessage((currentMessage) => {
        if (
          currentMessage?.key === nextMessage?.key &&
          currentMessage?.expiresAt === nextMessage?.expiresAt
        ) {
          return currentMessage;
        }

        return nextMessage;
      });
    };
    const unsubscribe = briefCadLogStore.subscribe(refresh);
    const timer = setInterval(refresh, tickMs);

    refresh();

    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [tickMs]);

  return message;
}
