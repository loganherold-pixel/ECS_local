/**
 * StorageCleanupSettings — Storage & Cleanup configuration panel
 *
 * Accessible from the More tab. Allows users to:
 *   - Adjust stale region threshold (days)
 *   - Set storage quota limit (MB)
 *   - Toggle auto-cleanup on/off
 *   - Set warning threshold percentage
 *   - View cleanup history with timestamps and actions taken
 *   - Manually trigger a full cache analysis with detailed results
 *   - Clear All Cache (destructive, with confirmation)
 *   - Verify tile freshness against upstream tile servers
 *
 * Styled with the ECS tactical theme.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  Switch,
  Animated,
  Platform,
} from 'react-native';
import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import { useTheme } from '../../context/ThemeContext';
import { SPACING, RADIUS } from '../../lib/theme';
import {
  tileCacheStore,
  DEFAULT_QUOTA_CONFIG,
  type StorageQuotaConfig,
  type QuotaStatus,
} from '../../lib/tileCacheStore';
import {
  analyzeCache,
  executeCleanup,
  quickCleanup,
  getCleanupHistoryEntries,
  formatCleanupEntry,
  type CleanupReport,
  type CleanupResult,
  type CleanupHistoryEntry,
} from '../../lib/tileAutoCleanup';
import TileFreshnessPanel from './TileFreshnessPanel';

interface Props {
  onToast: (msg: string) => void;
}

type SettingsSubTab = 'config' | 'history' | 'analysis' | 'freshness';


export default function StorageCleanupSettings({ onToast }: Props) {
  const { colors, palette } = useTheme();

  // ── Sub-tab state ──────────────────────────────────────
  const [subTab, setSubTab] = useState<SettingsSubTab>('config');

  // ── Config state ───────────────────────────────────────
  const [config, setConfig] = useState<StorageQuotaConfig>(tileCacheStore.getQuotaConfig());
  const [quotaStatus, setQuotaStatus] = useState<QuotaStatus>(tileCacheStore.getQuotaStatus());
  const [hasChanges, setHasChanges] = useState(false);

  // Editable fields
  const [quotaLimitMB, setQuotaLimitMB] = useState(String(config.quotaLimitMB));
  const [staleRegionDays, setStaleRegionDays] = useState(String(config.staleRegionDays));
  const [warningThreshold, setWarningThreshold] = useState(String(Math.round(config.warningThreshold * 100)));
  const [criticalThreshold, setCriticalThreshold] = useState(String(Math.round(config.criticalThreshold * 100)));
  const [autoCleanupEnabled, setAutoCleanupEnabled] = useState(config.autoCleanupEnabled);

  // ── History state ──────────────────────────────────────
  const [history, setHistory] = useState<CleanupHistoryEntry[]>([]);

  // ── Analysis state ─────────────────────────────────────
  const [analysisReport, setAnalysisReport] = useState<CleanupReport | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [lastCleanupResult, setLastCleanupResult] = useState<CleanupResult | null>(null);

  // ── Clear all state ────────────────────────────────────
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState('');

  // ── Animations ─────────────────────────────────────────
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scanAnim = useRef(new Animated.Value(0)).current;

  // ── Load data on mount ─────────────────────────────────
  useEffect(() => {
    const cfg = tileCacheStore.getQuotaConfig();
    setConfig(cfg);
    setQuotaStatus(tileCacheStore.getQuotaStatus());
    setHistory(getCleanupHistoryEntries());
    setQuotaLimitMB(String(cfg.quotaLimitMB));
    setStaleRegionDays(String(cfg.staleRegionDays));
    setWarningThreshold(String(Math.round(cfg.warningThreshold * 100)));
    setCriticalThreshold(String(Math.round(cfg.criticalThreshold * 100)));
    setAutoCleanupEnabled(cfg.autoCleanupEnabled);
    setHasChanges(false);
  }, []);

  const refreshData = useCallback(() => {
    const cfg = tileCacheStore.getQuotaConfig();
    setConfig(cfg);
    setQuotaStatus(tileCacheStore.getQuotaStatus());
    setHistory(getCleanupHistoryEntries());
    setQuotaLimitMB(String(cfg.quotaLimitMB));
    setStaleRegionDays(String(cfg.staleRegionDays));
    setWarningThreshold(String(Math.round(cfg.warningThreshold * 100)));
    setCriticalThreshold(String(Math.round(cfg.criticalThreshold * 100)));
    setAutoCleanupEnabled(cfg.autoCleanupEnabled);
    setHasChanges(false);
  }, []);

  // ── Save config ────────────────────────────────────────
  const saveConfig = useCallback(() => {
    const newConfig: Partial<StorageQuotaConfig> = {
      quotaLimitMB: Math.max(100, parseInt(quotaLimitMB, 10) || DEFAULT_QUOTA_CONFIG.quotaLimitMB),
      staleRegionDays: Math.max(1, parseInt(staleRegionDays, 10) || DEFAULT_QUOTA_CONFIG.staleRegionDays),
      warningThreshold: Math.min(0.99, Math.max(0.1, (parseInt(warningThreshold, 10) || 80) / 100)),
      criticalThreshold: Math.min(1.0, Math.max(0.5, (parseInt(criticalThreshold, 10) || 95) / 100)),
      autoCleanupEnabled,
    };

    // Ensure warning < critical
    if ((newConfig.warningThreshold || 0.8) >= (newConfig.criticalThreshold || 0.95)) {
      onToast('Warning threshold must be less than critical threshold');
      return;
    }

    tileCacheStore.setQuotaConfig(newConfig);
    refreshData();
    onToast('Storage settings saved');
  }, [quotaLimitMB, staleRegionDays, warningThreshold, criticalThreshold, autoCleanupEnabled, onToast, refreshData]);

  // ── Reset to defaults ──────────────────────────────────
  const resetDefaults = useCallback(() => {
    tileCacheStore.setQuotaConfig(DEFAULT_QUOTA_CONFIG);
    refreshData();
    onToast('Settings reset to defaults');
  }, [onToast, refreshData]);

  // ── Run analysis ───────────────────────────────────────
  const runAnalysis = useCallback(() => {
    setIsAnalyzing(true);
    // Animate scan bar
    scanAnim.setValue(0);
    Animated.timing(scanAnim, {
      toValue: 1,
      duration: 1200,
      useNativeDriver: false,
    }).start();

    // Small delay for visual effect
    setTimeout(() => {
      const report = analyzeCache();
      setAnalysisReport(report);
      setIsAnalyzing(false);
    }, 800);
  }, [scanAnim]);

  // ── Quick cleanup ──────────────────────────────────────
  const runQuickCleanup = useCallback(async () => {
    setIsCleaning(true);
    try {
      const result = await quickCleanup();
      setLastCleanupResult(result);
      refreshData();
      // Re-analyze after cleanup
      const report = analyzeCache();
      setAnalysisReport(report);
      onToast(result.message);
    } catch (e) {
      onToast('Cleanup failed');
    } finally {
      setIsCleaning(false);
    }
  }, [onToast, refreshData]);

  // ── Execute full cleanup from analysis ─────────────────
  const executeFullCleanup = useCallback(async () => {
    if (!analysisReport) return;
    setIsCleaning(true);
    try {
      const result = await executeCleanup(analysisReport, {
        deleteStale: true,
        deleteBroken: true,
        performMerges: false,
        trigger: 'manual',
      });
      setLastCleanupResult(result);
      refreshData();
      const report = analyzeCache();
      setAnalysisReport(report);
      onToast(result.message);
    } catch (e) {
      onToast('Cleanup failed');
    } finally {
      setIsCleaning(false);
    }
  }, [analysisReport, onToast, refreshData]);

  // ── Clear all cache ────────────────────────────────────
  const handleClearAll = useCallback(() => {
    if (clearConfirmText.toUpperCase() !== 'DELETE') {
      onToast('Type DELETE to confirm');
      return;
    }
    tileCacheStore.clearAll();
    setShowClearConfirm(false);
    setClearConfirmText('');
    setAnalysisReport(null);
    setLastCleanupResult(null);
    refreshData();
    onToast('All cached tiles cleared');
  }, [clearConfirmText, onToast, refreshData]);

  // ── Helpers ────────────────────────────────────────────
  const formatMB = (mb: number): string => {
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
    if (mb >= 1) return `${mb.toFixed(1)} MB`;
    return `${Math.round(mb * 1024)} KB`;
  };

  const formatDate = (iso: string): string => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  const getWarningColor = (level: string): string => {
    switch (level) {
      case 'exceeded': return colors.danger;
      case 'critical': return '#FF6B00';
      case 'warning': return colors.warning;
      default: return colors.success;
    }
  };

  const markChanged = () => setHasChanges(true);

  // ── Render: Sub-tab bar ────────────────────────────────
  // ── Freshness badge count ───────────────────────────────
  const updateCount = tileCacheStore.getUpdateAvailableCount();

  // ── Render: Sub-tab bar ────────────────────────────────
  const renderSubTabs = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.subTabBar, { backgroundColor: colors.bgCard, borderBottomColor: colors.border }]}
      contentContainerStyle={styles.subTabBarContent}
    >
      {([
        { key: 'config' as SettingsSubTab, label: 'CONFIG', icon: 'settings-outline' as const },
        { key: 'history' as SettingsSubTab, label: 'HISTORY', icon: 'time-outline' as const },
        { key: 'analysis' as SettingsSubTab, label: 'ANALYSIS', icon: 'analytics-outline' as const },
        { key: 'freshness' as SettingsSubTab, label: 'FRESHNESS', icon: 'leaf-outline' as const },
      ]).map(tab => (
        <TouchableOpacity
          key={tab.key}
          style={[styles.subTabItem, subTab === tab.key && { borderBottomWidth: 2, borderBottomColor: colors.gold }]}
          onPress={() => setSubTab(tab.key)}
          activeOpacity={0.7}
        >
          <Ionicons name={tab.icon} size={14} color={subTab === tab.key ? colors.gold : colors.textMuted} />
          <Text style={[styles.subTabLabel, { color: subTab === tab.key ? colors.gold : colors.textMuted }]}>
            {tab.label}
          </Text>
          {tab.key === 'freshness' && updateCount > 0 && (
            <View style={[styles.updateBadge, { backgroundColor: colors.warning }]}>
              <Text style={styles.updateBadgeText}>{updateCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      ))}
    </ScrollView>
  );


  // ── Render: Quota gauge ────────────────────────────────
  const renderQuotaGauge = () => {
    const usedFrac = quotaStatus.usedFraction;
    const warnFrac = config.warningThreshold;
    const critFrac = config.criticalThreshold;
    const levelColor = getWarningColor(quotaStatus.level);

    return (
      <View style={[styles.gaugeCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <View style={styles.gaugeHeader}>
          <Ionicons name="server-outline" size={16} color={colors.gold} />
          <Text style={[styles.gaugeTitle, { color: colors.textPrimary }]}>STORAGE QUOTA</Text>
          <View style={[styles.levelBadge, { backgroundColor: levelColor + '20', borderColor: levelColor + '50' }]}>
            <View style={[styles.levelDot, { backgroundColor: levelColor }]} />
            <Text style={[styles.levelText, { color: levelColor }]}>{quotaStatus.level.toUpperCase()}</Text>
          </View>
        </View>

        {/* Gauge bar */}
        <View style={[styles.gaugeTrack, { backgroundColor: colors.bgInput }]}>
          {/* Warning threshold marker */}
          <View style={[styles.thresholdMarker, { left: `${warnFrac * 100}%`, backgroundColor: colors.warning + '60' }]} />
          {/* Critical threshold marker */}
          <View style={[styles.thresholdMarker, { left: `${critFrac * 100}%`, backgroundColor: colors.danger + '60' }]} />
          {/* Fill */}
          <View
            style={[
              styles.gaugeFill,
              {
                width: `${Math.min(usedFrac * 100, 100)}%`,
                backgroundColor: levelColor,
              },
            ]}
          />
        </View>

        <View style={styles.gaugeLabels}>
          <Text style={[styles.gaugeValue, { color: levelColor }]}>
            {formatMB(quotaStatus.usedMB)}
          </Text>
          <Text style={[styles.gaugeLimit, { color: colors.textMuted }]}>
            / {formatMB(config.quotaLimitMB)}
          </Text>
          <Text style={[styles.gaugePct, { color: levelColor }]}>
            {Math.round(usedFrac * 100)}%
          </Text>
        </View>

        <View style={styles.gaugeStats}>
          <View style={styles.gaugeStat}>
            <Text style={[styles.gaugeStatLabel, { color: colors.textMuted }]}>REGIONS</Text>
            <Text style={[styles.gaugeStatValue, { color: colors.textPrimary }]}>{quotaStatus.regionBreakdown.length}</Text>
          </View>
          <View style={styles.gaugeStat}>
            <Text style={[styles.gaugeStatLabel, { color: colors.textMuted }]}>STALE</Text>
            <Text style={[styles.gaugeStatValue, { color: quotaStatus.staleRegionCount > 0 ? colors.warning : colors.textPrimary }]}>
              {quotaStatus.staleRegionCount}
            </Text>
          </View>
          <View style={styles.gaugeStat}>
            <Text style={[styles.gaugeStatLabel, { color: colors.textMuted }]}>AVAILABLE</Text>
            <Text style={[styles.gaugeStatValue, { color: colors.success }]}>{formatMB(quotaStatus.availableMB)}</Text>
          </View>
        </View>
      </View>
    );
  };

  // ── Render: Config tab ─────────────────────────────────
  const renderConfigTab = () => (
    <View>
      {renderQuotaGauge()}

      {/* Auto-Cleanup Toggle */}
      <View style={[styles.settingCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <View style={styles.settingHeader}>
          <Ionicons name="flash-outline" size={16} color={colors.gold} />
          <Text style={[styles.settingTitle, { color: colors.textPrimary }]}>AUTO-CLEANUP ENGINE</Text>
        </View>
        <Text style={[styles.settingDesc, { color: colors.textMuted }]}>
          Automatically clean stale and broken regions on app startup when storage is critical.
        </Text>
        <View style={styles.toggleRow}>
          <Text style={[styles.toggleLabel, { color: colors.textSecondary }]}>Enable Auto-Cleanup</Text>
          <Switch
            value={autoCleanupEnabled}
            onValueChange={(v) => { setAutoCleanupEnabled(v); markChanged(); }}
            trackColor={{ false: 'rgba(255,255,255,0.08)', true: colors.gold + '40' }}
            thumbColor={autoCleanupEnabled ? colors.gold : colors.textMuted}
            style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
          />
        </View>
      </View>

      {/* Stale Region Threshold */}
      <View style={[styles.settingCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <View style={styles.settingHeader}>
          <Ionicons name="calendar-outline" size={16} color={colors.gold} />
          <Text style={[styles.settingTitle, { color: colors.textPrimary }]}>STALE REGION THRESHOLD</Text>
        </View>
        <Text style={[styles.settingDesc, { color: colors.textMuted }]}>
          Regions older than this are flagged for cleanup. Protected regions (active expeditions, recent routes) are never auto-deleted.
        </Text>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.numInput, { backgroundColor: colors.bgInput, borderColor: colors.border, color: colors.textPrimary }]}
            value={staleRegionDays}
            onChangeText={(v) => { setStaleRegionDays(v); markChanged(); }}
            keyboardType="number-pad"
            placeholder="90"
            placeholderTextColor={colors.textMuted}
          />
          <Text style={[styles.inputUnit, { color: colors.textSecondary }]}>days</Text>
          <View style={styles.presetRow}>
            {[30, 60, 90, 180].map(d => (
              <TouchableOpacity
                key={d}
                style={[
                  styles.presetBtn,
                  { borderColor: colors.border, backgroundColor: colors.bgInput },
                  staleRegionDays === String(d) && { borderColor: colors.gold + '60', backgroundColor: colors.gold + '15' },
                ]}
                onPress={() => { setStaleRegionDays(String(d)); markChanged(); }}
              >
                <Text style={[
                  styles.presetText,
                  { color: colors.textMuted },
                  staleRegionDays === String(d) && { color: colors.gold },
                ]}>{d}d</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* Storage Quota Limit */}
      <View style={[styles.settingCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <View style={styles.settingHeader}>
          <Ionicons name="cloud-outline" size={16} color={colors.gold} />
          <Text style={[styles.settingTitle, { color: colors.textPrimary }]}>STORAGE QUOTA LIMIT</Text>
        </View>
        <Text style={[styles.settingDesc, { color: colors.textMuted }]}>
          Maximum tile cache size. Downloads are blocked when this limit is reached.
        </Text>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.numInput, { backgroundColor: colors.bgInput, borderColor: colors.border, color: colors.textPrimary }]}
            value={quotaLimitMB}
            onChangeText={(v) => { setQuotaLimitMB(v); markChanged(); }}
            keyboardType="number-pad"
            placeholder="2048"
            placeholderTextColor={colors.textMuted}
          />
          <Text style={[styles.inputUnit, { color: colors.textSecondary }]}>MB</Text>
          <View style={styles.presetRow}>
            {[512, 1024, 2048, 4096].map(mb => (
              <TouchableOpacity
                key={mb}
                style={[
                  styles.presetBtn,
                  { borderColor: colors.border, backgroundColor: colors.bgInput },
                  quotaLimitMB === String(mb) && { borderColor: colors.gold + '60', backgroundColor: colors.gold + '15' },
                ]}
                onPress={() => { setQuotaLimitMB(String(mb)); markChanged(); }}
              >
                <Text style={[
                  styles.presetText,
                  { color: colors.textMuted },
                  quotaLimitMB === String(mb) && { color: colors.gold },
                ]}>{mb >= 1024 ? `${mb / 1024}G` : `${mb}M`}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* Warning & Critical Thresholds */}
      <View style={[styles.settingCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <View style={styles.settingHeader}>
          <Ionicons name="warning-outline" size={16} color={colors.gold} />
          <Text style={[styles.settingTitle, { color: colors.textPrimary }]}>ALERT THRESHOLDS</Text>
        </View>
        <Text style={[styles.settingDesc, { color: colors.textMuted }]}>
          Warning shows a banner. Critical triggers auto-cleanup if enabled.
        </Text>

        <View style={styles.thresholdRow}>
          <View style={styles.thresholdField}>
            <View style={styles.thresholdLabelRow}>
              <View style={[styles.thresholdDot, { backgroundColor: colors.warning }]} />
              <Text style={[styles.thresholdLabel, { color: colors.textSecondary }]}>WARNING</Text>
            </View>
            <View style={styles.thresholdInputRow}>
              <TextInput
                style={[styles.numInputSm, { backgroundColor: colors.bgInput, borderColor: colors.border, color: colors.textPrimary }]}
                value={warningThreshold}
                onChangeText={(v) => { setWarningThreshold(v); markChanged(); }}
                keyboardType="number-pad"
                placeholder="80"
                placeholderTextColor={colors.textMuted}
              />
              <Text style={[styles.inputUnitSm, { color: colors.textMuted }]}>%</Text>
            </View>
          </View>

          <View style={[styles.thresholdDivider, { backgroundColor: colors.border }]} />

          <View style={styles.thresholdField}>
            <View style={styles.thresholdLabelRow}>
              <View style={[styles.thresholdDot, { backgroundColor: colors.danger }]} />
              <Text style={[styles.thresholdLabel, { color: colors.textSecondary }]}>CRITICAL</Text>
            </View>
            <View style={styles.thresholdInputRow}>
              <TextInput
                style={[styles.numInputSm, { backgroundColor: colors.bgInput, borderColor: colors.border, color: colors.textPrimary }]}
                value={criticalThreshold}
                onChangeText={(v) => { setCriticalThreshold(v); markChanged(); }}
                keyboardType="number-pad"
                placeholder="95"
                placeholderTextColor={colors.textMuted}
              />
              <Text style={[styles.inputUnitSm, { color: colors.textMuted }]}>%</Text>
            </View>
          </View>
        </View>

        {/* Visual threshold preview */}
        <View style={[styles.thresholdPreview, { backgroundColor: colors.bgInput }]}>
          <View style={[styles.thresholdZone, { width: `${parseInt(warningThreshold, 10) || 80}%`, backgroundColor: colors.success + '30' }]}>
            <Text style={[styles.thresholdZoneLabel, { color: colors.success }]}>OK</Text>
          </View>
          <View style={[
            styles.thresholdZone,
            {
              width: `${(parseInt(criticalThreshold, 10) || 95) - (parseInt(warningThreshold, 10) || 80)}%`,
              backgroundColor: colors.warning + '30',
            },
          ]}>
            <Text style={[styles.thresholdZoneLabel, { color: colors.warning }]}>WARN</Text>
          </View>
          <View style={[
            styles.thresholdZone,
            {
              width: `${100 - (parseInt(criticalThreshold, 10) || 95)}%`,
              backgroundColor: colors.danger + '30',
            },
          ]}>
            <Text style={[styles.thresholdZoneLabel, { color: colors.danger }]}>CRIT</Text>
          </View>
        </View>
      </View>

      {/* Save / Reset buttons */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: hasChanges ? colors.gold : colors.gold + '40' }]}
          onPress={saveConfig}
          disabled={!hasChanges}
          activeOpacity={0.7}
        >
          <Ionicons name="save-outline" size={16} color={hasChanges ? '#000' : colors.textMuted} />
          <Text style={[styles.saveBtnText, { color: hasChanges ? '#000' : colors.textMuted }]}>
            SAVE SETTINGS
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.resetBtn, { borderColor: colors.border }]}
          onPress={resetDefaults}
          activeOpacity={0.7}
        >
          <Ionicons name="refresh-outline" size={14} color={colors.textMuted} />
          <Text style={[styles.resetBtnText, { color: colors.textMuted }]}>DEFAULTS</Text>
        </TouchableOpacity>
      </View>

      {/* Destructive: Clear All Cache */}
      <View style={[styles.dangerZone, { borderColor: colors.danger + '30', backgroundColor: colors.danger + '08' }]}>
        <View style={styles.dangerHeader}>
          <Ionicons name="nuclear-outline" size={18} color={colors.danger} />
          <Text style={[styles.dangerTitle, { color: colors.danger }]}>DANGER ZONE</Text>
        </View>
        <Text style={[styles.dangerDesc, { color: colors.textMuted }]}>
          Permanently delete all cached map tiles and region metadata. This cannot be undone.
        </Text>

        {!showClearConfirm ? (
          <TouchableOpacity
            style={[styles.clearAllBtn, { backgroundColor: colors.danger + '15', borderColor: colors.danger + '40' }]}
            onPress={() => setShowClearConfirm(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={16} color={colors.danger} />
            <Text style={[styles.clearAllBtnText, { color: colors.danger }]}>CLEAR ALL CACHE</Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.confirmBox, { borderColor: colors.danger + '50', backgroundColor: colors.danger + '10' }]}>
            <Text style={[styles.confirmLabel, { color: colors.danger }]}>
              Type DELETE to confirm:
            </Text>
            <TextInput
              style={[styles.confirmInput, { backgroundColor: colors.bgInput, borderColor: colors.danger + '40', color: colors.textPrimary }]}
              value={clearConfirmText}
              onChangeText={setClearConfirmText}
              placeholder="DELETE"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
            />
            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={[styles.confirmCancel, { borderColor: colors.border }]}
                onPress={() => { setShowClearConfirm(false); setClearConfirmText(''); }}
              >
                <Text style={[styles.confirmCancelText, { color: colors.textMuted }]}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.confirmDelete,
                  {
                    backgroundColor: clearConfirmText.toUpperCase() === 'DELETE' ? colors.danger : colors.danger + '30',
                  },
                ]}
                onPress={handleClearAll}
                disabled={clearConfirmText.toUpperCase() !== 'DELETE'}
              >
                <Ionicons name="trash" size={14} color="#fff" />
                <Text style={styles.confirmDeleteText}>CONFIRM DELETE</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </View>
  );

  // ── Render: History tab ────────────────────────────────
  const renderHistoryTab = () => {
    const sortedHistory = [...history].reverse(); // newest first

    return (
      <View>
        <View style={[styles.historyHeader, { borderBottomColor: colors.border }]}>
          <Ionicons name="time-outline" size={16} color={colors.gold} />
          <Text style={[styles.historyTitle, { color: colors.textPrimary }]}>CLEANUP HISTORY</Text>
          <Text style={[styles.historyCount, { color: colors.textMuted }]}>
            {history.length} entries
          </Text>
        </View>

        {sortedHistory.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={40} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No cleanup history yet</Text>
            <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>
              History is recorded when auto-cleanup runs on startup or when you manually clean.
            </Text>
          </View>
        ) : (
          sortedHistory.map((entry, idx) => {
            const triggerColor = entry.trigger === 'startup' ? colors.info : entry.trigger === 'auto' ? colors.warning : colors.gold;
            const triggerIcon = entry.trigger === 'startup' ? 'power-outline' : entry.trigger === 'auto' ? 'flash-outline' : 'hand-left-outline';
            const triggerLabel = entry.trigger === 'startup' ? 'STARTUP' : entry.trigger === 'auto' ? 'AUTO' : 'MANUAL';

            return (
              <View
                key={idx}
                style={[styles.historyCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
              >
                <View style={styles.historyCardHeader}>
                  <View style={[styles.triggerBadge, { backgroundColor: triggerColor + '15', borderColor: triggerColor + '40' }]}>
                    <Ionicons name={triggerIcon as any} size={10} color={triggerColor} />
                    <Text style={[styles.triggerText, { color: triggerColor }]}>{triggerLabel}</Text>
                  </View>
                  <Text style={[styles.historyDate, { color: colors.textMuted }]}>
                    {formatDate(entry.timestamp)}
                  </Text>
                </View>

                <View style={styles.historyMetrics}>
                  <View style={styles.historyMetric}>
                    <Ionicons name="trash-outline" size={12} color={entry.regionsDeleted > 0 ? colors.danger : colors.textMuted} />
                    <Text style={[styles.historyMetricValue, { color: entry.regionsDeleted > 0 ? colors.textPrimary : colors.textMuted }]}>
                      {entry.regionsDeleted}
                    </Text>
                    <Text style={[styles.historyMetricLabel, { color: colors.textMuted }]}>deleted</Text>
                  </View>

                  <View style={styles.historyMetric}>
                    <Ionicons name="cloud-download-outline" size={12} color={entry.freedMB > 0 ? colors.success : colors.textMuted} />
                    <Text style={[styles.historyMetricValue, { color: entry.freedMB > 0 ? colors.success : colors.textMuted }]}>
                      {formatMB(entry.freedMB)}
                    </Text>
                    <Text style={[styles.historyMetricLabel, { color: colors.textMuted }]}>freed</Text>
                  </View>

                  {entry.mergesPerformed > 0 && (
                    <View style={styles.historyMetric}>
                      <Ionicons name="git-merge-outline" size={12} color={colors.info} />
                      <Text style={[styles.historyMetricValue, { color: colors.info }]}>
                        {entry.mergesPerformed}
                      </Text>
                      <Text style={[styles.historyMetricLabel, { color: colors.textMuted }]}>merged</Text>
                    </View>
                  )}
                </View>

                <Text style={[styles.historySummary, { color: colors.textSecondary }]}>
                  {formatCleanupEntry(entry)}
                </Text>
              </View>
            );
          })
        )}
      </View>
    );
  };

  // ── Render: Analysis tab ───────────────────────────────
  const renderAnalysisTab = () => (
    <View>
      {/* Run Analysis Button */}
      <TouchableOpacity
        style={[
          styles.analyzeBtn,
          {
            backgroundColor: isAnalyzing ? colors.bgCard : colors.gold + '15',
            borderColor: isAnalyzing ? colors.gold + '30' : colors.gold + '50',
          },
        ]}
        onPress={runAnalysis}
        disabled={isAnalyzing}
        activeOpacity={0.7}
      >
        {isAnalyzing ? (
          <View style={styles.analyzingRow}>
            <Ionicons name="scan-outline" size={18} color={colors.gold} />
            <Text style={[styles.analyzeBtnText, { color: colors.gold }]}>ANALYZING CACHE...</Text>
            <View style={[styles.scanBar, { backgroundColor: colors.bgInput }]}>
              <Animated.View
                style={[
                  styles.scanFill,
                  {
                    backgroundColor: colors.gold,
                    width: scanAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%'],
                    }),
                  },
                ]}
              />
            </View>
          </View>
        ) : (
          <View style={styles.analyzeRow}>
            <Ionicons name="analytics-outline" size={18} color={colors.gold} />
            <Text style={[styles.analyzeBtnText, { color: colors.gold }]}>RUN FULL CACHE ANALYSIS</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Analysis Results */}
      {analysisReport && (
        <View>
          {/* Summary banner */}
          <View style={[
            styles.analysisBanner,
            {
              backgroundColor: getWarningColor(analysisReport.warningLevel) + '10',
              borderColor: getWarningColor(analysisReport.warningLevel) + '30',
            },
          ]}>
            <View style={styles.analysisBannerHeader}>
              <Ionicons
                name={analysisReport.needsAttention ? 'alert-circle' : 'checkmark-circle'}
                size={18}
                color={getWarningColor(analysisReport.warningLevel)}
              />
              <Text style={[styles.analysisBannerTitle, { color: getWarningColor(analysisReport.warningLevel) }]}>
                {analysisReport.warningLevel.toUpperCase()} — {analysisReport.needsAttention ? 'Attention Needed' : 'Cache Healthy'}
              </Text>
            </View>
            <Text style={[styles.analysisBannerMsg, { color: colors.textSecondary }]}>
              {analysisReport.summaryMessage}
            </Text>
            <Text style={[styles.analysisTimestamp, { color: colors.textMuted }]}>
              Analyzed: {formatDate(analysisReport.analyzedAt)}
            </Text>
          </View>

          {/* Stats grid */}
          <View style={styles.statsGrid}>
            {[
              { label: 'TOTAL CACHE', value: formatMB(analysisReport.totalCacheMB), icon: 'server-outline', color: colors.textPrimary },
              { label: 'REGIONS', value: String(analysisReport.totalRegions), icon: 'map-outline', color: colors.textPrimary },
              { label: 'STALE', value: String(analysisReport.staleRegions.length), icon: 'hourglass-outline', color: analysisReport.staleRegions.length > 0 ? colors.warning : colors.textMuted },
              { label: 'BROKEN', value: String(analysisReport.brokenRegions.length), icon: 'alert-circle-outline', color: analysisReport.brokenRegions.length > 0 ? colors.danger : colors.textMuted },
              { label: 'PROTECTED', value: String(analysisReport.protectedRegionIds.size), icon: 'shield-checkmark-outline', color: colors.success },
              { label: 'FREEABLE', value: formatMB(analysisReport.autoCleanFreeMB), icon: 'trash-outline', color: analysisReport.autoCleanFreeMB > 0 ? colors.info : colors.textMuted },
              { label: 'OVERLAPS', value: String(analysisReport.overlappingPairs.length), icon: 'layers-outline', color: analysisReport.overlappingPairs.length > 0 ? colors.warning : colors.textMuted },
              { label: 'MERGE OPS', value: String(analysisReport.mergeSuggestions.length), icon: 'git-merge-outline', color: analysisReport.mergeSuggestions.length > 0 ? colors.info : colors.textMuted },
            ].map((stat, idx) => (
              <View key={idx} style={[styles.statCell, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                <Ionicons name={stat.icon as any} size={14} color={stat.color} />
                <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>{stat.label}</Text>
              </View>
            ))}
          </View>

          {/* Stale regions detail */}
          {analysisReport.staleRegions.length > 0 && (
            <View style={[styles.detailSection, { borderColor: colors.border }]}>
              <View style={styles.detailHeader}>
                <Ionicons name="hourglass-outline" size={14} color={colors.warning} />
                <Text style={[styles.detailTitle, { color: colors.warning }]}>
                  STALE REGIONS ({analysisReport.staleRegions.length})
                </Text>
                <Text style={[styles.detailSize, { color: colors.textMuted }]}>
                  {formatMB(analysisReport.staleTotalMB)}
                </Text>
              </View>
              {analysisReport.staleRegions.map((c, idx) => (
                <View key={idx} style={[styles.candidateRow, { borderBottomColor: colors.border }]}>
                  <View style={styles.candidateInfo}>
                    <Text style={[styles.candidateName, { color: colors.textPrimary }]} numberOfLines={1}>
                      {c.regionName}
                    </Text>
                    <Text style={[styles.candidateMeta, { color: colors.textMuted }]}>
                      {c.ageDays}d old \u00B7 {formatMB(c.sizeMB)} \u00B7 {c.tileCount} tiles
                    </Text>
                  </View>
                  {c.isProtected ? (
                    <View style={[styles.protectedBadge, { backgroundColor: colors.success + '15', borderColor: colors.success + '40' }]}>
                      <Ionicons name="shield-checkmark" size={10} color={colors.success} />
                      <Text style={[styles.protectedText, { color: colors.success }]}>PROTECTED</Text>
                    </View>
                  ) : (
                    <View style={[styles.cleanableBadge, { backgroundColor: colors.warning + '15', borderColor: colors.warning + '40' }]}>
                      <Text style={[styles.cleanableText, { color: colors.warning }]}>CLEANABLE</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Broken regions detail */}
          {analysisReport.brokenRegions.length > 0 && (
            <View style={[styles.detailSection, { borderColor: colors.border }]}>
              <View style={styles.detailHeader}>
                <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
                <Text style={[styles.detailTitle, { color: colors.danger }]}>
                  BROKEN DOWNLOADS ({analysisReport.brokenRegions.length})
                </Text>
                <Text style={[styles.detailSize, { color: colors.textMuted }]}>
                  {formatMB(analysisReport.brokenTotalMB)}
                </Text>
              </View>
              {analysisReport.brokenRegions.map((c, idx) => (
                <View key={idx} style={[styles.candidateRow, { borderBottomColor: colors.border }]}>
                  <View style={styles.candidateInfo}>
                    <Text style={[styles.candidateName, { color: colors.textPrimary }]} numberOfLines={1}>
                      {c.regionName}
                    </Text>
                    <Text style={[styles.candidateMeta, { color: colors.textMuted }]}>
                      {c.reason} \u00B7 {formatMB(c.sizeMB)} \u00B7 {c.tileCount} tiles
                    </Text>
                  </View>
                  <View style={[styles.cleanableBadge, { backgroundColor: colors.danger + '15', borderColor: colors.danger + '40' }]}>
                    <Text style={[styles.cleanableText, { color: colors.danger }]}>REMOVE</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Merge suggestions */}
          {analysisReport.mergeSuggestions.length > 0 && (
            <View style={[styles.detailSection, { borderColor: colors.border }]}>
              <View style={styles.detailHeader}>
                <Ionicons name="git-merge-outline" size={14} color={colors.info} />
                <Text style={[styles.detailTitle, { color: colors.info }]}>
                  MERGE OPPORTUNITIES ({analysisReport.mergeSuggestions.length})
                </Text>
              </View>
              {analysisReport.mergeSuggestions.map((s, idx) => (
                <View key={idx} style={[styles.mergeCard, { backgroundColor: colors.bgInput, borderColor: colors.border }]}>
                  <Text style={[styles.mergeDesc, { color: colors.textSecondary }]}>{s.description}</Text>
                  <View style={styles.mergeStats}>
                    <View style={[styles.savingsBadge, { backgroundColor: colors.success + '15', borderColor: colors.success + '40' }]}>
                      <Ionicons name="trending-down-outline" size={10} color={colors.success} />
                      <Text style={[styles.savingsText, { color: colors.success }]}>
                        Save {formatMB(s.savingsMB)} ({s.savingsPercent}%)
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Action buttons */}
          {analysisReport.autoCleanCandidates.length > 0 && (
            <View style={styles.analysisActions}>
              <TouchableOpacity
                style={[styles.cleanupBtn, { backgroundColor: colors.warning + '15', borderColor: colors.warning + '50' }]}
                onPress={runQuickCleanup}
                disabled={isCleaning}
                activeOpacity={0.7}
              >
                <Ionicons name="flash" size={16} color={colors.warning} />
                <Text style={[styles.cleanupBtnText, { color: colors.warning }]}>
                  {isCleaning ? 'CLEANING...' : `QUICK CLEAN (${formatMB(analysisReport.autoCleanFreeMB)})`}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.cleanupBtn, { backgroundColor: colors.danger + '15', borderColor: colors.danger + '50' }]}
                onPress={executeFullCleanup}
                disabled={isCleaning}
                activeOpacity={0.7}
              >
                <Ionicons name="nuclear-outline" size={16} color={colors.danger} />
                <Text style={[styles.cleanupBtnText, { color: colors.danger }]}>
                  {isCleaning ? 'CLEANING...' : `FULL CLEANUP (${formatMB(analysisReport.totalFreeMB)})`}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Last cleanup result */}
          {lastCleanupResult && (
            <View style={[styles.resultBanner, { backgroundColor: colors.success + '10', borderColor: colors.success + '30' }]}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={[styles.resultText, { color: colors.success }]}>{lastCleanupResult.message}</Text>
              <Text style={[styles.resultDuration, { color: colors.textMuted }]}>
                {lastCleanupResult.durationMs}ms
              </Text>
            </View>
          )}
        </View>
      )}

      {/* No analysis yet */}
      {!analysisReport && !isAnalyzing && (
        <View style={styles.emptyState}>
          <Ionicons name="scan-outline" size={40} color={colors.textMuted} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No analysis data</Text>
          <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>
            Run a full cache analysis to see detailed storage health, stale regions, overlap detection, and cleanup recommendations.
          </Text>
        </View>
      )}
    </View>
  );

  // ── Main render ────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Section header */}
      <View style={styles.sectionHeader}>
        <Ionicons name="server-outline" size={20} color={colors.gold} />
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Storage & Cleanup</Text>
      </View>

      {renderSubTabs()}

      {subTab === 'config' && renderConfigTab()}
      {subTab === 'history' && renderHistoryTab()}
      {subTab === 'analysis' && renderAnalysisTab()}
      {subTab === 'freshness' && <TileFreshnessPanel onToast={onToast} />}
    </View>
  );
}


const styles = StyleSheet.create({
  container: {},

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // Sub-tabs
  subTabBar: {
    borderBottomWidth: 1,
    borderRadius: RADIUS.sm,
    marginBottom: SPACING.lg,
    overflow: 'hidden',
    maxHeight: 44,
  },
  subTabBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subTabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
  },
  subTabLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  updateBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    marginLeft: 2,
  },
  updateBadgeText: {
    color: '#000',
    fontSize: 9,
    fontWeight: '900',
  },


  // Gauge card
  gaugeCard: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  gaugeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: SPACING.md,
  },
  gaugeTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
  },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  levelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  levelText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  gaugeTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  gaugeFill: {
    height: '100%',
    borderRadius: 4,
  },
  thresholdMarker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    zIndex: 1,
  },
  gaugeLabels: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginTop: 8,
  },
  gaugeValue: {
    fontSize: 18,
    fontWeight: '800',
    fontFamily: 'Courier',
  },
  gaugeLimit: {
    fontSize: 12,
    fontFamily: 'Courier',
  },
  gaugePct: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: 'Courier',
    marginLeft: 'auto',
  },
  gaugeStats: {
    flexDirection: 'row',
    marginTop: SPACING.md,
    gap: SPACING.md,
  },
  gaugeStat: {
    flex: 1,
    alignItems: 'center',
  },
  gaugeStatLabel: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 2,
  },
  gaugeStatValue: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Courier',
  },

  // Setting cards
  settingCard: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  settingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  settingTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
  },
  settingDesc: {
    fontSize: 11,
    lineHeight: 16,
    marginBottom: SPACING.md,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  numInput: {
    width: 80,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Courier',
    textAlign: 'center',
  },
  inputUnit: {
    fontSize: 13,
    fontWeight: '600',
  },
  presetRow: {
    flexDirection: 'row',
    gap: 6,
    marginLeft: 'auto',
  },
  presetBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
  },
  presetText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },

  // Threshold section
  thresholdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  thresholdField: {
    flex: 1,
  },
  thresholdLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  thresholdDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  thresholdLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
  },
  thresholdInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  numInputSm: {
    width: 60,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Courier',
    textAlign: 'center',
  },
  inputUnitSm: {
    fontSize: 14,
    fontWeight: '700',
  },
  thresholdDivider: {
    width: 1,
    height: 50,
    marginHorizontal: 4,
  },
  thresholdPreview: {
    flexDirection: 'row',
    height: 20,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: SPACING.md,
  },
  thresholdZone: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  thresholdZoneLabel: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // Action buttons
  actionRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
    marginBottom: SPACING.xl,
  },
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.md,
  },
  saveBtnText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  resetBtnText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },

  // Danger zone
  dangerZone: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  dangerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  dangerTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
  },
  dangerDesc: {
    fontSize: 11,
    lineHeight: 16,
    marginBottom: SPACING.md,
  },
  clearAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  clearAllBtnText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
  },
  confirmBox: {
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    padding: SPACING.md,
  },
  confirmLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  confirmInput: {
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 4,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  confirmCancel: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  confirmCancelText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  confirmDelete: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
  },
  confirmDeleteText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // History
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    marginBottom: SPACING.md,
  },
  historyTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
  },
  historyCount: {
    fontSize: 11,
    fontFamily: 'Courier',
  },
  historyCard: {
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  historyCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  triggerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  triggerText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
  },
  historyDate: {
    fontSize: 10,
    fontFamily: 'Courier',
  },
  historyMetrics: {
    flexDirection: 'row',
    gap: SPACING.lg,
    marginBottom: 6,
  },
  historyMetric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  historyMetricValue: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Courier',
  },
  historyMetricLabel: {
    fontSize: 10,
  },
  historySummary: {
    fontSize: 11,
    fontStyle: 'italic',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 20,
  },

  // Analysis
  analyzeBtn: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  analyzeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  analyzingRow: {
    alignItems: 'center',
    gap: 8,
  },
  analyzeBtnText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
  },
  scanBar: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 4,
  },
  scanFill: {
    height: '100%',
    borderRadius: 2,
  },

  // Analysis banner
  analysisBanner: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  analysisBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  analysisBannerTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  analysisBannerMsg: {
    fontSize: 12,
    lineHeight: 18,
  },
  analysisTimestamp: {
    fontSize: 9,
    fontFamily: 'Courier',
    marginTop: 6,
  },

  // Stats grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  statCell: {
    width: '23%',
    minWidth: 70,
    alignItems: 'center',
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    flexGrow: 1,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: 'Courier',
    marginTop: 4,
  },
  statLabel: {
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 2,
  },

  // Detail sections
  detailSection: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: SPACING.md,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: SPACING.md,
  },
  detailTitle: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
  },
  detailSize: {
    fontSize: 11,
    fontFamily: 'Courier',
  },
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
  },
  candidateInfo: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  candidateName: {
    fontSize: 12,
    fontWeight: '600',
  },
  candidateMeta: {
    fontSize: 10,
    marginTop: 2,
  },
  protectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  protectedText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
  },
  cleanableBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  cleanableText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // Merge cards
  mergeCard: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  mergeDesc: {
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 6,
  },
  mergeStats: {
    flexDirection: 'row',
  },
  savingsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  savingsText: {
    fontSize: 9,
    fontWeight: '700',
  },

  // Analysis actions
  analysisActions: {
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  cleanupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  cleanupBtnText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // Result banner
  resultBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: SPACING.md,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    marginBottom: SPACING.md,
  },
  resultText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  resultDuration: {
    fontSize: 10,
    fontFamily: 'Courier',
  },
});




