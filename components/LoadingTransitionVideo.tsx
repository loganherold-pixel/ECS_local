import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { VideoView, useVideoPlayer } from 'expo-video';

import LegalFooter from './legal/LegalFooter';
import { TACTICAL } from '../lib/theme';

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
        <View pointerEvents="none" style={styles.loadingFallback}>
          <ActivityIndicator size="small" color={TACTICAL.amber} />
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
  const player = useVideoPlayer(LOADING_TRANSITION_VIDEO, (videoPlayer) => {
    try {
      videoPlayer.loop = true;
      videoPlayer.muted = true;
      videoPlayer.play();
    } catch {
      markVideoFailed();
    }
  });

  const safePlaybackAction = useCallback(
    (action: 'play' | 'pause' | 'replay') => {
      if (!isMountedRef.current) return;
      try {
        player[action]();
      } catch {
        markVideoFailed();
      }
    },
    [markVideoFailed, player],
  );

  useEffect(() => {
    isMountedRef.current = true;
    const cycleTimer = setInterval(() => {
      safePlaybackAction('replay');
      safePlaybackAction('play');
    }, LOADING_VIDEO_CYCLE_MS);

    return () => {
      isMountedRef.current = false;
      clearInterval(cycleTimer);
      try {
        player.pause();
      } catch {}
    };
  }, [player, safePlaybackAction]);

  useEffect(() => {
    const subscription = player.addListener('statusChange', ({ status, error }) => {
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
  }, [markVideoFailed, onReady, player, safePlaybackAction]);

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
  },
  legalOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 18,
  },
});
