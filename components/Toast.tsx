import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Text, StyleSheet, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SPACING, RADIUS, resolveEcsPopupSurfaceTheme } from '../lib/theme';
import { useToastState } from '../context/AppContext';
import { getCommandDockHeight } from '../lib/shellLayout';
import { useReducedMotion, useStableAnimatedValue } from '../lib/ecsAnimations';
import ECSShellTexture from './ECSShellTexture';
import { useTheme } from '../context/ThemeContext';

type ToastProps = {
  placement?: 'bottom' | 'top';
  topOffset?: number;
  bottomOffset?: number;
  horizontalInset?: number;
  elevated?: boolean;
  zIndex?: number;
};

const TOAST_FADE_IN_MS = 220;
const TOAST_FADE_OUT_MS = 260;

export default function Toast({
  placement = 'bottom',
  topOffset = 16,
  bottomOffset,
  horizontalInset = 20,
  elevated = false,
  zIndex,
}: ToastProps) {
  const insets = useSafeAreaInsets();
  const toastMsg = useToastState();
  const { effectiveTheme, palette } = useTheme();
  const reducedMotion = useReducedMotion();
  const opacity = useStableAnimatedValue(toastMsg ? 1 : 0);
  const [displayMsg, setDisplayMsg] = useState<string | null>(toastMsg);
  const displayMsgRef = useRef<string | null>(toastMsg);
  const latestToastRef = useRef<string | null>(toastMsg);
  const mountedRef = useRef(true);
  const surfaceTheme = useMemo(() => resolveEcsPopupSurfaceTheme(effectiveTheme), [effectiveTheme]);

  useEffect(() => {
    latestToastRef.current = toastMsg;
  }, [toastMsg]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      opacity.stopAnimation();
    };
  }, [opacity]);

  useEffect(() => {
    opacity.stopAnimation();

    if (toastMsg) {
      displayMsgRef.current = toastMsg;
      setDisplayMsg(toastMsg);

      if (reducedMotion) {
        opacity.setValue(1);
        return undefined;
      }

      opacity.setValue(0);
      const fadeIn = Animated.timing(opacity, {
        toValue: 1,
        duration: TOAST_FADE_IN_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      });
      fadeIn.start();
      return () => fadeIn.stop();
    }

    if (!displayMsgRef.current) {
      opacity.setValue(0);
      return undefined;
    }

    if (reducedMotion) {
      displayMsgRef.current = null;
      setDisplayMsg(null);
      opacity.setValue(0);
      return undefined;
    }

    const fadeOut = Animated.timing(opacity, {
      toValue: 0,
      duration: TOAST_FADE_OUT_MS,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    });

    fadeOut.start(({ finished }) => {
      if (!finished || !mountedRef.current || latestToastRef.current) return;
      displayMsgRef.current = null;
      setDisplayMsg(null);
    });

    return () => fadeOut.stop();
  }, [opacity, reducedMotion, toastMsg]);

  if (!displayMsg) return null;

  const resolvedBottomOffset = bottomOffset ?? getCommandDockHeight(insets.bottom);

  const positionStyle: ViewStyle =
    placement === 'top'
      ? {
          top: topOffset,
          bottom: undefined,
          left: horizontalInset,
          right: horizontalInset,
        }
      : {
          top: undefined,
          bottom: resolvedBottomOffset,
          left: horizontalInset,
          right: horizontalInset,
        };

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        elevated && styles.elevated,
        positionStyle,
        {
          backgroundColor: surfaceTheme.shellBg,
          borderColor: surfaceTheme.shellBorder,
        },
        { opacity },
        zIndex != null && { zIndex },
      ]}
    >
      <ECSShellTexture />
      <Text style={[styles.text, { color: palette.amber }]}>{displayMsg}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    zIndex: 9999,
  },
  elevated: {
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 24,
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
    zIndex: 1,
  },
});





