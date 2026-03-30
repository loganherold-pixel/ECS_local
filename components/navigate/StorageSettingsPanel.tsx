/**
 * StorageSettingsPanel — Offline Map Storage Management UI
 *
 * Accessible from OfflineMapPanel, provides:
 *   - Configurable storage quota (slider from 500MB to 10GB)
 *   - Auto-cleanup toggle
 *   - Stale region age configuration
 *   - Per-region size breakdown with visual bar charts
 *   - Quota usage gauge with color-coded levels
 *   - Manual cleanup of stale regions
 *   - Clear all cached data
 *
 * Integrates with tileCacheStore quota management system.
 */
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  ScrollView,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, TYPO, DENSITY } from '../../lib/theme';
import {
  tileCacheStore,
  DEFAULT_QUOTA_CONFIG,
  type StorageQuotaConfig,
  type QuotaStatus,
  type RegionSizeBreakdown,
} from '../../lib/tileCacheStore';

// ── Types ───────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
  showToast: (msg: string) => void;
}

// ── Quota Presets ───────────────────────────────────────

const QUOTA_PRESETS = [
  { label: '500 MB', value: 512 },
  { label: '1 GB', value: 1024 },
  { label: '2 GB', value: 2048 },
  { label: '5 GB', value: 5120 },
  { label: '10 GB', value: 10240 },
];

const STALE_PRESETS = [
  { label: '30d', value: 30 },
  { label: '60d', value: 60 },
  { label: '90d', value: 90 },
  { label: '180d', value: 180 },
  { label: '365d', value: 365 },
];

// ── Helpers ─────────────────────────────────────────────

function formatSize(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.round(mb * 1024)} KB`;
}

function getLevelColor(level: QuotaStatus['level']): string {
  switch (level) {
    case 'ok': return '#66BB6A';
    case 'warning': return '#FFB300';
    case 'critical': return '#FF7043';
    case 'exceeded': return '#EF5350';
  }
}

function getLevelLabel(level: QuotaStatus['level']): string {
  switch (level) {
    case 'ok': return 'HEALTHY';
    case 'warning': return 'WARNING';
    case 'critical': return 'CRITICAL';
    case 'exceeded': return 'EXCEEDED';
  }
}

function getStatusColor(status: RegionSizeBreakdown['status']): string {
  switch (status) {
    case 'complete': return '#66BB6A';
    case 'downloading': return '#FFB300';
    case 'error': return '#EF5350';
    case 'partial': return '#FF7043';
    case 'cancelled': return TACTICAL.textMuted;
    default: return TACTICAL.textMuted;
  }
}

// ── Component ───────────────────────────────────────────

export default function StorageSettingsPanel({ visible, onClose, showToast }: Props) {
  const [config, setConfig] = useState<StorageQuotaConfig>(DEFAULT_QUOTA_CONFIG);
  const [quotaStatus, setQuotaStatus] = useState<QuotaStatus | null>(null);
  const [isPurging, setIsPurging] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // ── Load config + status ──────────────────────────────
  const refreshData = useCallback(() => {
    setConfig(tileCacheStore.getQuotaConfig());
    setQuotaStatus(tileCacheStore.getQuotaStatus());
  }, []);

  useEffect(() => {
    if (visible) {
      refreshData();
      const unsub = tileCacheStore.subscribe(refreshData);
      return unsub;
    }
  }, [visible, refreshData]);

  // ── Config update handlers ────────────────────────────
  const updateQuota = useCallback((quotaLimitMB: number) => {
    tileCacheStore.setQuotaConfig({ quotaLimitMB });
    setConfig(prev => ({ ...prev, quotaLimitMB }));
    refreshData();
  }, [refreshData]);

  const toggleAutoCleanup = useCallback((enabled: boolean) => {
    tileCacheStore.setQuotaConfig({ autoCleanupEnabled: enabled });
    setConfig(prev => ({ ...prev, autoCleanupEnabled: enabled }));
  }, []);

  const updateStaleDays = useCallback((staleRegionDays: number) => {
    tileCacheStore.setQuotaConfig({ staleRegionDays });
    setConfig(prev => ({ ...prev, staleRegionDays }));
    refreshData();
  }, [refreshData]);

  // ── Purge stale regions ───────────────────────────────
  const handlePurgeStale = useCallback(async () => {
    if (!quotaStatus || quotaStatus.staleRegionCount === 0) {
      showToast('NO STALE REGIONS TO PURGE');
      return;
    }

    const doPurge = async () => {
      setIsPurging(true);
      try {
        const result = await tileCacheStore.purgeStaleRegions();
        showToast(`PURGED ${result.purged} REGIONS — FREED ${formatSize(result.freedMB)}`);
        refreshData();
      } catch {
        showToast('PURGE FAILED');
      }
      setIsPurging(false);
    };

    if (Platform.OS === 'web') {
      if (confirm(`Purge ${quotaStatus.staleRegionCount} stale regions (${formatSize(quotaStatus.staleSizeMB)})?`)) {
        doPurge();
      }
    } else {
      Alert.alert(
        'Purge Stale Regions',
        `Remove ${quotaStatus.staleRegionCount} regions older than ${config.staleRegionDays} days?\n\nThis will free ~${formatSize(quotaStatus.staleSizeMB)}.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Purge', style: 'destructive', onPress: doPurge },
        ]
      );
    }
  }, [quotaStatus, config.staleRegionDays, showToast, refreshData]);

  // ── Clear all ─────────────────────────────────────────
  const handleClearAll = useCallback(() => {
    const doClear = async () => {
      setIsClearing(true);
      try {
        tileCacheStore.clearAll();
        showToast('ALL CACHED DATA CLEARED');
        refreshData();
      } catch {
        showToast('CLEAR FAILED');
      }
      setIsClearing(false);
    };

    if (Platform.OS === 'web') {
      if (confirm('Delete ALL cached map tiles? This cannot be undone.')) doClear();
    } else {
      Alert.alert(
        'Clear All Cache',
        'Delete ALL cached map tiles and regions? This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Clear All', style: 'destructive', onPress: doClear },
        ]
      );
    }
  }, [showToast, refreshData]);

  // ── Run auto-cleanup manually ─────────────────────────
  const handleAutoCleanup = useCallback(async () => {
    setIsPurging(true);
    try {
      const result = await tileCacheStore.autoCleanup();
      if (result.triggered) {
        showToast(`AUTO-CLEANUP: PURGED ${result.purged} REGIONS — FREED ${formatSize(result.freedMB)}`);
      } else {
        showToast('STORAGE IS HEALTHY — NO CLEANUP NEEDED');
      }
      refreshData();
    } catch {
      showToast('AUTO-CLEANUP FAILED');
    }
    setIsPurging(false);
  }, [showToast, refreshData]);

  if (!visible) return null;

  const breakdown = quotaStatus?.regionBreakdown || [];
  const maxRegionSize = breakdown.length > 0 ? Math.max(...breakdown.map(r => r.sizeMB)) : 1;

  return (
    <View style={styles.container}>
      {/* ═══════ HEADER ═══════ */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="settings-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.headerTitle}>STORAGE SETTINGS</Text>
        </View>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={18} color={TACTICAL.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* ═══════ QUOTA GAUGE ═══════ */}
        {quotaStatus && (
          <View style={styles.gaugeSection}>
            <View style={styles.gaugeHeader}>
              <Text style={styles.gaugeUsed}>{formatSize(quotaStatus.usedMB)}</Text>
              <Text style={styles.gaugeSeparator}>/</Text>
              <Text style={styles.gaugeLimit}>{formatSize(quotaStatus.config.quotaLimitMB)}</Text>
              <View style={[styles.levelBadge, { backgroundColor: getLevelColor(quotaStatus.level) + '20' }]}>
                <View style={[styles.levelDot, { backgroundColor: getLevelColor(quotaStatus.level) }]} />
                <Text style={[styles.levelText, { color: getLevelColor(quotaStatus.level) }]}>
                  {getLevelLabel(quotaStatus.level)}
                </Text>
              </View>
            </View>

            {/* Quota bar */}
            <View style={styles.quotaBarBg}>
              {/* Warning threshold marker */}
              <View style={[styles.thresholdMarker, { left: `${quotaStatus.config.warningThreshold * 100}%` }]} />
              {/* Critical threshold marker */}
              <View style={[styles.thresholdMarker, styles.thresholdCritical, { left: `${quotaStatus.config.criticalThreshold * 100}%` }]} />
              {/* Fill */}
              <View style={[
                styles.quotaBarFill,
                {
                  width: `${Math.min(100, quotaStatus.usedFraction * 100)}%`,
                  backgroundColor: getLevelColor(quotaStatus.level),
                },
              ]} />
            </View>

            <View style={styles.quotaBarLabels}>
              <Text style={styles.quotaBarLabel}>0</Text>
              <Text style={styles.quotaBarLabel}>{formatSize(quotaStatus.config.quotaLimitMB * 0.5)}</Text>
              <Text style={styles.quotaBarLabel}>{formatSize(quotaStatus.config.quotaLimitMB)}</Text>
            </View>

            {/* Summary stats */}
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{quotaStatus.regionBreakdown.length}</Text>
                <Text style={styles.summaryLabel}>REGIONS</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{formatSize(quotaStatus.availableMB)}</Text>
                <Text style={styles.summaryLabel}>AVAILABLE</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, quotaStatus.staleRegionCount > 0 && { color: '#FFB300' }]}>
                  {quotaStatus.staleRegionCount}
                </Text>
                <Text style={styles.summaryLabel}>STALE</Text>
              </View>
            </View>
          </View>
        )}

        {/* ═══════ QUOTA LIMIT SELECTOR ═══════ */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="speedometer-outline" size={12} color={TACTICAL.amber} />
            <Text style={styles.sectionTitle}>QUOTA LIMIT</Text>
          </View>
          <View style={styles.presetRow}>
            {QUOTA_PRESETS.map(preset => {
              const isActive = config.quotaLimitMB === preset.value;
              return (
                <TouchableOpacity
                  key={preset.value}
                  style={[styles.presetChip, isActive && styles.presetChipActive]}
                  onPress={() => updateQuota(preset.value)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.presetChipText, isActive && styles.presetChipTextActive]}>
                    {preset.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ═══════ AUTO-CLEANUP TOGGLE ═══════ */}
        <View style={styles.section}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <View style={styles.toggleHeader}>
                <Ionicons name="flash-outline" size={12} color={TACTICAL.amber} />
                <Text style={styles.sectionTitle}>AUTO-CLEANUP</Text>
              </View>
              <Text style={styles.toggleDesc}>
                Automatically purge oldest regions when approaching quota
              </Text>
            </View>
            <Switch
              value={config.autoCleanupEnabled}
              onValueChange={toggleAutoCleanup}
              trackColor={{ false: TACTICAL.border, true: TACTICAL.amber + '60' }}
              thumbColor={config.autoCleanupEnabled ? TACTICAL.amber : TACTICAL.textMuted}
            />
          </View>
        </View>

        {/* ═══════ STALE REGION AGE ═══════ */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="time-outline" size={12} color={TACTICAL.amber} />
            <Text style={styles.sectionTitle}>STALE THRESHOLD</Text>
            <Text style={styles.sectionSub}>Regions older than this are eligible for cleanup</Text>
          </View>
          <View style={styles.presetRow}>
            {STALE_PRESETS.map(preset => {
              const isActive = config.staleRegionDays === preset.value;
              return (
                <TouchableOpacity
                  key={preset.value}
                  style={[styles.presetChip, isActive && styles.presetChipActive]}
                  onPress={() => updateStaleDays(preset.value)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.presetChipText, isActive && styles.presetChipTextActive]}>
                    {preset.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ═══════ PER-REGION BREAKDOWN ═══════ */}
        {breakdown.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="bar-chart-outline" size={12} color={TACTICAL.amber} />
              <Text style={styles.sectionTitle}>REGION BREAKDOWN</Text>
              <Text style={styles.sectionSub}>{breakdown.length} regions</Text>
            </View>

            {breakdown.map((region) => (
              <View key={region.id} style={styles.regionRow}>
                <View style={styles.regionInfo}>
                  <View style={styles.regionNameRow}>
                    <View style={[styles.regionStatusDot, { backgroundColor: getStatusColor(region.status) }]} />
                    <Text style={styles.regionName} numberOfLines={1}>{region.name}</Text>
                    {region.isStale && (
                      <View style={styles.staleBadge}>
                        <Text style={styles.staleBadgeText}>STALE</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.regionMeta}>
                    <Text style={styles.regionMetaText}>{formatSize(region.sizeMB)}</Text>
                    <Text style={styles.regionMetaDot}>{'\u00B7'}</Text>
                    <Text style={styles.regionMetaText}>{region.zoomRange}</Text>
                    <Text style={styles.regionMetaDot}>{'\u00B7'}</Text>
                    <Text style={styles.regionMetaText}>{region.styleKey.toUpperCase()}</Text>
                    <Text style={styles.regionMetaDot}>{'\u00B7'}</Text>
                    <Text style={[
                      styles.regionMetaText,
                      region.ageDays > config.staleRegionDays && { color: '#FFB300' },
                    ]}>
                      {region.ageDays}d old
                    </Text>
                  </View>
                </View>
                {/* Size bar */}
                <View style={styles.regionBarBg}>
                  <View style={[
                    styles.regionBarFill,
                    {
                      width: `${Math.max(2, (region.sizeMB / maxRegionSize) * 100)}%`,
                      backgroundColor: region.isStale ? '#FFB300' : getStatusColor(region.status),
                    },
                  ]} />
                </View>
                {/* Fraction label */}
                <Text style={styles.regionFraction}>
                  {(region.fractionOfTotal * 100).toFixed(0)}%
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ═══════ ACTIONS ═══════ */}
        <View style={styles.actionsSection}>
          {/* Purge stale */}
          <TouchableOpacity
            style={[
              styles.actionBtn,
              styles.actionBtnWarning,
              (!quotaStatus || quotaStatus.staleRegionCount === 0) && styles.actionBtnDisabled,
            ]}
            onPress={handlePurgeStale}
            activeOpacity={0.8}
            disabled={isPurging || !quotaStatus || quotaStatus.staleRegionCount === 0}
          >
            {isPurging ? (
              <ActivityIndicator size="small" color="#FFB300" />
            ) : (
              <Ionicons name="hourglass-outline" size={14} color="#FFB300" />
            )}
            <View style={styles.actionBtnContent}>
              <Text style={styles.actionBtnTitle}>PURGE STALE REGIONS</Text>
              <Text style={styles.actionBtnSub}>
                {quotaStatus && quotaStatus.staleRegionCount > 0
                  ? `${quotaStatus.staleRegionCount} regions, ~${formatSize(quotaStatus.staleSizeMB)}`
                  : 'No stale regions'
                }
              </Text>
            </View>
          </TouchableOpacity>

          {/* Auto-cleanup */}
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnAmber]}
            onPress={handleAutoCleanup}
            activeOpacity={0.8}
            disabled={isPurging}
          >
            {isPurging ? (
              <ActivityIndicator size="small" color={TACTICAL.amber} />
            ) : (
              <Ionicons name="flash-outline" size={14} color={TACTICAL.amber} />
            )}
            <View style={styles.actionBtnContent}>
              <Text style={[styles.actionBtnTitle, { color: TACTICAL.amber }]}>RUN AUTO-CLEANUP</Text>
              <Text style={styles.actionBtnSub}>
                Purge stale + oldest regions to reach healthy level
              </Text>
            </View>
          </TouchableOpacity>

          {/* Clear all */}
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnDanger]}
            onPress={handleClearAll}
            activeOpacity={0.8}
            disabled={isClearing || !quotaStatus || quotaStatus.regionBreakdown.length === 0}
          >
            {isClearing ? (
              <ActivityIndicator size="small" color="#EF5350" />
            ) : (
              <Ionicons name="trash-outline" size={14} color="#EF5350" />
            )}
            <View style={styles.actionBtnContent}>
              <Text style={[styles.actionBtnTitle, { color: '#EF5350' }]}>CLEAR ALL CACHE</Text>
              <Text style={styles.actionBtnSub}>
                Delete all cached regions and tiles
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Reset to defaults */}
        <TouchableOpacity
          style={styles.resetBtn}
          onPress={() => {
            tileCacheStore.setQuotaConfig(DEFAULT_QUOTA_CONFIG);
            setConfig(DEFAULT_QUOTA_CONFIG);
            refreshData();
            showToast('SETTINGS RESET TO DEFAULTS');
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="refresh-outline" size={11} color={TACTICAL.textMuted} />
          <Text style={styles.resetBtnText}>RESET TO DEFAULTS</Text>
        </TouchableOpacity>

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    borderTopColor: TACTICAL.border,
    backgroundColor: TACTICAL.panel,
    maxHeight: 520,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: DENSITY.cardPad,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: TACTICAL.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    ...TYPO.T4,
    color: TACTICAL.amber,
    fontSize: 9,
    letterSpacing: 3,
  },

  scrollContent: {
    paddingHorizontal: DENSITY.cardPad,
  },

  // Gauge section
  gaugeSection: {
    paddingTop: 14,
    paddingBottom: 10,
    gap: 8,
  },
  gaugeHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  gaugeUsed: {
    ...TYPO.K1,
    fontSize: 22,
    color: TACTICAL.text,
  },
  gaugeSeparator: {
    ...TYPO.B2,
    fontSize: 14,
    color: TACTICAL.textMuted,
    marginHorizontal: 2,
  },
  gaugeLimit: {
    ...TYPO.K2,
    fontSize: 14,
    color: TACTICAL.textMuted,
  },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginLeft: 'auto',
  },
  levelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  levelText: {
    ...TYPO.U2,
    fontSize: 7,
    letterSpacing: 2,
  },

  // Quota bar
  quotaBarBg: {
    height: 8,
    backgroundColor: 'rgba(62,79,60,0.15)',
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  quotaBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  thresholdMarker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: '#FFB300' + '60',
    zIndex: 1,
  },
  thresholdCritical: {
    backgroundColor: '#EF5350' + '60',
  },
  quotaBarLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  quotaBarLabel: {
    ...TYPO.B2,
    fontSize: 7,
    color: TACTICAL.textMuted,
  },

  // Summary row
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingTop: 4,
  },
  summaryItem: {
    alignItems: 'center',
    gap: 2,
  },
  summaryValue: {
    ...TYPO.K3,
    fontSize: 13,
    color: TACTICAL.text,
  },
  summaryLabel: {
    ...TYPO.U2,
    fontSize: 6,
    letterSpacing: 2,
    color: TACTICAL.textMuted,
  },
  summaryDivider: {
    width: 1,
    height: 24,
    backgroundColor: TACTICAL.border,
  },

  // Sections
  section: {
    paddingTop: 14,
    gap: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  sectionTitle: {
    ...TYPO.U2,
    fontSize: 8,
    letterSpacing: 3,
    color: TACTICAL.amber,
  },
  sectionSub: {
    ...TYPO.B2,
    fontSize: 9,
    color: TACTICAL.textMuted,
    marginLeft: 'auto',
  },

  // Preset chips
  presetRow: {
    flexDirection: 'row',
    gap: 6,
  },
  presetChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  presetChipActive: {
    borderColor: TACTICAL.amber,
    backgroundColor: 'rgba(196,138,44,0.1)',
  },
  presetChipText: {
    ...TYPO.U2,
    fontSize: 8,
    letterSpacing: 1,
    color: TACTICAL.textMuted,
  },
  presetChipTextActive: {
    color: TACTICAL.amber,
  },

  // Toggle row
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  toggleInfo: {
    flex: 1,
    gap: 4,
  },
  toggleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toggleDesc: {
    ...TYPO.B2,
    fontSize: 10,
    color: TACTICAL.textMuted,
    lineHeight: 14,
  },

  // Region breakdown
  regionRow: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: TACTICAL.border + '40',
    gap: 4,
  },
  regionInfo: {
    gap: 2,
  },
  regionNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  regionStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  regionName: {
    ...TYPO.B2,
    fontSize: 11,
    color: TACTICAL.text,
    flex: 1,
  },
  staleBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: 'rgba(255,179,0,0.12)',
  },
  staleBadgeText: {
    ...TYPO.U2,
    fontSize: 6,
    letterSpacing: 1,
    color: '#FFB300',
  },
  regionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 12,
  },
  regionMetaText: {
    ...TYPO.B2,
    fontSize: 8,
    color: TACTICAL.textMuted,
  },
  regionMetaDot: {
    ...TYPO.B2,
    fontSize: 8,
    color: TACTICAL.textMuted,
  },
  regionBarBg: {
    height: 4,
    backgroundColor: 'rgba(62,79,60,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
    marginLeft: 12,
  },
  regionBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  regionFraction: {
    ...TYPO.K3,
    fontSize: 8,
    color: TACTICAL.textMuted,
    textAlign: 'right',
    paddingRight: 2,
  },

  // Actions
  actionsSection: {
    paddingTop: 16,
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  actionBtnWarning: {
    borderColor: '#FFB300' + '30',
    backgroundColor: 'rgba(255,179,0,0.04)',
  },
  actionBtnAmber: {
    borderColor: TACTICAL.amber + '30',
    backgroundColor: 'rgba(196,138,44,0.04)',
  },
  actionBtnDanger: {
    borderColor: '#EF5350' + '30',
    backgroundColor: 'rgba(239,83,80,0.04)',
  },
  actionBtnDisabled: {
    opacity: 0.4,
  },
  actionBtnContent: {
    flex: 1,
    gap: 2,
  },
  actionBtnTitle: {
    ...TYPO.U2,
    fontSize: 8,
    letterSpacing: 2,
    color: '#FFB300',
  },
  actionBtnSub: {
    ...TYPO.B2,
    fontSize: 9,
    color: TACTICAL.textMuted,
  },

  // Reset
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginTop: 12,
  },
  resetBtnText: {
    ...TYPO.U2,
    fontSize: 7,
    letterSpacing: 2,
    color: TACTICAL.textMuted,
  },
});



