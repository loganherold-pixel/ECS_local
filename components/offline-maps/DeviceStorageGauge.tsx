/**
 * DeviceStorageGauge — Visual device storage breakdown
 *
 * Shows:
 *   - Total device storage capacity
 *   - Free space remaining
 *   - Tile cache usage as a segment of total
 *   - Other app/system usage
 *   - Segmented bar with color-coded sections
 *   - Warning indicators when storage is low
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, TYPO, DENSITY } from '../../lib/theme';
import { getDeviceStorageInfo } from '../../lib/nativeTileStorage';
import type { TileCacheStats } from '../../lib/tileCacheStore';

interface Props {
  stats: TileCacheStats;
  /** Optional: force refresh trigger */
  refreshKey?: number;
}

function formatSize(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.round(mb * 1024)} KB`;
}

export default function DeviceStorageGauge({ stats, refreshKey }: Props) {
  const [deviceInfo, setDeviceInfo] = useState<{ freeMB: number; totalMB: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const isNative = Platform.OS !== 'web';

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      if (isNative) {
        const info = await getDeviceStorageInfo();
        if (mounted) setDeviceInfo(info);
      } else {
        // Web: use Storage API estimate
        try {
          if (navigator && 'storage' in navigator && 'estimate' in (navigator as any).storage) {
            const estimate = await (navigator as any).storage.estimate();
            if (mounted) {
              setDeviceInfo({
                freeMB: Math.round(((estimate.quota || 0) - (estimate.usage || 0)) / (1024 * 1024)),
                totalMB: Math.round((estimate.quota || 0) / (1024 * 1024)),
              });
            }
          }
        } catch {}
      }
      if (mounted) setLoading(false);
    })();
    return () => { mounted = false; };
  }, [refreshKey, isNative]);

  // Use stats device info as fallback
  const totalMB = deviceInfo?.totalMB || stats.deviceTotalMB || 0;
  const freeMB = deviceInfo?.freeMB || stats.deviceFreeMB || 0;
  const cacheMB = stats.totalSizeMB || 0;
  const otherUsedMB = Math.max(0, totalMB - freeMB - cacheMB);

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Ionicons name="hardware-chip-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.headerText}>DEVICE STORAGE</Text>
        </View>
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={TACTICAL.amber} />
          <Text style={styles.loadingText}>Analyzing storage...</Text>
        </View>
      </View>
    );
  }

  if (totalMB === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Ionicons name="hardware-chip-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.headerText}>DEVICE STORAGE</Text>
        </View>
        <View style={styles.unavailableRow}>
          <Ionicons name="alert-circle-outline" size={12} color={TACTICAL.textMuted} />
          <Text style={styles.unavailableText}>
            {isNative
              ? 'Device storage info unavailable'
              : 'Browser storage estimate unavailable'}
          </Text>
        </View>
      </View>
    );
  }

  const cachePercent = totalMB > 0 ? Math.min(100, (cacheMB / totalMB) * 100) : 0;
  const otherPercent = totalMB > 0 ? Math.min(100 - cachePercent, (otherUsedMB / totalMB) * 100) : 0;
  const freePercent = Math.max(0, 100 - cachePercent - otherPercent);
  const freeWarning = freePercent < 10;
  const freeCritical = freePercent < 5;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="hardware-chip-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.headerText}>DEVICE STORAGE</Text>
        </View>
        <View style={styles.headerRight}>
          <Ionicons
            name={isNative ? 'phone-portrait-outline' : 'globe-outline'}
            size={9}
            color={TACTICAL.textMuted}
          />
          <Text style={styles.engineLabel}>
            {isNative ? 'DEVICE' : 'BROWSER'}
          </Text>
        </View>
      </View>

      {/* Segmented bar */}
      <View style={styles.barContainer}>
        <View style={styles.barBg}>
          {/* Other system/app usage */}
          {otherPercent > 0.5 && (
            <View style={[styles.barSegment, { width: `${otherPercent}%`, backgroundColor: '#5C6370' }]} />
          )}
          {/* Tile cache usage */}
          {cachePercent > 0.1 && (
            <View style={[styles.barSegment, { width: `${cachePercent}%`, backgroundColor: TACTICAL.amber }]} />
          )}
          {/* Free space */}
          <View style={[
            styles.barSegment,
            {
              width: `${freePercent}%`,
              backgroundColor: freeCritical ? 'rgba(239,83,80,0.2)' : freeWarning ? 'rgba(255,179,0,0.15)' : 'rgba(102,187,106,0.15)',
            },
          ]} />
        </View>
      </View>

      {/* Legend */}
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: TACTICAL.amber }]} />
          <Text style={styles.legendLabel}>TILE CACHE</Text>
          <Text style={styles.legendValue}>{formatSize(cacheMB)}</Text>
          <Text style={styles.legendPercent}>{cachePercent.toFixed(1)}%</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#5C6370' }]} />
          <Text style={styles.legendLabel}>OTHER</Text>
          <Text style={styles.legendValue}>{formatSize(otherUsedMB)}</Text>
          <Text style={styles.legendPercent}>{otherPercent.toFixed(1)}%</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[
            styles.legendDot,
            { backgroundColor: freeCritical ? '#EF5350' : freeWarning ? '#FFB300' : '#66BB6A' },
          ]} />
          <Text style={styles.legendLabel}>FREE</Text>
          <Text style={[
            styles.legendValue,
            freeCritical && { color: '#EF5350' },
            freeWarning && !freeCritical && { color: '#FFB300' },
          ]}>
            {formatSize(freeMB)}
          </Text>
          <Text style={[
            styles.legendPercent,
            freeCritical && { color: '#EF5350' },
            freeWarning && !freeCritical && { color: '#FFB300' },
          ]}>
            {freePercent.toFixed(1)}%
          </Text>
        </View>
      </View>

      {/* Total capacity */}
      <View style={styles.totalRow}>
        <Ionicons name="disc-outline" size={10} color={TACTICAL.textMuted} />
        <Text style={styles.totalText}>
          Total capacity: {formatSize(totalMB)}
        </Text>
      </View>

      {/* Warning */}
      {freeWarning && (
        <View style={[styles.warningBanner, freeCritical && styles.warningBannerCritical]}>
          <Ionicons
            name={freeCritical ? 'alert-circle' : 'warning-outline'}
            size={12}
            color={freeCritical ? '#EF5350' : '#FFB300'}
          />
          <Text style={[styles.warningText, freeCritical && { color: '#EF5350' }]}>
            {freeCritical
              ? 'Storage is nearly full. Remove older saved regions before downloading more map coverage.'
              : 'Storage is getting tight. Consider cleaning up older saved regions soon.'}
          </Text>
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
    gap: 10,
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
  headerRight: {
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
  engineLabel: {
    ...TYPO.U2,
    fontSize: 6,
    letterSpacing: 2,
    color: TACTICAL.textMuted,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  loadingText: {
    ...TYPO.B2,
    fontSize: 11,
    color: TACTICAL.textMuted,
  },
  unavailableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  unavailableText: {
    ...TYPO.B2,
    fontSize: 10,
    color: TACTICAL.textMuted,
  },
  barContainer: {
    paddingVertical: 2,
  },
  barBg: {
    height: 10,
    backgroundColor: 'rgba(62,79,60,0.1)',
    borderRadius: 5,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  barSegment: {
    height: '100%',
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  legendItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  legendDot: {
    width: 8,
    height: 4,
    borderRadius: 2,
  },
  legendLabel: {
    ...TYPO.U2,
    fontSize: 6,
    letterSpacing: 2,
    color: TACTICAL.textMuted,
  },
  legendValue: {
    ...TYPO.K3,
    fontSize: 10,
    color: TACTICAL.text,
  },
  legendPercent: {
    ...TYPO.B2,
    fontSize: 8,
    color: TACTICAL.textMuted,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
    paddingTop: 2,
    borderTopWidth: 1,
    borderTopColor: TACTICAL.border,
  },
  totalText: {
    ...TYPO.B2,
    fontSize: 9,
    color: TACTICAL.textMuted,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,179,0,0.08)',
    borderWidth: 1,
    borderColor: '#FFB300' + '25',
  },
  warningBannerCritical: {
    backgroundColor: 'rgba(239,83,80,0.08)',
    borderColor: '#EF5350' + '25',
  },
  warningText: {
    ...TYPO.B2,
    fontSize: 10,
    color: '#FFB300',
    flex: 1,
    lineHeight: 14,
  },
});



