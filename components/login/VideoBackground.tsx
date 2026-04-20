/**
 * VideoBackground — Full-screen looping background video for the ECS Login screen.
 *
 * Platform behaviour:
 *   Web    → renders an HTML5 <video> element (muted, autoplay, loop, no controls)
 *   Native → renders expo-video VideoView component (muted, autoplay, loop, cover)
 *
 * Video source:
 *   Supabase public storage bucket — no signed token required.
 *
 * Fallback strategy:
 *   1. While video loads → branded ECS fallback image (cinematic terrain)
 *   2. If video fails   → branded ECS fallback image persists
 *   3. Never shows plain black — always has visual content
 *
 * Layer responsibilities (this component only handles z-index 0):
 *   The dark overlay (z-index 1) is handled by the parent AdaptiveBackground.
 *
 * Brightness control:
 *   Web:    CSS filter brightness(0.5) contrast(1.05)
 *   Native: Semi-transparent dark overlay within this component (0.45 opacity)
 *           to approximate the same dimming effect
 */

import React, { useState, useCallback, useEffect, useRef, memo } from 'react';
import {
  View,
  StyleSheet,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import { Image } from 'expo-image';
import { VideoView, useVideoPlayer } from 'expo-video';

// ── Video source (Supabase public URL — no token needed) ──────
const VIDEO_URI =
  'https://fklgdugvoczmotoubroz.supabase.co/storage/v1/object/public/ECS/Intro_Login_Video.mp4';

// ── Branded fallback image — cinematic terrain/landscape ──────
// This shows while video loads AND if video fails to play.
const FALLBACK_IMAGE_URI =
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&q=80';

// ── Platform flags ─────────────────────────────────────────────
const IS_WEB = Platform.OS === 'web';
const IS_NATIVE = !IS_WEB;

// ── Web-only HTML5 video element ──────────────────────────────
const WebVideo = memo(function WebVideo({
  onError,
  onLoad,
}: {
  onError: () => void;
  onLoad: () => void;
}) {
  const videoRef = useRef<any>(null);

  useEffect(() => {
    if (!IS_WEB) return;
    const el = videoRef.current;
    if (!el) return;

    el.muted = true;
    const playPromise = el.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        onError();
      });
    }
  }, [onError]);

  if (!IS_WEB) return null;

  return React.createElement('video', {
    ref: videoRef,
    src: VIDEO_URI,
    autoPlay: true,
    muted: true,
    loop: true,
    playsInline: true,
    controls: false,
    preload: 'auto',
    onCanPlayThrough: onLoad,
    onError: onError,
    style: {
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      objectFit: 'cover',
      filter: 'brightness(0.5) contrast(1.05)',
      pointerEvents: 'none',
      zIndex: 0,
    } as any,
  });
});

// ── Native video via expo-video ───────────────────────────────
const NativeVideo = memo(function NativeVideo({
  onError,
  onLoad,
}: {
  onError: () => void;
  onLoad: () => void;
}) {
  const hasSignalled = useRef(false);

  const player = useVideoPlayer(
    { uri: VIDEO_URI },
    (playerInstance) => {
      try {
        playerInstance.loop = true;
        playerInstance.muted = true;
        playerInstance.play();
      } catch (e) {
        if (!hasSignalled.current) {
          hasSignalled.current = true;
          console.log('[ECS] Video player init error:', e);
          onError();
        }
      }
    }
  );

  useEffect(() => {
    const statusSub = player.addListener('statusChange', ({ status, error }) => {
      if (hasSignalled.current) return;

      if (status === 'readyToPlay') {
        hasSignalled.current = true;
        onLoad();
        return;
      }

      if (status === 'error' || error) {
        hasSignalled.current = true;
        console.log('[ECS] Video playback error:', error);
        onError();
      }
    });

    return () => {
      statusSub.remove();
    };
  }, [player, onLoad, onError]);

  return (
    <VideoView
  player={player}
  style={StyleSheet.absoluteFillObject}
  contentFit="cover"
  nativeControls={false}
  fullscreenOptions={{ enable: false }}
/>
  );
});

// ── Branded fallback image (always visible as base layer) ─────
const BrandedFallback = memo(function BrandedFallback() {
  return (
    <View style={fallbackStyles.container}>
      <Image
        source={{ uri: FALLBACK_IMAGE_URI }}
        style={fallbackStyles.image}
        contentFit="cover"
        transition={0}
        priority="high"
        cachePolicy="memory-disk"
      />
      <View style={fallbackStyles.colorGrade} />
      <View style={fallbackStyles.vignette} />
    </View>
  );
});

const fallbackStyles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  colorGrade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8, 6, 4, 0.55)',
  },
  vignette: {
    position: 'absolute',
    top: '20%',
    left: '15%',
    right: '15%',
    height: '15%',
    borderRadius: 200,
    backgroundColor: 'rgba(196, 138, 44, 0.04)',
  },
});

// ── Exported component ────────────────────────────────────────
interface Props {
  children?: React.ReactNode;
}

function VideoBackground({ children }: Props) {
  const [videoFailed, setVideoFailed] = useState(false);

  // ── Fade-in animation: 0 → 1 over 1s, ease-out ────────────
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const handleLoad = useCallback(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 1000,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const handleError = useCallback(() => {
    console.log('[ECS] Video background failed — using branded fallback image');
    setVideoFailed(true);
  }, []);

  return (
    <View style={styles.container}>
      {/* BASE LAYER — Branded fallback image */}
      <BrandedFallback />

      {/* VIDEO LAYER — Fades in smoothly over the fallback image */}
      {!videoFailed && (
        <Animated.View
          style={[styles.videoLayer, { opacity: fadeAnim }]}
          pointerEvents="none"
        >
          {IS_WEB ? (
            <WebVideo onError={handleError} onLoad={handleLoad} />
          ) : (
            <NativeVideo onError={handleError} onLoad={handleLoad} />
          )}

          {/* Native brightness control — approximates CSS brightness(0.5) */}
          {IS_NATIVE && (
            <View style={styles.nativeBrightnessOverlay} pointerEvents="none" />
          )}
        </Animated.View>
      )}

      {children}
    </View>
  );
}

export default memo(VideoBackground);

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  videoLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  nativeBrightnessOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
});
