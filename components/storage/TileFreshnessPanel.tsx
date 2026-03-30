/**
 * TileFreshnessPanel — Tile Freshness Verification UI
 *
 * Lets users check if their cached map tiles are outdated by sampling
 * tiles and comparing them with upstream tile servers.
 *
 * Features:
 *   - Region cards with freshness badges (Fresh / Update Available / Error / Unknown / Checking)
 *   - Per-region "Check Freshness" button
 *   - "Check All Regions" batch action with progress bar
 *   - "Refresh All Outdated" bulk action button
 *   - Last verified timestamp display
 *   - Detailed check results (sampled tiles, changed %, message)
 *
 * Integrates with tileCacheStore.checkRegionFreshness() and checkAllRegionsFreshness().
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import { useTheme } from '../../context/ThemeContext';
import { SPACING, RADIUS } from '../../lib/theme';
import {
  tileCacheStore,
  type TileCacheRegion,
  type FreshnessStatus,
  type FreshnessCheckResult,
  type FreshnessCheckProgress,
} from '../../lib/tileCacheStore';

/** Local download progress type for refresh operations */
interface DownloadProgress {
  percent: number;
  message: string;
}




interface Props {
  onToast: (msg: string) => void;
}

// ── Freshness badge config ──────────────────────────────────

interface BadgeConfig {
  label: string;
  icon: string;
  color: string;
  bgAlpha: string;
  borderAlpha: string;
}

function getBadgeConfig(status: FreshnessStatus, colors: any): BadgeConfig {
  switch (status) {
    case 'fresh':
      return {
        label: 'FRESH',
        icon: 'checkmark-circle',
        color: colors.success,
        bgAlpha: '15',
        borderAlpha: '40',
      };
    case 'update-available':
      return {
        label: 'UPDATE AVAILABLE',
        icon: 'arrow-up-circle',
        color: colors.warning,
        bgAlpha: '15',
        borderAlpha: '40',
      };
    case 'error':
      return {
        label: 'ERROR',
        icon: 'close-circle',
        color: colors.danger,
        bgAlpha: '15',
        borderAlpha: '40',
      };
    case 'checking':
      return {
        label: 'CHECKING',
        icon: 'sync-outline',
        color: colors.info,
        bgAlpha: '15',
        borderAlpha: '40',
      };
    case 'unknown':
    default:
      return {
        label: 'UNKNOWN',
        icon: 'help-circle-outline',
        color: colors.textMuted,
        bgAlpha: '15',
        borderAlpha: '40',
      };
  }
}

// ── Helpers ──────────────────────────────────────────────────

function formatMB(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.round(mb * 1024)} KB`;
}

function formatDate(iso: string): string {
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
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ── Main Component ──────────────────────────────────────────

export default function TileFreshnessPanel({ onToast }: Props) {
  const { colors } = useTheme();

  // ── State ──────────────────────────────────────────────
  const [regions, setRegions] = useState<TileCacheRegion[]>([]);
  const [checkingRegionId, setCheckingRegionId] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<FreshnessCheckProgress | null>(null);
  const [isBatchChecking, setIsBatchChecking] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshingRegionId, setRefreshingRegionId] = useState<string | null>(null);
  const [refreshProgress, setRefreshProgress] = useState<DownloadProgress | null>(null);
  const [lastResults, setLastResults] = useState<FreshnessCheckResult[]>([]);
  const [expandedRegionId, setExpandedRegionId] = useState<string | null>(null);

  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  // ── Load regions ───────────────────────────────────────
  const loadRegions = useCallback(() => {
    const all = tileCacheStore.getRegions();
    // Only show complete or partial regions (can be freshness-checked)
    const checkable = all.filter(r => r.status === 'complete' || r.status === 'partial');
    setRegions(checkable);
  }, []);

  useEffect(() => {
    loadRegions();
    const unsub = tileCacheStore.subscribe(loadRegions);
    return unsub;
  }, [loadRegions]);

  // ── Pulse animation for checking state ─────────────────
  useEffect(() => {
    if (checkingRegionId || isBatchChecking) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.5, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [checkingRegionId, isBatchChecking, pulseAnim]);

  // ── Check single region ────────────────────────────────
  const checkRegion = useCallback(async (regionId: string) => {
    setCheckingRegionId(regionId);
    try {
      const result = await tileCacheStore.checkRegionFreshness(regionId);
      setLastResults(prev => {
        const filtered = prev.filter(r => r.regionId !== regionId);
        return [...filtered, result];
      });
      loadRegions();

      if (result.status === 'fresh') {
        onToast('Region tiles are up to date');
      } else if (result.status === 'update-available') {
        onToast(`${result.changedTiles} of ${result.sampledTiles} sampled tiles have changes`);
      } else if (result.status === 'error') {
        onToast('Freshness check failed — network error');
      }
    } catch (e) {
      onToast('Freshness check failed');
    } finally {
      setCheckingRegionId(null);
    }
  }, [loadRegions, onToast]);

  // ── Check all regions ──────────────────────────────────
  const checkAllRegions = useCallback(async () => {
    setIsBatchChecking(true);
    setBatchProgress(null);
    progressAnim.setValue(0);

    try {
      const results = await tileCacheStore.checkAllRegionsFreshness((progress) => {
        setBatchProgress(progress);
        const pct = progress.totalRegions > 0
          ? progress.checkedRegions / progress.totalRegions
          : 0;
        Animated.timing(progressAnim, {
          toValue: pct,
          duration: 200,
          useNativeDriver: false,
        }).start();
      });

      setLastResults(results);
      loadRegions();

      const updatable = results.filter(r => r.status === 'update-available').length;
      const fresh = results.filter(r => r.status === 'fresh').length;
      const errors = results.filter(r => r.status === 'error').length;

      if (updatable > 0) {
        onToast(`${updatable} region${updatable !== 1 ? 's' : ''} have updates available`);
      } else if (errors > 0) {
        onToast(`All checked — ${errors} region${errors !== 1 ? 's' : ''} had errors`);
      } else {
        onToast(`All ${fresh} region${fresh !== 1 ? 's' : ''} are up to date`);
      }
    } catch (e) {
      onToast('Batch freshness check failed');
    } finally {
      setIsBatchChecking(false);
      setBatchProgress(null);
    }
  }, [loadRegions, onToast, progressAnim]);

  // ── Refresh single region ──────────────────────────────
  const refreshRegion = useCallback(async (regionId: string) => {
    setRefreshingRegionId(regionId);
    setRefreshProgress(null);
    try {
      const success = await tileCacheStore.refreshRegion(regionId, (progress) => {
        setRefreshProgress(progress);
      });
      loadRegions();
      if (success) {
        onToast('Region refreshed with latest tiles');
      } else {
        onToast('Region refresh failed');
      }
    } catch (e) {
      onToast('Region refresh failed');
    } finally {
      setRefreshingRegionId(null);
      setRefreshProgress(null);
    }
  }, [loadRegions, onToast]);

  // ── Refresh all outdated ───────────────────────────────
  const refreshAllOutdated = useCallback(async () => {
    const outdated = regions.filter(r => r.freshnessStatus === 'update-available');
    if (outdated.length === 0) {
      onToast('No outdated regions to refresh');
      return;
    }

    setIsRefreshing(true);
    let refreshed = 0;
    let failed = 0;

    for (const region of outdated) {
      setRefreshingRegionId(region.id);
      try {
        const success = await tileCacheStore.refreshRegion(region.id, (progress) => {
          setRefreshProgress(progress);
        });
        if (success) refreshed++;
        else failed++;
      } catch {
        failed++;
      }
    }

    setRefreshingRegionId(null);
    setRefreshProgress(null);
    setIsRefreshing(false);
    loadRegions();

    if (failed > 0) {
      onToast(`Refreshed ${refreshed} region${refreshed !== 1 ? 's' : ''}, ${failed} failed`);
    } else {
      onToast(`All ${refreshed} outdated region${refreshed !== 1 ? 's' : ''} refreshed`);
    }
  }, [regions, loadRegions, onToast]);

  // ── Computed values ────────────────────────────────────
  const updatableCount = regions.filter(r => r.freshnessStatus === 'update-available').length;
  const freshCount = regions.filter(r => r.freshnessStatus === 'fresh').length;
  const unknownCount = regions.filter(r => !r.freshnessStatus || r.freshnessStatus === 'unknown').length;
  const errorCount = regions.filter(r => r.freshnessStatus === 'error').length;

  const getResultForRegion = (regionId: string): FreshnessCheckResult | undefined =>
    lastResults.find(r => r.regionId === regionId);

  // ── Render: Empty state ────────────────────────────────
  if (regions.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <Ionicons name="cloud-offline-outline" size={40} color={colors.textMuted} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No Cached Regions
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>
            Download offline map regions from the Navigate tab to check their freshness here.
          </Text>
        </View>
      </View>
    );
  }

  // ── Render: Summary bar ────────────────────────────────
  const renderSummary = () => (
    <View style={[styles.summaryCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
      <View style={styles.summaryHeader}>
        <Ionicons name="leaf-outline" size={16} color={colors.gold} />
        <Text style={[styles.summaryTitle, { color: colors.textPrimary }]}>TILE FRESHNESS</Text>
        <Text style={[styles.summaryCount, { color: colors.textMuted }]}>
          {regions.length} region{regions.length !== 1 ? 's' : ''}
        </Text>
      </View>

      <View style={styles.summaryStats}>
        {[
          { label: 'FRESH', value: freshCount, color: colors.success, icon: 'checkmark-circle' },
          { label: 'OUTDATED', value: updatableCount, color: colors.warning, icon: 'arrow-up-circle' },
          { label: 'UNKNOWN', value: unknownCount, color: colors.textMuted, icon: 'help-circle-outline' },
          { label: 'ERROR', value: errorCount, color: colors.danger, icon: 'close-circle' },
        ].map((stat, idx) => (
          <View key={idx} style={styles.summaryStat}>
            <Ionicons name={stat.icon as any} size={14} color={stat.value > 0 ? stat.color : colors.textMuted + '40'} />
            <Text style={[
              styles.summaryStatValue,
              { color: stat.value > 0 ? stat.color : colors.textMuted + '60' },
            ]}>
              {stat.value}
            </Text>
            <Text style={[styles.summaryStatLabel, { color: colors.textMuted }]}>{stat.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  // ── Render: Batch actions ──────────────────────────────
  const renderActions = () => (
    <View style={styles.actionsRow}>
      {/* Check All */}
      <TouchableOpacity
        style={[
          styles.actionBtn,
          {
            backgroundColor: isBatchChecking ? colors.bgCard : colors.info + '12',
            borderColor: isBatchChecking ? colors.info + '30' : colors.info + '40',
          },
        ]}
        onPress={checkAllRegions}
        disabled={isBatchChecking || isRefreshing}
        activeOpacity={0.7}
      >
        {isBatchChecking ? (
          <ActivityIndicator size="small" color={colors.info} />
        ) : (
          <Ionicons name="scan-outline" size={16} color={colors.info} />
        )}
        <Text style={[styles.actionBtnText, { color: colors.info }]}>
          {isBatchChecking ? 'CHECKING...' : 'CHECK ALL REGIONS'}
        </Text>
      </TouchableOpacity>

      {/* Refresh All Outdated */}
      {updatableCount > 0 && (
        <TouchableOpacity
          style={[
            styles.actionBtn,
            {
              backgroundColor: isRefreshing ? colors.bgCard : colors.warning + '12',
              borderColor: isRefreshing ? colors.warning + '30' : colors.warning + '40',
            },
          ]}
          onPress={refreshAllOutdated}
          disabled={isBatchChecking || isRefreshing}
          activeOpacity={0.7}
        >
          {isRefreshing ? (
            <ActivityIndicator size="small" color={colors.warning} />
          ) : (
            <Ionicons name="refresh-outline" size={16} color={colors.warning} />
          )}
          <Text style={[styles.actionBtnText, { color: colors.warning }]}>
            {isRefreshing ? 'REFRESHING...' : `REFRESH ALL OUTDATED (${updatableCount})`}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // ── Render: Batch progress ─────────────────────────────
  const renderBatchProgress = () => {
    if (!batchProgress || batchProgress.status === 'idle') return null;

    const pct = batchProgress.totalRegions > 0
      ? Math.round((batchProgress.checkedRegions / batchProgress.totalRegions) * 100)
      : 0;

    return (
      <View style={[styles.batchProgressCard, { backgroundColor: colors.bgCard, borderColor: colors.info + '30' }]}>
        <View style={styles.batchProgressHeader}>
          <Animated.View style={{ opacity: pulseAnim }}>
            <Ionicons name="scan-outline" size={14} color={colors.info} />
          </Animated.View>
          <Text style={[styles.batchProgressTitle, { color: colors.info }]}>
            BATCH FRESHNESS CHECK
          </Text>
          <Text style={[styles.batchProgressPct, { color: colors.info }]}>
            {pct}%
          </Text>
        </View>

        {/* Progress bar */}
        <View style={[styles.batchProgressTrack, { backgroundColor: colors.bgInput }]}>
          <Animated.View
            style={[
              styles.batchProgressFill,
              {
                backgroundColor: colors.info,
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>

        <View style={styles.batchProgressMeta}>
          <Text style={[styles.batchProgressRegion, { color: colors.textSecondary }]}>
            {batchProgress.currentRegionName
              ? `Checking: ${batchProgress.currentRegionName}`
              : 'Preparing...'}
          </Text>
          <Text style={[styles.batchProgressCount, { color: colors.textMuted }]}>
            {batchProgress.checkedRegions}/{batchProgress.totalRegions}
          </Text>
        </View>

        {/* Inline results so far */}
        {batchProgress.results.length > 0 && (
          <View style={styles.batchInlineResults}>
            {batchProgress.results.map((result, idx) => {
              const badge = getBadgeConfig(result.status, colors);
              return (
                <View key={idx} style={[styles.batchInlineResult, { borderColor: colors.border }]}>
                  <Ionicons name={badge.icon as any} size={10} color={badge.color} />
                  <Text style={[styles.batchInlineRegionName, { color: colors.textSecondary }]} numberOfLines={1}>
                    {regions.find(r => r.id === result.regionId)?.name || result.regionId.slice(0, 8)}
                  </Text>
                  <Text style={[styles.batchInlineStatus, { color: badge.color }]}>{badge.label}</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  // ── Render: Region card ────────────────────────────────
  const renderRegionCard = (region: TileCacheRegion) => {
    const status: FreshnessStatus = region.freshnessStatus || 'unknown';
    const badge = getBadgeConfig(
      checkingRegionId === region.id ? 'checking' : status,
      colors
    );
    const isChecking = checkingRegionId === region.id;
    const isThisRefreshing = refreshingRegionId === region.id;
    const isExpanded = expandedRegionId === region.id;
    const result = getResultForRegion(region.id);
    const sizeMB = region.actualSizeMB > 0 ? region.actualSizeMB : region.estimatedSizeMB;

    return (
      <View
        key={region.id}
        style={[
          styles.regionCard,
          {
            backgroundColor: colors.bgCard,
            borderColor: isChecking ? colors.info + '40' : isThisRefreshing ? colors.warning + '40' : colors.border,
          },
        ]}
      >
        {/* Card header */}
        <TouchableOpacity
          style={styles.regionCardHeader}
          onPress={() => setExpandedRegionId(isExpanded ? null : region.id)}
          activeOpacity={0.7}
        >
          <View style={styles.regionInfo}>
            <View style={styles.regionNameRow}>
              <Ionicons
                name={region.sourceType === 'route-corridor' ? 'trail-sign-outline' : 'map-outline'}
                size={14}
                color={colors.gold}
              />
              <Text style={[styles.regionName, { color: colors.textPrimary }]} numberOfLines={1}>
                {region.name}
              </Text>
            </View>
            <Text style={[styles.regionMeta, { color: colors.textMuted }]}>
              {formatMB(sizeMB)} \u00B7 {region.tileCount.toLocaleString()} tiles \u00B7 Z{region.zoomMin}\u2013{region.zoomMax}
            </Text>
          </View>

          {/* Freshness badge */}
          <View style={[
            styles.freshnessBadge,
            {
              backgroundColor: badge.color + badge.bgAlpha,
              borderColor: badge.color + badge.borderAlpha,
            },
          ]}>
            {isChecking ? (
              <ActivityIndicator size={10} color={badge.color} />
            ) : (
              <Ionicons name={badge.icon as any} size={12} color={badge.color} />
            )}
            <Text style={[styles.freshnessBadgeText, { color: badge.color }]}>
              {badge.label}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Last verified */}
        {region.lastVerifiedAt && (
          <View style={styles.lastVerifiedRow}>
            <Ionicons name="time-outline" size={10} color={colors.textMuted} />
            <Text style={[styles.lastVerifiedText, { color: colors.textMuted }]}>
              Verified {timeAgo(region.lastVerifiedAt)}
            </Text>
            {region.freshnessChangePercent != null && region.freshnessChangePercent > 0 && (
              <Text style={[styles.changePercent, { color: colors.warning }]}>
                ~{region.freshnessChangePercent}% changed
              </Text>
            )}
          </View>
        )}

        {/* Refresh progress bar */}
        {isThisRefreshing && refreshProgress && (
          <View style={styles.refreshProgressSection}>
            <View style={[styles.refreshProgressTrack, { backgroundColor: colors.bgInput }]}>
              <View
                style={[
                  styles.refreshProgressFill,
                  {
                    backgroundColor: colors.warning,
                    width: `${refreshProgress.percent}%`,
                  },
                ]}
              />
            </View>
            <Text style={[styles.refreshProgressText, { color: colors.textMuted }]}>
              {refreshProgress.message} ({refreshProgress.percent}%)
            </Text>
          </View>
        )}

        {/* Expanded detail */}
        {isExpanded && result && (
          <View style={[styles.expandedDetail, { borderTopColor: colors.border }]}>
            <Text style={[styles.expandedTitle, { color: colors.textSecondary }]}>
              LAST CHECK RESULTS
            </Text>
            <View style={styles.expandedGrid}>
              <View style={[styles.expandedCell, { backgroundColor: colors.bgInput }]}>
                <Text style={[styles.expandedCellValue, { color: colors.textPrimary }]}>
                  {result.sampledTiles}
                </Text>
                <Text style={[styles.expandedCellLabel, { color: colors.textMuted }]}>SAMPLED</Text>
              </View>
              <View style={[styles.expandedCell, { backgroundColor: colors.bgInput }]}>
                <Text style={[styles.expandedCellValue, { color: colors.success }]}>
                  {result.unchangedTiles}
                </Text>
                <Text style={[styles.expandedCellLabel, { color: colors.textMuted }]}>FRESH</Text>
              </View>
              <View style={[styles.expandedCell, { backgroundColor: colors.bgInput }]}>
                <Text style={[styles.expandedCellValue, { color: result.changedTiles > 0 ? colors.warning : colors.textMuted }]}>
                  {result.changedTiles}
                </Text>
                <Text style={[styles.expandedCellLabel, { color: colors.textMuted }]}>CHANGED</Text>
              </View>
              <View style={[styles.expandedCell, { backgroundColor: colors.bgInput }]}>
                <Text style={[styles.expandedCellValue, { color: result.errorTiles > 0 ? colors.danger : colors.textMuted }]}>
                  {result.errorTiles}
                </Text>
                <Text style={[styles.expandedCellLabel, { color: colors.textMuted }]}>ERRORS</Text>
              </View>
            </View>

            {result.changePercent > 0 && (
              <View style={[styles.changeBar, { backgroundColor: colors.bgInput }]}>
                <View style={[styles.changeFresh, { width: `${100 - result.changePercent}%`, backgroundColor: colors.success + '30' }]} />
                <View style={[styles.changeOutdated, { width: `${result.changePercent}%`, backgroundColor: colors.warning + '50' }]} />
              </View>
            )}

            <Text style={[styles.expandedMessage, { color: colors.textSecondary }]}>
              {result.message}
            </Text>
            <Text style={[styles.expandedTimestamp, { color: colors.textMuted }]}>
              Checked: {formatDate(result.checkedAt)}
            </Text>
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.regionActions}>
          <TouchableOpacity
            style={[
              styles.checkBtn,
              {
                backgroundColor: isChecking ? colors.bgInput : colors.info + '10',
                borderColor: colors.info + '30',
              },
            ]}
            onPress={() => checkRegion(region.id)}
            disabled={isChecking || isBatchChecking || isThisRefreshing}
            activeOpacity={0.7}
          >
            {isChecking ? (
              <ActivityIndicator size={12} color={colors.info} />
            ) : (
              <Ionicons name="scan-outline" size={12} color={colors.info} />
            )}
            <Text style={[styles.checkBtnText, { color: colors.info }]}>
              {isChecking ? 'CHECKING...' : 'CHECK FRESHNESS'}
            </Text>
          </TouchableOpacity>

          {status === 'update-available' && (
            <TouchableOpacity
              style={[
                styles.refreshBtn,
                {
                  backgroundColor: isThisRefreshing ? colors.bgInput : colors.warning + '10',
                  borderColor: colors.warning + '30',
                },
              ]}
              onPress={() => refreshRegion(region.id)}
              disabled={isChecking || isBatchChecking || isThisRefreshing || isRefreshing}
              activeOpacity={0.7}
            >
              {isThisRefreshing ? (
                <ActivityIndicator size={12} color={colors.warning} />
              ) : (
                <Ionicons name="refresh-outline" size={12} color={colors.warning} />
              )}
              <Text style={[styles.refreshBtnText, { color: colors.warning }]}>
                {isThisRefreshing ? 'REFRESHING...' : 'REFRESH'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Expand/collapse toggle */}
          {result && (
            <TouchableOpacity
              style={[styles.expandBtn, { borderColor: colors.border }]}
              onPress={() => setExpandedRegionId(isExpanded ? null : region.id)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={colors.textMuted}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  // ── Main render ────────────────────────────────────────
  return (
    <View style={styles.container}>
      {renderSummary()}
      {renderActions()}
      {renderBatchProgress()}

      {/* Region list */}
      <View style={styles.regionList}>
        {regions.map(renderRegionCard)}
      </View>

      {/* Hint text */}
      <View style={styles.hintRow}>
        <Ionicons name="information-circle-outline" size={12} color={colors.textMuted} />
        <Text style={[styles.hintText, { color: colors.textMuted }]}>
          Freshness checks sample 8 tiles per region and compare with upstream tile servers using HTTP headers. Network connectivity required.
        </Text>
      </View>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {},

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

  // Summary card
  summaryCard: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: SPACING.md,
  },
  summaryTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
  },
  summaryCount: {
    fontSize: 11,
    fontFamily: 'Courier',
  },
  summaryStats: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  summaryStat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  summaryStatValue: {
    fontSize: 16,
    fontWeight: '800',
    fontFamily: 'Courier',
  },
  summaryStatLabel: {
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 1,
  },

  // Actions row
  actionsRow: {
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },

  // Batch progress
  batchProgressCard: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  batchProgressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  batchProgressTitle: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
  },
  batchProgressPct: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: 'Courier',
  },
  batchProgressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  batchProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  batchProgressMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  batchProgressRegion: {
    flex: 1,
    fontSize: 11,
  },
  batchProgressCount: {
    fontSize: 10,
    fontFamily: 'Courier',
  },
  batchInlineResults: {
    marginTop: 8,
    gap: 3,
  },
  batchInlineResult: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
    borderBottomWidth: 0.5,
  },
  batchInlineRegionName: {
    flex: 1,
    fontSize: 10,
  },
  batchInlineStatus: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // Region card
  regionCard: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  regionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  regionInfo: {
    flex: 1,
  },
  regionNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  regionName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  regionMeta: {
    fontSize: 10,
    fontFamily: 'Courier',
    marginLeft: 20,
  },

  // Freshness badge
  freshnessBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  freshnessBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // Last verified
  lastVerifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    marginLeft: 20,
  },
  lastVerifiedText: {
    fontSize: 9,
    fontFamily: 'Courier',
  },
  changePercent: {
    fontSize: 9,
    fontWeight: '700',
    marginLeft: 'auto',
  },

  // Refresh progress
  refreshProgressSection: {
    marginTop: 8,
    gap: 4,
  },
  refreshProgressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  refreshProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  refreshProgressText: {
    fontSize: 9,
    fontFamily: 'Courier',
  },

  // Expanded detail
  expandedDetail: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
  },
  expandedTitle: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 8,
  },
  expandedGrid: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  expandedCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
  },
  expandedCellValue: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: 'Courier',
  },
  expandedCellLabel: {
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 2,
  },
  changeBar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  changeFresh: {
    height: '100%',
  },
  changeOutdated: {
    height: '100%',
  },
  expandedMessage: {
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 4,
  },
  expandedTimestamp: {
    fontSize: 9,
    fontFamily: 'Courier',
  },

  // Region actions
  regionActions: {
    flexDirection: 'row',
    gap: 6,
    marginTop: SPACING.sm,
  },
  checkBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 7,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  checkBtnText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  refreshBtnText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  expandBtn: {
    width: 30,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },

  // Region list
  regionList: {
    gap: 0,
  },

  // Hint
  hintRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.xs,
  },
  hintText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 15,
  },
});





