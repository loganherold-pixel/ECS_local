import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  AccessibilityInfo,
  Platform,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import {
  advisoryStore,
  type AdvisoryState,
  type AdvisoryMode,
} from '../../lib/advisoryStore';
import { DEPTH_SHADOWS } from '../../lib/depthSystem';
import { TACTICAL } from '../../lib/theme';
import { useTheme } from '../../context/ThemeContext';
import { useStableAnimatedValue } from '../../lib/ecsAnimations';

const COMPACT_BAR_HEIGHT = 50;
const CRITICAL_BAR_HEIGHT = 68;
const FADE_IN_MS = 340;
const FADE_OUT_MS = 360;

interface ModeVisual {
  bg: string;
  border: string;
  text: string;
  icon: string;
  indicator: string;
  label: string;
  accent: string;
  badgeBg: string;
}

const MODE_VISUALS: Record<AdvisoryMode, ModeVisual> = {
  alert: {
    bg: 'rgba(192, 57, 43, 0.12)',
    border: 'rgba(192, 57, 43, 0.30)',
    text: '#F6C2BC',
    icon: '#E85B4D',
    indicator: '#E85B4D',
    label: 'ALERT',
    accent: '#E85B4D',
    badgeBg: 'rgba(232, 91, 77, 0.10)',
  },
  advisory: {
    bg: 'rgba(196, 138, 44, 0.09)',
    border: 'rgba(196, 138, 44, 0.24)',
    text: '#E8D7A9',
    icon: '#D4A017',
    indicator: '#D4A017',
    label: 'ADVISORY',
    accent: '#D4A017',
    badgeBg: 'rgba(212, 160, 23, 0.09)',
  },
  standby: {
    bg: 'rgba(139, 148, 158, 0.045)',
    border: 'rgba(139, 148, 158, 0.11)',
    text: '#93A0AB',
    icon: '#69737D',
    indicator: '#59626B',
    label: 'STANDBY',
    accent: '#59626B',
    badgeBg: 'rgba(89, 98, 107, 0.10)',
  },
};

const MODE_ICONS: Record<AdvisoryMode, string> = {
  alert: 'alert-circle',
  advisory: 'radio',
  standby: 'shield-checkmark',
};

interface ExpeditionIntelligenceBarProps {
  enabled?: boolean;
  disableAnimations?: boolean;
  override?: {
    title: string;
    detail?: string | null;
    badge: string;
    icon?: React.ComponentProps<typeof Ionicons>['name'];
    tone?: 'active' | 'ready' | 'warning' | 'unavailable' | 'info';
    live?: boolean;
  } | null;
}

const depthShadow4 = DEPTH_SHADOWS?.[4] ?? {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.2,
  shadowRadius: 8,
  elevation: 6,
};

export default function ExpeditionIntelligenceBar({
  enabled = true,
  disableAnimations = false,
  override = null,
}: ExpeditionIntelligenceBarProps) {
  const { palette, colors, isLight } = useTheme();
  const [state, setState] = useState<AdvisoryState>(advisoryStore.getState());
  const [reduceMotion, setReduceMotion] = useState(false);
  const fadeAnim = useStableAnimatedValue(0);
  const transitionTokenRef = useRef(0);
  const overrideMessageKey = override
    ? `${override.badge}|${override.title}|${override.detail ?? ''}|${override.tone ?? ''}|${override.live ? 'live' : 'idle'}`
    : null;
  const visible = !!override || (!!state.current && !!state.isVisible);
  const currentMessageId = overrideMessageKey ?? state.current?.id ?? null;

  useEffect(() => {
    let cancelled = false;

    if (Platform.OS !== 'web' && AccessibilityInfo.isReduceMotionEnabled) {
      AccessibilityInfo.isReduceMotionEnabled()
        .then((value) => {
          if (!cancelled) setReduceMotion(!!value);
        })
        .catch(() => {
          if (!cancelled) setReduceMotion(false);
        });
    }

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = advisoryStore.subscribe((nextState) => {
      setState((current) => (
        current.current?.id === nextState.current?.id &&
        current.isVisible === nextState.isVisible &&
        current.enabled === nextState.enabled &&
        current.simplifiedMode === nextState.simplifiedMode
          ? current
          : nextState
      ));
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const shouldAnimate = !reduceMotion && !disableAnimations;
    const transitionToken = ++transitionTokenRef.current;
    fadeAnim.stopAnimation();

    if (shouldAnimate) {
      const animation = Animated.timing(fadeAnim, {
        toValue: visible ? 1 : 0,
        duration: visible ? FADE_IN_MS : FADE_OUT_MS,
        useNativeDriver: true,
      });
      animation.start(({ finished }) => {
        if (finished && transitionTokenRef.current === transitionToken) {
          fadeAnim.setValue(visible ? 1 : 0);
        }
      });
      return () => {
        transitionTokenRef.current += 1;
        animation.stop();
        fadeAnim.stopAnimation();
      };
    } else {
      fadeAnim.setValue(visible ? 1 : 0);
    }
  }, [currentMessageId, visible, reduceMotion, disableAnimations, fadeAnim]);

  const message = state.current;
  const mode: AdvisoryMode = message?.mode ?? 'standby';
  const criticalState = mode === 'alert' || override?.tone === 'warning';

  if (!enabled || !state.enabled) {
    return <View style={[styles.reservedSpace, { height: COMPACT_BAR_HEIGHT, backgroundColor: palette.bg, borderBottomColor: palette.border }]} />;
  }

  const fallbackVisual = MODE_VISUALS[mode] ?? MODE_VISUALS.standby;
  const overrideVisual = (() => {
    switch (override?.tone) {
      case 'active':
        return {
          bg: 'rgba(196, 138, 44, 0.12)',
          border: 'rgba(196, 138, 44, 0.28)',
          text: '#F0DEB1',
          icon: '#D4A017',
          indicator: '#D4A017',
          accent: '#D4A017',
          badgeBg: 'rgba(212,160,23,0.11)',
        };
      case 'ready':
        return {
          bg: 'rgba(76, 175, 80, 0.10)',
          border: 'rgba(76, 175, 80, 0.24)',
          text: '#C8E6C9',
          icon: '#7BC67E',
          indicator: '#7BC67E',
          accent: '#7BC67E',
          badgeBg: 'rgba(123,198,126,0.12)',
        };
      case 'warning':
        return MODE_VISUALS.alert;
      case 'unavailable':
        return {
          bg: 'rgba(111, 119, 131, 0.08)',
          border: 'rgba(111, 119, 131, 0.18)',
          text: '#A3AFBA',
          icon: '#8D99A6',
          indicator: '#8D99A6',
          accent: '#8D99A6',
          badgeBg: 'rgba(141,153,166,0.10)',
        };
      case 'info':
      default:
        return {
          bg: 'rgba(91, 141, 239, 0.10)',
          border: 'rgba(91, 141, 239, 0.22)',
          text: '#D5E2FF',
          icon: '#89ABF6',
          indicator: '#89ABF6',
          accent: '#89ABF6',
          badgeBg: 'rgba(137,171,246,0.11)',
        };
    }
  })();

  const visualBase = override ? overrideVisual : fallbackVisual;
  const visual = isLight
    ? {
        ...visualBase,
        bg: palette.panel,
        border: palette.border,
        text: palette.text,
        badgeBg: colors.bgInput,
      }
    : visualBase;

  const renderedIcon = override?.icon || (message?.icon as any) || (MODE_ICONS[mode] as any) || 'sparkles-outline';
  const renderedTitle = override ? override.title : message?.text ?? '';
  const renderedDetail = override?.detail?.trim() || null;
  const accessibilityLabel = override
    ? `${override.badge}: ${[renderedTitle, renderedDetail].filter(Boolean).join('. ')}`
    : message
      ? `${fallbackVisual.label}: ${message.text}`
      : 'Expedition intelligence standing by';

  return (
    <View
      style={[
        styles.container,
        {
          height: criticalState ? CRITICAL_BAR_HEIGHT : COMPACT_BAR_HEIGHT,
          backgroundColor: palette.bg,
          borderBottomColor: palette.border,
        },
      ]}
    >
      <Animated.View
        style={[
          styles.bar,
          {
            backgroundColor: visual.bg,
            borderColor: visual.border,
            opacity: fadeAnim,
          },
        ]}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        accessibilityLabel={accessibilityLabel}
      >
        {override || message ? (
          <View style={styles.content}>
            <View style={styles.indicatorGroup}>
              <View style={[styles.modeDot, { backgroundColor: visual.indicator }]} />
              {override?.live ? (
                <View style={[styles.liveDot, { backgroundColor: visual.indicator }]} />
              ) : null}
              <Ionicons
                name={renderedIcon as any}
                size={17}
                color={visual.icon}
              />
            </View>

            <View style={styles.messageBlock}>
              <Text
                style={[styles.messageTitle, { color: visual.text }]}
                numberOfLines={criticalState ? 2 : 1}
                ellipsizeMode="tail"
              >
                {renderedTitle}
              </Text>
              {renderedDetail ? (
                <Text
                  style={[styles.messageDetail, { color: isLight ? colors.textSecondary : TACTICAL.textMuted }]}
                  numberOfLines={criticalState ? 2 : 1}
                  ellipsizeMode="tail"
                >
                  {renderedDetail}
                </Text>
              ) : null}
            </View>

            <View
              style={[
                styles.modeBadge,
                {
                  borderColor: `${visual.accent}40`,
                  backgroundColor: visual.badgeBg,
                },
              ]}
            >
              <Text style={[styles.modeBadgeText, { color: visual.accent }]}>
                {override?.badge ?? fallbackVisual.label}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.emptyContent}>
            <View
              style={[
                styles.emptyDot,
                { backgroundColor: MODE_VISUALS.standby.indicator },
              ]}
            />
            <Ionicons
              name="radio-outline"
              size={13}
              color={MODE_VISUALS.standby.icon}
            />
            <Text style={[styles.emptyText, { color: isLight ? colors.textSecondary : TACTICAL.textMuted }]}>
              EXPEDITION INTELLIGENCE
            </Text>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  reservedSpace: {
    borderBottomWidth: 1,
    backgroundColor: TACTICAL.bg,
    borderBottomColor: TACTICAL.border,
  },

  container: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 4,
    justifyContent: 'center',
    borderBottomWidth: 1,
    backgroundColor: TACTICAL.bg,
    borderBottomColor: TACTICAL.border,
    zIndex: 4,
  },

  bar: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 0.75,
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: depthShadow4.shadowColor,
    shadowOffset: depthShadow4.shadowOffset,
    shadowOpacity: depthShadow4.shadowOpacity,
    shadowRadius: depthShadow4.shadowRadius,
    elevation: depthShadow4.elevation,
  },

  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 12,
    gap: 8,
  },

  indicatorGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingLeft: 6,
  },

  modeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },

  liveDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    opacity: 0.85,
  },

  messageBlock: {
    flex: 1,
    justifyContent: 'center',
    gap: 1,
  },

  messageTitle: {
    fontSize: 12.2,
    fontWeight: '700',
    letterSpacing: 0.22,
    lineHeight: 14.5,
  },

  messageDetail: {
    fontSize: 10.2,
    fontWeight: '600',
    lineHeight: 12.5,
    letterSpacing: 0.12,
  },

  modeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 0.75,
    alignSelf: 'center',
  },

  modeBadgeText: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 1.5,
  },

  emptyContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    opacity: 0.42,
  },

  emptyDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },

  emptyText: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 2.5,
  },
});
