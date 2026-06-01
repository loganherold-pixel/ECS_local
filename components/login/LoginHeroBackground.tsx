import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus, Animated, Easing, Image, Platform, StyleSheet, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';

import { useReducedMotion } from '../../lib/ecsAnimations';
import { ecsLog } from '../../lib/ecsLogger';

const LOGIN_VIDEO = require('../../assets/login/intro-login-video.mp4');
const LOGIN_FALLBACK = require('../../assets/attitude/backgrounds/darker-tactical-canyon.png');
const LOGIN_HERO_VIDEO_ENABLED = true;

function LoginHeroBackground() {
  const reducedMotion = useReducedMotion();
  const shouldUseVideo = LOGIN_HERO_VIDEO_ENABLED && !reducedMotion;

  return (
    <View style={styles.container}>
      <Image source={LOGIN_FALLBACK} resizeMode="cover" style={styles.fallbackImage} />
      {shouldUseVideo ? (
        <LoginHeroVideoLayer reducedMotion={reducedMotion} />
      ) : null}

      <View pointerEvents="none" style={styles.darkTint} />
      <View pointerEvents="none" style={styles.screenTint} />
      <View pointerEvents="none" style={styles.goldWash} />
      {Platform.OS === 'android' ? <View pointerEvents="none" style={styles.androidContrast} /> : null}
    </View>
  );
}

function LoginHeroVideoLayer({ reducedMotion }: { reducedMotion: boolean }) {
  const videoReadyOpacity = useRef(new Animated.Value(0)).current;
  const [videoFailed, setVideoFailed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const failureLoggedRef = useRef(false);
  const isMountedRef = useRef(true);
  const markVideoFailed = useCallback((error?: unknown) => {
    if (!isMountedRef.current || failureLoggedRef.current) return;
    failureLoggedRef.current = true;
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'Unknown video error';
    ecsLog.warn('SYSTEM', '[AuthMedia] Login background video failed', {
      error: message,
    });
    setVideoFailed(true);
  }, []);
  const player = useVideoPlayer(LOGIN_VIDEO, (instance) => {
    try {
      instance.loop = true;
      instance.muted = true;
      instance.play();
    } catch (error) {
      markVideoFailed(error);
    }
  });

  const safePlayerAction = useCallback(
    (action: 'play' | 'pause') => {
      if (!isMountedRef.current) return;
      try {
        player[action]();
      } catch (error) {
        markVideoFailed(error);
      }
    },
    [markVideoFailed, player],
  );

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      try {
        player.pause();
      } catch {}
    };
  }, [player]);

  useEffect(() => {
    if (videoFailed) {
      safePlayerAction('pause');
      return;
    }

    safePlayerAction('play');
  }, [safePlayerAction, videoFailed]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasActive = appStateRef.current === 'active';
      appStateRef.current = nextState;

      if (videoFailed || !videoReady) {
        return;
      }

      if (nextState === 'active') {
        safePlayerAction('play');
      } else if (wasActive) {
        safePlayerAction('pause');
      }
    });

    return () => {
      subscription.remove();
    };
  }, [safePlayerAction, videoFailed, videoReady]);

  useEffect(() => {
    const statusSubscription = player.addListener('statusChange', ({ status, error }) => {
      if (!isMountedRef.current) return;

      if (status === 'readyToPlay') {
        setVideoReady(true);
        safePlayerAction('play');
        return;
      }

      if (!error) return;
      markVideoFailed(error.message ?? 'Unknown video error');
    });

    return () => {
      statusSubscription.remove();
    };
  }, [markVideoFailed, player, safePlayerAction]);

  useEffect(() => {
    if (videoFailed) {
      videoReadyOpacity.stopAnimation();
      videoReadyOpacity.setValue(0);
      return;
    }

    if (!videoReady) {
      return;
    }

    if (reducedMotion) {
      videoReadyOpacity.stopAnimation();
      videoReadyOpacity.setValue(1);
      return;
    }

    Animated.timing(videoReadyOpacity, {
      toValue: 1,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [reducedMotion, videoFailed, videoReady, videoReadyOpacity]);

  return (
    <>
      {!videoFailed ? (
        <Animated.View pointerEvents="none" style={[styles.videoLayer, { opacity: videoReadyOpacity }]}>
          <VideoView
            player={player}
            style={styles.video}
            contentFit="cover"
            nativeControls={false}
            fullscreenOptions={{ enable: false }}
            allowsPictureInPicture={false}
            playsInline
            onFirstFrameRender={() => {
              if (isMountedRef.current) {
                setVideoReady(true);
                safePlayerAction('play');
              }
            }}
          />
          <View pointerEvents="none" style={styles.videoDimmer} />
        </Animated.View>
      ) : null}
    </>
  );
}

export default memo(LoginHeroBackground);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#040608',
    overflow: 'hidden',
  },
  fallbackImage: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
    opacity: 0.64,
  },
  videoLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  video: {
    ...StyleSheet.absoluteFillObject,
  },
  videoDimmer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.16)',
  },
  darkTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7,8,11,0.32)',
  },
  screenTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4,6,9,0.42)',
  },
  goldWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(143,99,24,0.03)',
  },
  androidContrast: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
});
