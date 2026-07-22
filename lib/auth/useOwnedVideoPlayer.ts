import { useEffect, useRef } from 'react';
import { createVideoPlayer, type VideoPlayer, type VideoSource } from 'expo-video';
import { recordAuthDiagnostic } from './authDiagnostics';

type RemovableSubscription = { remove: () => void };
let nextVideoOwnerGeneration = 0;

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
  const ownerGeneration = ++nextVideoOwnerGeneration;
  const subscriptions = new Set<RemovableSubscription>();
  let disposed = false;
  let initializationError: unknown | null = null;
  recordAuthDiagnostic('video_owner_created', { metadata: { videoOwnerGeneration: ownerGeneration } });
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
      if (disposed) {
        recordAuthDiagnostic('stale_video_callback_rejected', { metadata: { videoOwnerGeneration: ownerGeneration } });
        return false;
      }
      operation(player);
      return true;
    },
    listen(eventName, listener) {
      if (disposed) return { remove: () => undefined };
      const guardedListener = (...args: any[]) => {
        if (disposed) {
          recordAuthDiagnostic('stale_video_callback_rejected', { metadata: { videoOwnerGeneration: ownerGeneration } });
          return;
        }
        listener(...args);
      };
      const nativeSubscription = player.addListener(eventName as any, guardedListener as any);
      recordAuthDiagnostic('video_listener_attached', { metadata: { videoOwnerGeneration: ownerGeneration } });
      let removed = false;
      const subscription = {
        remove() {
          if (removed) return;
          removed = true;
          subscriptions.delete(subscription);
          nativeSubscription.remove();
          recordAuthDiagnostic('video_listener_detached', { metadata: { videoOwnerGeneration: ownerGeneration } });
        },
      };
      subscriptions.add(subscription);
      return subscription;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const subscription of [...subscriptions]) subscription.remove();
      recordAuthDiagnostic('video_release_started', { metadata: { videoOwnerGeneration: ownerGeneration } });
      try {
        player.release();
        recordAuthDiagnostic('video_release_completed', { metadata: { videoOwnerGeneration: ownerGeneration } });
      } catch {
        recordAuthDiagnostic('transition_failed', {
          result: 'failure',
          metadata: { videoOwnerGeneration: ownerGeneration, phase: 'video_release' },
        });
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
