import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleProp,
  StyleSheet,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ECSText } from '../ECSText';
import { ECSIcon } from '../ECSStatus';
import {
  expeditionReadinessStore,
  useActiveReadinessAlert,
  type ExpeditionReadinessAlert,
} from '../../lib/readiness';
import { getCommandDockHeight } from '../../lib/shellLayout';
import { ECS, GOLD_RAIL } from '../../lib/theme';
import { useReducedMotion } from '../../lib/ecsAnimations';
import { readinessInnerSurfaceStyle } from './readinessUi';

export type ReadinessAlertToastProps = {
  onOpenCommandBrief?: () => void;
  placement?: 'top' | 'bottom';
  topOffset?: number;
  bottomOffset?: number;
  horizontalInset?: number;
  autoDismissMs?: number;
  style?: StyleProp<ViewStyle>;
};

const READINESS_TOAST_FADE_IN_MS = 180;
const READINESS_TOAST_FADE_OUT_MS = 220;

function severityTone(alert: ExpeditionReadinessAlert): 'ready' | 'warning' | 'unavailable' | 'info' {
  if (alert.severity === 'hold') return 'unavailable';
  if (alert.severity === 'caution') return 'warning';
  return 'info';
}

function severityIcon(alert: ExpeditionReadinessAlert) {
  if (alert.severity === 'hold') return 'hand-left-outline' as const;
  if (alert.severity === 'caution') return 'alert-circle-outline' as const;
  return 'information-circle-outline' as const;
}

export function ReadinessAlertToast({
  onOpenCommandBrief,
  placement = 'bottom',
  topOffset = 88,
  bottomOffset,
  horizontalInset = 14,
  autoDismissMs = 9000,
  style,
}: ReadinessAlertToastProps) {
  const insets = useSafeAreaInsets();
  const alert = useActiveReadinessAlert();
  const [renderedAlert, setRenderedAlert] = useState<ExpeditionReadinessAlert | null>(alert);
  const renderedAlertRef = useRef<ExpeditionReadinessAlert | null>(renderedAlert);
  const dismissingAlertIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const opacity = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();
  const resolvedBottomOffset = bottomOffset ?? getCommandDockHeight(insets.bottom);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      opacity.stopAnimation();
    };
  }, [opacity]);

  useEffect(() => {
    renderedAlertRef.current = renderedAlert;
  }, [renderedAlert]);

  useEffect(() => {
    if (alert) {
      dismissingAlertIdRef.current = null;
      setRenderedAlert(alert);
      opacity.stopAnimation();
      if (reducedMotion) {
        opacity.setValue(1);
        return undefined;
      }
      opacity.setValue(0);
      const fadeIn = Animated.timing(opacity, {
        toValue: 1,
        duration: READINESS_TOAST_FADE_IN_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      });
      fadeIn.start();
      return () => fadeIn.stop();
    }

    if (!renderedAlertRef.current) return undefined;
    opacity.stopAnimation();
    if (reducedMotion) {
      setRenderedAlert(null);
      opacity.setValue(0);
      return undefined;
    }
    const fadeOut = Animated.timing(opacity, {
      toValue: 0,
      duration: READINESS_TOAST_FADE_OUT_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    fadeOut.start(({ finished }) => {
      if (finished && mountedRef.current) {
        setRenderedAlert(null);
      }
    });

    return () => fadeOut.stop();
  }, [alert, opacity, reducedMotion]);

  const dismissWithFade = useCallback((alertId: string, afterDismiss?: () => void) => {
    if (dismissingAlertIdRef.current === alertId) return;
    dismissingAlertIdRef.current = alertId;
    opacity.stopAnimation();
    if (reducedMotion) {
      expeditionReadinessStore.dismissReadinessAlert(alertId);
      setRenderedAlert((current) => (current?.id === alertId ? null : current));
      dismissingAlertIdRef.current = null;
      afterDismiss?.();
      return;
    }
    const fadeOut = Animated.timing(opacity, {
      toValue: 0,
      duration: READINESS_TOAST_FADE_OUT_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    fadeOut.start(({ finished }) => {
      if (!mountedRef.current) return;
      expeditionReadinessStore.dismissReadinessAlert(alertId);
      setRenderedAlert((current) => (current?.id === alertId ? null : current));
      dismissingAlertIdRef.current = null;
      if (finished) {
        afterDismiss?.();
      }
    });
  }, [opacity, reducedMotion]);

  useEffect(() => {
    if (!renderedAlert || autoDismissMs <= 0) return undefined;
    const timer = setTimeout(() => {
      dismissWithFade(renderedAlert.id);
    }, Math.max(autoDismissMs - READINESS_TOAST_FADE_OUT_MS, 0));
    return () => clearTimeout(timer);
  }, [autoDismissMs, dismissWithFade, renderedAlert]);

  if (!renderedAlert) return null;

  const handleOpen = () => {
    dismissWithFade(renderedAlert.id, onOpenCommandBrief);
  };

  const positionStyle: ViewStyle = placement === 'top'
    ? {
        top: topOffset + insets.top,
        left: horizontalInset,
        right: horizontalInset,
      }
    : {
        bottom: resolvedBottomOffset,
        left: horizontalInset,
        right: horizontalInset,
      };

  return (
    <Animated.View pointerEvents="box-none" style={[styles.host, positionStyle, { opacity }]}>
      <View style={[styles.toast, readinessInnerSurfaceStyle, renderedAlert.severity === 'hold' && styles.holdToast, style]}>
        <View style={styles.iconWrap}>
          <ECSIcon name={severityIcon(renderedAlert)} tier="compact" tone={severityTone(renderedAlert)} />
        </View>
        <Pressable
          style={styles.copy}
          onPress={handleOpen}
          accessibilityRole="button"
          accessibilityLabel={`${renderedAlert.title}. ${renderedAlert.message}. Open Command Brief.`}
        >
          <ECSText variant="body" style={styles.title} numberOfLines={1}>
            {renderedAlert.title}
          </ECSText>
          <ECSText variant="helper" style={styles.message} numberOfLines={2}>
            {renderedAlert.message}
          </ECSText>
        </Pressable>
        <Pressable
          style={styles.action}
          onPress={handleOpen}
          accessibilityRole="button"
          accessibilityLabel={renderedAlert.actionLabel}
        >
          <ECSText variant="chip" style={styles.actionText} numberOfLines={1}>
            Brief
          </ECSText>
        </Pressable>
        <Pressable
          style={styles.close}
          onPress={() => dismissWithFade(renderedAlert.id)}
          accessibilityRole="button"
          accessibilityLabel="Dismiss readiness alert"
        >
          <ECSIcon name="close-outline" tier="compact" tone="info" />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    zIndex: 92,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 10,
    paddingHorizontal: 11,
    borderColor: GOLD_RAIL.section,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 18,
  },
  holdToast: {
    borderColor: ECS.danger,
  },
  iconWrap: {
    flexShrink: 0,
  },
  copy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  title: {
    color: ECS.text,
    fontSize: 13,
    lineHeight: 17,
    includeFontPadding: false,
  } as TextStyle,
  message: {
    color: ECS.muted,
    lineHeight: 15,
    includeFontPadding: false,
  } as TextStyle,
  action: {
    flexShrink: 0,
    borderLeftWidth: 1,
    borderLeftColor: GOLD_RAIL.internal,
    paddingLeft: 9,
    minHeight: 34,
    justifyContent: 'center',
  },
  actionText: {
    color: ECS.accent,
    textTransform: 'uppercase',
  } as TextStyle,
  close: {
    flexShrink: 0,
    paddingLeft: 2,
  },
});

export default ReadinessAlertToast;
