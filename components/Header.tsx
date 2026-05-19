import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeIcon as Ionicons } from './SafeIcon';
import { TYPO } from '../lib/theme';
import { CLOSE_BTN } from '../lib/uiConstants';
import { useTheme } from '../context/ThemeContext';
import { useApp } from '../context/AppContext';
import { ecsLog } from '../lib/ecsLogger';
import { expeditionStateStore } from '../lib/expeditionStateStore';
import { operatorTrustModeStore } from '../lib/ai/operatorTrustMode';
import type { ECSOperatorTrustMode } from '../lib/ai/operatorTrustTypes';
import {
  ECS_TOP_BANNER_TITLE_CENTER_PADDING,
  ECS_TOP_BANNER_TITLE_LEFT_SLOT_WIDTH,
  ECS_TOP_BANNER_TITLE_RIGHT_SLOT_WIDTH,
  ECS_TOP_SHELL_COMMAND_PILL_HEIGHT,
  ECS_TOP_SHELL_CONTROL_SLOT_WIDTH,
  getEcsTopBannerLayoutMetrics,
  getShellHeaderAnchorTop,
  getShellHeaderTopPadding,
} from '../lib/shellLayout';
import ProfileSettingsPanel from './ProfileSettingsPanel';
import ThemeToggle from './ThemeToggle';
import { getTopBannerToneColor, resolveProfileCommandStatus, resolveTopBannerPresentation } from '../lib/ui/topBannerStatusResolver';
import type { ECSTopBannerCommandContext } from '../lib/ui/topBannerTypes';
import { useAdaptiveLayout } from '../lib/useAdaptiveLayout';
import { AUTH_COPY } from '../lib/auth/authCopy';
import { resolveAccountUx } from '../lib/auth/accountUXResolver';
import TacticalPopupShell from './TacticalPopupShell';
import { openManageSubscription } from '../lib/subscriptionAccess';
import { VISIBILITY_THEME_CYCLE } from '../lib/appearanceStore';
import { resolveShellChromeTheme } from '../lib/ui/shellChromeTheme';
import TopBannerBackground, { resolveTopBannerVariant } from './TopBannerBackground';
import { useEcsTopBannerHeight } from './ECSGlobalBanner';
import { useEcsBriefTopBannerMessage } from '../lib/useEcsBriefTopBannerMessage';

const HEADER = {
  bar: '#1E2125',
  goldRail: '#A0813A',
  barBottomEdge: '#262A2E',
  facetFill: '#20252A',
  facetEdge: 'rgba(255,255,255,0.03)',
  centerPlate: '#21262B',
  centerPlateBorder: 'rgba(201,162,76,0.08)',
  iconMuted: '#8A7A58',
  iconActive: '#C9A24C',
  productText: '#C9A24C',
  tripText: '#8A7A58',
  statusOnline: '#3E6B3E',
};

interface HeaderProps {
  title?: string;
  onAuthPress?: () => void;
  guidance?: {
    eyebrow?: string;
    title: string;
    detail?: string | null;
    tone?: 'active' | 'ready' | 'warning' | 'info';
  } | null;
  commandContext?: ECSTopBannerCommandContext | null;
}

function resolveHeaderBannerSubject(
  variant: ReturnType<typeof resolveTopBannerVariant>,
): string | null {
  switch (variant) {
    case 'fleet':
      return 'Fleet';
    case 'navigate':
      return 'Navigate';
    case 'explore':
      return 'Explore';
    case 'dispatch':
      return 'Dispatch';
    default:
      return null;
  }
}

export default function Header({ title, onAuthPress, guidance, commandContext }: HeaderProps) {
  const router = useRouter();
  const {
    user,
    activeTrip,
    accessState,
    operatorInfo,
    isOnline,
    offlineMode,
    syncStatus,
    connectivityStatus,
    triggerSync,
    signOut,
    showToast,
    refreshAccessState,
    purchaseEcsProMonthly,
    restoreEcsProAccess,
    sendPasswordReset,
    ecsProProduct,
  } = useApp();
  const { appearanceMode, setAppearanceMode, palette, colors, effectiveTheme } = useTheme();
  const insets = useSafeAreaInsets();
  const adaptive = useAdaptiveLayout();
  const topBannerHeight = useEcsTopBannerHeight();
  const [profilePanelVisible, setProfilePanelVisible] = useState(false);
  const [signOutConfirmVisible, setSignOutConfirmVisible] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [accountActionBusyId, setAccountActionBusyId] = useState<string | null>(null);
  const [geofenceRadius, setGeofenceRadius] = useState(() => expeditionStateStore.getGeofenceRadius());
  const [operatorTrustMode, setOperatorTrustMode] = useState<ECSOperatorTrustMode>(
    () => operatorTrustModeStore.mode,
  );
  const [expeditionState, setExpeditionState] = useState(() => expeditionStateStore.getState());
  const shellMessageLogKeyRef = useRef<string | null>(null);
  const syncSpin = useRef(new Animated.Value(0)).current;
  const briefBannerAnim = useRef(new Animated.Value(0)).current;
  const briefTopBanner = useEcsBriefTopBannerMessage();
  const [displayBriefBanner, setDisplayBriefBanner] = useState(briefTopBanner);
  const processingActive = syncStatus === 'syncing' || connectivityStatus === 'reconnecting';

  useEffect(() => {
    return expeditionStateStore.subscribe((nextState) => {
      setExpeditionState(nextState);
    });
  }, []);

  useEffect(() => {
    return operatorTrustModeStore.subscribe((nextMode) => {
      setOperatorTrustMode((currentMode) => currentMode === nextMode ? currentMode : nextMode);
    });
  }, []);

  useEffect(() => {
    if (!processingActive) {
      syncSpin.stopAnimation();
      syncSpin.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.timing(syncSpin, {
        toValue: 1,
        duration: 1300,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    animation.start();
    return () => {
      animation.stop();
      syncSpin.stopAnimation();
      syncSpin.setValue(0);
    };
  }, [processingActive, syncSpin]);

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

  const hasActiveExpeditionContext = useMemo(
    () => expeditionState === 'active' || Boolean(activeTrip),
    [activeTrip, expeditionState],
  );
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

  const titleText = title ?? 'Expedition Command System';
  const topBannerVariant = useMemo(() => resolveTopBannerVariant(titleText), [titleText]);
  const bannerSubject = useMemo(
    () => resolveHeaderBannerSubject(topBannerVariant),
    [topBannerVariant],
  );
  const guidanceOverrideActive = Boolean(guidance?.title || guidance?.eyebrow || guidance?.detail);

  useEffect(() => {
    const nextKey = [
      titleText,
      bannerStatus.statusLabel,
      bannerStatus.source,
      bannerStatus.priority,
    ].join('|');

    if (shellMessageLogKeyRef.current === nextKey) return;
    shellMessageLogKeyRef.current = nextKey;

    ecsLog.debug('SHELL', '[ShellMessage]', {
      shellMessageSource: bannerStatus.source,
      shellMessageReason: bannerStatus.reason,
      shellMessagePriority: bannerStatus.priority,
      suppressedShellSources: bannerStatus.suppressedSources,
      shellTitle: titleText,
      shellStatusLabel: bannerStatus.statusLabel,
      guidanceOverrideActive,
      gpsLive: bannerStatus.diagnostics.gpsLive,
      routeActive: bannerStatus.diagnostics.routeUsable && hasActiveExpeditionContext,
      connectivityState: connectivityStatus,
      hasConfiguredVehicle: bannerStatus.diagnostics.hasConfiguredVehicle,
      offlineMode,
      cloudEnhancementAvailable: bannerStatus.diagnostics.cloudEnhancementAvailable,
    });
  }, [
    bannerStatus,
    connectivityStatus,
    guidanceOverrideActive,
    hasActiveExpeditionContext,
    offlineMode,
    titleText,
  ]);

  const syncSpinRotation = useMemo(
    () =>
      syncSpin.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
      }),
    [syncSpin],
  );
  const briefDefaultOpacity = briefBannerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const briefBannerTranslateY = briefBannerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [5, 0],
  });

  const openProfilePanel = useCallback(() => {
    setGeofenceRadius(expeditionStateStore.getGeofenceRadius());
    setProfilePanelVisible(true);
  }, []);
  const requestSignOut = useCallback(() => {
    setSignOutConfirmVisible(true);
  }, []);
  const handleCancelSignOut = useCallback(() => {
    if (signOutBusy) return;
    setSignOutConfirmVisible(false);
  }, [signOutBusy]);
  const handleConfirmSignOut = useCallback(async () => {
    if (signOutBusy) return;
    setSignOutBusy(true);
    try {
      await signOut();
      setProfilePanelVisible(false);
      setSignOutConfirmVisible(false);
    } finally {
      setSignOutBusy(false);
    }
  }, [signOut, signOutBusy]);
  const handleOpenAuthEntry = useCallback(() => {
    setProfilePanelVisible(false);
    if (onAuthPress) {
      onAuthPress();
      return;
    }
    router.replace('/login');
  }, [onAuthPress, router]);
  const handleAccountAction = useCallback(
    async (actionId: string) => {
      if (accountActionBusyId) return;
      if (actionId === 'sign_in') {
        handleOpenAuthEntry();
        return;
      }
      if (actionId === 'sign_out') {
        setProfilePanelVisible(false);
        requestSignOut();
        return;
      }
      setAccountActionBusyId(actionId);
      try {
        switch (actionId) {
          case 'start_subscription': {
            const result = await purchaseEcsProMonthly();
            if (result.success) {
              showToast('ECS access confirmed');
            } else if (result.cancelled) {
              showToast('Purchase cancelled');
            } else if (result.pending) {
              showToast(result.error || 'Purchase pending confirmation');
            } else if (result.error) {
              showToast(result.error);
            }
            break;
          }
          case 'restore_purchases': {
            const result = await restoreEcsProAccess();
            showToast(result.success ? 'Purchases restored' : (result.error || 'Restore failed'));
            break;
          }
          case 'manage_subscription': {
            const ok = await openManageSubscription();
            if (!ok) {
              showToast('Unable to open access management on this device.');
            }
            break;
          }
          case 'refresh_access': {
            const refreshed = await refreshAccessState();
            showToast(refreshed ? 'Access refreshed' : 'Unable to verify ECS access right now.');
            break;
          }
          case 'reset_password': {
            if (!user?.email) {
              showToast('Unable to load account details right now.');
              break;
            }
            const result = await sendPasswordReset(user.email);
            showToast(result.error ? 'Unable to send reset instructions right now.' : 'Reset instructions sent if the account exists.');
            break;
          }
        }
      } catch (error: any) {
        showToast(error?.message || 'Unable to verify ECS access right now.');
      } finally {
        setAccountActionBusyId(null);
      }
    },
    [
      accountActionBusyId,
      handleOpenAuthEntry,
      purchaseEcsProMonthly,
      requestSignOut,
      refreshAccessState,
      restoreEcsProAccess,
      sendPasswordReset,
      showToast,
      user?.email,
    ],
  );
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

  const syncActionLabel = useMemo(() => {
    if (syncStatus === 'error') return 'RETRY SYNC';
    if (!isOnline) return 'WAIT FOR SIGNAL';
    if (bannerStatus.processingActive) return (bannerStatus.processingLabel ?? 'SYNCING').toUpperCase();
    return 'SYNC NOW';
  }, [bannerStatus.processingActive, bannerStatus.processingLabel, isOnline, syncStatus]);
  const controlSlotWidth = ECS_TOP_SHELL_CONTROL_SLOT_WIDTH;
  const useBannerTitleLayout = Boolean(bannerSubject || displayBriefBanner);
  const leftControlSlotWidth = useBannerTitleLayout
    ? ECS_TOP_BANNER_TITLE_LEFT_SLOT_WIDTH
    : controlSlotWidth;
  const rightControlSlotWidth = useBannerTitleLayout
    ? ECS_TOP_BANNER_TITLE_RIGHT_SLOT_WIDTH
    : controlSlotWidth;
  const centerContentPadding = useBannerTitleLayout
    ? ECS_TOP_BANNER_TITLE_CENTER_PADDING
    : 8;
  const topBannerLayout = getEcsTopBannerLayoutMetrics(insets.top, topBannerHeight, {
    isTablet: adaptive.isTablet,
    shortHeight: adaptive.shortHeight,
  });
  const sharedHeaderHeight = useBannerTitleLayout
    ? topBannerLayout.visibleHeight
    : Math.max(adaptive.shell.headerMinHeight, topBannerHeight);
  const sharedHeaderTopPadding = useBannerTitleLayout
    ? topBannerLayout.topPadding
    : getShellHeaderTopPadding(insets.top);
  const connectionLabel = offlineMode || !isOnline ? 'OFFLINE' : 'ONLINE';
  const connectionTone = offlineMode || !isOnline ? shellChrome.iconMuted : shellChrome.online;
  const bluetoothPillStyle = useMemo(
    () => ({
      borderColor: shellChrome.iconMuted + '45',
      backgroundColor: shellChrome.iconMuted + '10',
      color: shellChrome.iconMuted,
    }),
    [shellChrome.iconMuted],
  );
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
  const accountFacts = useMemo(
    () =>
      [
        {
          label: 'Account type',
          value:
            accessState?.role === 'admin'
              ? 'Admin'
              : accessState?.role === 'friends_and_family'
                ? 'Internal access'
                : accessState?.rawEntitlementStatus === 'free'
                  ? 'Free member'
                  : accessState?.isBillingManaged
                    ? 'Paid subscriber'
                    : 'Member account',
        },
        { label: 'Status', value: accountUx.stateLabel },
        { label: 'Access Source', value: accessState?.sourceLabel ?? accountUx.title },
        { label: accountUx.renewalLabel, value: accountUx.renewalValue },
        { label: accountUx.billingLabel, value: accountUx.billingValue },
      ].filter((fact) => fact.value && fact.value !== 'Unknown'),
    [
      accessState?.isBillingManaged,
      accessState?.rawEntitlementStatus,
      accessState?.role,
      accessState?.sourceLabel,
      accountUx.billingLabel,
      accountUx.billingValue,
      accountUx.renewalLabel,
      accountUx.renewalValue,
      accountUx.stateLabel,
      accountUx.title,
    ],
  );
  const accountActions = useMemo(() => {
    const actions = accountUx.availableActions
      .map((action) => {
        switch (action.id) {
          case 'sign_in':
            return {
              id: action.id,
              label: AUTH_COPY.account.signIn,
              detail: 'Open the full ECS sign-in screen for this device.',
              icon: 'log-in-outline' as const,
              tone: 'primary' as const,
            };
          case 'manage_subscription':
            return {
              id: action.id,
              label: AUTH_COPY.account.manageAccess,
              detail: 'Open store access management for this ECS account.',
              icon: 'open-outline' as const,
              tone: 'default' as const,
            };
          case 'restore_purchases':
            return {
              id: action.id,
              label: AUTH_COPY.account.restorePurchases,
              detail: 'Recheck store billing and restore paid ECS access on this device.',
              icon: 'refresh-outline' as const,
              tone: 'default' as const,
            };
          case 'start_subscription':
            return {
              id: action.id,
              label: AUTH_COPY.account.manageAccess,
              detail: ecsProProduct?.priceLabel
                ? `Open access management for ${ecsProProduct.priceLabel} on this device.`
                : 'Open access management for this ECS account.',
              icon: 'card-outline' as const,
              tone: 'primary' as const,
            };
          case 'refresh_access':
            return {
              id: action.id,
              label: AUTH_COPY.account.refreshAccess,
              detail: 'Verify account access again when ECS needs a fresh access check.',
              icon: 'sync-outline' as const,
              tone: 'primary' as const,
            };
          default:
            return null;
        }
      })
      .filter(Boolean) as {
      id: string;
      label: string;
      detail: string;
      icon: React.ComponentProps<typeof Ionicons>['name'];
      tone?: 'default' | 'primary' | 'danger';
    }[];

    if (user?.email) {
      actions.push({
        id: 'reset_password',
        label: AUTH_COPY.account.resetPassword,
        detail: 'Send reset instructions to your signed-in ECS email.',
        icon: 'key-outline',
        tone: 'default',
      });
    }
    if (user) {
      actions.push({
        id: 'sign_out',
        label: AUTH_COPY.account.signOut,
        detail: 'End this device session and return to the secure ECS login screen.',
        icon: 'log-out-outline',
        tone: 'danger',
      });
    } else if (!actions.some((action) => action.id === 'sign_in')) {
      actions.push({
        id: 'sign_in',
        label: AUTH_COPY.account.signIn,
        detail: 'Open the full ECS sign-in screen for this device.',
        icon: 'log-in-outline',
        tone: 'primary',
      });
    }

    return actions;
  }, [accountUx.availableActions, ecsProProduct?.priceLabel, user]);

  return (
    <View
      style={[
        styles.container,
        useBannerTitleLayout ? styles.bannerMatchedContainer : null,
        {
          height: sharedHeaderHeight,
          paddingTop: sharedHeaderTopPadding,
          minHeight: sharedHeaderHeight,
        },
      ]}
    >
      <TopBannerBackground
        variant={topBannerVariant}
        resizeMode={useBannerTitleLayout ? 'cover' : undefined}
        verticalOffset={useBannerTitleLayout ? topBannerLayout.bannerOffset : 0}
        overscan={useBannerTitleLayout ? topBannerLayout.bannerOverscan : 0}
      />
      <View
        style={[
          styles.contentRow,
          useBannerTitleLayout ? styles.bannerMatchedContentRow : null,
          {
            maxWidth: adaptive.shell.headerMaxWidth,
            paddingHorizontal: adaptive.shell.headerHorizontalPadding,
          },
        ]}
      >
        <View
          style={[
            styles.edgeSlotBase,
            useBannerTitleLayout ? styles.bannerMatchedEdgeSlot : null,
            styles.edgeSlotStart,
            { width: leftControlSlotWidth },
          ]}
        >
          <View style={styles.connectionWordmark} pointerEvents="none">
            <View style={[styles.connectionDot, { backgroundColor: connectionTone }]} />
            <Text style={[styles.connectionText, { color: connectionTone }]}>{connectionLabel}</Text>
          </View>
        </View>

        <View
          style={[styles.centerContent, { paddingHorizontal: centerContentPadding }]}
          pointerEvents="none"
        >
          {bannerSubject || displayBriefBanner ? (
            <View style={styles.bannerTitleStack}>
              {bannerSubject ? (
                <Animated.View style={[styles.bannerDefaultCopy, { opacity: briefDefaultOpacity }]}>
                  <Text
                    style={styles.bannerTitle}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.74}
                  >
                    {bannerSubject}
                  </Text>
                </Animated.View>
              ) : null}
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
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.78}
                  >
                    {displayBriefBanner.detail}
                  </Text>
                </Animated.View>
              ) : null}
            </View>
          ) : null}
        </View>

        <View
          style={[
            styles.edgeSlotBase,
            useBannerTitleLayout ? styles.bannerMatchedEdgeSlot : null,
            styles.edgeSlotEnd,
            { width: rightControlSlotWidth },
          ]}
        >
          <View style={styles.rightControlCluster}>
            <TouchableOpacity
              style={[styles.statusPill, bluetoothPillStyle]}
              onPress={openBluetoothConnections}
              activeOpacity={0.78}
              hitSlop={CLOSE_BTN.hitSlop}
              accessibilityRole="button"
              accessibilityLabel="Bluetooth controls"
              accessibilityHint="Opens device connections and Bluetooth controls"
            >
              <Ionicons name="bluetooth-outline" size={16} color={bluetoothPillStyle.color} />
            </TouchableOpacity>
            <ThemeToggle
              compact
              size={30}
              iconMode="eye"
              cycleModes={VISIBILITY_THEME_CYCLE}
            />
          <TouchableOpacity
            onPress={openProfilePanel}
            style={[
              styles.authBtn,
              {
                backgroundColor: shellChrome.controlSurface,
                borderColor: shellChrome.controlBorder,
              },
            ]}
            hitSlop={CLOSE_BTN.hitSlop}
            activeOpacity={0.7}
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
                <Animated.View style={{ transform: [{ rotate: syncSpinRotation }] }}>
                  <Ionicons name="sync-outline" size={9} color={toneColor} />
                </Animated.View>
              </View>
            )}
          </TouchableOpacity>
          </View>
        </View>
      </View>

      <ProfileSettingsPanel
        visible={profilePanelVisible}
        onClose={() => setProfilePanelVisible(false)}
        anchorTop={getShellHeaderAnchorTop(insets.top)}
        userEmail={user?.email ?? null}
        accessLabel={accountUx.title}
        accessStatusLabel={accountUx.stateLabel}
        accessDetail={accountUx.detail}
        accountBadgeLabel={accountUx.badgeLabel}
        accountFacts={accountFacts}
        accountFootnote={accountUx.footnote}
        accountActions={accountActions}
        accountActionBusyId={accountActionBusyId}
        onAccountAction={handleAccountAction}
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
        onProfilePress={!user ? handleOpenAuthEntry : undefined}
      />

      <TacticalPopupShell
        visible={signOutConfirmVisible}
        onClose={handleCancelSignOut}
        tier="global"
        title={AUTH_COPY.logout.title}
        subtitle={AUTH_COPY.logout.supporting}
        eyebrow="SESSION"
        icon="log-out-outline"
        overlayClass="dialog"
        footer={
          <View style={styles.signOutConfirmFooter}>
            <TouchableOpacity
              style={[
                styles.signOutConfirmPrimary,
                styles.signOutConfirmFooterPrimary,
                signOutBusy ? styles.signOutConfirmPrimaryDisabled : null,
              ]}
              onPress={() => void handleConfirmSignOut()}
              activeOpacity={0.76}
              disabled={signOutBusy}
            >
              <Text style={styles.signOutConfirmPrimaryText}>
                {signOutBusy ? AUTH_COPY.logout.primaryLoading : AUTH_COPY.logout.primary}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.signOutConfirmSecondary, styles.signOutConfirmFooterSecondary]}
              onPress={handleCancelSignOut}
              activeOpacity={0.72}
              disabled={signOutBusy}
            >
              <Text style={styles.signOutConfirmSecondaryText}>{AUTH_COPY.logout.secondary}</Text>
            </TouchableOpacity>
          </View>
        }
      >
        <View style={styles.signOutConfirmCard}>
          <Text style={styles.signOutConfirmHint}>
            This will clear the active ECS session from this device.
          </Text>
        </View>
      </TacticalPopupShell>
      <View
        pointerEvents="none"
        style={[styles.goldRailLine, { backgroundColor: shellChrome.goldRail }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingTop: 0,
    paddingBottom: 8,
    borderBottomWidth: 0,
    overflow: 'hidden',
    backgroundColor: '#020304',
  },
  bannerMatchedContainer: {
    alignItems: 'center',
    paddingBottom: 3,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    width: '100%',
    alignSelf: 'center',
    minHeight: ECS_TOP_SHELL_COMMAND_PILL_HEIGHT,
  },
  bannerMatchedContentRow: {
    alignItems: 'center',
    flex: 1,
  },
  goldRailLine: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: HEADER.goldRail,
    opacity: 0.78,
    zIndex: 4,
  },
  barBottomEdge: {
    position: 'absolute',
    bottom: 1.5,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: HEADER.barBottomEdge,
    zIndex: 1,
  },
  edgeSlotBase: {
    width: ECS_TOP_SHELL_CONTROL_SLOT_WIDTH,
    justifyContent: 'flex-end',
    paddingBottom: 3,
    zIndex: 3,
  },
  bannerMatchedEdgeSlot: {
    justifyContent: 'center',
    paddingBottom: 0,
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
    color: HEADER.iconActive,
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
    fontSize: 9.5,
    lineHeight: 10.5,
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
    color: HEADER.iconActive,
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
  product: {
    ...TYPO.T1,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 19,
    letterSpacing: 1.6,
    color: HEADER.productText,
    textAlign: 'center',
    includeFontPadding: false,
    textShadowColor: 'rgba(0, 0, 0, 0.34)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
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
    borderColor: 'rgba(201,162,76,0.22)',
  },
  signOutConfirmCard: {
    paddingTop: 2,
  },
  signOutConfirmHint: {
    color: '#8B949E',
    fontSize: 13,
    lineHeight: 19,
  },
  signOutConfirmFooter: {
    width: '100%',
    gap: 10,
  },
  signOutConfirmPrimary: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#D96C50',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  signOutConfirmPrimaryDisabled: {
    opacity: 0.7,
  },
  signOutConfirmPrimaryText: {
    color: '#FFF4EE',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  signOutConfirmSecondary: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  signOutConfirmFooterPrimary: {
    width: '100%',
  },
  signOutConfirmFooterSecondary: {
    width: '100%',
  },
  signOutConfirmSecondaryText: {
    color: HEADER.iconMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
