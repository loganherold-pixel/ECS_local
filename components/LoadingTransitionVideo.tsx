import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { VideoView } from 'expo-video';

import LegalFooter from './legal/LegalFooter';
import { TACTICAL } from '../lib/theme';
import { useOwnedVideoPlayer } from '../lib/auth/useOwnedVideoPlayer';

const LOADING_TRANSITION_VIDEO = require('../assets/auth/loading-transition.mp4');
const LOADING_FALLBACK = require('../assets/attitude/backgrounds/darker-tactical-canyon.png');
export const LOADING_VIDEO_CYCLE_MS = 5000;
const STARTUP_LOADING_VIDEO_ENABLED = !(Platform.OS === 'android' && typeof __DEV__ !== 'undefined' && __DEV__);

export default function LoadingTransitionVideo() {
  const [videoFailed, setVideoFailed] = useState(!STARTUP_LOADING_VIDEO_ENABLED);
  const [videoReady, setVideoReady] = useState(false);

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <Image source={LOADING_FALLBACK} resizeMode="cover" style={styles.fallbackImage} />
      {STARTUP_LOADING_VIDEO_ENABLED ? (
        <LoadingTransitionVideoLayer
          onReady={() => setVideoReady((current) => current || true)}
          onFailed={() => setVideoFailed((current) => current || true)}
        />
      ) : null}
      <View pointerEvents="none" style={styles.tint} />
      {!videoReady || videoFailed ? (
        <View style={styles.loadingFallback} accessibilityRole="progressbar" accessibilityLabel="Preparing ECS offline workspace">
          <ActivityIndicator size="small" color={TACTICAL.amber} />
          <Text style={styles.loadingLabel}>Preparing your offline workspace…</Text>
        </View>
      ) : null}
      <View pointerEvents="none" style={styles.legalOverlay}>
        <LegalFooter variant="minimal" />
      </View>
    </View>
  );
}

function LoadingTransitionVideoLayer({
  onReady,
  onFailed,
}: {
  onReady: () => void;
  onFailed: () => void;
}) {
  const isMountedRef = useRef(true);
  const [videoFailed, setVideoFailed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const markVideoFailed = useCallback(() => {
    if (!isMountedRef.current) return;
    setVideoFailed(true);
    onFailed();
  }, [onFailed]);
  const playerOwner = useOwnedVideoPlayer(LOADING_TRANSITION_VIDEO, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.muted = true;
    videoPlayer.play();
  });
  const player = playerOwner.player;

  const safePlaybackAction = useCallback(
    (action: 'play' | 'pause' | 'replay') => {
      if (!isMountedRef.current || !playerOwner.active()) return;
      try {
        playerOwner.action((ownedPlayer) => ownedPlayer[action]());
      } catch {
        markVideoFailed();
      }
    },
    [markVideoFailed, playerOwner],
  );

  useEffect(() => {
    isMountedRef.current = true;
    if (playerOwner.initializationError) {
      markVideoFailed();
      return () => {
        isMountedRef.current = false;
      };
    }
    safePlaybackAction('play');

    const cycleTimer = setInterval(() => {
      safePlaybackAction('replay');
      safePlaybackAction('play');
    }, LOADING_VIDEO_CYCLE_MS);

    return () => {
      isMountedRef.current = false;
      clearInterval(cycleTimer);
    };
  }, [markVideoFailed, playerOwner, safePlaybackAction]);

  useEffect(() => {
    const subscription = playerOwner.listen('statusChange', ({ status, error }: any) => {
      if (!isMountedRef.current) return;
      if (status === 'readyToPlay') {
        setVideoReady((current) => current || true);
        onReady();
        safePlaybackAction('play');
        return;
      }
      if (error) {
        markVideoFailed();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [markVideoFailed, onReady, playerOwner, safePlaybackAction]);

  return (
    <>
      {!videoFailed ? (
        <VideoView
          player={player}
          style={[styles.media, videoReady ? null : styles.hiddenMedia]}
          nativeControls={false}
          contentFit="cover"
          fullscreenOptions={{ enable: false }}
          allowsPictureInPicture={false}
          playsInline
          onFirstFrameRender={() => {
            if (isMountedRef.current) {
              setVideoReady((current) => current || true);
              onReady();
              safePlaybackAction('play');
            }
          }}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#040608',
  },
  fallbackImage: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
    opacity: 0.74,
  },
  media: {
    ...StyleSheet.absoluteFillObject,
  },
  hiddenMedia: {
    opacity: 0,
  },
  tint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(3,5,8,0.5)',
  },
  loadingFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingLabel: {
    color: '#F2F5F7',
    fontSize: 14,
    fontWeight: '600',
  },
  legalOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 18,
  },
});
