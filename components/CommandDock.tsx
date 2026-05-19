/**
 * CommandDock — Permanent bottom navigation bar
 *
 * FLEET | NAVIGATE | DASHBOARD (crest) | EXPLORE | DISPATCH
 *
 * Updated for local premium badge assets:
 *   • Outer four tabs use local PNG badge icons
 *   • Active/inactive handled with animated opacity + label transitions
 *   • Dashboard crest remains live BrandShieldIcon
 *   • Safe-area support preserved
 *   • QuickActionsSheet long-press preserved
 *
 * Startup fix:
 *   • Uses router.navigate instead of router.push so dock navigation
 *     selects the existing tab route without stacking screens.
 *
 * Hook-order fix:
 *   • All hooks are declared before any conditional return.
 */

import React, { useRef, useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import QuickActionsSheet from './QuickActionsSheet';
import { useTheme } from '../context/ThemeContext';

import { MOTION, EASING, PRESS } from '../lib/motion';
import { hapticMicro, hapticCommand } from '../lib/haptics';
import { TYPO, ECS } from '../lib/theme';
import {
  hasSeenDashboardLongPressHint,
  markDashboardLongPressHintSeen,
} from '../lib/firstLaunchGuidanceStore';
import {
  ECS_COMMAND_DOCK_BAR_HEIGHT,
  ECS_COMMAND_DOCK_CENTER_SLOT_WIDTH,
  ECS_COMMAND_DOCK_CENTER_SLOT_FLEX,
  ECS_COMMAND_DOCK_EDGE_SLOT_FLEX,
  ECS_COMMAND_DOCK_INNER_SLOT_FLEX,
  ECS_COMMAND_DOCK_LABEL_HEIGHT,
  ECS_COMMAND_DOCK_OUTER_ITEM_MAX_WIDTH,
} from '../lib/shellLayout';
import {
  getDashboardChromeState,
  subscribeDashboardChrome,
} from '../lib/dashboardChromeStore';
import { useAdaptiveLayout } from '../lib/useAdaptiveLayout';
import { BOTTOM_BANNER_BG } from '../lib/chromeAssets';
import { resolveShellChromeTheme } from '../lib/ui/shellChromeTheme';
import { resolveDispatchRolloutConfig } from '../lib/dispatchRolloutConfig';
import {
  ECSGlobalBanner,
  getEcsBottomSafePadding,
} from './ECSGlobalBanner';

// ── ECS Dock Palette ─────────────────────────────────────────
const DOCK = {
  bar: '#151A20',
  barBorder: 'rgba(196,138,44,0.22)',

  labelMuted: '#6E7886',
  labelActive: '#D1AC59',
};

// ── Shield sizing ────────────────────────────────────────────
const SHIELD_ICON_SIZE = 80;

// ── Outer badge sizing ───────────────────────────────────────
const OUTER_BADGE_SIZE_ACTIVE = 70;
const OUTER_DOCK_ITEM_VERTICAL_OFFSET = 6;
const OUTER_BADGE_TO_LABEL_OFFSET = -4;
const CENTER_DASHBOARD_BUTTON_DROP = 6;
const BOTTOM_BANNER_BACKGROUND_DROP_OFFSET = 3;

// ── Bar layout ───────────────────────────────────────────────
const MIN_DOCK_LIFT = 0;

const SCALE_PULSE_PEAK = 1.05;
const SCALE_PULSE_DURATION = 120;
const FIRST_LAUNCH_HINT_CYCLES = 5;
const FIRST_LAUNCH_HINT_FADE_MS = 520;
const FIRST_LAUNCH_HINT_IDLE_MS = 180;
const QUICK_ACTIONS_NAV_LOCK_MS = 650;

const DOCK_BADGES = {
  fleet: require('../assets/ecs/nav/fleet-badge.png'),
  navigate: require('../assets/ecs/nav/navigate-badge.png'),
  dashboard: require('../assets/ecs/nav/ecs-center.png'),
  discover: require('../assets/ecs/nav/discover-badge.png'),
  alert: require('../assets/ecs/nav/alert-badge.png'),
} as const;

// ── Local badge assets ───────────────────────────────────────
// ── Dock item config ─────────────────────────────────────────
interface DockItem {
  key: 'fleet' | 'navigate' | 'dashboard' | 'discover' | 'alert';
  label: string;
  route: string;
  pathMatch: string[];
  badge?: number;
  iconOffsetY?: number;
}

type DockItemKey = DockItem['key'];

const DOCK_ITEMS: DockItem[] = [
  {
    key: 'fleet',
    label: 'FLEET',
    route: '/fleet',
    pathMatch: ['/fleet', '/vehicle-config'],
    badge: DOCK_BADGES.fleet,
  },
  {
    key: 'navigate',
    label: 'NAVIGATE',
    route: '/navigate',
    pathMatch: ['/navigate', '/route', '/navigate-run', '/navigate-offline', '/navigate-bailouts'],
    badge: DOCK_BADGES.navigate,
  },
  {
    key: 'dashboard',
    label: '',
    route: '/dashboard',
    pathMatch: ['/dashboard'],
    badge: DOCK_BADGES.dashboard,
  },
  {
    key: 'discover',
    label: 'EXPLORE',
    route: '/discover',
    pathMatch: ['/discover'],
    badge: DOCK_BADGES.discover,
    iconOffsetY: 3.25,
  },
  {
    key: 'alert',
    label: 'DISPATCH',
    route: '/alert',
    pathMatch: ['/alert', '/safety', '/intel', '/more'],
    badge: DOCK_BADGES.alert,
    iconOffsetY: 3.75,
  },
];

function getDockSlotFlex(key: DockItemKey): number {
  switch (key) {
    case 'fleet':
    case 'alert':
      return ECS_COMMAND_DOCK_EDGE_SLOT_FLEX;
    case 'navigate':
    case 'discover':
      return ECS_COMMAND_DOCK_INNER_SLOT_FLEX;
    case 'dashboard':
    default:
      return ECS_COMMAND_DOCK_CENTER_SLOT_FLEX;
  }
}

function getOuterSlotHorizontalPadding(
  key: DockItemKey,
  isLargePhone: boolean,
  isTablet: boolean,
): number {
  const edgePadding = isTablet ? 9 : isLargePhone ? 8 : 7;
  const innerPadding = isTablet ? 17 : isLargePhone ? 15 : 13;

  switch (key) {
    case 'navigate':
    case 'discover':
      return innerPadding;
    case 'fleet':
    case 'alert':
      return edgePadding;
    default:
      return 0;
  }
}

// ── Outer dock button using local badge images ───────────────
function DockButton({
  item,
  isActive,
  onPress,
  maxWidth,
  labelMuted,
  labelActive,
}: {
  item: DockItem;
  isActive: boolean;
  onPress: () => void;
  maxWidth: number;
  labelMuted: string;
  labelActive: string;
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
    outputRange: [1, 0],
  });

  const activeOpacity = colorProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const badgeOpacity = colorProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.58, 1],
  });
  const badgeScale = colorProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1],
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

  if (!item.badge) return null;

  return (
    <Pressable
      style={[styles.dockPressable, { maxWidth }]}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      hitSlop={8}
    >
      <Animated.View
        style={[
          styles.dockItem,
          {
            transform: [
              { translateY: OUTER_DOCK_ITEM_VERTICAL_OFFSET },
              { scale: pressScaleAnim },
              { scale: scalePulse },
            ],
          },
        ]}
      >
        <Animated.View
          style={[
          styles.badgeContainer,
          styles.outerBadgeContainer,
          {
            opacity: badgeOpacity,
            transform: [{ translateY: item.iconOffsetY ?? 0 }, { scale: badgeScale }],
          },
        ]}
      >
          <Image
            source={item.badge}
            style={styles.badgeImage}
            contentFit="contain"
            transition={0}
          />
        </Animated.View>

        <View style={[styles.labelContainer, styles.outerLabelContainer]}>
          <Animated.Text
            style={[
              styles.dockLabel,
              styles.labelBase,
              { color: labelMuted },
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
              { color: labelActive },
              { opacity: activeOpacity },
            ]}
          >
            {item.label}
          </Animated.Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ── Center shield button ─────────────────────────────────────
function ShieldCenterButton({
  isActive,
  onTap,
  onLongPress,
  hintOpacity,
  hintScale,
  slotWidth,
}: {
  isActive: boolean;
  onTap: () => void;
  onLongPress: () => void;
  hintOpacity?: Animated.Value;
  hintScale?: Animated.Value;
  slotWidth: number;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

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

  return (
    <View style={[styles.shieldSlot, { width: slotWidth, transform: [{ translateY: CENTER_DASHBOARD_BUTTON_DROP }] }]}>
      {hintOpacity && hintScale ? (
        <Animated.View
          style={[
            styles.firstLaunchHintHalo,
            {
              opacity: hintOpacity,
              transform: [{ scale: hintScale }],
            },
          ]}
          pointerEvents="none"
        />
      ) : null}

      <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut} onPress={handlePress}>
        <Animated.View
          style={[
            styles.shieldPressable,
            {
              opacity: isActive ? 1 : 0.96,
              transform: [{ translateY: -1 }, { scale: scaleAnim }],
            },
          ]}
        >
          <View style={styles.shieldWrapper}>
            <Image
              source={DOCK_BADGES.dashboard}
              style={styles.shieldImage}
              contentFit="contain"
              transition={0}
            />
          </View>
          <View style={styles.shieldLabelSpacer} />
        </Animated.View>
      </Pressable>
    </View>
  );
}

// ── Radial center glow overlay ───────────────────────────────

// ── Main dock ────────────────────────────────────────────────
export default function CommandDock() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { palette, colors, effectiveTheme } = useTheme();
  const adaptive = useAdaptiveLayout();
  const [quickActionsVisible, setQuickActionsVisible] = useState(false);
  const quickActionsNavLockUntilRef = useRef(0);
  const [dashboardExpanded, setDashboardExpanded] = useState(
    getDashboardChromeState().expanded
  );
  const [showFirstLaunchHint, setShowFirstLaunchHint] = useState(false);
  const firstLaunchHintOpacity = useRef(new Animated.Value(0)).current;
  const firstLaunchHintScale = useRef(new Animated.Value(0.96)).current;
  const firstLaunchHintRunningRef = useRef(false);
  const dockVisibilityAnim = useRef(
    new Animated.Value(
      pathname.includes('/dashboard') && getDashboardChromeState().expanded ? 0 : 1
    )
  ).current;

  const hiddenPaths = useMemo(
    () => new Set(['/login', '/create-access-key', '/', '/initialize', '/expedition-wizard']),
    []
  );

  const isHidden = hiddenPaths.has(pathname);
  const hideForDashboardExpanded = pathname.includes('/dashboard') && dashboardExpanded;

  const isItemActive = useCallback(
    (item: DockItem): boolean => {
      return item.pathMatch.some((p) => pathname.includes(p));
    },
    [pathname]
  );

  const handleNavigate = useCallback(
    (route: string) => {
      if (quickActionsVisible || Date.now() < quickActionsNavLockUntilRef.current) {
        if (__DEV__) {
          console.log('[FIELD_UTILITIES] dock_navigation_ignored_quick_actions_active', {
            route,
            pathname,
            quickActionsVisible,
          });
        }
        return;
      }
      if (pathname === route) return;
      router.navigate(route as any);
    },
    [pathname, quickActionsVisible, router]
  );

  const openQuickActions = useCallback(() => {
    quickActionsNavLockUntilRef.current = Date.now() + QUICK_ACTIONS_NAV_LOCK_MS;
    setQuickActionsVisible(true);
  }, []);

  const closeQuickActions = useCallback(() => {
    quickActionsNavLockUntilRef.current = Date.now() + QUICK_ACTIONS_NAV_LOCK_MS;
    setQuickActionsVisible(false);
  }, []);

  const dockBottomPadding = getEcsBottomSafePadding(insets.bottom);
  const dockHeight = ECS_COMMAND_DOCK_BAR_HEIGHT + dockBottomPadding;
  const dockBackgroundDrop = Math.max(6, Math.min(dockBottomPadding, 10));
  const dockBackgroundTopOffset = BOTTOM_BANNER_BACKGROUND_DROP_OFFSET;
  const dockBackgroundHeight = dockHeight + dockBackgroundDrop;
  const dockOuterGutter = adaptive.shell.dockOuterGutter;
  const availableDockWidth = Math.max(
    280,
    windowWidth - insets.left - insets.right - dockOuterGutter * 2,
  );
  const dockFrameWidth = adaptive.shell.dockMaxWidth
    ? Math.min(availableDockWidth, adaptive.shell.dockMaxWidth)
    : availableDockWidth;
  const dockHorizontalPadding = adaptive.shell.dockHorizontalPadding;
  const outerItemMaxWidth = adaptive.isTablet ? 148 : adaptive.isLargePhone ? 136 : ECS_COMMAND_DOCK_OUTER_ITEM_MAX_WIDTH;
  const centerSlotWidth = adaptive.isTablet ? 140 : adaptive.isLargePhone ? 132 : ECS_COMMAND_DOCK_CENTER_SLOT_WIDTH;
  const dispatchRollout = useMemo(() => resolveDispatchRolloutConfig(), []);
  const visibleDockItems = useMemo(
    () => DOCK_ITEMS.filter((item) => item.key !== 'alert' || dispatchRollout.dispatchTabVisibility),
    [dispatchRollout.dispatchTabVisibility],
  );
  const dashboardDockItem = useMemo(
    () => visibleDockItems.find((item) => item.key === 'dashboard') ?? DOCK_ITEMS[2],
    [visibleDockItems],
  );
  const shellChrome = useMemo(
    () => resolveShellChromeTheme({ effectiveTheme, palette, colors }),
    [colors, effectiveTheme, palette],
  );

  useEffect(() => {
    return subscribeDashboardChrome((nextState) => {
      setDashboardExpanded(nextState.expanded);
    });
  }, []);

  useEffect(() => {
    Animated.timing(dockVisibilityAnim, {
      toValue: hideForDashboardExpanded ? 0 : 1,
      duration: hideForDashboardExpanded ? 220 : 260,
      easing: EASING.standard,
      useNativeDriver: true,
    }).start();
  }, [dockVisibilityAnim, hideForDashboardExpanded]);

  const dismissFirstLaunchHint = useCallback(() => {
    firstLaunchHintRunningRef.current = false;
    firstLaunchHintOpacity.stopAnimation();
    firstLaunchHintScale.stopAnimation();
    setShowFirstLaunchHint(false);
    firstLaunchHintOpacity.setValue(0);
    firstLaunchHintScale.setValue(0.96);
  }, [firstLaunchHintOpacity, firstLaunchHintScale]);

  useEffect(() => {
    if (isHidden) {
      dismissFirstLaunchHint();
      return;
    }

    let cancelled = false;

    const runFirstLaunchHint = async () => {
      const seen = await hasSeenDashboardLongPressHint();
      if (cancelled || seen) {
        return;
      }

      await markDashboardLongPressHintSeen();
      if (cancelled) {
        return;
      }

      firstLaunchHintRunningRef.current = true;
      setShowFirstLaunchHint(true);
      firstLaunchHintOpacity.setValue(0);
      firstLaunchHintScale.setValue(0.96);

      const steps: Animated.CompositeAnimation[] = [];
      for (let i = 0; i < FIRST_LAUNCH_HINT_CYCLES; i += 1) {
        steps.push(
          Animated.parallel([
            Animated.timing(firstLaunchHintOpacity, {
              toValue: 0.92,
              duration: FIRST_LAUNCH_HINT_FADE_MS,
              easing: EASING.standard,
              useNativeDriver: true,
            }),
            Animated.timing(firstLaunchHintScale, {
              toValue: 1.04,
              duration: FIRST_LAUNCH_HINT_FADE_MS,
              easing: EASING.standard,
              useNativeDriver: true,
            }),
          ]),
          Animated.delay(FIRST_LAUNCH_HINT_IDLE_MS),
          Animated.parallel([
            Animated.timing(firstLaunchHintOpacity, {
              toValue: 0.18,
              duration: FIRST_LAUNCH_HINT_FADE_MS,
              easing: EASING.standard,
              useNativeDriver: true,
            }),
            Animated.timing(firstLaunchHintScale, {
              toValue: 0.98,
              duration: FIRST_LAUNCH_HINT_FADE_MS,
              easing: EASING.standard,
              useNativeDriver: true,
            }),
          ]),
        );
      }

      Animated.sequence([
        ...steps,
        Animated.parallel([
          Animated.timing(firstLaunchHintOpacity, {
            toValue: 0,
            duration: 280,
            easing: EASING.standard,
            useNativeDriver: true,
          }),
          Animated.timing(firstLaunchHintScale, {
            toValue: 1,
            duration: 280,
            easing: EASING.standard,
            useNativeDriver: true,
          }),
        ]),
      ]).start(({ finished }) => {
        if (!finished || cancelled) {
          return;
        }

        firstLaunchHintRunningRef.current = false;
        setShowFirstLaunchHint(false);
        firstLaunchHintOpacity.setValue(0);
        firstLaunchHintScale.setValue(0.96);
      });
    };

    runFirstLaunchHint();

    return () => {
      cancelled = true;
      dismissFirstLaunchHint();
    };
  }, [
    dismissFirstLaunchHint,
    firstLaunchHintOpacity,
    firstLaunchHintScale,
    isHidden,
  ]);

  if (isHidden) {
    return null;
  }

  return (
    <>
      <QuickActionsSheet
        visible={quickActionsVisible}
        onClose={closeQuickActions}
      />

      <Animated.View
        style={[
          styles.dockContainer,
          {
            bottom: MIN_DOCK_LIFT,
            paddingHorizontal: dockOuterGutter,
            opacity: dockVisibilityAnim,
            transform: [
              {
                translateY: dockVisibilityAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [dockHeight + 24, 0],
                }),
              },
            ],
          },
        ]}
        pointerEvents={hideForDashboardExpanded || quickActionsVisible ? 'none' : 'auto'}
      >
        <ECSGlobalBanner
          source={BOTTOM_BANNER_BG}
          placement="bottom"
          style={[
            styles.dockEdgeFill,
            {
              height: dockBackgroundHeight,
              bottom: -(dockBackgroundDrop + dockBackgroundTopOffset),
            },
          ]}
        />
        <View
          style={[
            styles.bannerTopRail,
            {
              top: dockBackgroundTopOffset,
              backgroundColor: shellChrome.goldRail,
            },
          ]}
          pointerEvents="none"
        />

        {showFirstLaunchHint ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.firstLaunchHintContainer,
              {
                bottom: dockHeight - 14,
                opacity: firstLaunchHintOpacity,
                transform: [{ scale: firstLaunchHintScale }],
              },
            ]}
          >
            <Text style={[styles.firstLaunchHintText, { color: shellChrome.hintText }]}>
              Long press for additional settings
            </Text>
            <View style={styles.firstLaunchHintArrow}>
              <View style={[styles.firstLaunchHintArrowStem, { backgroundColor: shellChrome.dockLabelActive }]} />
              <View style={[styles.firstLaunchHintArrowHead, { borderTopColor: shellChrome.dockLabelActive }]} />
            </View>
          </Animated.View>
        ) : null}

        <View
          style={[
            styles.dockBar,
            {
              height: dockHeight,
              paddingBottom: dockBottomPadding,
              width: dockFrameWidth,
              alignSelf: 'center',
              paddingHorizontal: dockHorizontalPadding,
            },
          ]}
        >
          {visibleDockItems.map((item) => (
            <View
              key={item.key}
              style={[
                item.key === 'dashboard' ? styles.centerSlot : styles.outerSlot,
                {
                  flex: getDockSlotFlex(item.key),
                  paddingHorizontal:
                    item.key === 'dashboard'
                      ? 0
                      : getOuterSlotHorizontalPadding(
                          item.key,
                          adaptive.isLargePhone,
                          adaptive.isTablet,
                        ),
                },
              ]}
            >
              {item.key === 'dashboard' ? (
                <ShieldCenterButton
                  isActive={isItemActive(dashboardDockItem)}
                  hintOpacity={showFirstLaunchHint ? firstLaunchHintOpacity : undefined}
                  hintScale={showFirstLaunchHint ? firstLaunchHintScale : undefined}
                  onTap={() => {
                    dismissFirstLaunchHint();
                    handleNavigate(dashboardDockItem.route);
                  }}
                  onLongPress={() => {
                    dismissFirstLaunchHint();
                    openQuickActions();
                  }}
                  slotWidth={centerSlotWidth}
                />
              ) : (
                <DockButton
                  item={item}
                  isActive={isItemActive(item)}
                  onPress={() => handleNavigate(item.route)}
                  maxWidth={outerItemMaxWidth}
                  labelMuted={shellChrome.dockLabelMuted}
                  labelActive={shellChrome.dockLabelActive}
                />
              )}
            </View>
          ))}
        </View>
      </Animated.View>
    </>
  );
}

// ── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  dockContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
    elevation: 9999,
  },

  dockEdgeFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#020304',
  },
  bannerTopRail: {
    position: 'absolute',
    top: 0,
    left: -64,
    right: -64,
    height: 2,
    opacity: 0.72,
  },

  dockBar: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderRadius: 0,
    borderTopWidth: 0,
    borderTopColor: DOCK.barBorder,
    paddingTop: 1,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  outerSlot: {
    flex: 1,
    alignItems: 'stretch',
    justifyContent: 'center',
    minWidth: 0,
  },
  centerSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },

  dockItem: {
    width: '100%',
    height: ECS_COMMAND_DOCK_BAR_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 2,
    paddingBottom: 0,
    position: 'relative',
    zIndex: 3,
  },

  dockPressable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
    width: '100%',
  },

  badgeContainer: {
    width: OUTER_BADGE_SIZE_ACTIVE + 2,
    height: OUTER_BADGE_SIZE_ACTIVE + 2,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: 2,
  },

  outerBadgeContainer: {
    marginBottom: OUTER_BADGE_TO_LABEL_OFFSET,
  },

  badgeImage: {
    width: '100%',
    height: '100%',
  },

  labelContainer: {
    position: 'relative',
    height: ECS_COMMAND_DOCK_LABEL_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    width: '100%',
    alignSelf: 'stretch',
  },

  outerLabelContainer: {
    marginTop: -4,
  },

  dockLabel: {
    ...TYPO.U3,
    fontSize: 8.4,
    lineHeight: 10.5,
    letterSpacing: 1.3,
    textAlign: 'center',
    width: '100%',
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

  shieldSlot: {
    alignItems: 'center',
    justifyContent: 'center',
    height: ECS_COMMAND_DOCK_BAR_HEIGHT,
    paddingTop: 2,
    paddingBottom: 0,
    position: 'relative',
    zIndex: 4,
    flexShrink: 0,
  },

  firstLaunchHintHalo: {
    position: 'absolute',
    width: SHIELD_ICON_SIZE + 28,
    height: SHIELD_ICON_SIZE + 28,
    borderRadius: (SHIELD_ICON_SIZE + 28) / 2,
    backgroundColor: 'rgba(212,160,23,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.22)',
    zIndex: 1,
  },

  shieldPressable: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },

  shieldWrapper: {
    width: SHIELD_ICON_SIZE,
    height: SHIELD_ICON_SIZE,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },

  shieldImage: {
    width: '100%',
    height: '100%',
  },

  shieldLabelSpacer: {
    height: ECS_COMMAND_DOCK_LABEL_HEIGHT,
    marginTop: 0,
  },

  firstLaunchHintContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10000,
    elevation: 10000,
  },

  firstLaunchHintText: {
    ...TYPO.U3,
    color: ECS.accent,
    fontSize: 10,
    letterSpacing: 1.2,
    textAlign: 'center',
    backgroundColor: 'rgba(12,15,20,0.86)',
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.18)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    overflow: 'hidden',
  },

  firstLaunchHintArrow: {
    alignItems: 'center',
    marginTop: 4,
  },

  firstLaunchHintArrowStem: {
    width: 1.5,
    height: 14,
    backgroundColor: 'rgba(212,160,23,0.72)',
  },

  firstLaunchHintArrowHead: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: 'rgba(212,160,23,0.72)',
    marginTop: -1,
  },
});
