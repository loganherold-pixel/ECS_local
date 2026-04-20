import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { SafeIcon as Ionicons } from '../SafeIcon';
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
  ECS_TOP_SHELL_EDGE_SLOT_WIDTH,
  ECS_TOP_SHELL_PROFILE_BUTTON_SIZE,
  getShellHeaderAnchorTop,
  getShellHeaderTopPadding,
} from '../../lib/shellLayout';
import { getTopBannerToneColor, resolveProfileCommandStatus, resolveTopBannerPresentation } from '../../lib/ui/topBannerStatusResolver';
import type { ECSTopBannerCommandContext } from '../../lib/ui/topBannerTypes';
import { resolveAccountUx } from '../../lib/auth/accountUXResolver';
import { useAdaptiveLayout } from '../../lib/useAdaptiveLayout';
import { TOP_BANNER_BG } from '../../lib/chromeAssets';

const DHDR = {
  bar: '#1E2125',
  goldRail: '#A0813A',
  barBottomEdge: '#262A2E',
  radialCore: 'rgba(161, 129, 58, 0.09)',
  radialMid: 'rgba(161, 129, 58, 0.04)',
  iconMuted: '#8A7A58',
  iconActive: '#C9A24C',
  expeditionGold: '#D4A017',
};

interface DashboardHeaderProps {
  layoutMode: boolean;
  onDone: () => void;
  onAuthPress: () => void;
  onExpeditionEnded?: () => void;
  collapsed?: boolean;
  commandContext?: ECSTopBannerCommandContext | null;
}

function DashHeaderRadialGradient() {
  return (
    <View style={styles.radialContainer} pointerEvents="none">
      <View
        style={[
          styles.radialRing,
          {
            width: '50%',
            height: '180%',
            backgroundColor: DHDR.radialCore,
            borderRadius: 999,
          },
        ]}
      />
      <View
        style={[
          styles.radialRing,
          {
            width: '75%',
            height: '240%',
            backgroundColor: DHDR.radialMid,
            borderRadius: 999,
          },
        ]}
      />
    </View>
  );
}

export default function DashboardHeader({
  layoutMode,
  onDone,
  onAuthPress,
  onExpeditionEnded,
  collapsed = false,
  commandContext,
}: DashboardHeaderProps) {
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
    showToast,
  } = useApp();
  const { palette, appearanceMode, setAppearanceMode } = useTheme();
  const insets = useSafeAreaInsets();
  const adaptive = useAdaptiveLayout();
  const [profilePanelVisible, setProfilePanelVisible] = useState(false);
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
  const goldUnderlineAnim = useRef(
    new Animated.Value(expeditionStateStore.getState() === 'active' ? 1 : 0)
  ).current;
  const collapseAnim = useRef(new Animated.Value(collapsed ? 1 : 0)).current;
  const syncSpin = useRef(new Animated.Value(0)).current;
  const prevStateRef = useRef<ExpeditionState>(expeditionStateStore.getState());
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
      const prevState = prevStateRef.current;
      setExpeditionState(state);

      if (state === 'active' && prevState !== 'active') {
        Animated.timing(goldUnderlineAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: false,
        }).start();
      } else if (state !== 'active' && prevState === 'active') {
        Animated.timing(goldUnderlineAnim, {
          toValue: 0,
          duration: 220,
          useNativeDriver: false,
        }).start();
      }

      prevStateRef.current = state;
    });

    return unsubscribe;
  }, [goldUnderlineAnim]);

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
  const toneColor = useMemo(
    () =>
      getTopBannerToneColor(bannerStatus.tone, {
        active: DHDR.iconActive,
        online: '#4CAF50',
        muted: DHDR.iconMuted,
        degraded: '#D6A04B',
      }),
    [bannerStatus.tone],
  );

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
    if (actionId !== 'sign_out' || accountActionBusyId) return;

    setAccountActionBusyId(actionId);
    setProfilePanelVisible(false);

    try {
      await signOut();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to sign out right now.');
    } finally {
      setAccountActionBusyId(null);
    }
  }, [accountActionBusyId, showToast, signOut]);

  const goldUnderlineOpacity = goldUnderlineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const goldUnderlineHeight = goldUnderlineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 2],
  });

  const openProfilePanel = useCallback(() => {
    setGeofenceRadius(expeditionStateStore.getGeofenceRadius());
    setProfilePanelVisible(true);
  }, []);

  const showEndExpedition = expeditionState === 'active';
  const controlSlotWidth = layoutMode
    ? 76
    : Math.max(ECS_TOP_SHELL_EDGE_SLOT_WIDTH, ECS_TOP_SHELL_PROFILE_BUTTON_SIZE + 10);
  const syncActionLabel = useMemo(() => {
    return syncStatus === 'error' ? 'FORCE SYNC' : 'SYNC NOW';
  }, [syncStatus]);
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

  const expandedHeight = Math.max(
    adaptive.shell.headerMinHeight,
    getShellHeaderTopPadding(insets.top, { webPadding: 10 }) + 60,
  );
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
  const shellDetailText =
    bannerStatus.processingActive
    || bannerStatus.tone !== 'online'
    || bannerStatus.source.startsWith('gps_live')
    || bannerStatus.source.startsWith('route_')
      ? bannerStatus.statusDetail
      : bannerStatus.postureDetail;

  useEffect(() => {
    const nextKey = [
      bannerStatus.postureLabel,
      bannerStatus.statusLabel,
      shellDetailText,
      bannerStatus.source,
      bannerStatus.priority,
    ].join('|');

    if (shellMessageLogKeyRef.current === nextKey) return;
    shellMessageLogKeyRef.current = nextKey;

    console.log('[DashboardShellMessage]', {
      shellMessageSource: bannerStatus.source,
      shellMessageReason: bannerStatus.reason,
      shellMessagePriority: bannerStatus.priority,
      suppressedShellSources: bannerStatus.suppressedSources,
      shellEyebrow: bannerStatus.postureLabel,
      shellStatusLabel: bannerStatus.statusLabel,
      shellStatusDetail: shellDetailText,
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
    shellDetailText,
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
      <ImageBackground
        source={TOP_BANNER_BG}
        resizeMode="cover"
        imageStyle={styles.bannerTextureImage}
        style={[
          styles.container,
          layoutMode && styles.containerDimmed,
          {
            paddingTop: getShellHeaderTopPadding(insets.top, { webPadding: 10 }),
            minHeight: adaptive.shell.headerMinHeight,
          },
        ]}
      >
        <View style={styles.bannerTextureScrim} pointerEvents="none" />
        <DashHeaderRadialGradient />
        <View style={styles.barBottomEdge} />
        <View style={styles.goldRailLine} />
        <Animated.View
          style={[
            styles.expeditionGoldUnderline,
            { opacity: goldUnderlineOpacity, height: goldUnderlineHeight },
          ]}
          pointerEvents="none"
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
          <View style={[styles.edgeSlot, { width: controlSlotWidth }]} />

          <Pressable style={styles.centerContent} onPress={handleTitlePress}>
            <View style={styles.statusRow}>
              <Text
                style={[
                  styles.postureLabel,
                  { color: hasActiveExpeditionContext ? DHDR.expeditionGold : DHDR.iconMuted },
                ]}
                numberOfLines={1}
              >
                {bannerStatus.postureLabel}
              </Text>
              <View
                style={[
                  styles.liveStatusPill,
                  {
                    borderColor: toneColor + '45',
                    backgroundColor: toneColor + '12',
                  },
                ]}
              >
                <Text style={[styles.liveStatusText, { color: toneColor }]}>
                  {bannerStatus.statusLabel}
                </Text>
              </View>
            </View>

            <Text style={styles.shellTitle} numberOfLines={1}>
              Expedition Command System
            </Text>

            <Text style={styles.shellDetail} numberOfLines={1}>
              {shellDetailText}
            </Text>
          </Pressable>

          <View style={[styles.edgeSlot, { width: controlSlotWidth }]}>
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
                style={styles.authBtn}
                activeOpacity={0.7}
                hitSlop={CLOSE_BTN.hitSlop}
              >
                <Ionicons
                  name={user ? 'person-circle' : 'person-circle-outline'}
                  size={24}
                  color={user ? DHDR.iconActive : DHDR.iconMuted}
                />
                {bannerStatus.processingActive ? (
                  <View style={styles.syncBadge}>
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
                ) : (
                  <View
                    style={[
                      styles.connDot,
                      {
                        backgroundColor: toneColor,
                        borderColor: DHDR.bar,
                      },
                    ]}
                  />
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ImageBackground>

      <ProfileSettingsPanel
        visible={profilePanelVisible}
        onClose={() => setProfilePanelVisible(false)}
        anchorTop={getShellHeaderAnchorTop(insets.top)}
        userEmail={user?.email ?? null}
        accessLabel={accountUx.title}
        accessStatusLabel={accountUx.stateLabel}
        accessDetail={accountUx.detail}
        accountActions={user ? [{
          id: 'sign_out',
          label: 'Sign Out',
          detail: 'End this device session and return to the secure ECS login screen.',
          icon: 'log-out-outline',
          tone: 'danger',
        }] : []}
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

const styles = StyleSheet.create({
  collapseShell: {
    overflow: 'hidden',
  },
  container: {
    alignItems: 'center',
    paddingTop: 0,
    paddingBottom: 8,
    overflow: 'visible',
  },
  bannerTextureImage: {
    width: '100%',
    height: '100%',
  },
  bannerTextureScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10, 13, 18, 0.20)',
  },
  containerDimmed: {
    opacity: 0.85,
  },
  goldRailLine: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: DHDR.goldRail,
    zIndex: 2,
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
  },
  edgeSlot: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  centerContent: {
    flex: 1,
    zIndex: 3,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 10,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
    flexWrap: 'wrap',
    minHeight: 16,
  },
  postureLabel: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  shellTitle: {
    fontSize: 15,
    lineHeight: 17,
    fontWeight: '700',
    letterSpacing: 0.22,
    color: DHDR.iconActive,
    textAlign: 'center',
  },
  shellDetail: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    color: '#8B949E',
    letterSpacing: 0.2,
    textAlign: 'center',
    maxWidth: '100%',
  },
  liveStatusPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  liveStatusText: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  authBtn: {
    width: ECS_TOP_SHELL_PROFILE_BUTTON_SIZE,
    height: ECS_TOP_SHELL_PROFILE_BUTTON_SIZE,
    borderRadius: ECS_TOP_SHELL_PROFILE_BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(201,162,76,0.20)',
  },
  syncBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17,20,24,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.25)',
  },
  connDot: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    borderWidth: 1.5,
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
