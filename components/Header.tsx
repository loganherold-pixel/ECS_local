import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, ImageBackground, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeIcon as Ionicons } from './SafeIcon';
import { DENSITY, TYPO } from '../lib/theme';
import { CLOSE_BTN } from '../lib/uiConstants';
import { useTheme } from '../context/ThemeContext';
import { useApp } from '../context/AppContext';
import { expeditionStateStore } from '../lib/expeditionStateStore';
import { operatorTrustModeStore } from '../lib/ai/operatorTrustMode';
import type { ECSOperatorTrustMode } from '../lib/ai/operatorTrustTypes';
import {
  ECS_TOP_SHELL_EDGE_SLOT_WIDTH,
  ECS_TOP_SHELL_PROFILE_BUTTON_SIZE,
  getShellHeaderAnchorTop,
  getShellHeaderTopPadding,
} from '../lib/shellLayout';
import ProfileSettingsPanel from './ProfileSettingsPanel';
import { getTopBannerToneColor, resolveProfileCommandStatus, resolveTopBannerPresentation } from '../lib/ui/topBannerStatusResolver';
import type { ECSTopBannerCommandContext } from '../lib/ui/topBannerTypes';
import { useAdaptiveLayout } from '../lib/useAdaptiveLayout';
import { AUTH_COPY } from '../lib/auth/authCopy';
import { resolveAccountUx } from '../lib/auth/accountUXResolver';
import TacticalPopupShell from './TacticalPopupShell';
import { openManageSubscription } from '../lib/subscriptionAccess';
import { TOP_BANNER_BG } from '../lib/chromeAssets';

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

const ACCOUNT_UTILITY_SHEETS = {
  support: {
    title: AUTH_COPY.account.support,
    icon: 'help-buoy-outline' as const,
    body:
      `${AUTH_COPY.utility.supportPrompt}\n\n` +
      'Use Reset password to send recovery instructions to your ECS email, or Manage access when account verification needs attention.\n\n' +
      'If access still looks wrong after a refresh or restore, contact your established ECS support channel or account administrator.',
  },
  privacy: {
    title: AUTH_COPY.account.privacy,
    icon: 'lock-closed-outline' as const,
    body:
      'Your signed-in ECS account is used to verify access, restore purchases, and protect expedition data tied to your deployment.\n\n' +
      'This surface keeps account-state details concise and avoids exposing internal auth metadata in normal field use.',
  },
  terms: {
    title: AUTH_COPY.account.terms,
    icon: 'document-text-outline' as const,
    body:
      'ECS account access is governed by your active deployment terms and operational policies.\n\n' +
      'Use only authorized accounts, verify expedition decisions independently, and contact your ECS administrator if current account terms need review.',
  },
} as const;

interface HeaderProps {
  onAuthPress?: () => void;
  guidance?: {
    eyebrow?: string;
    title: string;
    detail?: string | null;
    tone?: 'active' | 'ready' | 'warning' | 'info';
  } | null;
  commandContext?: ECSTopBannerCommandContext | null;
}

function HeaderBackdropPanels() {
  return (
    <View style={styles.shellBackdrop} pointerEvents="none">
      <View style={styles.shellBackdropWash} />
      <View style={styles.shellBackdropSheen} />
      <View style={styles.shellBackdropBand} />
      <View style={styles.shellBackdropRim} />
    </View>
  );
}

export default function Header({ onAuthPress, guidance, commandContext }: HeaderProps) {
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
  const { appearanceMode, setAppearanceMode } = useTheme();
  const insets = useSafeAreaInsets();
  const adaptive = useAdaptiveLayout();
  const [profilePanelVisible, setProfilePanelVisible] = useState(false);
  const [signOutConfirmVisible, setSignOutConfirmVisible] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [accountActionBusyId, setAccountActionBusyId] = useState<string | null>(null);
  const [activeAccountUtilitySheet, setActiveAccountUtilitySheet] = useState<keyof typeof ACCOUNT_UTILITY_SHEETS | null>(null);
  const [geofenceRadius, setGeofenceRadius] = useState(() => expeditionStateStore.getGeofenceRadius());
  const [operatorTrustMode, setOperatorTrustMode] = useState<ECSOperatorTrustMode>(
    () => operatorTrustModeStore.mode,
  );
  const [expeditionState, setExpeditionState] = useState(() => expeditionStateStore.getState());
  const shellMessageLogKeyRef = useRef<string | null>(null);
  const syncSpin = useRef(new Animated.Value(0)).current;
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
  const toneColor = useMemo(
    () =>
      getTopBannerToneColor(bannerStatus.tone, {
        active: HEADER.iconActive,
        online: HEADER.statusOnline,
        muted: HEADER.iconMuted,
        degraded: '#D6A04B',
      }),
    [bannerStatus.tone],
  );

  const titleText = guidance?.title ?? 'Expedition Command System';

  useEffect(() => {
    const nextKey = [
      guidance?.eyebrow ?? bannerStatus.postureLabel,
      titleText,
      bannerStatus.statusLabel,
      bannerStatus.statusDetail,
      bannerStatus.source,
      bannerStatus.priority,
    ].join('|');

    if (shellMessageLogKeyRef.current === nextKey) return;
    shellMessageLogKeyRef.current = nextKey;

    console.log('[ShellMessage]', {
      shellMessageSource: bannerStatus.source,
      shellMessageReason: bannerStatus.reason,
      shellMessagePriority: bannerStatus.priority,
      suppressedShellSources: bannerStatus.suppressedSources,
      shellEyebrow: guidance?.eyebrow ?? bannerStatus.postureLabel,
      shellTitle: titleText,
      shellStatusLabel: bannerStatus.statusLabel,
      shellStatusDetail: bannerStatus.statusDetail,
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
    guidance?.eyebrow,
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
    setActiveAccountUtilitySheet(null);
    router.replace('/login');
  }, [router]);
  const handleAccountAction = useCallback(
    async (actionId: string) => {
      if (accountActionBusyId) return;
      if (actionId === 'sign_in') {
        handleOpenAuthEntry();
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
      refreshAccessState,
      restoreEcsProAccess,
      sendPasswordReset,
      showToast,
      user?.email,
    ],
  );
  const handleUtilityPress = useCallback((utilityId: string) => {
    if (utilityId === 'support' || utilityId === 'privacy' || utilityId === 'terms') {
      setActiveAccountUtilitySheet(utilityId);
    }
  }, []);

  const syncActionLabel = useMemo(() => {
    if (syncStatus === 'error') return 'RETRY SYNC';
    if (!isOnline) return 'WAIT FOR SIGNAL';
    if (bannerStatus.processingActive) return (bannerStatus.processingLabel ?? 'SYNCING').toUpperCase();
    return 'SYNC NOW';
  }, [bannerStatus.processingActive, bannerStatus.processingLabel, isOnline, syncStatus]);
  const controlSlotWidth = Math.max(
    ECS_TOP_SHELL_EDGE_SLOT_WIDTH,
    ECS_TOP_SHELL_PROFILE_BUTTON_SIZE + 10,
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
      .filter(Boolean) as Array<{
      id: string;
      label: string;
      detail: string;
      icon: React.ComponentProps<typeof Ionicons>['name'];
      tone?: 'default' | 'primary' | 'danger';
    }>;

    if (user?.email) {
      actions.push({
        id: 'reset_password',
        label: AUTH_COPY.account.resetPassword,
        detail: 'Send reset instructions to your signed-in ECS email.',
        icon: 'key-outline',
        tone: 'default',
      });
    }

    return actions;
  }, [accountUx.availableActions, ecsProProduct?.priceLabel, user?.email]);
  const utilityLinks = useMemo(
    () => [
      { id: 'support', label: AUTH_COPY.account.support, icon: 'help-buoy-outline' as const },
      { id: 'privacy', label: AUTH_COPY.account.privacy, icon: 'lock-closed-outline' as const },
      { id: 'terms', label: AUTH_COPY.account.terms, icon: 'document-text-outline' as const },
    ],
    [],
  );

  return (
    <ImageBackground
      source={TOP_BANNER_BG}
      resizeMode="cover"
      imageStyle={styles.bannerTextureImage}
      style={[
        styles.container,
        {
          paddingTop: getShellHeaderTopPadding(insets.top),
          minHeight: adaptive.shell.headerMinHeight,
        },
      ]}
    >
      <HeaderBackdropPanels />
      <View style={styles.barBottomEdge} />
      <View style={styles.goldRailLine} />
      <View
        style={[
          styles.contentRow,
          {
            paddingHorizontal: adaptive.shell.headerHorizontalPadding,
          },
        ]}
      >
        <View style={[styles.edgeSlot, { width: controlSlotWidth }]} />

        <View style={styles.centerContent}>
          <View style={styles.statusRow}>
            <Text
              style={[
                styles.guidanceEyebrow,
                guidance?.tone === 'warning' && styles.guidanceEyebrowWarning,
              ]}
              numberOfLines={1}
            >
              {guidance?.eyebrow ?? bannerStatus.postureLabel}
            </Text>
          </View>

          <Text style={guidance ? styles.guidanceTitle : styles.product} numberOfLines={1}>
            {titleText}
          </Text>
        </View>

        <View style={[styles.edgeSlot, { width: controlSlotWidth }]}>
          <TouchableOpacity
            onPress={openProfilePanel}
            style={styles.authBtn}
            hitSlop={CLOSE_BTN.hitSlop}
            activeOpacity={0.7}
          >
            <Ionicons
              name={user ? 'person-circle' : 'person-circle-outline'}
              size={24}
              color={user ? HEADER.iconActive : HEADER.iconMuted}
            />
            {bannerStatus.processingActive ? (
              <View style={styles.syncBadge}>
                <Animated.View style={{ transform: [{ rotate: syncSpinRotation }] }}>
                  <Ionicons name="sync-outline" size={9} color={toneColor} />
                </Animated.View>
              </View>
            ) : (
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor: toneColor,
                    borderColor: HEADER.bar,
                  },
                ]}
              />
            )}
          </TouchableOpacity>
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
        utilityLinks={utilityLinks}
        onUtilityPress={handleUtilityPress}
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
        endActionLabel={user ? AUTH_COPY.logout.primary : AUTH_COPY.account.signIn}
        endActionDetail={user ? AUTH_COPY.logout.supporting : 'Return to the full ECS sign-in screen.'}
        endActionIcon={user ? 'log-out-outline' : 'log-in-outline'}
        onEndAction={user ? requestSignOut : handleOpenAuthEntry}
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
      <TacticalPopupShell
        visible={!!activeAccountUtilitySheet}
        onClose={() => setActiveAccountUtilitySheet(null)}
        tier="global"
        title={activeAccountUtilitySheet ? ACCOUNT_UTILITY_SHEETS[activeAccountUtilitySheet].title : ''}
        subtitle="Expedition Command System"
        eyebrow="ACCOUNT"
        icon={activeAccountUtilitySheet ? ACCOUNT_UTILITY_SHEETS[activeAccountUtilitySheet].icon : 'help-buoy-outline'}
        overlayClass="support"
        maxWidth={500}
        maxHeightFraction={0.68}
      >
        <View style={styles.accountUtilitySheetBody}>
          <Text style={styles.accountUtilitySheetText}>
            {activeAccountUtilitySheet ? ACCOUNT_UTILITY_SHEETS[activeAccountUtilitySheet].body : ''}
          </Text>
        </View>
      </TacticalPopupShell>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingTop: 0,
    paddingBottom: 6,
    borderBottomWidth: 0,
    overflow: 'hidden',
  },
  bannerTextureImage: {
    width: '100%',
    height: '100%',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: DENSITY.screenPad,
  },
  goldRailLine: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: HEADER.goldRail,
    zIndex: 2,
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
  shellBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
    overflow: 'hidden',
  },
  shellBackdropWash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10, 13, 18, 0.18)',
  },
  shellBackdropSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(24, 29, 34, 0.46)',
  },
  shellBackdropBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 10,
    backgroundColor: 'rgba(201, 162, 76, 0.03)',
  },
  shellBackdropRim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    opacity: 1,
  },
  edgeSlot: {
    width: ECS_TOP_SHELL_EDGE_SLOT_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    paddingHorizontal: 8,
    zIndex: 3,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    minHeight: 12,
  },
  guidanceEyebrow: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 1.35,
    color: HEADER.iconActive,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  guidanceEyebrowWarning: {
    color: '#D96C50',
  },
  guidanceTitle: {
    ...TYPO.T2,
    fontSize: 14,
    lineHeight: 16,
    letterSpacing: 0.18,
    color: HEADER.productText,
    textAlign: 'center',
  },
  guidanceDetail: {
    ...TYPO.B2,
    fontSize: 11,
    lineHeight: 14,
    color: HEADER.tripText,
    textAlign: 'center',
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(201, 162, 76, 0.10)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(201, 162, 76, 0.25)',
  },
  offlineBadgeText: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: HEADER.iconActive,
  },
  liveStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  liveStatusText: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1.05,
  },
  product: {
    ...TYPO.T2,
    fontSize: 15,
    lineHeight: 17,
    letterSpacing: 0.28,
    color: HEADER.productText,
    textAlign: 'center',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    maxWidth: '100%',
  },
  activeTrip: {
    ...TYPO.B2,
    fontSize: 11,
    fontWeight: '600',
    color: HEADER.tripText,
    textAlign: 'center',
    flexShrink: 1,
  },
  detailFallback: {
    ...TYPO.B2,
    fontSize: 11,
    lineHeight: 14,
    color: HEADER.tripText,
    textAlign: 'center',
    opacity: 0.88,
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
  statusDot: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    borderWidth: 1.5,
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
  accountUtilitySheetBody: {
    paddingTop: 2,
  },
  accountUtilitySheetText: {
    color: '#8B949E',
    fontSize: 13,
    lineHeight: 20,
  },
});
