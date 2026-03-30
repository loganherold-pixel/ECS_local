import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Platform, Alert, Switch } from 'react-native';
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
import type { AppearanceMode } from '../../lib/appearanceStore';

type SubTab = 'risk' | 'logs' | 'manifest' | 'templates' | 'sync' | 'storage' | 'offline-data' | 'rate-limits' | 'settings';





const MODE_LABELS: Record<AppearanceMode, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  auto: { label: 'Auto', icon: 'contrast-outline', color: '#80C0FF' },
  dark: { label: 'Dark', icon: 'moon-outline', color: '#8A8AFF' },
  light: { label: 'Light', icon: 'sunny-outline', color: '#FFB800' },
  driving: { label: 'Driving (Hi-Vis)', icon: 'car-sport-outline', color: '#E0A030' },
};

function MoreScreenInner() {
  const { activeTrip, loadItems, riskScore, fuelWaterLogs, userSettings, refreshActiveTrip, showToast, user, operatorInfo, signOut } = useApp();
  const { palette, colors, appearanceMode, autoDrivingEnabled, effectiveTheme, isAutoDrivingActive, setAppearanceMode, setAutoDrivingEnabled } = useTheme();
  const router = useRouter();

  const [authVisible, setAuthVisible] = useState(false);
  const [subTab, setSubTab] = useState<SubTab>('risk');
  const [manifestShowAll, setManifestShowAll] = useState(false);
  const [appearanceModalVisible, setAppearanceModalVisible] = useState(false);


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
  }, []));

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
        ) : noTrip && subTab !== 'settings' && subTab !== 'rate-limits' ? (
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
            <Text style={[styles.sectionLabel, { color: colors.gold, borderBottomColor: colors.goldBorder }]}>AI ASSISTANT</Text>
            <TouchableOpacity
              style={[styles.powerCenterBtn, { backgroundColor: colors.bgCard, borderColor: colors.goldBorder }]}
              onPress={() => router.push('/assistant' as any)}
              activeOpacity={0.7}
            >
              <View style={[styles.powerCenterIcon, { backgroundColor: 'rgba(212,160,23,0.12)' }]}>
                <Ionicons name="shield-outline" size={20} color={colors.gold} />
              </View>
              <View style={styles.powerCenterInfo}>
                <Text style={[styles.powerCenterTitle, { color: colors.textPrimary }]}>AI Expedition Assistant</Text>
                <Text style={[styles.powerCenterDesc, { color: colors.textMuted }]}>Context-aware expedition guidance using ECS systems</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.gold} />
            </TouchableOpacity>


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
                          <View style={[styles.opBadge, { borderColor: operatorInfo.role === 'admin' ? colors.warning : colors.success }]}>
                            <Text style={[styles.opBadgeText, { color: operatorInfo.role === 'admin' ? colors.warning : colors.success }]}>
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
                  <TouchableOpacity
                    style={[styles.logoutBtn, { backgroundColor: colors.danger }]}
                    onPress={async () => {
                      await signOut();
                      showToast('Session terminated');
                      router.replace('/login');
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
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: RADIUS.sm, paddingVertical: 10 },
  logoutBtnText: { color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  // Power Center
  powerCenterBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, marginBottom: SPACING.lg },
  powerCenterIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  powerCenterInfo: { flex: 1 },
  powerCenterTitle: { fontSize: 14, fontWeight: '700' },
  powerCenterDesc: { fontSize: 11, marginTop: 2 },
});





