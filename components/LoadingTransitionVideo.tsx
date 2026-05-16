import React, { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { VideoView, useVideoPlayer } from 'expo-video';

import LegalFooter from './legal/LegalFooter';

const LOADING_TRANSITION_VIDEO = require('../assets/auth/loading-transition.mp4');
export const LOADING_VIDEO_CYCLE_MS = 5000;

export default function LoadingTransitionVideo() {
  const isMountedRef = useRef(true);
  const player = useVideoPlayer(LOADING_TRANSITION_VIDEO, (videoPlayer) => {
    try {
      videoPlayer.loop = true;
      videoPlayer.muted = true;
      videoPlayer.play();
    } catch {}
  });

  const safePlaybackAction = useCallback(
    (action: 'play' | 'pause' | 'replay') => {
      if (!isMountedRef.current) return;
      try {
        player[action]();
      } catch {}
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

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <VideoView
        player={player}
        style={styles.media}
        nativeControls={false}
        contentFit="cover"
        fullscreenOptions={{ enable: false }}
        allowsPictureInPicture={false}
        playsInline
      />
      <View pointerEvents="none" style={styles.legalOverlay}>
        <LegalFooter variant="minimal" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  media: {
    ...StyleSheet.absoluteFillObject,
  },
  legalOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 18,
  },
});
