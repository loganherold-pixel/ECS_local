import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { useApp } from '../../context/AppContext';
import { TACTICAL, SPACING, RADIUS } from '../../lib/theme';
import { hasPremiumEntitlement, openManageSubscription } from '../../lib/subscriptionAccess';
import { resolveAccountUx } from '../../lib/auth/accountUXResolver';
import { setupStore } from '../../lib/setupStore';
import { isNativePurchaseModuleAvailable } from '../../lib/ecsProPurchase';
import { resolveConfiguredVehiclePresence } from '../../lib/vehiclePresence';

interface ProPaywallViewProps {
  featureLabel?: string;
  compact?: boolean;
  onContinueFree?: () => void;
  continueLabel?: string;
}

export default function ProPaywallView({
  featureLabel,
  compact = false,
  onContinueFree,
  continueLabel = 'Continue with Free',
}: ProPaywallViewProps) {
  const router = useRouter();
  const {
    user,
    operatorInfo,
    enterOfflineMode,
    showToast,
    billingFlowState,
    billingError,
    purchaseEcsProMonthly,
    restoreEcsProAccess,
  } = useApp();

  const hasAccess = hasPremiumEntitlement(operatorInfo);
  const nativePurchaseAvailable = isNativePurchaseModuleAvailable();
  const accountUx = React.useMemo(
    () =>
      resolveAccountUx({
        operatorInfo,
        authenticated: !!user,
        isOnline: true,
        billingFlowState,
      }),
    [billingFlowState, operatorInfo, user],
  );
  const isBusy =
    billingFlowState === 'purchasing' ||
    billingFlowState === 'confirming_access' ||
    billingFlowState === 'restore_in_progress';

  const handleStartPro = async () => {
    if (!user) {
      showToast('Sign in to purchase ECS Pro.');
      router.push('/login');
      return;
    }

    const result = await purchaseEcsProMonthly();
    if (result.success) {
      showToast('ECS Pro access confirmed');
      router.back();
    } else if (result.cancelled) {
      showToast('Purchase cancelled');
    } else if (result.pending) {
      showToast(result.error || 'Purchase pending confirmation');
    } else if (result.error) {
      showToast(result.error);
    }
  };

  const handleRestore = async () => {
    if (!user) {
      showToast('Sign in to the ECS account that should receive restored ECS Pro access.');
      router.push('/login');
      return;
    }

    const result = await restoreEcsProAccess();
    showToast(result.success ? 'Purchases restored' : (result.error || 'Restore failed'));
    if (result.success) {
      router.back();
    }
  };

  const handleContinueFree = () => {
    if (onContinueFree) {
      onContinueFree();
      return;
    }
    enterOfflineMode();
    router.replace(
      setupStore.isComplete() && resolveConfiguredVehiclePresence().hasConfiguredVehicle
        ? '/(tabs)/dashboard'
        : '/setup'
    );
  };

  const handleManage = async () => {
    const ok = await openManageSubscription();
    if (!ok) showToast('Unable to open subscription management on this device.');
  };

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <View style={styles.headerRow}>
        <View style={styles.iconWrap}>
          <Ionicons name="diamond-outline" size={20} color={TACTICAL.amber} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>ECS PRO</Text>
          <Text style={styles.title}>{hasAccess ? accountUx.title : 'Operate with ECS Pro'}</Text>
          <Text style={styles.subtitle}>
            {hasAccess
              ? accountUx.subtitle
              : featureLabel
              ? `${featureLabel} is part of ECS Pro.`
              : 'Unlock live expedition tools, premium route intelligence, advanced dashboard control, deeper offline capability, and live integrations.'}
          </Text>
        </View>
      </View>

      <View style={styles.valueList}>
        <ValueLine text="Live expedition tools and deeper field visibility" />
        <ValueLine text="Premium route intelligence and expedition analysis" />
        <ValueLine text="Advanced dashboard control and Pro widgets" />
        <ValueLine text="Deeper offline capability and live integrations" />
      </View>

      {billingError ? <Text style={styles.errorText}>{billingError}</Text> : null}
      {!hasAccess && !nativePurchaseAvailable ? (
        <Text style={styles.statusText}>
          Purchases and restore are unavailable in this build. Continue with Free, or use a production build that includes native billing support.
        </Text>
      ) : null}
      {accountUx.billingFlowLabel ? (
        <View style={styles.statusRow}>
          {isBusy ? <ActivityIndicator size="small" color={TACTICAL.amber} /> : null}
          <Text style={styles.statusText}>{accountUx.billingFlowLabel}</Text>
        </View>
      ) : null}

      {hasAccess ? (
        <View style={styles.accessCard}>
          <Text style={styles.accessTitle}>{accountUx.title}</Text>
          <Text style={styles.accessStatus}>{accountUx.stateLabel}</Text>
          <Text style={styles.accessText}>{accountUx.detail}</Text>
        </View>
      ) : nativePurchaseAvailable ? (
        <TouchableOpacity
          style={[styles.primaryBtn, isBusy && styles.primaryBtnDisabled]}
          onPress={handleStartPro}
          disabled={isBusy}
          activeOpacity={0.8}
        >
          <Ionicons name="card-outline" size={16} color="#000" />
          <Text style={styles.primaryBtnText}>Start Pro</Text>
        </TouchableOpacity>
      ) : null}

      {!hasAccess ? (
        <View style={styles.secondaryRow}>
          <TouchableOpacity style={styles.secondaryBtn} onPress={handleContinueFree} activeOpacity={0.75}>
            <Text style={styles.secondaryBtnText}>{continueLabel}</Text>
          </TouchableOpacity>
          {nativePurchaseAvailable && accountUx.availableActions.some((action) => action.id === 'restore_purchases') ? (
            <TouchableOpacity style={styles.secondaryBtn} onPress={handleRestore} activeOpacity={0.75}>
              <Text style={styles.secondaryBtnText}>Restore Purchases</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {user && accountUx.availableActions.some((action) => action.id === 'manage_subscription') ? (
        <TouchableOpacity style={styles.manageBtn} onPress={handleManage} activeOpacity={0.75}>
          <Ionicons name="open-outline" size={14} color={TACTICAL.textMuted} />
          <Text style={styles.manageBtnText}>Manage Subscription</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={styles.footnote}>{accountUx.footnote}</Text>
      {!hasAccess && user ? (
        <Text style={styles.footnote}>
          Restore Purchases applies to the ECS account currently signed in on this device.
        </Text>
      ) : null}
    </View>
  );
}

function ValueLine({ text }: { text: string }) {
  return (
    <View style={styles.valueLine}>
      <Ionicons name="checkmark-circle-outline" size={14} color={TACTICAL.amber} />
      <Text style={styles.valueText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.24)',
    backgroundColor: 'rgba(8,10,12,0.92)',
    padding: SPACING.lg,
    gap: 14,
  },
  cardCompact: {
    marginTop: SPACING.md,
  },
  headerRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(196,138,44,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
    gap: 4,
  },
  eyebrow: {
    color: TACTICAL.amber,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
  },
  title: {
    color: TACTICAL.text,
    fontSize: 24,
    fontWeight: '800',
  },
  subtitle: {
    color: TACTICAL.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  valueList: {
    gap: 8,
  },
  valueLine: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  valueText: {
    flex: 1,
    color: TACTICAL.text,
    fontSize: 12,
    lineHeight: 17,
  },
  errorText: {
    color: TACTICAL.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  statusText: {
    color: TACTICAL.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  primaryBtn: {
    minHeight: 48,
    borderRadius: RADIUS.sm,
    backgroundColor: TACTICAL.amber,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  accessCard: {
    minHeight: 48,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.20)',
    backgroundColor: 'rgba(196,138,44,0.08)',
    paddingHorizontal: SPACING.md,
    justifyContent: 'center',
    gap: 2,
  },
  accessTitle: {
    color: TACTICAL.amber,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  accessStatus: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  accessText: {
    color: TACTICAL.text,
    fontSize: 11,
    lineHeight: 16,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
  },
  secondaryBtnText: {
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '700',
  },
  manageBtn: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  manageBtnText: {
    color: TACTICAL.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  footnote: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
    opacity: 0.9,
  },
});
