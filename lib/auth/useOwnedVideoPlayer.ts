import { useEffect, useRef } from 'react';
import { createVideoPlayer, type VideoPlayer, type VideoSource } from 'expo-video';

type RemovableSubscription = { remove: () => void };

export type OwnedVideoPlayer = {
  player: VideoPlayer;
  initializationError: unknown | null;
  active: () => boolean;
  action: (operation: (player: VideoPlayer) => void) => boolean;
  listen: (eventName: string, listener: (...args: any[]) => void) => RemovableSubscription;
  dispose: () => void;
};

export function createOwnedVideoPlayer(
  source: VideoSource,
  configure?: (player: VideoPlayer) => void,
): OwnedVideoPlayer {
  const player = createVideoPlayer(source);
  const subscriptions = new Set<RemovableSubscription>();
  let disposed = false;
  let initializationError: unknown | null = null;
  try {
    configure?.(player);
  } catch (error) {
    initializationError = error;
  }

  const owner: OwnedVideoPlayer = {
    player,
    initializationError,
    active: () => !disposed,
    action(operation) {
      if (disposed) return false;
      operation(player);
      return true;
    },
    listen(eventName, listener) {
      if (disposed) return { remove: () => undefined };
      const nativeSubscription = player.addListener(eventName as any, listener as any);
      let removed = false;
      const subscription = {
        remove() {
          if (removed) return;
          removed = true;
          subscriptions.delete(subscription);
          nativeSubscription.remove();
        },
      };
      subscriptions.add(subscription);
      return subscription;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const subscription of [...subscriptions]) subscription.remove();
      try {
        player.pause();
      } finally {
        player.release();
      }
    },
  };

  return owner;
}

export function useOwnedVideoPlayer(
  source: VideoSource,
  configure?: (player: VideoPlayer) => void,
): OwnedVideoPlayer {
  const ownerRef = useRef<OwnedVideoPlayer | null>(null);
  if (!ownerRef.current) ownerRef.current = createOwnedVideoPlayer(source, configure);

  useEffect(() => {
    const owner = ownerRef.current;
    return () => owner?.dispose();
  }, []);

  return ownerRef.current;
}
