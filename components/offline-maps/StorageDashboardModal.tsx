/**
 * StorageDashboardModal — Full-featured Storage Management Dashboard
 *
 * Accessible from the Navigate tab. Shows:
 *   - Total cached size with pie chart breakdown by region
 *   - Per-region last-accessed date and access frequency
 *   - Device storage gauge showing free vs used space
 *   - 'Smart Cleanup' button using LRU algorithm
 *   - Configurable auto-cleanup rules (max cache age, max total size, priority protection)
 *   - LRU score visualization per region
 *   - Delete individual cached regions
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
    Switch,
  TextInput,
  Animated,
  ActivityIndicator,
  Alert,
  Platform,
  Dimensions,
} from 'react-native';
import { useSheetLayout } from '../../lib/useSheetLayout';

import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, TYPO, DENSITY } from '../../lib/theme';
import { tileCacheStore, type TileCacheRegion } from '../../lib/tileCacheStore';
import {
  getCleanupRules,
  setCleanupRules,
  resetCleanupRules,
  computeLRUScores,
  smartCleanup,
  getDeviceStorageStatus,
  getPieChartData,
  trackAccess,
  formatRelativeTime,
  formatStorageSize,
  type CleanupRules,
  type LRUScore,
  type SmartCleanupResult,
  type DeviceStorageStatus,
  type PieSlice,
  DEFAULT_CLEANUP_RULES,
} from '../../lib/storageCleanupEngine';

const { width: SCREEN_W } = Dimensions.get('window');

interface Props {
  visible?: boolean;
  onClose?: () => void;
  embedded?: boolean;
  showToast: (msg: string) => void;
}

type DashboardTab = 'overview' | 'regions' | 'rules';

export default function StorageDashboardModal({
  visible = false,
  onClose,
  embedded = false,
  showToast,
}: Props) {
  // ── Safe sheet layout — ensures content is visible on all devices ──
  const { sheetMaxHeight, contentBottomPadding, safeBottom } = useSheetLayout();

  const [tab, setTab] = useState<DashboardTab>('overview');
  const [deviceStatus, setDeviceStatus] = useState<DeviceStorageStatus | null>(null);
  const [lruScores, setLruScores] = useState<LRUScore[]>([]);
  const [pieData, setPieData] = useState<PieSlice[]>([]);
  const [rules, setRulesState] = useState<CleanupRules>(getCleanupRules());
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [lastResult, setLastResult] = useState<SmartCleanupResult | null>(null);
  const [expandedRegion, setExpandedRegion] = useState<string | null>(null);
  const [hasRuleChanges, setHasRuleChanges] = useState(false);
  const [deletingRegion, setDeletingRegion] = useState<string | null>(null);


  // Editable rule fields
  const [editMinFree, setEditMinFree] = useState(String(rules.minFreeSpaceMB));
  const [editMaxCache, setEditMaxCache] = useState(String(rules.maxCacheSizeMB));
  const [editMaxAge, setEditMaxAge] = useState(String(rules.maxCacheAgeDays));
  const [editProtectionDays, setEditProtectionDays] = useState(String(rules.recentAccessProtectionDays));
  const [editCheckInterval, setEditCheckInterval] = useState(String(rules.checkIntervalMinutes));

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const loopAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  // Cleanup animation on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (loopAnimRef.current) {
        loopAnimRef.current.stop();
        loopAnimRef.current = null;
      }
      pulseAnim.stopAnimation();
    };
  }, [pulseAnim]);


  // Load data when modal opens
  useEffect(() => {
    if (!visible) return;
    loadData();
  }, [visible]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [status] = await Promise.all([
        getDeviceStorageStatus(),
      ]);
      setDeviceStatus(status);
      setLruScores(computeLRUScores());
      setPieData(getPieChartData());

      const r = getCleanupRules();
      setRulesState(r);
      setEditMinFree(String(r.minFreeSpaceMB));
      setEditMaxCache(String(r.maxCacheSizeMB));
      setEditMaxAge(String(r.maxCacheAgeDays));
      setEditProtectionDays(String(r.recentAccessProtectionDays));
      setEditCheckInterval(String(r.checkIntervalMinutes));
      setHasRuleChanges(false);
    } catch (e) {
      console.warn('[StorageDashboard] Load failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Smart cleanup handler
  const handleSmartCleanup = useCallback(async () => {
    const doClean = async () => {
      setCleaning(true);
      // Pulse animation — store reference for proper cleanup
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.6, duration: 400, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        ])
      );
      loopAnimRef.current = loop;
      loop.start();

      try {
        const result = await smartCleanup(0, 'manual');
        setLastResult(result);
        showToast(result.message.toUpperCase());
        await loadData();
      } catch (e: any) {
        showToast(`CLEANUP FAILED: ${e?.message || 'Unknown'}`);
      } finally {
        setCleaning(false);
        if (loopAnimRef.current) {
          loopAnimRef.current.stop();
          loopAnimRef.current = null;
        }
        pulseAnim.setValue(1);
      }
    };

    if (Platform.OS === 'web') {
      if (confirm('Run Smart Cleanup? This will delete least-recently-used cached regions to free space. Protected regions are preserved.')) {
        doClean();
      }
    } else {
      Alert.alert('Smart Cleanup', 'Delete least-recently-used cached regions? Protected regions are preserved.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clean Up', style: 'destructive', onPress: doClean },
      ]);
    }
  }, [showToast, loadData, pulseAnim]);


  // Delete single region
  const handleDeleteRegion = useCallback(async (regionId: string, regionName: string) => {
    const doDelete = async () => {
      setDeletingRegion(regionId);
      try {
        await tileCacheStore.deleteRegion(regionId);
        showToast(`DELETED: ${regionName}`);
        await loadData();
      } catch {
        showToast('DELETE FAILED');
      } finally {
        setDeletingRegion(null);
      }
    };

    if (Platform.OS === 'web') {
      if (confirm(`Delete cached region "${regionName}"?`)) doDelete();
    } else {
      Alert.alert('Delete Region', `Delete "${regionName}" and all its cached tiles?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  }, [showToast, loadData]);

  // Save rules
  const handleSaveRules = useCallback(() => {
    const updated = setCleanupRules({
      minFreeSpaceMB: Math.max(50, parseInt(editMinFree, 10) || DEFAULT_CLEANUP_RULES.minFreeSpaceMB),
      maxCacheSizeMB: Math.max(100, parseInt(editMaxCache, 10) || DEFAULT_CLEANUP_RULES.maxCacheSizeMB),
      maxCacheAgeDays: Math.max(1, parseInt(editMaxAge, 10) || DEFAULT_CLEANUP_RULES.maxCacheAgeDays),
      recentAccessProtectionDays: Math.max(0, parseInt(editProtectionDays, 10) || DEFAULT_CLEANUP_RULES.recentAccessProtectionDays),
      checkIntervalMinutes: Math.max(5, parseInt(editCheckInterval, 10) || DEFAULT_CLEANUP_RULES.checkIntervalMinutes),
      autoCleanupEnabled: rules.autoCleanupEnabled,
      protectActiveExpeditions: rules.protectActiveExpeditions,
    });
    setRulesState(updated);
    setHasRuleChanges(false);
    showToast('CLEANUP RULES SAVED');
  }, [editMinFree, editMaxCache, editMaxAge, editProtectionDays, editCheckInterval, rules, showToast]);

  const handleResetRules = useCallback(() => {
    const defaults = resetCleanupRules();
    setRulesState(defaults);
    setEditMinFree(String(defaults.minFreeSpaceMB));
    setEditMaxCache(String(defaults.maxCacheSizeMB));
    setEditMaxAge(String(defaults.maxCacheAgeDays));
    setEditProtectionDays(String(defaults.recentAccessProtectionDays));
    setEditCheckInterval(String(defaults.checkIntervalMinutes));
    setHasRuleChanges(false);
    showToast('RULES RESET TO DEFAULTS');
  }, [showToast]);

  const markChanged = () => setHasRuleChanges(true);

  // Computed values
  const totalCacheMB = useMemo(() => pieData.reduce((sum, s) => sum + s.value, 0), [pieData]);
  const protectedCount = useMemo(() => lruScores.filter(s => s.isProtected).length, [lruScores]);
  const cleanableCount = useMemo(() => lruScores.filter(s => !s.isProtected && s.score > 10).length, [lruScores]);
  const cleanableMB = useMemo(() =>
    lruScores.filter(s => !s.isProtected && s.score > 10).reduce((sum, s) => sum + s.sizeMB, 0),
    [lruScores]
  );

  const getScoreColor = (score: number): string => {
    if (score >= 70) return '#EF5350';
    if (score >= 50) return '#FFB300';
    if (score >= 30) return '#C48A2C';
    return '#66BB6A';
  };

  const getLevelColor = (level: string): string => {
    switch (level) {
      case 'critical': return '#EF5350';
      case 'exceeded': return '#EF5350';
      case 'warning': return '#FFB300';
      default: return '#66BB6A';
    }
  };

  // ── Render: Pie Chart (SVG-like using Views) ──────────────
  const renderPieChart = () => {
    if (pieData.length === 0) return null;

    const size = Math.min(SCREEN_W - 80, 200);
    const center = size / 2;
    const radius = center - 4;

    // Build pie segments as colored arcs using conic gradient simulation
    // Since RN doesn't support SVG natively, we'll use a segmented bar chart instead
    return (
      <View style={styles.pieContainer}>
        {/* Circular representation using stacked bars */}
        <View style={[styles.pieRing, { width: size, height: size, borderRadius: size / 2 }]}>
          {/* Background */}
          <View style={[styles.pieInner, { width: size - 24, height: size - 24, borderRadius: (size - 24) / 2 }]}>
            <Text style={styles.pieCenterValue}>{formatStorageSize(totalCacheMB)}</Text>
            <Text style={styles.pieCenterLabel}>TOTAL CACHED</Text>
          </View>
          {/* Colored segments as absolute positioned arcs */}
          {pieData.map((slice, idx) => {
            // Calculate rotation for each segment
            let startAngle = 0;
            for (let i = 0; i < idx; i++) {
              startAngle += (pieData[i].percent / 100) * 360;
            }
            const sweepAngle = (slice.percent / 100) * 360;

            // Only render if segment is visible
            if (sweepAngle < 1) return null;

            return (
              <View
                key={slice.id}
                style={[
                  styles.pieSegmentIndicator,
                  {
                    backgroundColor: slice.color,
                    width: 6,
                    height: radius,
                    left: center - 3,
                    top: 0,
                    // Rotate around bottom-center of the bar (the ring center).
                    // Default RN transform origin is element center (3, radius/2).
                    // We need pivot at (3, center), so offset = center - radius/2.
                    transform: [
                      { translateY: center - radius / 2 },
                      { rotate: `${startAngle}deg` },
                      { translateY: -(center - radius / 2) },
                    ],
                  },
                ]}
              />
            );

          })}
        </View>

        {/* Legend */}
        <View style={styles.pieLegend}>
          {pieData.slice(0, 8).map(slice => (
            <TouchableOpacity
              key={slice.id}
              style={styles.legendItem}
              onPress={() => setExpandedRegion(expandedRegion === slice.id ? null : slice.id)}
              activeOpacity={0.7}
            >
              <View style={[styles.legendDot, { backgroundColor: slice.color }]} />
              <Text style={styles.legendName} numberOfLines={1}>{slice.label}</Text>
              <Text style={styles.legendSize}>{formatStorageSize(slice.value)}</Text>
              <Text style={styles.legendPercent}>{slice.percent}%</Text>
            </TouchableOpacity>
          ))}
          {pieData.length > 8 && (
            <Text style={styles.legendMore}>+{pieData.length - 8} more regions</Text>
          )}
        </View>
      </View>
    );
  };

  // ── Render: Horizontal bar chart (simpler, more reliable) ──
  const renderBarChart = () => {
    if (pieData.length === 0) return null;

    return (
      <View style={styles.barChartContainer}>
        <View style={styles.barChartHeader}>
          <Ionicons name="pie-chart-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.barChartTitle}>CACHE BREAKDOWN</Text>
          <Text style={styles.barChartTotal}>{formatStorageSize(totalCacheMB)}</Text>
        </View>

        {/* Stacked bar */}
        <View style={styles.stackedBar}>
          {pieData.map(slice => (
            <View
              key={slice.id}
              style={[
                styles.stackedSegment,
                {
                  width: `${Math.max(slice.percent, 0.5)}%`,
                  backgroundColor: slice.color,
                },
              ]}
            />
          ))}
        </View>

        {/* Legend grid */}
        <View style={styles.legendGrid}>
          {pieData.slice(0, 10).map(slice => (
            <TouchableOpacity
              key={slice.id}
              style={[
                styles.legendCard,
                expandedRegion === slice.id && styles.legendCardActive,
              ]}
              onPress={() => setExpandedRegion(expandedRegion === slice.id ? null : slice.id)}
              activeOpacity={0.7}
            >
              <View style={styles.legendCardTop}>
                <View style={[styles.legendDotLg, { backgroundColor: slice.color }]} />
                <Text style={styles.legendCardName} numberOfLines={1}>{slice.label}</Text>
                {slice.isProtected && (
                  <Ionicons name="shield-checkmark" size={10} color="#66BB6A" />
                )}
              </View>
              <View style={styles.legendCardBottom}>
                <Text style={styles.legendCardSize}>{formatStorageSize(slice.value)}</Text>
                <Text style={styles.legendCardPercent}>{slice.percent}%</Text>
              </View>
              {expandedRegion === slice.id && (
                <View style={styles.legendCardExpanded}>
                  <View style={styles.legendCardMeta}>
                    <Ionicons name="time-outline" size={9} color={TACTICAL.textMuted} />
                    <Text style={styles.legendCardMetaText}>
                      Last accessed: {formatRelativeTime(slice.lastAccessed)}
                    </Text>
                  </View>
                  <View style={styles.legendCardMeta}>
                    <Ionicons name="eye-outline" size={9} color={TACTICAL.textMuted} />
                    <Text style={styles.legendCardMetaText}>
                      {slice.accessCount} access{slice.accessCount !== 1 ? 'es' : ''}
                    </Text>
                  </View>
                  <View style={styles.legendCardMeta}>
                    <Ionicons name="calendar-outline" size={9} color={TACTICAL.textMuted} />
                    <Text style={styles.legendCardMetaText}>
                      {slice.ageDays}d old
                    </Text>
                  </View>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  // ── Render: Device Storage Gauge ──────────────────────────
  const renderDeviceGauge = () => {
    if (!deviceStatus || deviceStatus.totalMB === 0) return null;

    const levelColor = getLevelColor(deviceStatus.level);
    const cachePercent = deviceStatus.totalMB > 0 ? (deviceStatus.cacheMB / deviceStatus.totalMB) * 100 : 0;
    const otherPercent = deviceStatus.totalMB > 0 ? ((deviceStatus.usedMB - deviceStatus.cacheMB) / deviceStatus.totalMB) * 100 : 0;
    const freePercent = deviceStatus.freePercent;

    return (
      <View style={styles.gaugeCard}>
        <View style={styles.gaugeHeader}>
          <Ionicons name="hardware-chip-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.gaugeTitle}>DEVICE STORAGE</Text>
          <View style={[styles.levelBadge, { backgroundColor: levelColor + '15', borderColor: levelColor + '40' }]}>
            <View style={[styles.levelDot, { backgroundColor: levelColor }]} />
            <Text style={[styles.levelLabel, { color: levelColor }]}>
              {deviceStatus.level.toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Segmented bar */}
        <View style={styles.gaugeBar}>
          {otherPercent > 0.5 && (
            <View style={[styles.gaugeSegment, { width: `${Math.max(otherPercent, 0.5)}%`, backgroundColor: '#5C6370' }]} />
          )}
          {cachePercent > 0.1 && (
            <View style={[styles.gaugeSegment, { width: `${Math.max(cachePercent, 0.5)}%`, backgroundColor: TACTICAL.amber }]} />
          )}
          <View style={[styles.gaugeSegment, {
            flex: 1,
            backgroundColor: deviceStatus.belowThreshold ? 'rgba(239,83,80,0.15)' : 'rgba(102,187,106,0.12)',
          }]} />
          {/* Threshold marker */}
          {deviceStatus.thresholdMB > 0 && deviceStatus.totalMB > 0 && (
            <View style={[
              styles.thresholdLine,
              { right: `${(deviceStatus.thresholdMB / deviceStatus.totalMB) * 100}%` },
            ]} />
          )}
        </View>

        {/* Legend */}
        <View style={styles.gaugeLegend}>
          <View style={styles.gaugeLegendItem}>
            <View style={[styles.gaugeLegendDot, { backgroundColor: TACTICAL.amber }]} />
            <Text style={styles.gaugeLegendLabel}>TILE CACHE</Text>
            <Text style={styles.gaugeLegendValue}>{formatStorageSize(deviceStatus.cacheMB)}</Text>
          </View>
          <View style={styles.gaugeLegendItem}>
            <View style={[styles.gaugeLegendDot, { backgroundColor: '#5C6370' }]} />
            <Text style={styles.gaugeLegendLabel}>OTHER</Text>
            <Text style={styles.gaugeLegendValue}>{formatStorageSize(deviceStatus.usedMB - deviceStatus.cacheMB)}</Text>
          </View>
          <View style={styles.gaugeLegendItem}>
            <View style={[styles.gaugeLegendDot, { backgroundColor: deviceStatus.belowThreshold ? '#EF5350' : '#66BB6A' }]} />
            <Text style={styles.gaugeLegendLabel}>FREE</Text>
            <Text style={[styles.gaugeLegendValue, deviceStatus.belowThreshold && { color: '#EF5350' }]}>
              {formatStorageSize(deviceStatus.freeMB)}
            </Text>
          </View>
        </View>

        {/* Total + threshold */}
        <View style={styles.gaugeFooter}>
          <Text style={styles.gaugeFooterText}>
            Total: {formatStorageSize(deviceStatus.totalMB)}
          </Text>
          <Text style={styles.gaugeFooterText}>
            Threshold: {formatStorageSize(deviceStatus.thresholdMB)} free
          </Text>
        </View>

        {/* Warning */}
        {deviceStatus.belowThreshold && (
          <View style={styles.thresholdWarning}>
            <Ionicons name="alert-circle" size={12} color="#EF5350" />
            <Text style={styles.thresholdWarningText}>
              Device storage below threshold. Need {formatStorageSize(deviceStatus.shortfallMB)} more free space.
            </Text>
          </View>
        )}
      </View>
    );
  };

  // ── Render: Smart Cleanup Button ──────────────────────────
  const renderSmartCleanup = () => (
    <View style={styles.cleanupSection}>
      <View style={styles.cleanupHeader}>
        <Ionicons name="flash-outline" size={16} color={TACTICAL.amber} />
        <Text style={styles.cleanupTitle}>SMART CLEANUP</Text>
      </View>

      <Text style={styles.cleanupDesc}>
        Uses LRU (Least Recently Used) algorithm to identify and remove the least-accessed cached regions while preserving active expedition data.
      </Text>

      {/* KPI summary */}
      <View style={styles.cleanupKPIs}>
        <View style={styles.cleanupKPI}>
          <Text style={styles.cleanupKPIValue}>{lruScores.length}</Text>
          <Text style={styles.cleanupKPILabel}>TOTAL</Text>
        </View>
        <View style={styles.cleanupKPIDivider} />
        <View style={styles.cleanupKPI}>
          <Text style={[styles.cleanupKPIValue, { color: '#66BB6A' }]}>{protectedCount}</Text>
          <Text style={styles.cleanupKPILabel}>PROTECTED</Text>
        </View>
        <View style={styles.cleanupKPIDivider} />
        <View style={styles.cleanupKPI}>
          <Text style={[styles.cleanupKPIValue, { color: '#FFB300' }]}>{cleanableCount}</Text>
          <Text style={styles.cleanupKPILabel}>CLEANABLE</Text>
        </View>
        <View style={styles.cleanupKPIDivider} />
        <View style={styles.cleanupKPI}>
          <Text style={[styles.cleanupKPIValue, { color: '#EF5350' }]}>
            {formatStorageSize(cleanableMB)}
          </Text>
          <Text style={styles.cleanupKPILabel}>FREEABLE</Text>
        </View>
      </View>

      {/* Cleanup button */}
      <Animated.View style={{ opacity: cleaning ? pulseAnim : 1 }}>
        <TouchableOpacity
          style={[styles.cleanupBtn, cleaning && styles.cleanupBtnDisabled]}
          onPress={handleSmartCleanup}
          disabled={cleaning || cleanableCount === 0}
          activeOpacity={0.8}
        >
          {cleaning ? (
            <ActivityIndicator size={14} color="#0B0F12" />
          ) : (
            <Ionicons name="flash" size={16} color="#0B0F12" />
          )}
          <Text style={styles.cleanupBtnText}>
            {cleaning ? 'CLEANING...' : cleanableCount === 0 ? 'NO CLEANUP NEEDED' : 'RUN SMART CLEANUP'}
          </Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Last result */}
      {lastResult && (
        <View style={[styles.resultBanner, {
          borderColor: lastResult.performed ? '#66BB6A30' : TACTICAL.border,
        }]}>
          <Ionicons
            name={lastResult.performed ? 'checkmark-circle' : 'information-circle-outline'}
            size={12}
            color={lastResult.performed ? '#66BB6A' : TACTICAL.textMuted}
          />
          <Text style={[styles.resultText, lastResult.performed && { color: '#66BB6A' }]}>
            {lastResult.message} ({lastResult.durationMs}ms)
          </Text>
        </View>
      )}
    </View>
  );

  // ── Render: Overview Tab ──────────────────────────────────
  const renderOverviewTab = () => (
    <ScrollView
      style={styles.tabContent}
      contentContainerStyle={{ paddingBottom: contentBottomPadding }}
      showsVerticalScrollIndicator={false}
    >
      {renderDeviceGauge()}
      {renderBarChart()}
      {renderSmartCleanup()}
      <View style={{ height: 40 }} />
    </ScrollView>
  );

  // ── Render: Regions Tab ───────────────────────────────────
  const renderRegionsTab = () => (
    <ScrollView
      style={styles.tabContent}
      contentContainerStyle={{ paddingBottom: contentBottomPadding }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.regionsHeader}>
        <Ionicons name="layers-outline" size={14} color={TACTICAL.amber} />
        <Text style={styles.regionsTitle}>CACHED REGIONS</Text>
        <Text style={styles.regionsCount}>{lruScores.length}</Text>
      </View>

      <Text style={styles.regionsDesc}>
        Regions sorted by LRU score. Higher score = better cleanup candidate.
      </Text>

      {lruScores.map(score => {
        const scoreColor = getScoreColor(score.score);
        const isExpanded = expandedRegion === score.regionId;
        const isDeleting = deletingRegion === score.regionId;

        return (
          <TouchableOpacity
            key={score.regionId}
            style={[styles.regionCard, isExpanded && styles.regionCardExpanded]}
            onPress={() => setExpandedRegion(isExpanded ? null : score.regionId)}
            activeOpacity={0.8}
          >
            {/* Score badge */}
            <View style={styles.regionCardHeader}>
              <View style={[styles.scoreBadge, { backgroundColor: scoreColor + '15', borderColor: scoreColor + '40' }]}>
                <Text style={[styles.scoreValue, { color: scoreColor }]}>
                  {Math.round(score.score)}
                </Text>
              </View>

              <View style={styles.regionCardInfo}>
                <Text style={styles.regionCardName} numberOfLines={1}>{score.regionName}</Text>
                <View style={styles.regionCardMeta}>
                  <Text style={styles.regionCardSize}>{formatStorageSize(score.sizeMB)}</Text>
                  <Text style={styles.regionCardDot}>{'\u00B7'}</Text>
                  <Text style={styles.regionCardAccess}>
                    {score.accessCount} access{score.accessCount !== 1 ? 'es' : ''}
                  </Text>
                  <Text style={styles.regionCardDot}>{'\u00B7'}</Text>
                  <Text style={styles.regionCardAge}>{score.ageDays}d old</Text>
                </View>
              </View>

              {score.isProtected ? (
                <View style={styles.protectedBadge}>
                  <Ionicons name="shield-checkmark" size={10} color="#66BB6A" />
                </View>
              ) : (
                <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={TACTICAL.textMuted} />
              )}
            </View>

            {/* Score bar */}
            <View style={styles.scoreBar}>
              <View style={[styles.scoreBarFill, { width: `${Math.min(score.score, 100)}%`, backgroundColor: scoreColor }]} />
            </View>

            {/* Expanded detail */}
            {isExpanded && (
              <View style={styles.regionCardDetail}>
                <View style={styles.detailGrid}>
                  <View style={styles.detailItem}>
                    <Ionicons name="time-outline" size={10} color={TACTICAL.textMuted} />
                    <Text style={styles.detailLabel}>LAST ACCESSED</Text>
                    <Text style={styles.detailValue}>{formatRelativeTime(score.lastAccessedAt)}</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Ionicons name="speedometer-outline" size={10} color={TACTICAL.textMuted} />
                    <Text style={styles.detailLabel}>FREQUENCY</Text>
                    <Text style={styles.detailValue}>{score.accessFrequency.toFixed(2)}/day</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Ionicons name="grid-outline" size={10} color={TACTICAL.textMuted} />
                    <Text style={styles.detailLabel}>TILES</Text>
                    <Text style={styles.detailValue}>
                      {score.tileCount >= 1000 ? `${(score.tileCount / 1000).toFixed(1)}K` : score.tileCount}
                    </Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Ionicons name="navigate-outline" size={10} color={TACTICAL.textMuted} />
                    <Text style={styles.detailLabel}>SOURCE</Text>
                    <Text style={styles.detailValue}>{score.sourceType.replace('-', ' ').toUpperCase()}</Text>
                  </View>
                </View>

                {score.isProtected && score.protectionReason && (
                  <View style={styles.protectionReason}>
                    <Ionicons name="shield-checkmark" size={10} color="#66BB6A" />
                    <Text style={styles.protectionReasonText}>{score.protectionReason}</Text>
                  </View>
                )}

                {!score.isProtected && (
                  <TouchableOpacity
                    style={styles.deleteRegionBtn}
                    onPress={() => handleDeleteRegion(score.regionId, score.regionName)}
                    disabled={isDeleting}
                    activeOpacity={0.7}
                  >
                    {isDeleting ? (
                      <ActivityIndicator size={10} color="#EF5350" />
                    ) : (
                      <Ionicons name="trash-outline" size={12} color="#EF5350" />
                    )}
                    <Text style={styles.deleteRegionBtnText}>
                      {isDeleting ? 'DELETING...' : 'DELETE REGION'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </TouchableOpacity>
        );
      })}

      {lruScores.length === 0 && (
        <View style={styles.emptyState}>
          <Ionicons name="layers-outline" size={36} color={TACTICAL.textMuted} />
          <Text style={styles.emptyTitle}>No Cached Regions</Text>
          <Text style={styles.emptySubtext}>
            Cache map tiles along your routes for offline navigation.
          </Text>
        </View>
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );

  // ── Render: Rules Tab ─────────────────────────────────────
  const renderRulesTab = () => (
    <ScrollView
      style={styles.tabContent}
      contentContainerStyle={{ paddingBottom: contentBottomPadding }}
      showsVerticalScrollIndicator={false}
    >
      {/* Auto-cleanup toggle */}
      <View style={styles.ruleCard}>
        <View style={styles.ruleHeader}>
          <Ionicons name="flash-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.ruleTitle}>AUTO-CLEANUP</Text>
        </View>
        <Text style={styles.ruleDesc}>
          Automatically clean up cached regions when device storage drops below threshold or cache size exceeds limit.
        </Text>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Enable Auto-Cleanup</Text>
          <Switch
            value={rules.autoCleanupEnabled}
            onValueChange={(v) => {
              const updated = setCleanupRules({ autoCleanupEnabled: v });
              setRulesState(updated);
            }}
            trackColor={{ false: 'rgba(255,255,255,0.08)', true: TACTICAL.amber + '40' }}
            thumbColor={rules.autoCleanupEnabled ? TACTICAL.amber : TACTICAL.textMuted}
            style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
          />
        </View>
      </View>

      {/* Protection toggle */}
      <View style={styles.ruleCard}>
        <View style={styles.ruleHeader}>
          <Ionicons name="shield-checkmark-outline" size={14} color="#66BB6A" />
          <Text style={styles.ruleTitle}>EXPEDITION PROTECTION</Text>
        </View>
        <Text style={styles.ruleDesc}>
          Never auto-delete regions associated with active expeditions or routes.
        </Text>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Protect Active Expeditions</Text>
          <Switch
            value={rules.protectActiveExpeditions}
            onValueChange={(v) => {
              const updated = setCleanupRules({ protectActiveExpeditions: v });
              setRulesState(updated);
            }}
            trackColor={{ false: 'rgba(255,255,255,0.08)', true: '#66BB6A40' }}
            thumbColor={rules.protectActiveExpeditions ? '#66BB6A' : TACTICAL.textMuted}
            style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
          />
        </View>
      </View>

      {/* Min free space threshold */}
      <View style={styles.ruleCard}>
        <View style={styles.ruleHeader}>
          <Ionicons name="hardware-chip-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.ruleTitle}>MIN FREE SPACE THRESHOLD</Text>
        </View>
        <Text style={styles.ruleDesc}>
          Auto-cleanup triggers when device free space drops below this value.
        </Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.numInput}
            value={editMinFree}
            onChangeText={(v) => { setEditMinFree(v); markChanged(); }}
            keyboardType="number-pad"
            placeholder="500"
            placeholderTextColor={TACTICAL.textMuted + '60'}
          />
          <Text style={styles.inputUnit}>MB</Text>
          <View style={styles.presetRow}>
            {[250, 500, 1000, 2000].map(v => (
              <TouchableOpacity
                key={v}
                style={[styles.presetBtn, editMinFree === String(v) && styles.presetBtnActive]}
                onPress={() => { setEditMinFree(String(v)); markChanged(); }}
              >
                <Text style={[styles.presetText, editMinFree === String(v) && styles.presetTextActive]}>
                  {v >= 1000 ? `${v / 1000}G` : `${v}M`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* Max cache size */}
      <View style={styles.ruleCard}>
        <View style={styles.ruleHeader}>
          <Ionicons name="cloud-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.ruleTitle}>MAX CACHE SIZE</Text>
        </View>
        <Text style={styles.ruleDesc}>
          Maximum total tile cache size. Cleanup triggers when exceeded.
        </Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.numInput}
            value={editMaxCache}
            onChangeText={(v) => { setEditMaxCache(v); markChanged(); }}
            keyboardType="number-pad"
            placeholder="2048"
            placeholderTextColor={TACTICAL.textMuted + '60'}
          />
          <Text style={styles.inputUnit}>MB</Text>
          <View style={styles.presetRow}>
            {[512, 1024, 2048, 4096].map(v => (
              <TouchableOpacity
                key={v}
                style={[styles.presetBtn, editMaxCache === String(v) && styles.presetBtnActive]}
                onPress={() => { setEditMaxCache(String(v)); markChanged(); }}
              >
                <Text style={[styles.presetText, editMaxCache === String(v) && styles.presetTextActive]}>
                  {v >= 1024 ? `${v / 1024}G` : `${v}M`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* Max cache age */}
      <View style={styles.ruleCard}>
        <View style={styles.ruleHeader}>
          <Ionicons name="calendar-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.ruleTitle}>MAX CACHE AGE</Text>
        </View>
        <Text style={styles.ruleDesc}>
          Regions older than this are prioritized for cleanup.
        </Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.numInput}
            value={editMaxAge}
            onChangeText={(v) => { setEditMaxAge(v); markChanged(); }}
            keyboardType="number-pad"
            placeholder="90"
            placeholderTextColor={TACTICAL.textMuted + '60'}
          />
          <Text style={styles.inputUnit}>days</Text>
          <View style={styles.presetRow}>
            {[30, 60, 90, 180].map(v => (
              <TouchableOpacity
                key={v}
                style={[styles.presetBtn, editMaxAge === String(v) && styles.presetBtnActive]}
                onPress={() => { setEditMaxAge(String(v)); markChanged(); }}
              >
                <Text style={[styles.presetText, editMaxAge === String(v) && styles.presetTextActive]}>
                  {v}d
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* Recent access protection */}
      <View style={styles.ruleCard}>
        <View style={styles.ruleHeader}>
          <Ionicons name="eye-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.ruleTitle}>RECENT ACCESS PROTECTION</Text>
        </View>
        <Text style={styles.ruleDesc}>
          Regions accessed within this window are protected from auto-cleanup.
        </Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.numInput}
            value={editProtectionDays}
            onChangeText={(v) => { setEditProtectionDays(v); markChanged(); }}
            keyboardType="number-pad"
            placeholder="7"
            placeholderTextColor={TACTICAL.textMuted + '60'}
          />
          <Text style={styles.inputUnit}>days</Text>
          <View style={styles.presetRow}>
            {[3, 7, 14, 30].map(v => (
              <TouchableOpacity
                key={v}
                style={[styles.presetBtn, editProtectionDays === String(v) && styles.presetBtnActive]}
                onPress={() => { setEditProtectionDays(String(v)); markChanged(); }}
              >
                <Text style={[styles.presetText, editProtectionDays === String(v) && styles.presetTextActive]}>
                  {v}d
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* Check interval */}
      <View style={styles.ruleCard}>
        <View style={styles.ruleHeader}>
          <Ionicons name="timer-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.ruleTitle}>CHECK INTERVAL</Text>
        </View>
        <Text style={styles.ruleDesc}>
          Minimum time between automatic cleanup checks.
        </Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.numInput}
            value={editCheckInterval}
            onChangeText={(v) => { setEditCheckInterval(v); markChanged(); }}
            keyboardType="number-pad"
            placeholder="30"
            placeholderTextColor={TACTICAL.textMuted + '60'}
          />
          <Text style={styles.inputUnit}>min</Text>
          <View style={styles.presetRow}>
            {[15, 30, 60, 120].map(v => (
              <TouchableOpacity
                key={v}
                style={[styles.presetBtn, editCheckInterval === String(v) && styles.presetBtnActive]}
                onPress={() => { setEditCheckInterval(String(v)); markChanged(); }}
              >
                <Text style={[styles.presetText, editCheckInterval === String(v) && styles.presetTextActive]}>
                  {v >= 60 ? `${v / 60}h` : `${v}m`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* Save / Reset */}
      <View style={styles.ruleActions}>
        <TouchableOpacity
          style={[styles.saveBtn, !hasRuleChanges && styles.saveBtnDisabled]}
          onPress={handleSaveRules}
          disabled={!hasRuleChanges}
          activeOpacity={0.7}
        >
          <Ionicons name="save-outline" size={14} color={hasRuleChanges ? '#0B0F12' : TACTICAL.textMuted} />
          <Text style={[styles.saveBtnText, !hasRuleChanges && { color: TACTICAL.textMuted }]}>
            SAVE RULES
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.resetBtn} onPress={handleResetRules} activeOpacity={0.7}>
          <Ionicons name="refresh-outline" size={12} color={TACTICAL.textMuted} />
          <Text style={styles.resetBtnText}>DEFAULTS</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );

  // ── Main render ───────────────────────────────────────────
  if (!embedded && !visible) return null;

  const content = (
    <>
      {/* Tab bar */}
      <View style={styles.tabBar}>
        {([
          { key: 'overview' as DashboardTab, label: 'OVERVIEW', icon: 'pie-chart-outline' as const },
          { key: 'regions' as DashboardTab, label: 'REGIONS', icon: 'layers-outline' as const },
          { key: 'rules' as DashboardTab, label: 'RULES', icon: 'settings-outline' as const },
        ]).map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabItem, tab === t.key && styles.tabItemActive]}
            onPress={() => setTab(t.key)}
            activeOpacity={0.7}
          >
            <Ionicons name={t.icon} size={12} color={tab === t.key ? TACTICAL.amber : TACTICAL.textMuted} />
            <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={TACTICAL.amber} />
          <Text style={styles.loadingText}>Analyzing storage...</Text>
        </View>
      ) : (
        <>
          {tab === 'overview' && renderOverviewTab()}
          {tab === 'regions' && renderRegionsTab()}
          {tab === 'rules' && renderRulesTab()}
        </>
      )}
    </>
  );

  if (embedded) {
    return <View style={{ paddingTop: 6 }}>{content}</View>;
  }

  return (
    <View
      style={[
        styles.sheet,
        {
          maxHeight: sheetMaxHeight,
          paddingBottom: safeBottom,
        },
      ]}
    >
      {/* Handle */}
      <View style={styles.handle} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="server-outline" size={18} color={TACTICAL.amber} />
          <Text style={styles.headerTitle}>STORAGE DASHBOARD</Text>
        </View>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="close" size={22} color={TACTICAL.textMuted} />
        </TouchableOpacity>
      </View>

      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: TACTICAL.panel,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    // maxHeight is now set dynamically via useSheetLayout
    // paddingBottom is now set dynamically for safe area
    borderTopWidth: 2,
    borderColor: TACTICAL.amber + '30',
  },

  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(138,138,133,0.3)',
    alignSelf: 'center', marginTop: 10, marginBottom: 4,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: TACTICAL.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { ...TYPO.T2, color: TACTICAL.amber, fontSize: 14 },

  // Tab bar
  tabBar: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: TACTICAL.border,
    paddingHorizontal: 8,
  },
  tabItem: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 10,
  },
  tabItemActive: { borderBottomWidth: 2, borderBottomColor: TACTICAL.amber },
  tabLabel: { ...TYPO.U2, fontSize: 8, color: TACTICAL.textMuted, letterSpacing: 2 },
  tabLabelActive: { color: TACTICAL.amber },

  tabContent: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },

  loadingContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 60,
  },
  loadingText: { ...TYPO.B2, fontSize: 11, color: TACTICAL.textMuted },

  // ── Pie/Bar Chart ─────────────────────────────────────────
  pieContainer: { gap: 12, marginBottom: 16 },
  pieRing: {
    alignSelf: 'center', alignItems: 'center', justifyContent: 'center',
    backgroundColor: TACTICAL.border + '30', overflow: 'hidden',
  },
  pieInner: {
    backgroundColor: TACTICAL.panel, alignItems: 'center', justifyContent: 'center',
    zIndex: 2,
  },
  pieCenterValue: { ...TYPO.K1, color: TACTICAL.text, fontSize: 16 },
  pieCenterLabel: { ...TYPO.U2, fontSize: 6, color: TACTICAL.textMuted, letterSpacing: 2 },
  pieSegmentIndicator: { position: 'absolute', borderRadius: 3 },
  pieLegend: { gap: 4 },
  legendItem: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3,
  },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendName: { ...TYPO.B2, fontSize: 11, color: TACTICAL.text, flex: 1 },
  legendSize: { ...TYPO.K3, fontSize: 10, color: TACTICAL.textMuted },
  legendPercent: { ...TYPO.K3, fontSize: 10, color: TACTICAL.textMuted, width: 38, textAlign: 'right' },
  legendMore: { ...TYPO.B2, fontSize: 10, color: TACTICAL.textMuted, textAlign: 'center', marginTop: 4 },

  // Bar chart
  barChartContainer: { marginBottom: 16, gap: 10 },
  barChartHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barChartTitle: { ...TYPO.T4, color: TACTICAL.amber, fontSize: 9, letterSpacing: 4, flex: 1 },
  barChartTotal: { ...TYPO.K2, color: TACTICAL.text, fontSize: 14 },
  stackedBar: {
    height: 12, borderRadius: 6, overflow: 'hidden', flexDirection: 'row',
    backgroundColor: 'rgba(62,79,60,0.1)',
  },
  stackedSegment: { height: '100%' },
  legendGrid: { gap: 4 },
  legendCard: {
    flexDirection: 'column', padding: 8, borderRadius: 8,
    borderWidth: 1, borderColor: TACTICAL.border, backgroundColor: 'rgba(62,79,60,0.04)',
  },
  legendCardActive: { borderColor: TACTICAL.amber + '40', backgroundColor: 'rgba(196,138,44,0.06)' },
  legendCardTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDotLg: { width: 10, height: 10, borderRadius: 5 },
  legendCardName: { ...TYPO.B1, fontSize: 11, color: TACTICAL.text, flex: 1 },
  legendCardBottom: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, paddingLeft: 16 },
  legendCardSize: { ...TYPO.K3, fontSize: 10, color: TACTICAL.textMuted },
  legendCardPercent: { ...TYPO.K3, fontSize: 10, color: TACTICAL.amber },
  legendCardExpanded: { marginTop: 8, paddingLeft: 16, gap: 4 },
  legendCardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendCardMetaText: { ...TYPO.B2, fontSize: 9, color: TACTICAL.textMuted },

  // ── Device Gauge ──────────────────────────────────────────
  gaugeCard: {
    borderRadius: 12, borderWidth: 1, borderColor: TACTICAL.border,
    backgroundColor: 'rgba(62,79,60,0.04)', padding: DENSITY.cardPad, gap: 10, marginBottom: 16,
  },
  gaugeHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gaugeTitle: { ...TYPO.T4, color: TACTICAL.amber, fontSize: 9, letterSpacing: 4, flex: 1 },
  levelBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, borderWidth: 1,
  },
  levelDot: { width: 6, height: 6, borderRadius: 3 },
  levelLabel: { ...TYPO.U2, fontSize: 7, letterSpacing: 2 },
  gaugeBar: {
    height: 10, borderRadius: 5, overflow: 'hidden', flexDirection: 'row',
    backgroundColor: 'rgba(62,79,60,0.1)', position: 'relative',
  },
  gaugeSegment: { height: '100%' },
  thresholdLine: {
    position: 'absolute', top: -2, bottom: -2, width: 2,
    backgroundColor: '#EF535080', zIndex: 1,
  },
  gaugeLegend: { flexDirection: 'row', justifyContent: 'space-between' },
  gaugeLegendItem: { flex: 1, alignItems: 'center', gap: 3 },
  gaugeLegendDot: { width: 8, height: 4, borderRadius: 2 },
  gaugeLegendLabel: { ...TYPO.U2, fontSize: 6, letterSpacing: 2, color: TACTICAL.textMuted },
  gaugeLegendValue: { ...TYPO.K3, fontSize: 10, color: TACTICAL.text },
  gaugeFooter: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingTop: 4, borderTopWidth: 1, borderTopColor: TACTICAL.border,
  },
  gaugeFooterText: { ...TYPO.B2, fontSize: 9, color: TACTICAL.textMuted },
  thresholdWarning: {
    flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8,
    borderRadius: 8, backgroundColor: 'rgba(239,83,80,0.08)',
    borderWidth: 1, borderColor: '#EF535025',
  },
  thresholdWarningText: { ...TYPO.B2, fontSize: 10, color: '#EF5350', flex: 1, lineHeight: 14 },

  // ── Smart Cleanup ─────────────────────────────────────────
  cleanupSection: {
    borderRadius: 12, borderWidth: 1, borderColor: TACTICAL.amber + '25',
    backgroundColor: 'rgba(196,138,44,0.04)', padding: DENSITY.cardPad, gap: 10, marginBottom: 16,
  },
  cleanupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cleanupTitle: { ...TYPO.T4, color: TACTICAL.amber, fontSize: 9, letterSpacing: 4 },
  cleanupDesc: { ...TYPO.B2, fontSize: 10, color: TACTICAL.textMuted, lineHeight: 15 },
  cleanupKPIs: { flexDirection: 'row', alignItems: 'center' },
  cleanupKPI: { flex: 1, alignItems: 'center', gap: 3 },
  cleanupKPIValue: { ...TYPO.K2, fontSize: 14, color: TACTICAL.text },
  cleanupKPILabel: { ...TYPO.U2, fontSize: 6, letterSpacing: 2, color: TACTICAL.textMuted },
  cleanupKPIDivider: { width: 1, height: 24, backgroundColor: TACTICAL.border },
  cleanupBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12, borderRadius: 8, backgroundColor: TACTICAL.amber,
  },
  cleanupBtnDisabled: { opacity: 0.5 },
  cleanupBtnText: { ...TYPO.U1, fontSize: 11, color: '#0B0F12', letterSpacing: 3 },
  resultBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6, padding: 8,
    borderRadius: 8, borderWidth: 1, backgroundColor: 'rgba(62,79,60,0.04)',
  },
  resultText: { ...TYPO.B2, fontSize: 10, color: TACTICAL.textMuted, flex: 1, lineHeight: 14 },

  // ── Regions Tab ───────────────────────────────────────────
  regionsHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4,
  },
  regionsTitle: { ...TYPO.T4, color: TACTICAL.amber, fontSize: 9, letterSpacing: 4, flex: 1 },
  regionsCount: { ...TYPO.K3, fontSize: 12, color: TACTICAL.textMuted },
  regionsDesc: { ...TYPO.B2, fontSize: 10, color: TACTICAL.textMuted, marginBottom: 12, lineHeight: 15 },

  regionCard: {
    borderRadius: 10, borderWidth: 1, borderColor: TACTICAL.border,
    backgroundColor: 'rgba(62,79,60,0.04)', padding: 10, marginBottom: 6, gap: 6,
  },
  regionCardExpanded: { borderColor: TACTICAL.amber + '30' },
  regionCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scoreBadge: {
    width: 32, height: 32, borderRadius: 6, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  scoreValue: { ...TYPO.K2, fontSize: 12 },
  regionCardInfo: { flex: 1, gap: 2 },
  regionCardName: { ...TYPO.B1, fontSize: 12, color: TACTICAL.text },
  regionCardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  regionCardSize: { ...TYPO.K3, fontSize: 9, color: TACTICAL.textMuted },
  regionCardDot: { color: TACTICAL.textMuted, fontSize: 8 },
  regionCardAccess: { ...TYPO.B2, fontSize: 9, color: TACTICAL.textMuted },
  regionCardAge: { ...TYPO.B2, fontSize: 9, color: TACTICAL.textMuted },
  protectedBadge: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(102,187,106,0.1)', alignItems: 'center', justifyContent: 'center',
  },
  scoreBar: {
    height: 3, borderRadius: 1.5, backgroundColor: 'rgba(62,79,60,0.1)', overflow: 'hidden',
  },
  scoreBarFill: { height: '100%', borderRadius: 1.5 },

  regionCardDetail: { paddingTop: 6, gap: 8, borderTopWidth: 1, borderTopColor: TACTICAL.border },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  detailItem: { width: '45%', gap: 2 },
  detailLabel: { ...TYPO.U2, fontSize: 6, letterSpacing: 2, color: TACTICAL.textMuted },
  detailValue: { ...TYPO.K3, fontSize: 10, color: TACTICAL.text },
  protectionReason: {
    flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6,
    borderRadius: 6, backgroundColor: 'rgba(102,187,106,0.08)',
  },
  protectionReasonText: { ...TYPO.B2, fontSize: 9, color: '#66BB6A', flex: 1 },
  deleteRegionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 8, borderRadius: 6,
    borderWidth: 1, borderColor: '#EF535030', backgroundColor: 'rgba(239,83,80,0.06)',
  },
  deleteRegionBtnText: { ...TYPO.U2, fontSize: 8, color: '#EF5350', letterSpacing: 2 },

  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyTitle: { ...TYPO.T3, color: TACTICAL.textMuted },
  emptySubtext: { ...TYPO.B2, fontSize: 11, color: TACTICAL.textMuted, textAlign: 'center', lineHeight: 16 },

  // ── Rules Tab ─────────────────────────────────────────────
  ruleCard: {
    borderRadius: 10, borderWidth: 1, borderColor: TACTICAL.border,
    backgroundColor: 'rgba(62,79,60,0.04)', padding: DENSITY.cardPad, marginBottom: 10, gap: 6,
  },
  ruleHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ruleTitle: { ...TYPO.T4, color: TACTICAL.amber, fontSize: 9, letterSpacing: 3 },
  ruleDesc: { ...TYPO.B2, fontSize: 10, color: TACTICAL.textMuted, lineHeight: 15 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  toggleLabel: { ...TYPO.B1, fontSize: 12, color: TACTICAL.text },
  inputRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  numInput: {
    width: 72, borderWidth: 1, borderColor: TACTICAL.border, borderRadius: 6,
    backgroundColor: 'rgba(62,79,60,0.08)', paddingHorizontal: 8, paddingVertical: 8,
    fontSize: 14, fontWeight: '700', fontFamily: 'Courier', textAlign: 'center',
    color: TACTICAL.text,
  },
  inputUnit: { ...TYPO.B1, fontSize: 12, color: TACTICAL.textMuted },
  presetRow: { flexDirection: 'row', gap: 4, marginLeft: 'auto' },
  presetBtn: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4,
    borderWidth: 1, borderColor: TACTICAL.border, backgroundColor: 'rgba(62,79,60,0.04)',
  },
  presetBtnActive: { borderColor: TACTICAL.amber + '60', backgroundColor: TACTICAL.amber + '15' },
  presetText: { ...TYPO.U2, fontSize: 8, color: TACTICAL.textMuted, letterSpacing: 1 },
  presetTextActive: { color: TACTICAL.amber },

  ruleActions: { flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 16 },
  saveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: 8, backgroundColor: TACTICAL.amber,
  },
  saveBtnDisabled: { backgroundColor: TACTICAL.amber + '40' },
  saveBtnText: { ...TYPO.U1, fontSize: 10, color: '#0B0F12', letterSpacing: 2 },
  resetBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8,
    borderWidth: 1, borderColor: TACTICAL.border,
  },
  resetBtnText: { ...TYPO.U2, fontSize: 8, color: TACTICAL.textMuted, letterSpacing: 1 },
});



