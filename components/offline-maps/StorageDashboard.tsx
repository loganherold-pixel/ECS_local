/**
 * Storage Dashboard — Offline Map Cache Statistics
 *
 * Displays:
 *   - Total cached regions count
 *   - Total tiles downloaded
 *   - Storage usage (actual + estimated)
 *   - Storage quota bar (web) / device storage bar (native)
 *   - Last download timestamp with freshness indicator
 *   - Per-region size breakdown
 *   - Native vs web storage engine indicator
 */
import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL, TYPO, DENSITY } from '../../lib/theme';
import type { TileCacheStats, TileCacheRegion } from '../../lib/tileCacheStore';

interface Props {
  stats: TileCacheStats;
  regions?: TileCacheRegion[];
  isLoading?: boolean;
}

function formatSize(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.round(mb * 1024)} KB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return d.toLocaleDateString();
}

function getFreshnessColor(iso: string | null): string {
  if (!iso) return TACTICAL.textMuted;
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays < 7) return '#66BB6A';   // Fresh — less than a week
  if (diffDays < 30) return '#FFB300';  // Aging — less than a month
  return '#EF5350';                      // Stale — over a month
}

function getFreshnessLabel(iso: string | null): string {
  if (!iso) return 'NO DATA';
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays < 1) return 'FRESH';
  if (diffDays < 7) return 'RECENT';
  if (diffDays < 30) return 'AGING';
  if (diffDays < 90) return 'STALE';
  return 'EXPIRED';
}

export default function StorageDashboard({ stats, regions, isLoading }: Props) {
  const quotaPercent = stats.storageQuotaMB && stats.storageUsedMB
    ? Math.min(100, Math.round((stats.storageUsedMB / stats.storageQuotaMB) * 100))
    : null;

  const completionPercent = stats.totalTiles > 0
    ? Math.round((stats.downloadedTiles / stats.totalTiles) * 100)
    : 0;

  const isNative = Platform.OS !== 'web';
  const freshnessColor = getFreshnessColor(stats.lastDownloadAt);
  const freshnessLabel = getFreshnessLabel(stats.lastDownloadAt);

  // Compute oldest region for staleness warning
  const oldestRegion = regions && regions.length > 0
    ? regions
        .filter(r => r.status === 'complete' && (r.completedAt || r.downloadedAt))
        .sort((a, b) => {
          const aDate = a.completedAt || a.downloadedAt;
          const bDate = b.completedAt || b.downloadedAt;
          return aDate.localeCompare(bDate);
        })[0]
    : null;

  const oldestAge = oldestRegion
    ? Math.floor((Date.now() - new Date(oldestRegion.completedAt || oldestRegion.downloadedAt).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="server-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.headerText}>CACHE STORAGE</Text>
        </View>
        <View style={styles.engineBadge}>
          <Ionicons
            name={isNative ? 'phone-portrait-outline' : 'globe-outline'}
            size={9}
            color={TACTICAL.textMuted}
          />
          <Text style={styles.engineText}>
            {isNative ? 'FILE SYSTEM' : 'INDEXEDDB'}
          </Text>
        </View>
      </View>

      {/* KPI Grid */}
      <View style={styles.kpiGrid}>
        <View style={styles.kpiItem}>
          <Text style={styles.kpiValue}>{stats.totalRegions}</Text>
          <Text style={styles.kpiLabel}>REGIONS</Text>
        </View>
        <View style={styles.kpiDivider} />
        <View style={styles.kpiItem}>
          <Text style={styles.kpiValue}>
            {stats.downloadedTiles >= 1000
              ? `${(stats.downloadedTiles / 1000).toFixed(1)}K`
              : stats.downloadedTiles}
          </Text>
          <Text style={styles.kpiLabel}>TILES</Text>
        </View>
        <View style={styles.kpiDivider} />
        <View style={styles.kpiItem}>
          <Text style={styles.kpiValue}>{formatSize(stats.totalSizeMB)}</Text>
          <Text style={styles.kpiLabel}>CACHED</Text>
        </View>
        <View style={styles.kpiDivider} />
        <View style={styles.kpiItem}>
          <Text style={[styles.kpiValue, { color: completionPercent >= 100 ? '#66BB6A' : TACTICAL.text }]}>
            {completionPercent}%
          </Text>
          <Text style={styles.kpiLabel}>COMPLETE</Text>
        </View>
      </View>

      {/* Storage quota bar */}
      {quotaPercent !== null && (
        <View style={styles.quotaSection}>
          <View style={styles.quotaHeader}>
            <Text style={styles.quotaLabel}>
              {isNative ? 'DEVICE STORAGE' : 'BROWSER STORAGE'}
            </Text>
            <Text style={styles.quotaValue}>
              {formatSize(stats.storageUsedMB || 0)} / {formatSize(stats.storageQuotaMB || 0)}
            </Text>
          </View>
          <View style={styles.quotaBarBg}>
            <View
              style={[
                styles.quotaBarFill,
                {
                  width: `${quotaPercent}%`,
                  backgroundColor: quotaPercent > 80 ? '#EF5350' : quotaPercent > 60 ? '#FFB300' : '#66BB6A',
                },
              ]}
            />
          </View>
          {/* Native device free space */}
          {isNative && stats.deviceFreeMB != null && (
            <Text style={styles.deviceFreeText}>
              {formatSize(stats.deviceFreeMB)} free on device
            </Text>
          )}
        </View>
      )}

      {/* Freshness indicator */}
      <View style={styles.freshnessRow}>
        <View style={styles.freshnessLeft}>
          <Ionicons name="time-outline" size={11} color={TACTICAL.textMuted} />
          <Text style={styles.lastDownloadText}>
            Last download: {formatDate(stats.lastDownloadAt)}
          </Text>
        </View>
        <View style={[styles.freshnessBadge, { borderColor: freshnessColor + '40' }]}>
          <View style={[styles.freshnessDot, { backgroundColor: freshnessColor }]} />
          <Text style={[styles.freshnessText, { color: freshnessColor }]}>
            {freshnessLabel}
          </Text>
        </View>
      </View>

      {/* Staleness warning */}
      {oldestAge !== null && oldestAge > 30 && (
        <View style={styles.stalenessWarning}>
          <Ionicons name="alert-circle-outline" size={12} color="#FFB300" />
          <Text style={styles.stalenessText}>
            Oldest region is {oldestAge}d old. Map data may be outdated — consider re-downloading.
          </Text>
        </View>
      )}

      {/* Per-region size breakdown (compact) */}
      {regions && regions.length > 0 && regions.length <= 6 && (
        <View style={styles.regionBreakdown}>
          {regions
            .filter(r => r.status === 'complete')
            .slice(0, 4)
            .map(r => {
              const size = r.actualSizeMB > 0 ? r.actualSizeMB : r.estimatedSizeMB;
              const age = r.completedAt || r.downloadedAt;
              const ageColor = getFreshnessColor(age);
              return (
                <View key={r.id} style={styles.regionRow}>
                  <View style={[styles.regionDot, { backgroundColor: ageColor }]} />
                  <Text style={styles.regionName} numberOfLines={1}>{r.name}</Text>
                  <Text style={styles.regionSize}>{formatSize(size)}</Text>
                  <Text style={[styles.regionAge, { color: ageColor }]}>{formatDate(age)}</Text>
                </View>
              );
            })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    padding: DENSITY.cardPad,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerText: {
    ...TYPO.T4,
    color: TACTICAL.amber,
    fontSize: 9,
    letterSpacing: 4,
  },
  engineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(62,79,60,0.1)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  engineText: {
    ...TYPO.U2,
    fontSize: 6,
    letterSpacing: 2,
    color: TACTICAL.textMuted,
  },
  kpiGrid: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  kpiItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  kpiValue: {
    ...TYPO.K2,
    color: TACTICAL.text,
    fontSize: 16,
  },
  kpiLabel: {
    ...TYPO.U2,
    fontSize: 7,
    letterSpacing: 3,
    color: TACTICAL.textMuted,
  },
  kpiDivider: {
    width: 1,
    height: 28,
    backgroundColor: TACTICAL.border,
  },
  quotaSection: {
    gap: 6,
  },
  quotaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quotaLabel: {
    ...TYPO.U2,
    fontSize: 7,
    letterSpacing: 3,
    color: TACTICAL.textMuted,
  },
  quotaValue: {
    ...TYPO.K3,
    fontSize: 10,
    color: TACTICAL.textMuted,
  },
  quotaBarBg: {
    height: 4,
    backgroundColor: 'rgba(62,79,60,0.15)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  quotaBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  deviceFreeText: {
    ...TYPO.B2,
    fontSize: 9,
    color: TACTICAL.textMuted,
    textAlign: 'right',
  },
  freshnessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  freshnessLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  lastDownloadText: {
    ...TYPO.B2,
    fontSize: 10,
    color: TACTICAL.textMuted,
  },
  freshnessBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  freshnessDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  freshnessText: {
    ...TYPO.U2,
    fontSize: 7,
    letterSpacing: 2,
  },
  stalenessWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,179,0,0.08)',
    borderWidth: 1,
    borderColor: '#FFB300' + '30',
  },
  stalenessText: {
    ...TYPO.B2,
    fontSize: 10,
    color: '#FFB300',
    flex: 1,
    lineHeight: 14,
  },
  regionBreakdown: {
    gap: 4,
    paddingTop: 2,
    borderTopWidth: 1,
    borderTopColor: TACTICAL.border,
  },
  regionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  regionDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  regionName: {
    ...TYPO.B2,
    fontSize: 10,
    color: TACTICAL.text,
    flex: 1,
  },
  regionSize: {
    ...TYPO.K3,
    fontSize: 9,
    color: TACTICAL.textMuted,
    width: 50,
    textAlign: 'right',
  },
  regionAge: {
    ...TYPO.B2,
    fontSize: 9,
    width: 50,
    textAlign: 'right',
  },
});



