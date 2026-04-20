import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Platform, Switch } from 'react-native';
import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import TabErrorBoundary from '../../components/TabErrorBoundary';


import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { SPACING, RADIUS, ZONES } from '../../lib/theme';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { riskScoreStore, fuelWaterLogStore, userSettingsStore } from '../../lib/storage';
import { calculateRisk, getRiskColor, getActiveItems, getPackingStats } from '../../lib/calculations';
import { RiskScore, FuelWaterLog, UserSettings } from '../../lib/types';
import Header from '../../components/Header';
import AuthModal from '../../components/AuthModal';
import Toast from '../../components/Toast';
import TemplateManager from '../../components/templates/TemplateManager';
import AppearanceSettingsModal from '../../components/AppearanceSettingsModal';
import SyncQueueManager from '../../components/sync/SyncQueueManager';
import StorageCleanupSettings from '../../components/storage/StorageCleanupSettings';
import OfflineExpeditionDataPanel from '../../components/offline-data/OfflineExpeditionDataPanel';
import RateLimitCleanupPanel from '../../components/RateLimitCleanupPanel';
import TacticalPopupShell from '../../components/TacticalPopupShell';
import EcsIssueIntelligencePanel from '../../components/admin/EcsIssueIntelligencePanel';
import FieldIssueReportModal from '../../components/feedback/FieldIssueReportModal';
import type { AppearanceMode } from '../../lib/appearanceStore';
import { openManageSubscription } from '../../lib/subscriptionAccess';
import { resolveEcsAccessState } from '../../lib/auth/accessResolver';
import { resolveRoleSurfaceScopes } from '../../lib/auth/roleScopeResolver';
import { resolveAccountUx } from '../../lib/auth/accountUXResolver';

type SubTab =
  | 'risk'
  | 'logs'
  | 'manifest'
  | 'templates'
  | 'sync'
  | 'storage'
  | 'offline-data'
  | 'rate-limits'
  | 'settings'
  | 'stability';





const MODE_LABELS: Record<AppearanceMode, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  auto: { label: 'Auto', icon: 'contrast-outline', color: '#80C0FF' },
  dark: { label: 'Dark', icon: 'moon-outline', color: '#8A8AFF' },
  light: { label: 'Light', icon: 'sunny-outline', color: '#FFB800' },
  driving: { label: 'Driving (Hi-Vis)', icon: 'car-sport-outline', color: '#E0A030' },
};

function SubscriptionFactRow({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: any;
}) {
  return (
    <View style={styles.subscriptionFactRow}>
      <Text style={[styles.subscriptionFactLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.subscriptionFactValue, { color: colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

function MoreScreenInner() {
  const {
    activeTrip,
    loadItems,
    riskScore,
    fuelWaterLogs,
    userSettings,
    refreshActiveTrip,
    showToast,
    user,
    operatorInfo,
    isOnline,
    signOut,
    rotateSharedAccountPassword,
    refreshAccessState,
    billingFlowState,
    billingError,
    ecsProProduct,
    loadEcsProProduct,
    purchaseEcsProMonthly,
    restoreEcsProAccess,
  } = useApp();
  const { palette, colors, appearanceMode, autoDrivingEnabled, effectiveTheme, isAutoDrivingActive, setAppearanceMode, setAutoDrivingEnabled } = useTheme();
  const router = useRouter();

  const [authVisible, setAuthVisible] = useState(false);
  const [subTab, setSubTab] = useState<SubTab>('risk');
  const [manifestShowAll, setManifestShowAll] = useState(false);
  const [appearanceModalVisible, setAppearanceModalVisible] = useState(false);
  const [sharedAccountModalVisible, setSharedAccountModalVisible] = useState(false);
  const [fieldIssueModalVisible, setFieldIssueModalVisible] = useState(false);
  const [sharedPassword, setSharedPassword] = useState('');
  const [sharedPasswordConfirm, setSharedPasswordConfirm] = useState('');
  const [revokeSharedSessions, setRevokeSharedSessions] = useState(false);
  const [sharedAccountBusy, setSharedAccountBusy] = useState(false);
  const [sharedAccountError, setSharedAccountError] = useState('');


  // Risk state
  const [riskFields, setRiskFields] = useState({
    terrain_complexity: riskScore?.terrain_complexity || 1,
    weather_exposure: riskScore?.weather_exposure || 1,
    remoteness: riskScore?.remoteness || 1,
    recovery_availability: riskScore?.recovery_availability || 1,
    comms_coverage: riskScore?.comms_coverage || 1,
  });

  // Log form state
  const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0]);
  const [logFuel, setLogFuel] = useState('');
  const [logWater, setLogWater] = useState('');
  const [logNotes, setLogNotes] = useState('');

  // Settings state
  const [settingsFields, setSettingsFields] = useState({
    roof_load_threshold_lbs: userSettings?.roof_load_threshold_lbs || 250,
    roof_share_warn: userSettings?.roof_share_warn || 0.12,
    roof_share_alert: userSettings?.roof_share_alert || 0.18,
  });

  useFocusEffect(useCallback(() => {
    refreshActiveTrip();
  }, [refreshActiveTrip]));

  // Update risk fields when riskScore changes
  React.useEffect(() => {
    if (riskScore) {
      setRiskFields({
        terrain_complexity: riskScore.terrain_complexity,
        weather_exposure: riskScore.weather_exposure,
        remoteness: riskScore.remoteness,
        recovery_availability: riskScore.recovery_availability,
        comms_coverage: riskScore.comms_coverage,
      });
    }
  }, [riskScore]);

  React.useEffect(() => {
    if (userSettings) {
      setSettingsFields({
        roof_load_threshold_lbs: userSettings.roof_load_threshold_lbs,
        roof_share_warn: userSettings.roof_share_warn,
        roof_share_alert: userSettings.roof_share_alert,
      });
    }
  }, [userSettings]);

  const risk = calculateRisk(riskFields as RiskScore);
  const resolvedAccess = React.useMemo(
    () =>
      resolveEcsAccessState({
        operatorInfo,
        authenticated: !!user,
        isOnline: true,
      }),
    [operatorInfo, user],
  );
  const roleScopes = React.useMemo(
    () => resolveRoleSurfaceScopes(resolvedAccess),
    [resolvedAccess],
  );
  const isFriendsAndFamilyAccess = resolvedAccess.role === 'friends_and_family';
  const canManageFriendsAndFamilyAccess = resolvedAccess.canManageFriendsAndFamilyAccess;
  const hasAdminAccess = roleScopes.showAdminTools;
  const canPurchasePro =
    !!user &&
    roleScopes.showBillingActions &&
    !resolvedAccess.hasFullAccess;
  const accountUx = React.useMemo(
    () =>
      resolveAccountUx({
        operatorInfo,
        accessState: resolvedAccess,
        authenticated: !!user,
        isOnline,
        billingFlowState,
        productPriceLabel: ecsProProduct?.priceLabel ?? null,
      }),
    [billingFlowState, ecsProProduct?.priceLabel, isOnline, operatorInfo, resolvedAccess, user],
  );
  const purchaseStatusText = accountUx.billingFlowLabel;
  const showBillingRestore = accountUx.availableActions.some((action) => action.id === 'restore_purchases');
  const showManageSubscription = accountUx.availableActions.some((action) => action.id === 'manage_subscription');
  const showRefreshAccess = accountUx.availableActions.some((action) => action.id === 'refresh_access');

  React.useEffect(() => {
    if (!canPurchasePro || subTab !== 'settings' || ecsProProduct || billingFlowState !== 'idle') return;
    loadEcsProProduct().catch(() => {});
  }, [billingFlowState, canPurchasePro, ecsProProduct, loadEcsProProduct, subTab]);

  const resetSharedAccountForm = useCallback(() => {
    setSharedPassword('');
    setSharedPasswordConfirm('');
    setRevokeSharedSessions(false);
    setSharedAccountError('');
    setSharedAccountBusy(false);
  }, []);

  const closeSharedAccountModal = useCallback(() => {
    if (sharedAccountBusy) return;
    setSharedAccountModalVisible(false);
    resetSharedAccountForm();
  }, [resetSharedAccountForm, sharedAccountBusy]);

  React.useEffect(() => {
    if (!operatorInfo?.revoke_sessions_supported) {
      setRevokeSharedSessions(false);
    }
  }, [operatorInfo?.revoke_sessions_supported]);

  const handleRotateSharedPassword = useCallback(async () => {
    if (!canManageFriendsAndFamilyAccess) {
      setSharedAccountError('This account is not authorized to manage shared access.');
      return;
    }

    if (sharedPassword.length < 8) {
      setSharedAccountError('Password must be at least 8 characters.');
      return;
    }

    if (sharedPassword !== sharedPasswordConfirm) {
      setSharedAccountError('Passwords do not match.');
      return;
    }

    setSharedAccountBusy(true);
    setSharedAccountError('');

    const shouldRevokeSessions =
      operatorInfo?.revoke_sessions_supported === true && revokeSharedSessions;
    const result = await rotateSharedAccountPassword(sharedPassword, shouldRevokeSessions);

    if (!result.success) {
      setSharedAccountBusy(false);
      setSharedAccountError(result.error || 'Unable to rotate the shared account password.');
      return;
    }

    setSharedAccountBusy(false);
    setSharedAccountModalVisible(false);
    resetSharedAccountForm();

    await refreshAccessState().catch(() => {});

    if (shouldRevokeSessions && result.sessions_revoked) {
      showToast('Shared password updated. Sign in again with the new password.');
      try {
        await signOut();
      } catch {}
      return;
    }

    if (shouldRevokeSessions && !result.revoke_supported) {
      showToast('Shared password updated. Global session revocation is unavailable in this auth environment.');
      return;
    }

    showToast('Shared password updated');
  }, [
    canManageFriendsAndFamilyAccess,
    operatorInfo?.revoke_sessions_supported,
    resetSharedAccountForm,
    revokeSharedSessions,
    rotateSharedAccountPassword,
    router,
    refreshAccessState,
    sharedPassword,
    sharedPasswordConfirm,
    showToast,
    signOut,
  ]);

  const saveRisk = async () => {
    if (!activeTrip) return;
    await riskScoreStore.upsert(activeTrip.id, riskFields);
    refreshActiveTrip();
    showToast('Risk assessment saved');
  };

  const addLog = async () => {
    if (!activeTrip) return;
    await fuelWaterLogStore.create({
      trip_id: activeTrip.id,
      log_date: logDate,
      fuel_remaining_gal: logFuel ? parseFloat(logFuel) : null,
      water_remaining_gal: logWater ? parseFloat(logWater) : null,
      notes: logNotes || null,
    });
    setLogFuel('');
    setLogWater('');
    setLogNotes('');
    refreshActiveTrip();
    showToast('Log entry added');
  };

  const deleteLog = async (id: string) => {
    await fuelWaterLogStore.softDelete(id);
    refreshActiveTrip();
    showToast('Log deleted');
  };

  const saveSettings = async () => {
    const s: UserSettings = {
      user_id: 'local',
      ...settingsFields,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await userSettingsStore.save(s);
    refreshActiveTrip();
    showToast('Settings saved');
  };

  const riskLabels = [
    { key: 'terrain_complexity', label: 'Terrain Complexity', icon: 'trail-sign-outline' as const },
    { key: 'weather_exposure', label: 'Weather Exposure', icon: 'thunderstorm-outline' as const },
    { key: 'remoteness', label: 'Remoteness', icon: 'locate-outline' as const },
    { key: 'recovery_availability', label: 'Recovery Availability', icon: 'construct-outline' as const },
    { key: 'comms_coverage', label: 'Comms Coverage', icon: 'radio-outline' as const },
  ];
  const riskWeights = [0.25, 0.20, 0.20, 0.15, 0.20];

  const renderSlider = (item: typeof riskLabels[0], index: number) => {
    const val = (riskFields as any)[item.key] as number;
    return (
      <View key={item.key} style={styles.sliderGroup}>
        <View style={styles.sliderHeader}>
          <Ionicons name={item.icon} size={16} color={colors.gold} />
          <Text style={[styles.sliderLabel, { color: colors.textPrimary }]}>{item.label}</Text>
          <Text style={[styles.sliderWeight, { color: colors.textMuted }]}>w: {riskWeights[index]}</Text>
        </View>
        <View style={styles.sliderRow}>
          {[1, 2, 3, 4, 5].map(v => (
            <TouchableOpacity
              key={v}
              style={[styles.sliderBtn, { backgroundColor: colors.bgCard, borderColor: colors.border }, val === v && { borderColor: 'transparent', backgroundColor: v <= 2 ? colors.success : v <= 3 ? colors.warning : colors.danger }]}
              onPress={() => setRiskFields(prev => ({ ...prev, [item.key]: v }))}
            >
              <Text style={[styles.sliderBtnText, { color: colors.textSecondary }, val === v && styles.sliderBtnTextActive]}>{v}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  // Manifest data
  const activeMode = activeTrip?.active_mode || 'Trip';
  const activeItems = activeTrip ? getActiveItems(loadItems, activeMode) : [];
  const allItems = loadItems;
  const manifestItems = manifestShowAll ? allItems : activeItems;
  const packStats = activeTrip ? getPackingStats(loadItems, activeMode) : { totalActive: 0, packedActive: 0, pct: 0 };
  const allPackedCount = allItems.filter(i => i.packed).length;

  const printManifest = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const items = manifestItems.map(i =>
        `${i.packed ? '[X]' : '[ ]'} ${i.name} | Zone: ${i.zone} | Qty: ${i.qty} | Mode: ${i.mode}${i.weight_lbs ? ` | ${i.weight_lbs}lb` : ''}${i.notes ? ` | ${i.notes}` : ''}`
      ).join('\n');
      const manifest = `
EXPEDITION COMMAND SYSTEM - MANIFEST
=====================================
Trip: ${activeTrip?.name || 'N/A'}
Dates: ${activeTrip?.start_date || '?'} to ${activeTrip?.end_date || '?'}
Active Mode: ${activeMode}
Filter: ${manifestShowAll ? 'ALL ITEMS' : `ACTIVE ONLY (${activeMode})`}
Items: ${manifestItems.length} shown | ${manifestItems.filter(i => i.packed).length} packed
=====================================


Generated: ${new Date().toISOString()}
Expedition Command System
      `;

      const w = window.open('', '_blank');
      if (w) {
        w.document.write(`<pre style="font-family:monospace;font-size:12px;background:#000;color:#d4af37;padding:20px;">${manifest}</pre>`);
        w.document.close();
        w.print();
      }
    } else {
      showToast('Print available on web');
    }
  };

  const noTrip = !activeTrip;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Header onAuthPress={() => setAuthVisible(true)} />

      {/* Sub-tab navigation */}
      <View style={[styles.subTabs, { backgroundColor: colors.bgCard, borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subTabsScroll}>
          {([
            { key: 'risk' as SubTab, label: 'Risk', icon: 'shield-outline' as const },
            { key: 'logs' as SubTab, label: 'Logs', icon: 'document-text-outline' as const },
            { key: 'manifest' as SubTab, label: 'Manifest', icon: 'print-outline' as const },
            { key: 'templates' as SubTab, label: 'Templates', icon: 'bookmark-outline' as const },
            { key: 'sync' as SubTab, label: 'Sync', icon: 'sync-outline' as const },
            { key: 'storage' as SubTab, label: 'Storage', icon: 'server-outline' as const },
            { key: 'offline-data' as SubTab, label: 'Offline Data', icon: 'cloud-download-outline' as const },
            { key: 'rate-limits' as SubTab, label: 'Rate Limits', icon: 'speedometer-outline' as const },
            ...(hasAdminAccess
              ? [{ key: 'stability' as SubTab, label: 'Stability', icon: 'pulse-outline' as const }]
              : []),
            { key: 'settings' as SubTab, label: 'Settings', icon: 'settings-outline' as const },
          ]).map(tab => (

            <TouchableOpacity
              key={tab.key}
              style={[styles.subTab, subTab === tab.key && { borderBottomWidth: 2, borderBottomColor: colors.gold }]}
              onPress={() => setSubTab(tab.key)}
            >
              <Ionicons name={tab.icon} size={14} color={subTab === tab.key ? colors.gold : colors.textMuted} />
              <Text style={[styles.subTabText, { color: subTab === tab.key ? colors.gold : colors.textMuted }]}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {subTab === 'rate-limits' ? (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Rate Limit Maintenance</Text>
            <RateLimitCleanupPanel onToast={showToast} />
          </>
        ) : subTab === 'templates' ? (
          <TemplateManager userId={user?.id || null} onToast={showToast} />
        ) : subTab === 'sync' ? (
          <SyncQueueManager />
        ) : subTab === 'storage' ? (
          <StorageCleanupSettings onToast={showToast} />
        ) : subTab === 'offline-data' ? (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Offline Expedition Data</Text>
            <OfflineExpeditionDataPanel onToast={showToast} />
          </>
        ) : subTab === 'stability' && hasAdminAccess ? (
          <EcsIssueIntelligencePanel colors={colors} onToast={showToast} />
        ) : noTrip && subTab !== 'settings' ? (
          <View style={styles.emptyState}>
            <Ionicons name="alert-circle-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No Active Trip</Text>
          </View>

        ) : subTab === 'risk' ? (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Risk Assessment Matrix</Text>

            {/* Risk Score Display */}
            <View style={[styles.riskBadge, { backgroundColor: `${getRiskColor(risk.level)}15`, borderColor: `${getRiskColor(risk.level)}40` }]}>
              <Text style={[styles.riskScore, { color: getRiskColor(risk.level) }]}>{risk.score.toFixed(2)}</Text>
              <Text style={[styles.riskLevel, { color: getRiskColor(risk.level) }]}>{risk.level}</Text>
            </View>

            {riskLabels.map((item, idx) => renderSlider(item, idx))}

            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.gold }]} onPress={saveRisk}>
              <Ionicons name="save-outline" size={18} color="#000" />
              <Text style={styles.saveBtnText}>Save Risk Assessment</Text>
            </TouchableOpacity>
          </>
        ) : subTab === 'logs' ? (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Fuel & Water Log</Text>

            {/* Add Log Form */}
            <View style={[styles.logForm, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
              <View style={styles.row}>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Date</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.bgInput, borderColor: colors.border, color: colors.textPrimary }]}
                    value={logDate}
                    onChangeText={setLogDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
              </View>
              <View style={styles.row}>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Fuel Remaining (gal)</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.bgInput, borderColor: colors.border, color: colors.textPrimary }]}
                    value={logFuel}
                    onChangeText={setLogFuel}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Water Remaining (gal)</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.bgInput, borderColor: colors.border, color: colors.textPrimary }]}
                    value={logWater}
                    onChangeText={setLogWater}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Notes</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.bgInput, borderColor: colors.border, color: colors.textPrimary }]}
                  value={logNotes}
                  onChangeText={setLogNotes}
                  placeholder="Optional notes..."
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.gold }]} onPress={addLog}>
                <Ionicons name="add-circle" size={18} color="#000" />
                <Text style={styles.saveBtnText}>Add Log Entry</Text>
              </TouchableOpacity>
            </View>

            {/* Log List */}
            {fuelWaterLogs.map(log => (
              <View key={log.id} style={[styles.logCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                <View style={styles.logHeader}>
                  <Text style={[styles.logDate, { color: colors.gold }]}>{log.log_date}</Text>
                  <TouchableOpacity onPress={() => deleteLog(log.id)}>
                    <Ionicons name="trash-outline" size={16} color={colors.danger} />
                  </TouchableOpacity>
                </View>
                <View style={styles.logValues}>
                  {log.fuel_remaining_gal != null && (
                    <View style={styles.logValue}>
                      <Ionicons name="flame-outline" size={14} color={colors.warning} />
                      <Text style={[styles.logValueText, { color: colors.textPrimary }]}>{log.fuel_remaining_gal} gal fuel</Text>
                    </View>
                  )}
                  {log.water_remaining_gal != null && (
                    <View style={styles.logValue}>
                      <Ionicons name="water-outline" size={14} color={colors.info} />
                      <Text style={[styles.logValueText, { color: colors.textPrimary }]}>{log.water_remaining_gal} gal water</Text>
                    </View>
                  )}
                </View>
                {log.notes && <Text style={[styles.logNotes, { color: colors.textMuted }]}>{log.notes}</Text>}
              </View>
            ))}

            {fuelWaterLogs.length === 0 && (
              <View style={styles.emptyItems}>
                <Text style={[styles.emptyItemsText, { color: colors.textMuted }]}>No log entries yet</Text>
              </View>
            )}
          </>
        ) : subTab === 'manifest' ? (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Printable Manifest</Text>

            <View style={[styles.manifestHeader, { backgroundColor: colors.bgCard, borderColor: colors.goldBorder }]}>
              <Text style={[styles.manifestBrand, { color: colors.textMuted }]}>EXPEDITION COMMAND SYSTEM</Text>

              <Text style={[styles.manifestTrip, { color: colors.gold }]}>{activeTrip?.name}</Text>
              <Text style={[styles.manifestMeta, { color: colors.textSecondary }]}>
                {activeTrip?.start_date || '?'} to {activeTrip?.end_date || '?'}
              </Text>

              <View style={[styles.manifestModeBadge, { backgroundColor: colors.goldMuted, borderColor: colors.goldBorder }]}>
                <Ionicons name="flash" size={12} color={colors.gold} />
                <Text style={[styles.manifestModeText, { color: colors.gold }]}>Active Mode: {activeMode}</Text>
              </View>

              <Text style={[styles.manifestStats, { color: colors.textPrimary }]}>
                {manifestShowAll
                  ? `${allItems.length} total items | ${allPackedCount} packed`
                  : `${packStats.totalActive} active items | ${packStats.packedActive} packed (${packStats.pct}%)`
                }
              </Text>

              {!manifestShowAll && packStats.pct < 70 && packStats.totalActive > 0 && (
                <View style={styles.manifestAlert}>
                  <Ionicons name="alert-circle" size={14} color={colors.danger} />
                  <Text style={[styles.manifestAlertText, { color: colors.danger }]}>Active Packed at {packStats.pct}% — below 70% threshold</Text>
                </View>
              )}
            </View>

            <View style={styles.manifestToggleRow}>
              <TouchableOpacity
                style={[styles.manifestToggle, { borderColor: colors.border, backgroundColor: colors.bgCard }, !manifestShowAll && { borderColor: colors.goldBorder, backgroundColor: colors.goldMuted }]}
                onPress={() => setManifestShowAll(false)}
              >
                <Ionicons name="flash" size={14} color={!manifestShowAll ? colors.gold : colors.textMuted} />
                <Text style={[styles.manifestToggleText, { color: !manifestShowAll ? colors.gold : colors.textMuted }]}>
                  Active ({activeMode})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.manifestToggle, { borderColor: colors.border, backgroundColor: colors.bgCard }, manifestShowAll && { borderColor: colors.goldBorder, backgroundColor: colors.goldMuted }]}
                onPress={() => setManifestShowAll(true)}
              >
                <Ionicons name="list" size={14} color={manifestShowAll ? colors.gold : colors.textMuted} />
                <Text style={[styles.manifestToggleText, { color: manifestShowAll ? colors.gold : colors.textMuted }]}>
                  All Items
                </Text>
              </TouchableOpacity>
            </View>

            {ZONES.map(zone => {
              const zoneItems = manifestItems.filter(i => i.zone === zone);
              if (zoneItems.length === 0) return null;
              const zonePacked = zoneItems.filter(i => i.packed).length;
              return (
                <View key={zone} style={styles.manifestZone}>
                  <View style={[styles.manifestZoneHeader, { borderBottomColor: colors.goldBorder }]}>
                    <Text style={[styles.manifestZoneTitle, { color: colors.gold }]}>{zone} ({zoneItems.length})</Text>
                    <Text style={[styles.manifestZonePacked, {
                      color: zonePacked === zoneItems.length ? colors.success : colors.textMuted,
                    }]}>{zonePacked}/{zoneItems.length} packed</Text>
                  </View>
                  {zoneItems.map(item => {
                    const isActive = item.mode === activeMode || item.mode === 'Both';
                    return (
                      <View key={item.id} style={[styles.manifestItem, { borderBottomColor: colors.border }, !isActive && manifestShowAll && { opacity: 0.4 }]}>
                        <Ionicons
                          name={item.packed ? 'checkbox' : 'square-outline'}
                          size={16}
                          color={item.packed ? colors.success : colors.textMuted}
                        />
                        <Text style={[styles.manifestItemName, { color: colors.textPrimary }, item.packed && { color: colors.success }]}>{item.name}</Text>
                        <Text style={[styles.manifestItemQty, { color: colors.textMuted }]}>x{item.qty}</Text>
                        {item.weight_lbs != null && item.weight_lbs > 0 && (
                          <Text style={[styles.manifestItemWeight, { color: colors.textMuted }]}>{item.weight_lbs}lb</Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              );
            })}

            {manifestItems.length === 0 && (
              <View style={styles.emptyItems}>
                <Text style={[styles.emptyItemsText, { color: colors.textMuted }]}>No items to show</Text>
              </View>
            )}

            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.gold }]} onPress={printManifest}>
              <Ionicons name="print-outline" size={18} color="#000" />
              <Text style={styles.saveBtnText}>Print / Export PDF</Text>
            </TouchableOpacity>
          </>
        ) : subTab === 'settings' ? (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Settings</Text>

            {/* ═══════════ DISPLAY / APPEARANCE SECTION ═══════════ */}
            <Text style={[styles.sectionLabel, { color: colors.gold, borderBottomColor: colors.goldBorder }]}>DISPLAY</Text>

            <View style={[styles.displayCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
              {/* Current Theme */}
              <View style={styles.displayRow}>
                <Ionicons name="color-palette-outline" size={16} color={palette.amber} />
                <Text style={[styles.displayLabel, { color: colors.textPrimary }]}>Theme</Text>
                <Text style={[styles.displayValue, { color: palette.amber }]}>{effectiveTheme.toUpperCase()}</Text>
              </View>

              {/* Mode Selector */}
              <View style={styles.modeSelector}>
                {(['auto', 'dark', 'light', 'driving'] as AppearanceMode[]).map(mode => {
                  const cfg = MODE_LABELS[mode];
                  const isActive = appearanceMode === mode;
                  return (
                    <TouchableOpacity
                      key={mode}
                      style={[
                        styles.modePill,
                        {
                          backgroundColor: isActive ? cfg.color + '15' : colors.bgInput,
                          borderColor: isActive ? cfg.color + '50' : colors.border,
                        },
                      ]}
                      onPress={() => setAppearanceMode(mode)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name={cfg.icon} size={14} color={isActive ? cfg.color : colors.textMuted} />
                      <Text style={[styles.modePillText, { color: isActive ? cfg.color : colors.textMuted }]}>{cfg.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Auto-Driving Toggle */}
              <View style={[styles.autoToggleRow, { borderTopColor: colors.border }]}>
                <Ionicons name="speedometer-outline" size={14} color={palette.amber} />
                <Text style={[styles.autoToggleLabel, { color: colors.textPrimary }]}>Auto-enable Driving when moving</Text>
                <Switch
                  value={autoDrivingEnabled}
                  onValueChange={setAutoDrivingEnabled}
                  trackColor={{ false: 'rgba(255,255,255,0.08)', true: palette.amber + '40' }}
                  thumbColor={autoDrivingEnabled ? palette.amber : colors.textMuted}
                  style={{ transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }] }}
                />
              </View>

              {isAutoDrivingActive && (
                <View style={[styles.autoActiveBanner, { backgroundColor: '#50A050' + '10', borderColor: '#50A050' + '30' }]}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#50A050' }} />
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#50A050' }}>Driving Mode active (auto-detected)</Text>
                </View>
              )}

              {/* Open Full Settings */}
              <TouchableOpacity
                style={[styles.openFullBtn, { borderColor: palette.amber + '30' }]}
                onPress={() => setAppearanceModalVisible(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="options-outline" size={14} color={palette.amber} />
                <Text style={[styles.openFullBtnText, { color: palette.amber }]}>ADVANCED DISPLAY SETTINGS</Text>
              </TouchableOpacity>
            </View>

            {/* ═══════════ POWER SYSTEMS SECTION ═══════════ */}
            <Text style={[styles.sectionLabel, { color: colors.gold, borderBottomColor: colors.goldBorder }]}>POWER SYSTEMS</Text>
            <TouchableOpacity
              style={[styles.powerCenterBtn, { backgroundColor: colors.bgCard, borderColor: colors.goldBorder }]}
              onPress={() => router.push('/power' as any)}
              activeOpacity={0.7}
            >
              <View style={[styles.powerCenterIcon, { backgroundColor: colors.goldMuted }]}>
                <Ionicons name="flash" size={20} color={colors.gold} />
              </View>
              <View style={styles.powerCenterInfo}>
                <Text style={[styles.powerCenterTitle, { color: colors.textPrimary }]}>Power Center</Text>
                <Text style={[styles.powerCenterDesc, { color: colors.textMuted }]}>Live telemetry, provider status, device management</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.gold} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.powerCenterBtn, { backgroundColor: colors.bgCard, borderColor: colors.goldBorder }]}
              onPress={() => router.push('/power/blu' as any)}
              activeOpacity={0.7}
            >
              <View style={[styles.powerCenterIcon, { backgroundColor: colors.goldMuted }]}>
                <Ionicons name="git-network-outline" size={20} color={colors.gold} />
              </View>
              <View style={styles.powerCenterInfo}>
                <Text style={[styles.powerCenterTitle, { color: colors.textPrimary }]}>BLU Power Sources</Text>
                <Text style={[styles.powerCenterDesc, { color: colors.textMuted }]}>Universal power telemetry — manage providers and devices</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.gold} />
            </TouchableOpacity>

            {/* ═══════════ VEHICLE TELEMETRY SECTION ═══════════ */}
            <Text style={[styles.sectionLabel, { color: colors.gold, borderBottomColor: colors.goldBorder }]}>VEHICLE TELEMETRY</Text>
            <TouchableOpacity
              style={[styles.powerCenterBtn, { backgroundColor: colors.bgCard, borderColor: colors.goldBorder }]}
              onPress={() => router.push('/vehicle-telemetry-settings' as any)}
              activeOpacity={0.7}
            >
              <View style={[styles.powerCenterIcon, { backgroundColor: colors.goldMuted }]}>
                <Ionicons name="speedometer-outline" size={20} color={colors.gold} />
              </View>
              <View style={styles.powerCenterInfo}>
                <Text style={[styles.powerCenterTitle, { color: colors.textPrimary }]}>Vehicle Telemetry</Text>
                <Text style={[styles.powerCenterDesc, { color: colors.textMuted }]}>OBD-II, TPMS, and vehicle sensor integrations</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.gold} />
            </TouchableOpacity>

            {/* ═══════════ AI EXPEDITION ASSISTANT SECTION ═══════════ */}
            <Text style={[styles.sectionLabel, { color: colors.gold, borderBottomColor: colors.goldBorder }]}>ECS ASSISTANT</Text>
            <TouchableOpacity
              style={[styles.powerCenterBtn, { backgroundColor: colors.bgCard, borderColor: colors.goldBorder }]}
              onPress={() => router.push('/assistant' as any)}
              activeOpacity={0.7}
            >
              <View style={[styles.powerCenterIcon, { backgroundColor: 'rgba(212,160,23,0.12)' }]}>
                <Ionicons name="shield-outline" size={20} color={colors.gold} />
              </View>
              <View style={styles.powerCenterInfo}>
                <Text style={[styles.powerCenterTitle, { color: colors.textPrimary }]}>ECS Expedition Assistant</Text>
                <Text style={[styles.powerCenterDesc, { color: colors.textMuted }]}>Context-aware expedition guidance using ECS systems</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.gold} />
            </TouchableOpacity>

            <Text style={[styles.sectionLabel, { color: colors.gold, borderBottomColor: colors.goldBorder }]}>ACCOUNT ACCESS</Text>
            <View style={[styles.subscriptionCard, { backgroundColor: colors.bgCard, borderColor: colors.goldBorder }]}>
              <View style={styles.subscriptionHeader}>
                <View style={[styles.subscriptionIcon, { backgroundColor: colors.goldMuted }]}>
                  <Ionicons name="diamond-outline" size={18} color={colors.gold} />
                </View>
                <View style={styles.subscriptionInfo}>
                  <Text style={[styles.subscriptionTitle, { color: colors.textPrimary }]}>{accountUx.title}</Text>
                  <Text style={[styles.subscriptionSubtitle, { color: colors.textMuted }]}>
                    {accountUx.subtitle}
                  </Text>
                </View>
              </View>

              <View style={styles.subscriptionBadgeRow}>
                <View
                  style={[
                    styles.opBadge,
                    {
                      borderColor:
                        accountUx.tone === 'positive'
                          ? colors.success
                          : accountUx.tone === 'warning'
                            ? colors.warning
                            : accountUx.tone === 'danger'
                              ? colors.danger
                              : colors.goldBorder,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.opBadgeText,
                      {
                        color:
                          accountUx.tone === 'positive'
                            ? colors.success
                            : accountUx.tone === 'warning'
                              ? colors.warning
                              : accountUx.tone === 'danger'
                                ? colors.danger
                                : colors.gold,
                      },
                    ]}
                  >
                    {accountUx.badgeLabel}
                  </Text>
                </View>
                {operatorInfo?.is_shared_account ? (
                  <View style={[styles.opBadge, { borderColor: colors.goldBorder }]}>
                    <Text style={[styles.opBadgeText, { color: colors.gold }]}>FRIENDS & FAMILY</Text>
                  </View>
                ) : null}
                {operatorInfo?.is_admin ? (
                  <View style={[styles.opBadge, { borderColor: colors.warning }]}>
                    <Text style={[styles.opBadgeText, { color: colors.warning }]}>ADMIN</Text>
                  </View>
                ) : null}
              </View>

              <View style={[styles.subscriptionFacts, { borderColor: colors.border }]}>
                <SubscriptionFactRow label="Account" value={accountUx.title} colors={colors} />
                <SubscriptionFactRow label="Status" value={accountUx.stateLabel} colors={colors} />
                <SubscriptionFactRow label="Access Source" value={resolvedAccess.sourceLabel} colors={colors} />
                <SubscriptionFactRow label={accountUx.renewalLabel} value={accountUx.renewalValue} colors={colors} />
                <SubscriptionFactRow label={accountUx.billingLabel} value={accountUx.billingValue} colors={colors} />
                <SubscriptionFactRow label="Last Verified" value={accountUx.lastVerifiedLabel} colors={colors} />
              </View>

              {purchaseStatusText ? (
                <Text style={[styles.subscriptionStatusText, { color: billingFlowState === 'restore_failed' ? colors.danger : colors.textSecondary }]}>
                  {purchaseStatusText}
                </Text>
              ) : null}

              {billingError ? (
                <Text style={[styles.subscriptionErrorText, { color: colors.danger }]}>{billingError}</Text>
              ) : null}

              {!user ? (
                <Text style={[styles.subscriptionNote, { color: colors.textMuted }]}>
                  Sign in to verify, restore, or manage ECS access for this account.
                </Text>
              ) : canPurchasePro ? (
                <View style={styles.subscriptionActionRow}>
                  <TouchableOpacity
                    style={[
                      styles.subscriptionPrimaryBtn,
                      { backgroundColor: billingFlowState === 'purchasing' || billingFlowState === 'confirming_access' ? colors.goldMuted : colors.gold },
                    ]}
                    onPress={async () => {
                      const result = await purchaseEcsProMonthly();
                      if (result.success) {
                        showToast('ECS Pro access confirmed');
                      } else if (result.cancelled) {
                        showToast('Purchase cancelled');
                      } else if (result.pending) {
                        showToast(result.error || 'Purchase is pending confirmation');
                      } else if (result.error) {
                        showToast(result.error);
                      }
                    }}
                    disabled={billingFlowState === 'purchasing' || billingFlowState === 'confirming_access' || billingFlowState === 'restore_in_progress'}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="card-outline" size={16} color="#000" />
                    <Text style={styles.subscriptionPrimaryBtnText}>
                      {ecsProProduct?.priceLabel ? `START PRO - ${ecsProProduct.priceLabel.toUpperCase()}` : 'START PRO'}
                    </Text>
                  </TouchableOpacity>

                  {showBillingRestore ? (
                    <TouchableOpacity
                      style={[styles.subscriptionSecondaryBtn, { borderColor: colors.border, backgroundColor: colors.bgInput }]}
                      onPress={async () => {
                        const result = await restoreEcsProAccess();
                        showToast(result.success ? 'Purchases restored' : (result.error || 'Restore failed'));
                      }}
                      disabled={billingFlowState === 'restore_in_progress' || billingFlowState === 'purchasing' || billingFlowState === 'confirming_access'}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="refresh-outline" size={16} color={colors.textPrimary} />
                      <Text style={[styles.subscriptionSecondaryBtnText, { color: colors.textPrimary }]}>RESTORE PURCHASES</Text>
                    </TouchableOpacity>
                  ) : null}

                  {showManageSubscription ? (
                    <TouchableOpacity
                      style={[styles.subscriptionSecondaryBtn, { borderColor: colors.border, backgroundColor: colors.bgInput }]}
                      onPress={async () => {
                        const ok = await openManageSubscription();
                        if (!ok) showToast('Unable to open subscription management on this device.');
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="open-outline" size={16} color={colors.textPrimary} />
                      <Text style={[styles.subscriptionSecondaryBtnText, { color: colors.textPrimary }]}>MANAGE SUBSCRIPTION</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : showBillingRestore || showManageSubscription || showRefreshAccess ? (
                <View style={styles.subscriptionActionRow}>
                  {showRefreshAccess ? (
                    <TouchableOpacity
                      style={[styles.subscriptionPrimaryBtn, { backgroundColor: colors.gold }]}
                      onPress={async () => {
                        const refreshed = await refreshAccessState();
                        showToast(refreshed ? 'Access refreshed' : 'Access refresh unavailable');
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="sync-outline" size={16} color="#000" />
                      <Text style={styles.subscriptionPrimaryBtnText}>REFRESH ACCESS</Text>
                    </TouchableOpacity>
                  ) : null}

                  {showBillingRestore ? (
                    <TouchableOpacity
                      style={[styles.subscriptionSecondaryBtn, { borderColor: colors.border, backgroundColor: colors.bgInput }]}
                      onPress={async () => {
                        const result = await restoreEcsProAccess();
                        showToast(result.success ? 'Purchases restored' : (result.error || 'Restore failed'));
                      }}
                      disabled={billingFlowState === 'restore_in_progress' || billingFlowState === 'purchasing' || billingFlowState === 'confirming_access'}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="refresh-outline" size={16} color={colors.textPrimary} />
                      <Text style={[styles.subscriptionSecondaryBtnText, { color: colors.textPrimary }]}>RESTORE PURCHASES</Text>
                    </TouchableOpacity>
                  ) : null}

                  {showManageSubscription ? (
                    <TouchableOpacity
                      style={[styles.subscriptionSecondaryBtn, { borderColor: colors.border, backgroundColor: colors.bgInput }]}
                      onPress={async () => {
                        const ok = await openManageSubscription();
                        if (!ok) showToast('Unable to open subscription management on this device.');
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="open-outline" size={16} color={colors.textPrimary} />
                      <Text style={[styles.subscriptionSecondaryBtnText, { color: colors.textPrimary }]}>MANAGE SUBSCRIPTION</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : (
                <Text style={[styles.subscriptionNote, { color: colors.textMuted }]}>
                  {accountUx.detail}
                </Text>
              )}

              <Text style={[styles.subscriptionNote, { color: colors.textMuted }]}>
                {accountUx.footnote}
              </Text>
            </View>

            {/* Operator Status Card */}

            {user && (
              <>
                <Text style={[styles.sectionLabel, { color: colors.gold, borderBottomColor: colors.goldBorder }]}>OPERATOR STATUS</Text>
                <View style={[styles.operatorCard, { backgroundColor: colors.bgCard, borderColor: colors.goldBorder }]}>
                  <View style={styles.operatorRow}>
                    <Ionicons name="person-circle" size={36} color={colors.gold} />
                    <View style={styles.operatorDetails}>
                      <Text style={[styles.operatorEmail, { color: colors.textPrimary }]}>{user.email}</Text>
                      <View style={styles.operatorBadges}>
                        {operatorInfo?.role && (
                          <View style={[styles.opBadge, { borderColor: operatorInfo.is_admin ? colors.warning : colors.success }]}>
                            <Text style={[styles.opBadgeText, { color: operatorInfo.is_admin ? colors.warning : colors.success }]}>
                              {operatorInfo.role.toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <View style={[styles.opBadge, { borderColor: colors.success }]}>
                          <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.success }} />
                          <Text style={[styles.opBadgeText, { color: colors.success }]}>
                            {operatorInfo?.status?.toUpperCase() || 'ACTIVE'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                  {isFriendsAndFamilyAccess ? (
                    <View style={[styles.sharedAccountPanel, { backgroundColor: colors.bgInput, borderColor: colors.border }]}>
                      <Text style={[styles.sharedAccountTitle, { color: colors.textPrimary }]}>Friends & Family Access</Text>
                      <Text style={[styles.sharedAccountText, { color: colors.textMuted }]}>
                        This account keeps the full ECS user experience through a granted access path. Admin utilities remain locked out.
                      </Text>
                      <View style={styles.sharedAccountBadgeRow}>
                        <View style={[styles.opBadge, { borderColor: colors.success }]}>
                          <Text style={[styles.opBadgeText, { color: colors.success }]}>FULL ACCESS</Text>
                        </View>
                        <View style={[styles.opBadge, { borderColor: colors.goldBorder }]}>
                          <Text style={[styles.opBadgeText, { color: colors.gold }]}>SHARED INTERNAL ACCOUNT</Text>
                        </View>
                        <View style={[styles.opBadge, { borderColor: colors.goldBorder }]}>
                          <Text style={[styles.opBadgeText, { color: colors.gold }]}>FRIENDS & FAMILY</Text>
                        </View>
                        <View style={[styles.opBadge, { borderColor: colors.warning }]}>
                          <Text style={[styles.opBadgeText, { color: colors.warning }]}>NO ADMIN RIGHTS</Text>
                        </View>
                      </View>
                      <View style={[styles.subscriptionFacts, { borderColor: colors.border, backgroundColor: colors.bgCard }]}>
                        <SubscriptionFactRow label="Access" value="Full Access" colors={colors} />
                        <SubscriptionFactRow label="Role" value={operatorInfo?.role === 'super_admin' ? 'Super Admin' : 'User'} colors={colors} />
                        <SubscriptionFactRow label="Admin" value="No" colors={colors} />
                      </View>
                      {canManageFriendsAndFamilyAccess ? (
                        <TouchableOpacity
                          style={[styles.sharedAccountActionBtn, { backgroundColor: colors.goldMuted, borderColor: colors.goldBorder }]}
                          onPress={() => {
                            setSharedAccountError('');
                            setSharedAccountModalVisible(true);
                          }}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="key-outline" size={16} color={colors.gold} />
                          <Text style={[styles.sharedAccountActionText, { color: colors.gold }]}>MANAGE FRIENDS & FAMILY ACCESS</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ) : null}
                  <TouchableOpacity
                    style={[styles.logoutBtn, { backgroundColor: colors.danger }]}
                    testID="auth-sign-out-button"
                    accessibilityRole="button"
                    accessibilityLabel="Terminate Session"
                    accessibilityHint="Signs out of the current ECS account and returns to login"
                    onPress={async () => {
                      await signOut();
                      showToast('Session terminated');
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="log-out-outline" size={16} color="#fff" />
                    <Text style={styles.logoutBtnText}>TERMINATE SESSION</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            <Text style={[styles.sectionLabel, { color: colors.gold, borderBottomColor: colors.goldBorder }]}>ROOF WEIGHT THRESHOLDS</Text>
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Roof Load Threshold (lbs)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.bgInput, borderColor: colors.border, color: colors.textPrimary }]}
                value={String(settingsFields.roof_load_threshold_lbs)}
                onChangeText={v => setSettingsFields(p => ({ ...p, roof_load_threshold_lbs: parseFloat(v) || 250 }))}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.row}>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Roof Share Warn</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.bgInput, borderColor: colors.border, color: colors.textPrimary }]}
                  value={String(settingsFields.roof_share_warn)}
                  onChangeText={v => setSettingsFields(p => ({ ...p, roof_share_warn: parseFloat(v) || 0.12 }))}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Roof Share Alert</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.bgInput, borderColor: colors.border, color: colors.textPrimary }]}
                  value={String(settingsFields.roof_share_alert)}
                  onChangeText={v => setSettingsFields(p => ({ ...p, roof_share_alert: parseFloat(v) || 0.18 }))}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.gold }]} onPress={saveSettings}>
              <Ionicons name="save-outline" size={18} color="#000" />
              <Text style={styles.saveBtnText}>Save Settings</Text>
            </TouchableOpacity>

            <Text style={[styles.sectionLabel, { color: colors.gold, borderBottomColor: colors.goldBorder }]}>FIELD FEEDBACK</Text>
            <View style={[styles.feedbackCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
              <View style={styles.feedbackHeader}>
                <View style={[styles.feedbackIcon, { backgroundColor: colors.goldMuted }]}>
                  <Ionicons name="bug-outline" size={18} color={colors.gold} />
                </View>
                <View style={styles.feedbackInfo}>
                  <Text style={[styles.feedbackTitle, { color: colors.textPrimary }]}>Report Field Issue</Text>
                  <Text style={[styles.feedbackText, { color: colors.textMuted }]}>
                    Send a short structured report from the current ECS state so admin stability summaries can group real field failures.
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.feedbackAction, { borderColor: colors.goldBorder, backgroundColor: colors.goldMuted }]}
                onPress={() => setFieldIssueModalVisible(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="send-outline" size={16} color={colors.gold} />
                <Text style={[styles.feedbackActionText, { color: colors.gold }]}>SEND FIELD REPORT</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.aboutSection, { borderTopColor: colors.border }]}>
              <Text style={[styles.aboutBrand, { color: colors.textMuted }]}>EXPEDITION COMMAND SYSTEM</Text>
              <Text style={[styles.aboutProduct, { color: colors.gold }]}>Expedition Command System</Text>
              <Text style={[styles.aboutVersion, { color: colors.textMuted }]}>v1.0.0</Text>
              <Text style={[styles.aboutDesc, { color: colors.textSecondary }]}>
                Offline-first expedition planning and packing command system with cloud sync.
                Built for overland expeditions, remote operations, and field deployments.
              </Text>
            </View>

          </>

        ) : null}

        <View style={{ height: 40 }} />
      </ScrollView>

      <AuthModal visible={authVisible} onClose={() => setAuthVisible(false)} />
      <AppearanceSettingsModal visible={appearanceModalVisible} onClose={() => setAppearanceModalVisible(false)} />
      <TacticalPopupShell
        visible={sharedAccountModalVisible}
        onClose={closeSharedAccountModal}
        title="Friends & Family Access"
        icon="key-outline"
        eyebrow="GRANTED ACCESS"
        maxWidth={540}
        footer={(
          <View style={styles.sharedAccountFooter}>
            <TouchableOpacity
              style={[styles.sharedAccountFooterBtn, styles.sharedAccountFooterSecondary, { borderColor: colors.border }]}
              onPress={closeSharedAccountModal}
              activeOpacity={0.7}
              disabled={sharedAccountBusy}
            >
              <Text style={[styles.sharedAccountFooterSecondaryText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.sharedAccountFooterBtn,
                styles.sharedAccountFooterPrimary,
                { backgroundColor: sharedAccountBusy ? colors.goldMuted : colors.gold },
              ]}
              onPress={handleRotateSharedPassword}
              activeOpacity={0.7}
              disabled={sharedAccountBusy}
            >
              <Ionicons name={sharedAccountBusy ? 'sync-outline' : 'refresh-outline'} size={16} color="#000" />
              <Text style={styles.sharedAccountFooterPrimaryText}>
                {sharedAccountBusy ? 'Updating...' : 'Rotate Password'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      >
        <Text style={[styles.sharedAccountModalCopy, { color: colors.textSecondary }]}>
          Rotate the password for the friends and family access account. Full ECS access stays active, and admin tools remain disabled.
        </Text>

        <View style={styles.sharedAccountBadgeRow}>
          <View style={[styles.opBadge, { borderColor: colors.success }]}>
            <Text style={[styles.opBadgeText, { color: colors.success }]}>FULL ACCESS</Text>
          </View>
          <View style={[styles.opBadge, { borderColor: colors.goldBorder }]}>
            <Text style={[styles.opBadgeText, { color: colors.gold }]}>FRIENDS & FAMILY</Text>
          </View>
          <View style={[styles.opBadge, { borderColor: colors.warning }]}>
            <Text style={[styles.opBadgeText, { color: colors.warning }]}>NO ADMIN RIGHTS</Text>
          </View>
        </View>

        <View style={[styles.subscriptionFacts, { borderColor: colors.border, backgroundColor: colors.bgCard }]}>
          <SubscriptionFactRow label="Access" value="Full Access" colors={colors} />
          <SubscriptionFactRow label="Role" value={operatorInfo?.role === 'super_admin' ? 'Super Admin' : 'User'} colors={colors} />
          <SubscriptionFactRow label="Admin" value="No" colors={colors} />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Account</Text>
          <Text style={[styles.sharedAccountEmail, { color: colors.textPrimary }]}>ecs@friendsandfamily.com</Text>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>New Password</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.bgInput, borderColor: colors.border, color: colors.textPrimary }]}
            value={sharedPassword}
            onChangeText={setSharedPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!sharedAccountBusy}
            placeholder="Minimum 8 characters"
            placeholderTextColor={colors.textMuted}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Confirm Password</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.bgInput, borderColor: colors.border, color: colors.textPrimary }]}
            value={sharedPasswordConfirm}
            onChangeText={setSharedPasswordConfirm}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!sharedAccountBusy}
            placeholder="Re-enter the new password"
            placeholderTextColor={colors.textMuted}
          />
        </View>

        {operatorInfo?.revoke_sessions_supported ? (
          <View style={[styles.sharedAccountToggleRow, { borderColor: colors.border, backgroundColor: colors.bgInput }]}>
            <View style={styles.sharedAccountToggleCopy}>
              <Text style={[styles.sharedAccountToggleTitle, { color: colors.textPrimary }]}>Sign out existing sessions</Text>
              <Text style={[styles.sharedAccountToggleText, { color: colors.textMuted }]}>
                Revoke current sessions after the password change and require a fresh sign-in.
              </Text>
            </View>
            <Switch
              value={revokeSharedSessions}
              onValueChange={setRevokeSharedSessions}
              disabled={sharedAccountBusy}
              trackColor={{ false: 'rgba(255,255,255,0.08)', true: colors.gold + '40' }}
              thumbColor={revokeSharedSessions ? colors.gold : colors.textMuted}
              style={{ transform: [{ scaleX: 0.82 }, { scaleY: 0.82 }] }}
            />
          </View>
        ) : (
          <Text style={[styles.sharedAccountNote, { color: colors.textMuted }]}>
            Global session revocation is not available in this auth environment yet.
          </Text>
        )}

        {sharedAccountError ? (
          <Text style={[styles.sharedAccountError, { color: colors.danger }]}>{sharedAccountError}</Text>
        ) : null}
      </TacticalPopupShell>
      <FieldIssueReportModal
        visible={fieldIssueModalVisible}
        onClose={() => setFieldIssueModalVisible(false)}
        colors={colors}
        onToast={showToast}
      />
      <Toast />
    </View>
  );
}


export default function MoreScreen() {
  return (
    <TabErrorBoundary tabName="MORE">
      <MoreScreenInner />
    </TabErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.lg, paddingBottom: 100 },
  subTabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  subTabsScroll: {
    flexDirection: 'row',
  },
  subTab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  subTabText: { fontSize: 11, fontWeight: '600' },

  sectionTitle: { fontSize: 22, fontWeight: '800', marginBottom: SPACING.lg },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
    borderBottomWidth: 1,
    paddingBottom: 6,
  },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 18, fontWeight: '600' },
  // Risk
  riskBadge: {
    alignItems: 'center',
    padding: SPACING.xl,
    borderRadius: RADIUS.lg,
    borderWidth: 2,
    marginBottom: SPACING.xl,
  },
  riskScore: { fontSize: 48, fontWeight: '900', fontFamily: 'Courier' },
  riskLevel: { fontSize: 18, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' },
  sliderGroup: { marginBottom: SPACING.lg },
  sliderHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  sliderLabel: { flex: 1, fontSize: 13, fontWeight: '600' },
  sliderWeight: { fontSize: 10, fontFamily: 'Courier' },
  sliderRow: { flexDirection: 'row', gap: 6 },
  sliderBtn: {
    flex: 1, height: 44, borderRadius: RADIUS.sm,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  sliderBtnText: { fontSize: 18, fontWeight: '800' },
  sliderBtnTextActive: { color: '#fff' },
  // Logs
  logForm: { borderRadius: RADIUS.md, padding: SPACING.lg, borderWidth: 1, marginBottom: SPACING.lg },
  logCard: { borderRadius: RADIUS.sm, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1 },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  logDate: { fontSize: 14, fontWeight: '700', fontFamily: 'Courier' },
  logValues: { flexDirection: 'row', gap: SPACING.lg },
  logValue: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  logValueText: { fontSize: 13, fontWeight: '600' },
  logNotes: { fontSize: 12, fontStyle: 'italic', marginTop: 4 },
  emptyItems: { alignItems: 'center', paddingVertical: 30 },
  emptyItemsText: { fontSize: 14 },
  // Manifest
  manifestHeader: { borderRadius: RADIUS.md, padding: SPACING.lg, borderWidth: 1, marginBottom: SPACING.md, alignItems: 'center' },
  manifestBrand: { fontSize: 9, letterSpacing: 2, fontWeight: '500' },
  manifestTrip: { fontSize: 20, fontWeight: '800', marginTop: 4 },
  manifestMeta: { fontSize: 12, marginTop: 4 },
  manifestModeBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.sm, borderWidth: 1, marginTop: 8 },
  manifestModeText: { fontSize: 11, fontWeight: '700' },
  manifestStats: { fontSize: 13, fontWeight: '600', marginTop: 8 },
  manifestAlert: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, backgroundColor: 'rgba(255,59,48,0.1)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: 'rgba(255,59,48,0.3)' },
  manifestAlertText: { fontSize: 11, fontWeight: '700' },
  manifestToggleRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg },
  manifestToggle: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: RADIUS.sm, borderWidth: 1 },
  manifestToggleText: { fontSize: 12, fontWeight: '600' },
  manifestZone: { marginBottom: SPACING.lg },
  manifestZoneHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, borderBottomWidth: 1, paddingBottom: 4 },
  manifestZoneTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  manifestZonePacked: { fontSize: 11, fontWeight: '600', fontFamily: 'Courier' },
  manifestItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1 },
  manifestItemName: { flex: 1, fontSize: 14, fontWeight: '600' },
  manifestItemQty: { fontSize: 12, fontFamily: 'Courier' },
  manifestItemWeight: { fontSize: 12, fontFamily: 'Courier' },
  // Display / Appearance
  displayCard: { borderRadius: RADIUS.md, padding: SPACING.md, borderWidth: 1, marginBottom: SPACING.lg },
  displayRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  displayLabel: { flex: 1, fontSize: 13, fontWeight: '600' },
  displayValue: { fontSize: 13, fontWeight: '800', letterSpacing: 1 },
  modeSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  modePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5 },
  modePillText: { fontSize: 11, fontWeight: '700' },
  autoToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 12, borderTopWidth: 1 },
  autoToggleLabel: { flex: 1, fontSize: 12, fontWeight: '600' },
  autoActiveBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, padding: 8, borderRadius: 6, borderWidth: 1 },
  openFullBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, paddingVertical: 8, borderRadius: 6, borderWidth: 1 },
  openFullBtnText: { fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  subscriptionCard: { borderRadius: RADIUS.md, padding: SPACING.md, borderWidth: 1, marginBottom: SPACING.lg, gap: 12 },
  subscriptionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  subscriptionIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  subscriptionInfo: { flex: 1, gap: 4 },
  subscriptionTitle: { fontSize: 14, fontWeight: '800', letterSpacing: 0.4 },
  subscriptionSubtitle: { fontSize: 12, lineHeight: 18 },
  subscriptionBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  subscriptionFacts: { borderWidth: 1, borderRadius: RADIUS.sm, padding: SPACING.sm, gap: 8 },
  subscriptionFactRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  subscriptionFactLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  subscriptionFactValue: { fontSize: 12, fontWeight: '700', textAlign: 'right', flexShrink: 1 },
  subscriptionStatusText: { fontSize: 12, fontWeight: '600' },
  subscriptionErrorText: { fontSize: 12, fontWeight: '700' },
  subscriptionNote: { fontSize: 12, lineHeight: 18 },
  subscriptionActionRow: { gap: 10 },
  subscriptionPrimaryBtn: { minHeight: 44, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: SPACING.md },
  subscriptionPrimaryBtnText: { color: '#000', fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  subscriptionSecondaryBtn: { minHeight: 42, borderRadius: RADIUS.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: SPACING.md },
  subscriptionSecondaryBtnText: { fontSize: 12, fontWeight: '800', letterSpacing: 1.1 },
  // Settings
  aboutSection: { marginTop: 32, alignItems: 'center', paddingVertical: SPACING.xl, borderTopWidth: 1 },
  aboutBrand: { fontSize: 10, letterSpacing: 2, fontWeight: '500' },
  aboutProduct: { fontSize: 16, fontWeight: '700', marginTop: 4 },
  aboutVersion: { fontSize: 12, marginTop: 4, fontFamily: 'Courier' },
  aboutDesc: { fontSize: 12, textAlign: 'center', marginTop: 12, lineHeight: 18 },
  // Common
  fieldGroup: { marginBottom: SPACING.md },
  fieldLabel: { fontSize: 11, fontWeight: '600', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { borderWidth: 1, borderRadius: RADIUS.sm, padding: SPACING.sm, fontSize: 15 },
  row: { flexDirection: 'row', gap: SPACING.sm },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: RADIUS.sm, padding: SPACING.md, marginTop: SPACING.lg },
  saveBtnText: { color: '#000', fontSize: 16, fontWeight: '700' },
  // Operator card
  operatorCard: { borderRadius: RADIUS.md, padding: SPACING.lg, borderWidth: 1, marginBottom: SPACING.lg },
  operatorRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  operatorDetails: { flex: 1 },
  operatorEmail: { fontSize: 14, fontWeight: '700' },
  operatorBadges: { flexDirection: 'row', gap: 6, marginTop: 4 },
  opBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, backgroundColor: 'rgba(0,0,0,0.2)' },
  opBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  sharedAccountPanel: { borderRadius: RADIUS.sm, borderWidth: 1, padding: SPACING.md, marginBottom: SPACING.md, gap: 10 },
  sharedAccountTitle: { fontSize: 13, fontWeight: '800', letterSpacing: 0.6 },
  sharedAccountText: { fontSize: 12, lineHeight: 18 },
  sharedAccountBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  sharedAccountActionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10, borderRadius: RADIUS.sm, borderWidth: 1 },
  sharedAccountActionText: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: RADIUS.sm, paddingVertical: 10 },
  logoutBtnText: { color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  sharedAccountModalCopy: { fontSize: 13, lineHeight: 19, marginBottom: SPACING.sm },
  sharedAccountEmail: { fontSize: 14, fontWeight: '700' },
  sharedAccountToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: RADIUS.sm, padding: SPACING.md, marginBottom: SPACING.md },
  sharedAccountToggleCopy: { flex: 1, gap: 4 },
  sharedAccountToggleTitle: { fontSize: 12, fontWeight: '700' },
  sharedAccountToggleText: { fontSize: 11, lineHeight: 16 },
  sharedAccountNote: { fontSize: 11, lineHeight: 16, marginTop: 2 },
  sharedAccountError: { fontSize: 12, fontWeight: '700', marginTop: SPACING.sm },
  sharedAccountFooter: { flexDirection: 'row', gap: 10 },
  sharedAccountFooterBtn: { flex: 1, minHeight: 42, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  sharedAccountFooterSecondary: { borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.02)' },
  sharedAccountFooterSecondaryText: { fontSize: 12, fontWeight: '700' },
  sharedAccountFooterPrimary: {},
  sharedAccountFooterPrimaryText: { color: '#000', fontSize: 12, fontWeight: '800', letterSpacing: 0.8 },
  // Power Center
  powerCenterBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, marginBottom: SPACING.lg },
  powerCenterIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  powerCenterInfo: { flex: 1 },
  powerCenterTitle: { fontSize: 14, fontWeight: '700' },
  powerCenterDesc: { fontSize: 11, marginTop: 2 },
  feedbackCard: { borderRadius: RADIUS.md, padding: SPACING.md, borderWidth: 1, marginBottom: SPACING.lg, gap: 12 },
  feedbackHeader: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  feedbackIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  feedbackInfo: { flex: 1, gap: 4 },
  feedbackTitle: { fontSize: 14, fontWeight: '800' },
  feedbackText: { fontSize: 12, lineHeight: 18 },
  feedbackAction: { minHeight: 42, borderRadius: RADIUS.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  feedbackActionText: { fontSize: 12, fontWeight: '800', letterSpacing: 1 },
});





