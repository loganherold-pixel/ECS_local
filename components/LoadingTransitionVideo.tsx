import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { VideoView, useVideoPlayer } from 'expo-video';

import LegalFooter from './legal/LegalFooter';
import { TACTICAL } from '../lib/theme';

const LOADING_TRANSITION_VIDEO = require('../assets/auth/loading-transition.mp4');
const LOADING_FALLBACK = require('../assets/attitude/backgrounds/darker-tactical-canyon.png');
export const LOADING_VIDEO_CYCLE_MS = 5000;

export default function LoadingTransitionVideo() {
  const isMountedRef = useRef(true);
  const [videoFailed, setVideoFailed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const player = useVideoPlayer(LOADING_TRANSITION_VIDEO, (videoPlayer) => {
    try {
      videoPlayer.loop = true;
      videoPlayer.muted = true;
      videoPlayer.play();
    } catch {
      setVideoFailed(true);
    }
  });

  const safePlaybackAction = useCallback(
    (action: 'play' | 'pause' | 'replay') => {
      if (!isMountedRef.current) return;
      try {
        player[action]();
      } catch {
        setVideoFailed(true);
      }
    },
    [player],
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
        setVideoReady(true);
        safePlaybackAction('play');
        return;
      }
      if (error) {
        setVideoFailed(true);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [player, safePlaybackAction]);

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <Image source={LOADING_FALLBACK} resizeMode="cover" style={styles.fallbackImage} />
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
              setVideoReady(true);
              safePlaybackAction('play');
            }
          }}
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
