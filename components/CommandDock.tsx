/**
 * CommandDock — Permanent bottom navigation bar
 *
 * FLEET | NAVIGATE | DASHBOARD (crest) | DISCOVER | ALERT
 *
 * Updated for local premium badge assets:
 *   • Outer four tabs use local PNG badge icons
 *   • Active/inactive handled with animated opacity + label transitions
 *   • Dashboard crest remains live BrandShieldIcon
 *   • Safe-area support preserved
 *   • QuickActionsSheet long-press preserved
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Platform,
  Image,
  type ImageSourcePropType,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import QuickActionsSheet from './QuickActionsSheet';
import BrandShieldIcon from './BrandShieldIcon';

import { MOTION, EASING, PRESS } from '../lib/motion';
import { hapticMicro, hapticCommand } from '../lib/haptics';
import { TYPO, ECS } from '../lib/theme';

// ── ECS Dock Palette ─────────────────────────────────────────
const DOCK = {
  bar: '#151A21',
  barTopEdge: '#1A2028',
  barBorder: ECS.stroke,

  goldRail: '#A0813A',

  radialCore: 'rgba(212,160,23,0.08)',
  radialMid: 'rgba(212,160,23,0.04)',

  iconMuted: ECS.muted,
  iconActive: ECS.accent,

  labelMuted: '#5A6370',
  labelActive: ECS.accent,

  goldUnderline: 'rgba(212,160,23,0.60)',

  dashGlowOuter: 'rgba(181,139,58,0.10)',
  dashGlowInner: 'rgba(212,160,23,0.18)',
};

// ── Shield sizing ────────────────────────────────────────────
const SHIELD_ICON_SIZE = 72;
const SHIELD_SCALE = 0.67;

// ── Outer badge sizing ───────────────────────────────────────
const OUTER_BADGE_SIZE = 56;
const OUTER_BADGE_SIZE_ACTIVE = 58;

// ── Bar layout ───────────────────────────────────────────────
const BAR_HEIGHT = 68;
const ITEM_TOUCH_TARGET = 54;

const DEFAULT_BOTTOM_PADDING = 6;
const MIN_DOCK_LIFT = 0;

const SCALE_PULSE_PEAK = 1.05;
const SCALE_PULSE_DURATION = 120;

// ── Local badge assets ───────────────────────────────────────
const BADGE_ICONS = {
  fleet: require('../assets/ecs/nav/fleet-badge.png'),
  navigate: require('../assets/ecs/nav/navigate-badge.png'),
  discover: require('../assets/ecs/nav/discover-badge.png'),
  alert: require('../assets/ecs/nav/alert-badge.png'),
} as const;

// ── Dock item config ─────────────────────────────────────────
interface DockItem {
  key: 'fleet' | 'navigate' | 'dashboard' | 'discover' | 'alert';
  label: string;
  route: string;
  pathMatch: string[];
  icon?: ImageSourcePropType;
}

const DOCK_ITEMS: DockItem[] = [
  {
    key: 'fleet',
    label: 'FLEET',
    route: '/(tabs)/fleet',
    pathMatch: ['/fleet', '/vehicle-config'],
    icon: BADGE_ICONS.fleet,
  },
  {
    key: 'navigate',
    label: 'NAVIGATE',
    route: '/(tabs)/navigate',
    pathMatch: ['/navigate', '/route', '/navigate-run', '/navigate-offline', '/navigate-bailouts'],
    icon: BADGE_ICONS.navigate,
  },
  {
    key: 'dashboard',
    label: '',
    route: '/(tabs)/dashboard',
    pathMatch: ['/dashboard'],
  },
  {
    key: 'discover',
    label: 'DISCOVER',
    route: '/(tabs)/discover',
    pathMatch: ['/discover'],
    icon: BADGE_ICONS.discover,
  },
  {
    key: 'alert',
    label: 'ALERT',
    route: '/(tabs)/alert',
    pathMatch: ['/alert', '/safety', '/intel', '/more'],
    icon: BADGE_ICONS.alert,
  },
];

// ── Outer dock button using local badge images ───────────────
function DockButton({
  item,
  isActive,
  onPress,
}: {
  item: DockItem;
  isActive: boolean;
  onPress: () => void;
}) {
  const pressScaleAnim = useRef(new Animated.Value(1)).current;
  const colorProgress = useRef(new Animated.Value(isActive ? 1 : 0)).current;
  const scalePulse = useRef(new Animated.Value(1)).current;
  const prevActiveRef = useRef(isActive);

  useEffect(() => {
    const wasActive = prevActiveRef.current;
    prevActiveRef.current = isActive;

    Animated.timing(colorProgress, {
      toValue: isActive ? 1 : 0,
      duration: MOTION.stateTransition,
      easing: EASING.standard,
      useNativeDriver: true,
    }).start();

    if (isActive && !wasActive) {
      Animated.sequence([
        Animated.timing(scalePulse, {
          toValue: SCALE_PULSE_PEAK,
          duration: SCALE_PULSE_DURATION / 2,
          easing: EASING.standard,
          useNativeDriver: true,
        }),
        Animated.timing(scalePulse, {
          toValue: 1,
          duration: SCALE_PULSE_DURATION / 2,
          easing: EASING.standard,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isActive, colorProgress, scalePulse]);

  const inactiveOpacity = colorProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 0],
  });

  const activeOpacity = colorProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const underlineOpacity = colorProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const handlePressIn = useCallback(() => {
    Animated.timing(pressScaleAnim, {
      toValue: PRESS.scaleDown,
      duration: MOTION.tapPress,
      easing: EASING.press,
      useNativeDriver: true,
    }).start();
  }, [pressScaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.timing(pressScaleAnim, {
      toValue: PRESS.scaleUp,
      duration: MOTION.pressRelease,
      easing: EASING.standard,
      useNativeDriver: true,
    }).start();
  }, [pressScaleAnim]);

  const handlePress = useCallback(() => {
    hapticMicro();
    onPress();
  }, [onPress]);

  if (!item.icon) return null;

const badgeOffsetY =
  item.key === 'discover' || item.key === 'alert' ? 4 : 0;

  return (
    <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut} onPress={handlePress}>
      <Animated.View
        style={[
          styles.dockItem,
          {
            transform: [{ scale: pressScaleAnim }, { scale: scalePulse }],
          },
        ]}
      >
        <View style={styles.badgeContainer}>
          <Animated.Image
  source={item.icon}
  resizeMode="contain"
  style={[
    styles.outerBadge,
    styles.outerBadgeBase,
    {
      opacity: inactiveOpacity,
      transform: [{ translateY: badgeOffsetY }],
    },
  ]}
/>

<Animated.Image
  source={item.icon}
  resizeMode="contain"
  style={[
    styles.outerBadge,
    styles.outerBadgeActive,
    {
      opacity: activeOpacity,
      transform: [{ translateY: badgeOffsetY }],
    },
  ]}
/>
        </View>

        <View style={styles.labelContainer}>
          <Animated.Text
            style={[
              styles.dockLabel,
              styles.labelBase,
              { opacity: inactiveOpacity },
            ]}
          >
            {item.label}
          </Animated.Text>

          <Animated.Text
            style={[
              styles.dockLabel,
              styles.labelOverlay,
              styles.labelActive,
              { opacity: activeOpacity },
            ]}
          >
            {item.label}
          </Animated.Text>
        </View>

        <Animated.View style={[styles.activeUnderline, { opacity: underlineOpacity }]} />
      </Animated.View>
    </Pressable>
  );
}

// ── Center shield button ─────────────────────────────────────
function ShieldCenterButton({
  isActive,
  onTap,
  onLongPress,
}: {
  isActive: boolean;
  onTap: () => void;
  onLongPress: () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(isActive ? 1 : 0)).current;
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  useEffect(() => {
    Animated.timing(glowAnim, {
      toValue: isActive ? 1 : 0,
      duration: 280,
      easing: EASING.standard,
      useNativeDriver: false,
    }).start();
  }, [isActive, glowAnim]);

  const handlePressIn = useCallback(() => {
    longPressTriggered.current = false;

    Animated.timing(scaleAnim, {
      toValue: PRESS.shieldScaleDown,
      duration: MOTION.tapPress,
      easing: EASING.press,
      useNativeDriver: true,
    }).start();

    pressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;

      Animated.timing(scaleAnim, {
        toValue: PRESS.scaleUp,
        duration: MOTION.pressRelease,
        easing: EASING.standard,
        useNativeDriver: true,
      }).start();

      hapticCommand();
      onLongPress();
    }, MOTION.longPress);
  }, [scaleAnim, onLongPress]);

  const handlePressOut = useCallback(() => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }

    Animated.timing(scaleAnim, {
      toValue: PRESS.scaleUp,
      duration: MOTION.pressRelease,
      easing: EASING.standard,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  const handlePress = useCallback(() => {
    if (!longPressTriggered.current) {
      hapticMicro();
      onTap();
    }
  }, [onTap]);

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <View style={styles.shieldSlot}>
      <Animated.View style={[styles.shieldGlowOuter, { opacity: glowOpacity }]} pointerEvents="none" />
      <Animated.View style={[styles.shieldGlowInner, { opacity: glowOpacity }]} pointerEvents="none" />

      <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut} onPress={handlePress}>
        <Animated.View
  style={[
    styles.shieldWrapper,
    { transform: [{ translateY: -4 }, { scale: scaleAnim }] },
  ]}
>
  <View style={styles.shieldIconOnly}>
    <BrandShieldIcon scale={SHIELD_SCALE} active={isActive} />
  </View>
</Animated.View>
      </Pressable>
    </View>
  );
}

// ── Radial center glow overlay ───────────────────────────────
function RadialGradientOverlay() {
  return (
    <View style={styles.radialContainer} pointerEvents="none">
      <View
        style={[
          styles.radialRing,
          {
            width: '40%',
            height: '160%',
            backgroundColor: DOCK.radialCore,
            borderRadius: 999,
          },
        ]}
      />
      <View
        style={[
          styles.radialRing,
          {
            width: '65%',
            height: '200%',
            backgroundColor: DOCK.radialMid,
            borderRadius: 999,
          },
        ]}
      />
    </View>
  );
}

// ── Main dock ────────────────────────────────────────────────
export default function CommandDock() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [quickActionsVisible, setQuickActionsVisible] = useState(false);

  const hiddenPaths = useMemo(
    () => new Set(['/login', '/create-access-key', '/', '/initialize', '/expedition-wizard']),
    []
  );

  if (hiddenPaths.has(pathname)) {
    return null;
  }

  const isItemActive = (item: DockItem): boolean => {
    return item.pathMatch.some((p) => pathname.includes(p));
  };

  const handleNavigate = (route: string) => {
    router.push(route as any);
  };

  const bottomInset = Platform.OS === 'web' ? 0 : insets.bottom;

  const dockBottomPadding =
    Platform.OS === 'android'
      ? Math.max(Math.min(bottomInset, 8), DEFAULT_BOTTOM_PADDING)
      : bottomInset > 0
        ? bottomInset
        : DEFAULT_BOTTOM_PADDING;

  const dockHeight = BAR_HEIGHT + dockBottomPadding;

  return (
    <>
      <QuickActionsSheet
        visible={quickActionsVisible}
        onClose={() => setQuickActionsVisible(false)}
      />

      <View style={[styles.dockContainer, { bottom: MIN_DOCK_LIFT }]}>
        <View style={[styles.dockBar, { height: dockHeight, paddingBottom: dockBottomPadding }]}>
          <View style={styles.goldRailLine} />
          <View style={styles.barTopEdge} />
          <RadialGradientOverlay />

          {DOCK_ITEMS.map((item) => {
            const active = isItemActive(item);

            if (item.key === 'dashboard') {
              return (
                <ShieldCenterButton
                  key={item.key}
                  isActive={active}
                  onTap={() => handleNavigate(item.route)}
                  onLongPress={() => setQuickActionsVisible(true)}
                />
              );
            }

            return (
              <DockButton
                key={item.key}
                item={item}
                isActive={active}
                onPress={() => handleNavigate(item.route)}
              />
            );
          })}
        </View>
      </View>
    </>
  );
}

// ── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  dockContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 9999,
    elevation: 9999,
  },

  goldRailLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: DOCK.goldRail,
    zIndex: 2,
  },

  barTopEdge: {
    position: 'absolute',
    top: 1.5,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: DOCK.barTopEdge,
    zIndex: 1,
  },

  dockBar: {
  flexDirection: 'row',
  alignItems: 'flex-end',
  justifyContent: 'space-between',
  backgroundColor: DOCK.bar,
  paddingHorizontal: 10,
  overflow: 'hidden',
},

  radialContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 0,
    overflow: 'hidden',
  },

  radialRing: {
    position: 'absolute',
  },

  dockItem: {
  width: 72,
  height: BAR_HEIGHT,
  alignItems: 'center',
  justifyContent: 'flex-start',
  paddingTop: 16,
  position: 'relative',
  zIndex: 3,
},

  badgeContainer: {
  width: OUTER_BADGE_SIZE_ACTIVE,
  height: 38,
  alignItems: 'center',
  justifyContent: 'center',
  position: 'relative',
  marginBottom: 2,
},

  outerBadge: {
    position: 'absolute',
  },

  outerBadgeBase: {
    width: OUTER_BADGE_SIZE,
    height: OUTER_BADGE_SIZE,
  },

  outerBadgeActive: {
    width: OUTER_BADGE_SIZE_ACTIVE,
    height: OUTER_BADGE_SIZE_ACTIVE,
  },

  labelContainer: {
  position: 'relative',
  height: 14,
  alignItems: 'center',
  justifyContent: 'center',
  marginTop: 2,
},

  dockLabel: {
    ...TYPO.U3,
    fontSize: 7,
    letterSpacing: 3,
    textAlign: 'center',
  },

  labelBase: {
    color: DOCK.labelMuted,
  },

  labelActive: {
    color: DOCK.labelActive,
  },

  labelOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },

  activeUnderline: {
    position: 'absolute',
    bottom: 2,
    left: '20%',
    right: '20%',
    height: 2,
    backgroundColor: DOCK.goldUnderline,
  },

  shieldSlot: {
  alignItems: 'center',
  justifyContent: 'flex-start',
  width: SHIELD_ICON_SIZE + 12,
  height: BAR_HEIGHT,
  paddingTop: 6,
  position: 'relative',
  zIndex: 4,
},

  shieldGlowOuter: {
    position: 'absolute',
    width: SHIELD_ICON_SIZE + 16,
    height: SHIELD_ICON_SIZE + 16,
    borderRadius: (SHIELD_ICON_SIZE + 16) / 2,
    backgroundColor: DOCK.dashGlowOuter,
    zIndex: 0,
  },

  shieldGlowInner: {
    position: 'absolute',
    width: SHIELD_ICON_SIZE + 2,
    height: SHIELD_ICON_SIZE + 2,
    borderRadius: (SHIELD_ICON_SIZE + 2) / 2,
    backgroundColor: DOCK.dashGlowInner,
    zIndex: 1,
  },

  shieldWrapper: {
  width: SHIELD_ICON_SIZE,
  height: SHIELD_ICON_SIZE,
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 2,
},

  shieldIconOnly: {
    width: SHIELD_ICON_SIZE,
    height: SHIELD_ICON_SIZE,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
});