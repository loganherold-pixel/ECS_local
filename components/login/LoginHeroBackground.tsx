import React, { memo, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus, Animated, Easing, Image, Platform, StyleSheet, View } from 'react-native';
import { ResizeMode, Video } from 'expo-av';

import { useReducedMotion } from '../../lib/ecsAnimations';

const LOGIN_VIDEO = require('../../assets/login/intro-login-video.mp4');
const LOGIN_FALLBACK = require('../../assets/attitude/backgrounds/darker-tactical-canyon.png');

function LoginHeroBackground() {
  const reducedMotion = useReducedMotion();
  const videoReadyOpacity = useRef(new Animated.Value(0)).current;
  const [videoFailed, setVideoFailed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const videoRef = useRef<Video | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const readyLoggedRef = useRef(false);
  const failureLoggedRef = useRef(false);

  useEffect(() => {
    if (videoFailed || !videoReady) {
      void videoRef.current?.pauseAsync().catch(() => {});
      return;
    }

    void videoRef.current?.playAsync().catch(() => {
      setVideoFailed(true);
    });
  }, [videoFailed, videoReady]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasActive = appStateRef.current === 'active';
      appStateRef.current = nextState;

      if (videoFailed || !videoReady) {
        return;
      }

      if (nextState === 'active') {
        void videoRef.current?.playAsync().catch(() => {
          setVideoFailed(true);
        });
      } else if (wasActive) {
        void videoRef.current?.pauseAsync().catch(() => {});
      }
    });

    return () => {
      subscription.remove();
    };
  }, [videoFailed, videoReady]);

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

  useEffect(() => {
    if (!videoReady || videoFailed) return;
    console.log('[AuthMedia] Login background video active');
  }, [videoFailed, videoReady]);

  const shouldShowFallback = videoFailed;

  return (
    <View style={styles.container}>
      {shouldShowFallback ? (
        <Image source={LOGIN_FALLBACK} resizeMode="cover" style={styles.fallbackImage} />
      ) : null}

      {!videoFailed ? (
        <Animated.View pointerEvents="none" style={[styles.videoLayer, { opacity: videoReadyOpacity }]}>
          <Video
            ref={videoRef}
            source={LOGIN_VIDEO}
            style={styles.video}
            resizeMode={ResizeMode.COVER}
            shouldPlay
            isLooping
            isMuted={true}
            useNativeControls={false}
            onLoad={() => {
              setVideoReady(true);
              if (!readyLoggedRef.current) {
                readyLoggedRef.current = true;
                console.log('[AuthMedia] Login background video loaded');
              }
            }}
            onReadyForDisplay={() => {
              setVideoReady(true);
              if (!readyLoggedRef.current) {
                readyLoggedRef.current = true;
                console.log('[AuthMedia] Login background video ready');
              }
            }}
            onPlaybackStatusUpdate={(status) => {
              if (!status.isLoaded) {
                if (!status.error || failureLoggedRef.current) {
                  return;
                }
                failureLoggedRef.current = true;
                console.warn('[AuthMedia] Login background video failed', {
                  status: 'error',
                  error: status.error ?? null,
                });
                setVideoFailed(true);
                return;
              }

              if (status.isLoaded && status.didJustFinish) {
                void videoRef.current?.replayAsync().catch(() => {
                  setVideoFailed(true);
                });
              }
            }}
            onError={(error) => {
              if (!failureLoggedRef.current) {
                failureLoggedRef.current = true;
                console.warn('[AuthMedia] Login background video failed', {
                  status: 'error',
                  error,
                });
              }
              setVideoFailed(true);
            }}
          />
          <View pointerEvents="none" style={styles.videoDimmer} />
        </Animated.View>
      ) : null}

      <View pointerEvents="none" style={styles.darkTint} />
      <View pointerEvents="none" style={styles.bottomGradient} />
      <View pointerEvents="none" style={styles.goldWash} />
      {Platform.OS === 'android' ? <View pointerEvents="none" style={styles.androidContrast} /> : null}

    </View>
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
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '36%',
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
