import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { SafeIcon as Ionicons } from '../SafeIcon';
import ThemeToggle from '../ThemeToggle';
import { CLOSE_BTN } from '../../lib/uiConstants';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { operatorTrustModeStore } from '../../lib/ai/operatorTrustMode';
import type { ECSOperatorTrustMode } from '../../lib/ai/operatorTrustTypes';
import EcsDiagnosticsPanel from './EcsDiagnosticsPanel';
import ProfileSettingsPanel from '../ProfileSettingsPanel';
import { getCachedExpeditions } from '../../lib/expeditionCache';
import { missionExpeditionStore } from '../../lib/missionStore';
import {
  expeditionStateStore,
  type ExpeditionState,
} from '../../lib/expeditionStateStore';
import { routeStore } from '../../lib/routeStore';
import { loadRoadNavigationSession } from '../../lib/roadNavigationStore';
import { loadTrailNavigationSession } from '../../lib/trailNavigationStore';
import {
  ECS_TOP_BANNER_TITLE_CENTER_PADDING,
  ECS_TOP_BANNER_TITLE_DONE_RIGHT_SLOT_WIDTH,
  ECS_TOP_BANNER_TITLE_LEFT_SLOT_WIDTH,
  ECS_TOP_BANNER_TITLE_RIGHT_SLOT_WIDTH,
  ECS_TOP_SHELL_COMMAND_PILL_HEIGHT,
  ECS_TOP_SHELL_CONTROL_SLOT_WIDTH,
  getEcsTopBannerLayoutMetrics,
  getShellHeaderAnchorTop,
} from '../../lib/shellLayout';
import { getTopBannerToneColor, resolveProfileCommandStatus, resolveTopBannerPresentation } from '../../lib/ui/topBannerStatusResolver';
import type { ECSTopBannerCommandContext } from '../../lib/ui/topBannerTypes';
import { resolveAccountUx } from '../../lib/auth/accountUXResolver';
import { useAdaptiveLayout } from '../../lib/useAdaptiveLayout';
import { bluPowerAuthority, type BluAuthoritySnapshot } from '../../lib/BluPowerAuthority';
import { useEcsProviders } from '../../lib/useEcsProviders';
import { ecsLog } from '../../lib/ecsLogger';
import { useUnifiedOBD2Scanner } from '../../lib/unifiedScanner';
import { VISIBILITY_THEME_CYCLE } from '../../lib/appearanceStore';
import { resolveShellChromeTheme } from '../../lib/ui/shellChromeTheme';
import TopBannerBackground from '../TopBannerBackground';
import { useEcsTopBannerHeight } from '../ECSGlobalBanner';
import { useStableAnimatedValue } from '../../lib/ecsAnimations';
import { useEcsBriefTopBannerMessage } from '../../lib/useEcsBriefTopBannerMessage';

const DHDR = {
  bar: '#1E2125',
  goldRail: '#A0813A',
  barBottomEdge: '#262A2E',
  iconMuted: '#8A7A58',
  iconActive: '#C9A24C',
  expeditionGold: '#D4A017',
};

type ShellStatusPillTone = 'neutral' | 'active' | 'sync' | 'degraded';

type ShellStatusPillModel = {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tone: ShellStatusPillTone;
};

interface DashboardHeaderProps {
  title?: string;
  layoutMode: boolean;
  onDone: () => void;
  onAuthPress: () => void;
  onExpeditionEnded?: () => void;
  collapsed?: boolean;
  commandContext?: ECSTopBannerCommandContext | null;
}
export default function DashboardHeader({
  title,
  layoutMode,
  onDone,
  onAuthPress,
  onExpeditionEnded,
  collapsed = false,
  commandContext,
}: DashboardHeaderProps) {
  const router = useRouter();
  const {
    syncStatus,
    user,
    accessState,
    operatorInfo,
    triggerSync,
    isOnline,
    connectivityStatus,
    offlineMode,
    signOut,
    sendPasswordReset,
    showToast,
  } = useApp();
  const { palette, colors, effectiveTheme, appearanceMode, setAppearanceMode } = useTheme();
  const insets = useSafeAreaInsets();
  const adaptive = useAdaptiveLayout();
  const topBannerHeight = useEcsTopBannerHeight();
  const obdScanner = useUnifiedOBD2Scanner();
  const ecsProviders = useEcsProviders();
  const [profilePanelVisible, setProfilePanelVisible] = useState(false);
  const [bluSnapshot, setBluSnapshot] = useState<BluAuthoritySnapshot>(() => bluPowerAuthority.getSnapshot());
  const [operatorTrustMode, setOperatorTrustMode] = useState<ECSOperatorTrustMode>(
    () => operatorTrustModeStore.mode,
  );
  const [accountActionBusyId, setAccountActionBusyId] = useState<string | null>(null);
  const [geofenceRadius, setGeofenceRadius] = useState(() => expeditionStateStore.getGeofenceRadius());
  const [diagnosticsPanelVisible, setDiagnosticsPanelVisible] = useState(false);
  const tripleTapCountRef = useRef(0);
  const tripleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [expeditionState, setExpeditionState] = useState<ExpeditionState>(expeditionStateStore.getState());
  const [hasRouteSelected, setHasRouteSelected] = useState(false);
  const collapseAnim = useStableAnimatedValue(collapsed ? 1 : 0);
  const syncSpin = useStableAnimatedValue(0);
  const briefBannerAnim = useStableAnimatedValue(0);
  const briefTopBanner = useEcsBriefTopBannerMessage();
  const [displayBriefBanner, setDisplayBriefBanner] = useState(briefTopBanner);
  const shellMessageLogKeyRef = useRef<string | null>(null);

  const handleTitlePress = useCallback(() => {
    if (!__DEV__) return;

    tripleTapCountRef.current += 1;
    if (tripleTapTimerRef.current) {
      clearTimeout(tripleTapTimerRef.current);
    }

    if (tripleTapCountRef.current >= 3) {
      tripleTapCountRef.current = 0;
      setDiagnosticsPanelVisible(true);
      return;
    }

    tripleTapTimerRef.current = setTimeout(() => {
      tripleTapCountRef.current = 0;
    }, 600);
  }, []);

  const refreshRouteSelectionState = useCallback(async () => {
    let hasSelectedRoute = !!routeStore.getActive();

    try {
      const [roadSession, trailSession] = await Promise.all([
        loadRoadNavigationSession(),
        loadTrailNavigationSession(),
      ]);

      hasSelectedRoute =
        hasSelectedRoute ||
        !!roadSession &&
          ['destination_selected', 'route_preview', 'navigation_active', 'rerouting'].includes(
            roadSession.status,
          ) ||
        !!trailSession &&
          [
            'route_preview_trail',
            'route_preview_hybrid',
            'transition_to_trail',
            'navigation_active_trail',
            'off_trail',
            'rejoining_trail',
          ].includes(trailSession.status);
    } catch {}

    setHasRouteSelected(hasSelectedRoute);
  }, []);

  useEffect(() => {
    const unsubscribe = expeditionStateStore.subscribe((state, _record) => {
      setExpeditionState(state);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const off = bluPowerAuthority.subscribe((next) => {
      setBluSnapshot(next);
    });

    return off;
  }, []);

  useEffect(() => {
    return operatorTrustModeStore.subscribe((nextMode) => {
      setOperatorTrustMode((currentMode) => currentMode === nextMode ? currentMode : nextMode);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (tripleTapTimerRef.current) {
        clearTimeout(tripleTapTimerRef.current);
      }
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshRouteSelectionState();
    }, [refreshRouteSelectionState]),
  );

  useEffect(() => {
    void refreshRouteSelectionState();
  }, [expeditionState, refreshRouteSelectionState]);

  useEffect(() => {
    Animated.timing(collapseAnim, {
      toValue: collapsed ? 1 : 0,
      duration: collapsed ? 220 : 260,
      useNativeDriver: false,
    }).start();
  }, [collapseAnim, collapsed]);

  useEffect(() => {
    if (briefTopBanner) {
      setDisplayBriefBanner(briefTopBanner);
      Animated.timing(briefBannerAnim, {
        toValue: 1,
        duration: 260,
        useNativeDriver: true,
      }).start();
      return;
    }

    Animated.timing(briefBannerAnim, {
      toValue: 0,
      duration: 320,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setDisplayBriefBanner(null);
      }
    });
  }, [briefBannerAnim, briefTopBanner]);

  const hasActiveExpeditionContext = useMemo(() => {
    if (expeditionState === 'active' || hasRouteSelected) return true;

    try {
      const activeMission = missionExpeditionStore.getActive();
      if (activeMission) return true;
    } catch {}

    try {
      const cached = getCachedExpeditions();
      if (cached.some((expedition) => expedition.status === 'active')) {
        return true;
      }
    } catch {}

    return false;
  }, [expeditionState, hasRouteSelected]);

  const bannerStatus = useMemo(
    () =>
      resolveTopBannerPresentation({
        syncStatus,
        connectivityStatus,
        isOnline,
        offlineMode,
        userPresent: !!user,
        expeditionState,
        hasActiveExpeditionContext,
        commandContext: commandContext ?? null,
      }),
    [
      commandContext,
      connectivityStatus,
      expeditionState,
      hasActiveExpeditionContext,
      isOnline,
      offlineMode,
      syncStatus,
      user,
    ],
  );
  const profileStatus = useMemo(
    () =>
      resolveProfileCommandStatus({
        syncStatus,
        connectivityStatus,
        isOnline,
        offlineMode,
        userPresent: !!user,
        expeditionState,
        hasActiveExpeditionContext,
        commandContext: commandContext ?? null,
      }),
    [
      commandContext,
      connectivityStatus,
      expeditionState,
      hasActiveExpeditionContext,
      isOnline,
      offlineMode,
      syncStatus,
      user,
    ],
  );
  const shellChrome = useMemo(
    () => resolveShellChromeTheme({ effectiveTheme, palette, colors }),
    [colors, effectiveTheme, palette],
  );
  const toneColor = useMemo(
    () =>
      getTopBannerToneColor(bannerStatus.tone, {
        active: shellChrome.iconActive,
        online: shellChrome.online,
        muted: shellChrome.iconMuted,
        degraded: '#D6A04B',
      }),
    [bannerStatus.tone, shellChrome.iconActive, shellChrome.iconMuted, shellChrome.online],
  );
  const titleText = title ?? 'Expedition Command';

  useEffect(() => {
    if (!bannerStatus.processingActive) {
      syncSpin.stopAnimation();
      syncSpin.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.timing(syncSpin, {
        toValue: 1,
        duration: 1300,
        useNativeDriver: true,
      }),
    );

    animation.start();
    return () => {
      animation.stop();
      syncSpin.stopAnimation();
      syncSpin.setValue(0);
    };
  }, [bannerStatus.processingActive, syncSpin]);

  const handleEndExpedition = useCallback(() => {
    setProfilePanelVisible(false);
    Alert.alert(
      'End Expedition',
      'Are you sure you want to end the current expedition?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Expedition',
          style: 'destructive',
          onPress: () => {
            expeditionStateStore.endExpedition();
            onExpeditionEnded?.();
          },
        },
      ],
      { cancelable: true }
    );
  }, [onExpeditionEnded]);

  const handleAccountAction = useCallback(async (actionId: string) => {
    if (accountActionBusyId) return;

    setAccountActionBusyId(actionId);

    try {
      if (actionId === 'sign_out') {
        setProfilePanelVisible(false);
        await signOut();
        return;
      }
      if (actionId === 'reset_password') {
        if (!user?.email) {
          showToast('Unable to load account details right now.');
          return;
        }
        const result = await sendPasswordReset(user.email);
        showToast(result.error ? 'Unable to send reset instructions right now.' : 'Reset instructions sent if the account exists.');
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to sign out right now.');
    } finally {
      setAccountActionBusyId(null);
    }
  }, [accountActionBusyId, sendPasswordReset, showToast, signOut, user?.email]);

  const openProfilePanel = useCallback(() => {
    setGeofenceRadius(expeditionStateStore.getGeofenceRadius());
    setProfilePanelVisible(true);
  }, []);
  const openBluetoothConnections = useCallback(() => {
    try {
      router.push('/power/blu');
    } catch {
      try {
        router.push('/power');
      } catch {
        showToast('Device connections unavailable');
      }
    }
  }, [router, showToast]);

  const showEndExpedition = expeditionState === 'active';
  const controlSlotWidth = ECS_TOP_SHELL_CONTROL_SLOT_WIDTH;
  const useFleetMatchedTitleLayout = titleText === 'Expedition Command';
  const leftControlSlotWidth = useFleetMatchedTitleLayout
    ? ECS_TOP_BANNER_TITLE_LEFT_SLOT_WIDTH
    : controlSlotWidth;
  const rightControlSlotWidth = useFleetMatchedTitleLayout
    ? layoutMode
      ? ECS_TOP_BANNER_TITLE_DONE_RIGHT_SLOT_WIDTH
      : ECS_TOP_BANNER_TITLE_RIGHT_SLOT_WIDTH
    : controlSlotWidth;
  const centerContentPadding = useFleetMatchedTitleLayout
    ? ECS_TOP_BANNER_TITLE_CENTER_PADDING
    : 8;
  const connectionLabel = offlineMode || !isOnline ? 'OFFLINE' : 'ONLINE';
  const connectionTone = offlineMode || !isOnline ? shellChrome.iconMuted : shellChrome.online;
  const syncActionLabel = useMemo(() => {
    return syncStatus === 'error' ? 'FORCE SYNC' : 'SYNC NOW';
  }, [syncStatus]);
  const bluetoothPill = useMemo<ShellStatusPillModel>(() => {
    const providerHasRegisteredDevices = Object.values(bluSnapshot.providers).some((provider) => provider.hasDevices);
    const powerUnavailable = providerHasRegisteredDevices && !bluSnapshot.isConnected && bluSnapshot.freshness === 'disconnected';
    const providerScanning = ecsProviders.providerSummaries.some((provider) => provider.isScanning);
    const permissionMissing = /permission|permissions|denied|not supported|required/i.test(obdScanner.error ?? '');
    const platformUnavailable = Platform.OS === 'web';
    const hasConnectedDevice = bluSnapshot.isConnected || obdScanner.isConnected;
    const isConnecting =
      bluSnapshot.isReconnecting ||
      obdScanner.isScanning ||
      obdScanner.isConnecting ||
      obdScanner.isReconnecting ||
      providerScanning ||
      ecsProviders.isAnyReconnecting;
    const isDegraded =
      platformUnavailable ||
      permissionMissing ||
      obdScanner.state === 'error' ||
      powerUnavailable;

    if (hasConnectedDevice) {
      return {
        label: 'BLU',
        icon: 'bluetooth',
        tone: 'active',
      };
    }

    if (isConnecting) {
      return {
        label: 'BLU',
        icon: 'sync-outline',
        tone: 'sync',
      };
    }

    if (isDegraded) {
      return {
        label: 'BLU',
        icon: 'bluetooth-outline',
        tone: 'degraded',
      };
    }

    return {
      label: 'BLU',
      icon: 'bluetooth-outline',
      tone: 'neutral',
    };
  }, [
    bluSnapshot.freshness,
    bluSnapshot.isConnected,
    bluSnapshot.isReconnecting,
    bluSnapshot.providers,
    ecsProviders.isAnyReconnecting,
    ecsProviders.providerSummaries,
    obdScanner.error,
    obdScanner.isConnected,
    obdScanner.isConnecting,
    obdScanner.isReconnecting,
    obdScanner.isScanning,
    obdScanner.state,
  ]);
  const bluetoothPillStyle = useMemo(
    () => getStatusPillStyles(bluetoothPill.tone, shellChrome.iconMuted),
    [bluetoothPill.tone, shellChrome.iconMuted],
  );
  const bluetoothAccessibilityLabel = useMemo(() => {
    switch (bluetoothPill.tone) {
      case 'active':
        return 'Bluetooth connected';
      case 'sync':
        return 'Bluetooth connecting';
      case 'degraded':
        return 'Bluetooth unavailable';
      case 'neutral':
      default:
        return 'Bluetooth available';
    }
  }, [bluetoothPill.tone]);
  const accountUx = useMemo(
    () =>
      resolveAccountUx({
        operatorInfo,
        accessState,
        authenticated: !!user,
        isOnline,
      }),
    [accessState, isOnline, operatorInfo, user],
  );

  const dashboardBannerLayout = getEcsTopBannerLayoutMetrics(insets.top, topBannerHeight, {
    isTablet: adaptive.isTablet,
    shortHeight: adaptive.shortHeight,
  });
  const dashboardTopPadding = dashboardBannerLayout.topPadding;
  const dashboardHeaderVisibleHeight = dashboardBannerLayout.visibleHeight;
  const dashboardBannerOverscan = dashboardBannerLayout.bannerOverscan;
  const dashboardBannerOffset = dashboardBannerLayout.bannerOffset;
  const expandedHeight = dashboardHeaderVisibleHeight;
  const collapsedHeight = 0;
  const headerHeight = collapseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [expandedHeight, collapsedHeight],
  });
  const headerOpacity = collapseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const headerTranslateY = collapseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -12],
  });
  const briefDefaultOpacity = briefBannerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const briefBannerTranslateY = briefBannerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [5, 0],
  });
  useEffect(() => {
    const nextKey = [
      titleText,
      bannerStatus.statusLabel,
      bannerStatus.source,
      bannerStatus.priority,
    ].join('|');

    if (shellMessageLogKeyRef.current === nextKey) return;
    shellMessageLogKeyRef.current = nextKey;

    ecsLog.debug('SHELL', '[DashboardShellMessage]', {
      shellMessageSource: bannerStatus.source,
      shellMessageReason: bannerStatus.reason,
      shellMessagePriority: bannerStatus.priority,
      suppressedShellSources: bannerStatus.suppressedSources,
      shellTitle: titleText,
      shellStatusLabel: bannerStatus.statusLabel,
      gpsLive: bannerStatus.diagnostics.gpsLive,
      routeActive: bannerStatus.diagnostics.routeUsable && hasRouteSelected,
      connectivityState: connectivityStatus,
      hasConfiguredVehicle: bannerStatus.diagnostics.hasConfiguredVehicle,
      offlineMode,
      cloudEnhancementAvailable: bannerStatus.diagnostics.cloudEnhancementAvailable,
    });
  }, [
    bannerStatus,
    connectivityStatus,
    hasRouteSelected,
    offlineMode,
    titleText,
  ]);

  return (
    <Animated.View
      style={[
        styles.collapseShell,
        {
          height: headerHeight,
          opacity: headerOpacity,
          transform: [{ translateY: headerTranslateY }],
        },
      ]}
      pointerEvents={collapsed ? 'none' : 'auto'}
    >
      <View
        style={[
          styles.container,
          {
            height: dashboardHeaderVisibleHeight,
            paddingTop: dashboardTopPadding,
            minHeight: dashboardHeaderVisibleHeight,
          },
        ]}
      >
        <TopBannerBackground
          variant="dashboard"
          resizeMode="cover"
          verticalOffset={dashboardBannerOffset}
          overscan={dashboardBannerOverscan}
        />

        <View
          style={[
            styles.contentRow,
            {
              maxWidth: adaptive.shell.headerMaxWidth,
              paddingHorizontal: adaptive.shell.headerHorizontalPadding,
            },
          ]}
        >
          <View style={[styles.edgeSlotBase, styles.edgeSlotStart, { width: leftControlSlotWidth }]}>
            <View style={styles.connectionWordmark} pointerEvents="none">
              <View style={[styles.connectionDot, { backgroundColor: connectionTone }]} />
              <Text style={[styles.connectionText, { color: connectionTone }]}>{connectionLabel}</Text>
            </View>
          </View>

          <Pressable
            style={[styles.centerContent, { paddingHorizontal: centerContentPadding }]}
            onPress={handleTitlePress}
            accessibilityRole="button"
            accessibilityLabel="ECS diagnostics"
          >
            <View style={styles.bannerTitleStack} pointerEvents="none">
              <Animated.View style={[styles.bannerDefaultCopy, { opacity: briefDefaultOpacity }]}>
                <Text
                  style={styles.bannerTitle}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.74}
                >
                  expedition command
                </Text>
                <Text
                  style={styles.bannerMotto}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.78}
                >
                  explore with confidence
                </Text>
              </Animated.View>
              {displayBriefBanner ? (
                <Animated.View
                  style={[
                    styles.briefBannerCopy,
                    {
                      opacity: briefBannerAnim,
                      transform: [{ translateY: briefBannerTranslateY }],
                    },
                  ]}
                >
                  <Text style={styles.briefBannerEyebrow} numberOfLines={1}>
                    {displayBriefBanner.eyebrow}
                  </Text>
                  <Text
                    style={styles.briefBannerDetail}
                    numberOfLines={3}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    {displayBriefBanner.detail}
                  </Text>
                </Animated.View>
              ) : null}
            </View>
          </Pressable>

          <View style={[styles.edgeSlotBase, styles.edgeSlotEnd, { width: rightControlSlotWidth }]}>
            <View style={styles.rightControlCluster}>
              <TouchableOpacity
                style={[
                  styles.statusPill,
                  bluetoothPillStyle,
                ]}
                onPress={openBluetoothConnections}
                activeOpacity={0.78}
                hitSlop={CLOSE_BTN.hitSlop}
                accessibilityRole="button"
                accessibilityLabel={bluetoothAccessibilityLabel}
                accessibilityHint="Opens device connections and Bluetooth controls"
              >
                <Ionicons
                  name={bluetoothPill.icon}
                  size={16}
                  color={bluetoothPillStyle.color}
                  style={bluetoothPill.tone === 'sync' ? styles.statusPillSyncIcon : null}
                />
              </TouchableOpacity>
              <ThemeToggle
                compact
                size={30}
                iconMode="eye"
                cycleModes={VISIBILITY_THEME_CYCLE}
              />
            {layoutMode ? (
              <TouchableOpacity
                style={[
                  styles.doneBtn,
                  { backgroundColor: palette.accent, borderColor: palette.borderFocus },
                ]}
                onPress={onDone}
                activeOpacity={0.7}
                hitSlop={CLOSE_BTN.hitSlop}
              >
                <Text style={[styles.doneText, { color: palette.text }]}>DONE</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={openProfilePanel}
                style={[
                  styles.authBtn,
                  {
                    backgroundColor: shellChrome.controlSurface,
                    borderColor: shellChrome.controlBorder,
                  },
                ]}
                activeOpacity={0.7}
                hitSlop={CLOSE_BTN.hitSlop}
              >
                <Ionicons
                  name={user ? 'person-circle' : 'person-circle-outline'}
                  size={18}
                  color={user ? shellChrome.iconActive : shellChrome.iconMuted}
                />
                {bannerStatus.processingActive && (
                  <View
                    style={[
                      styles.syncBadge,
                      {
                        backgroundColor: shellChrome.syncBadgeSurface,
                        borderColor: shellChrome.syncBadgeBorder,
                      },
                    ]}
                  >
                    <Animated.View
                      style={{
                        transform: [
                          {
                            rotate: syncSpin.interpolate({
                              inputRange: [0, 1],
                              outputRange: ['0deg', '360deg'],
                            }),
                          },
                        ],
                      }}
                    >
                      <Ionicons name="sync-outline" size={9} color={toneColor} />
                    </Animated.View>
                  </View>
                )}
              </TouchableOpacity>
            )}
            </View>
          </View>
        </View>
        <View
          pointerEvents="none"
          style={[styles.goldRailLine, { backgroundColor: shellChrome.goldRail }]}
        />
      </View>

      <ProfileSettingsPanel
        visible={profilePanelVisible}
        onClose={() => setProfilePanelVisible(false)}
        anchorTop={getShellHeaderAnchorTop(insets.top)}
        userEmail={user?.email ?? null}
        accessLabel={accountUx.title}
        accessStatusLabel={accountUx.stateLabel}
        accessDetail={accountUx.detail}
        accountActions={user ? [
          {
            id: 'reset_password',
            label: 'Reset Password',
            detail: 'Send reset instructions to your signed-in ECS email.',
            icon: 'key-outline',
            tone: 'default',
          },
          {
            id: 'sign_out',
            label: 'Sign Out',
            detail: 'End this device session and return to the secure ECS login screen.',
            icon: 'log-out-outline',
            tone: 'danger',
          },
        ] : []}
        accountActionBusyId={accountActionBusyId}
        onAccountAction={user ? handleAccountAction : undefined}
        statusLabel={profileStatus.statusLabel}
        statusDetail={profileStatus.statusDetail}
        statusTone={profileStatus.tone}
        processingActive={profileStatus.processingActive}
        syncActionLabel={syncActionLabel}
        syncLabel={bannerStatus.processingLabel ?? bannerStatus.statusDetail}
        syncDisabled={!isOnline || bannerStatus.processingActive}
        onManualSync={triggerSync}
        geofenceRadius={geofenceRadius}
        onSelectGeofence={(meters) => {
          setGeofenceRadius(meters);
          expeditionStateStore.setGeofenceRadius(meters);
        }}
        appearanceMode={appearanceMode}
        onSelectTheme={setAppearanceMode}
        operatorTrustMode={operatorTrustMode}
        onSelectOperatorTrustMode={(mode) => {
          setOperatorTrustMode(mode);
          operatorTrustModeStore.setMode(mode);
        }}
        onProfilePress={onAuthPress}
        endActionLabel={showEndExpedition ? 'END EXPEDITION' : undefined}
        onEndAction={showEndExpedition ? handleEndExpedition : undefined}
      />

      <EcsDiagnosticsPanel
        visible={diagnosticsPanelVisible}
        onClose={() => setDiagnosticsPanelVisible(false)}
      />
    </Animated.View>
  );
}

function getStatusPillStyles(tone: ShellStatusPillTone, neutralColor: string) {
  switch (tone) {
    case 'active':
      return {
        color: '#4CAF50',
        borderColor: '#4CAF50' + '45',
        backgroundColor: '#4CAF50' + '12',
      };
    case 'sync':
      return {
        color: '#5AC8FA',
        borderColor: '#5AC8FA' + '45',
        backgroundColor: '#5AC8FA' + '12',
      };
    case 'degraded':
      return {
        color: '#D6A04B',
        borderColor: '#D6A04B' + '45',
        backgroundColor: '#D6A04B' + '12',
      };
    case 'neutral':
    default:
      return {
        color: neutralColor,
        borderColor: neutralColor + '45',
        backgroundColor: neutralColor + '10',
      };
  }
}

const styles = StyleSheet.create({
  collapseShell: {
    overflow: 'hidden',
  },
  container: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 0,
    paddingBottom: 3,
    overflow: 'hidden',
    backgroundColor: '#020304',
  },
  goldRailLine: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: DHDR.goldRail,
    opacity: 0.78,
    zIndex: 4,
  },
  expeditionGoldUnderline: {
    position: 'absolute',
    bottom: 1.5,
    left: 0,
    right: 0,
    backgroundColor: DHDR.expeditionGold,
    zIndex: 3,
  },
  barBottomEdge: {
    position: 'absolute',
    bottom: 1.5,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: DHDR.barBottomEdge,
    zIndex: 1,
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
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    alignSelf: 'center',
    flex: 1,
    minHeight: ECS_TOP_SHELL_COMMAND_PILL_HEIGHT,
  },
  edgeSlotBase: {
    justifyContent: 'center',
    paddingBottom: 0,
    zIndex: 3,
  },
  edgeSlotStart: {
    alignItems: 'flex-start',
  },
  edgeSlotEnd: {
    alignItems: 'flex-end',
  },
  rightControlCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 5,
  },
  connectionWordmark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '100%',
    paddingHorizontal: 2,
  },
  connectionDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  connectionText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  centerContent: {
    flex: 1,
    minWidth: 0,
    zIndex: 3,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingBottom: 0,
    backgroundColor: 'transparent',
  },
  bannerTitleStack: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
    minHeight: 30,
    position: 'relative',
  },
  bannerDefaultCopy: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  briefBannerCopy: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  briefBannerEyebrow: {
    maxWidth: '100%',
    color: DHDR.iconActive,
    fontSize: 8,
    lineHeight: 9,
    fontWeight: '900',
    letterSpacing: 0.82,
    textAlign: 'center',
    textTransform: 'uppercase',
    includeFontPadding: false,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  briefBannerDetail: {
    maxWidth: '100%',
    marginTop: 1,
    color: 'rgba(248,242,226,0.94)',
    fontSize: 8.8,
    lineHeight: 9.6,
    fontWeight: '800',
    letterSpacing: 0.18,
    textAlign: 'center',
    includeFontPadding: false,
    textShadowColor: 'rgba(0,0,0,0.76)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  bannerTitle: {
    maxWidth: '100%',
    color: DHDR.iconActive,
    fontFamily: Platform.select({
      ios: 'Avenir Next Condensed',
      android: 'sans-serif-condensed',
      default: 'System',
    }),
    fontSize: 17,
    lineHeight: 18,
    fontWeight: '800',
    letterSpacing: 0,
    textAlign: 'center',
    textTransform: 'uppercase',
    includeFontPadding: false,
    textShadowColor: 'rgba(0,0,0,0.82)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  bannerMotto: {
    maxWidth: '100%',
    marginTop: 1,
    color: 'rgba(234,222,190,0.88)',
    fontFamily: Platform.select({
      ios: 'Avenir Next',
      android: 'sans-serif-medium',
      default: 'System',
    }),
    fontSize: 9.5,
    lineHeight: 11,
    fontWeight: '700',
    letterSpacing: 0,
    textAlign: 'center',
    textTransform: 'uppercase',
    includeFontPadding: false,
    textShadowColor: 'rgba(0,0,0,0.68)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  shellTitle: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '700',
    letterSpacing: 0.22,
    color: DHDR.iconActive,
    textAlign: 'center',
  },
  shellTitleStack: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  shellTitlePrimary: {
    fontSize: 12.5,
    lineHeight: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
    color: DHDR.iconActive,
    textAlign: 'center',
  },
  shellTitleSecondary: {
    marginTop: -1,
    fontSize: 10.5,
    lineHeight: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
    color: DHDR.iconActive,
    textAlign: 'center',
  },
  statusPill: {
    width: 30,
    height: 30,
    minHeight: 30,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    flexShrink: 0,
    overflow: 'hidden',
  },
  statusPillSyncIcon: {
    opacity: 0.96,
  },
  authBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: 'rgba(201,162,76,0.20)',
  },
  syncBadge: {
    position: 'absolute',
    right: -4,
    top: -4,
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17,20,24,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.25)',
  },
  doneBtn: {
    minWidth: 70,
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
});
