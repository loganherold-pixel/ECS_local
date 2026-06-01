/**
 * TileSourceIndicator — Floating tile source status badge
 *
 * Displays real-time tile serving mode on the map overlay:
 *   - NETWORK: Tiles loading from remote servers (green)
 *   - CACHE: Tiles served from WebView Cache API (blue)
 *   - NATIVE: Tiles served from device file system (amber)
 *   - OFFLINE: No tiles available (red)
 *
 * Shows:
 *   - Dominant source icon + label
 *   - Tile hit/miss ratio
 *   - Expandable detail panel with per-source breakdown
 *   - Connectivity status integration
 *   - Animated pulse when actively serving from cache
 *
 * Integrates with:
 *   - tileServingBridge.tileSourceTracker for real-time stats
 *   - connectivity for online/offline detection
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, TYPO } from '../../lib/theme';
import { tileSourceTracker, type TileSourceStats, type TileSource } from '../../lib/tileServingBridge';
import { connectivity } from '../../lib/connectivity';

// ── Source Config ────────────────────────────────────────

const SOURCE_CONFIG: Record<TileSource, {
  icon: string;
  label: string;
  color: string;
  shortLabel: string;
}> = {
  network: {
    icon: 'cloud-outline',
    label: 'NETWORK',
    color: '#66BB6A',
    shortLabel: 'NET',
  },
  cache: {
    icon: 'layers-outline',
    label: 'CACHE',
    color: '#64B5F6',
    shortLabel: 'WEB',
  },
  native: {
    icon: 'phone-portrait-outline',
    label: 'DEVICE',
    color: TACTICAL.amber,
    shortLabel: 'DEV',
  },
  none: {
    icon: 'cloud-offline-outline',
    label: 'OFFLINE',
    color: '#EF5350',
    shortLabel: 'OFF',
  },
};

// ── Component ───────────────────────────────────────────

interface Props {
  /** Position offset from top-right */
  top?: number;
  right?: number;
}

export default function TileSourceIndicator({ top = 12, right = 12 }: Props) {
  const [stats, setStats] = useState<TileSourceStats>(tileSourceTracker.getStats());
  const [isOnline, setIsOnline] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const hasCachedTiles = stats.total > 0;
  const expandAnim = useRef(new Animated.Value(0)).current;

  // ── Subscribe to tile source stats ────────────────────
  useEffect(() => {
    const unsub = tileSourceTracker.onStatsChange((newStats) => {
      setStats(newStats);
    });
    return unsub;
  }, []);

  // ── Subscribe to connectivity ─────────────────────────
  useEffect(() => {
    setIsOnline(connectivity.isOnline());
    const unsub = connectivity.onStatusChange((status) => {
      setIsOnline(status === 'online');
    });
    connectivity.startMonitoring();
    return unsub;
  }, []);

  // ── Pulse animation when serving from cache ───────────
  useEffect(() => {
    if (stats.isOfflineServing && hasCachedTiles) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.5, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [hasCachedTiles, pulseAnim, stats.isOfflineServing]);

  // ── Expand/collapse animation ─────────────────────────
  const toggleExpand = useCallback(() => {
    const next = !expanded;
    setExpanded(next);
    Animated.timing(expandAnim, {
      toValue: next ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [expanded, expandAnim]);

  // ── Don't render if no tile activity ──────────────────
  if (stats.total === 0 && isOnline) return null;

  const source = stats.dominantSource;
  const config = SOURCE_CONFIG[source];
  const effectiveColor = !isOnline && source !== 'native' && source !== 'cache'
    ? SOURCE_CONFIG.none.color
    : config.color;

  const hitRate = stats.total > 0
    ? Math.round(((stats.cacheHits + stats.nativeHits + stats.networkHits) / stats.total) * 100)
    : 0;

  const offlineRate = stats.total > 0
    ? Math.round(((stats.cacheHits + stats.nativeHits) / stats.total) * 100)
    : 0;

  const expandHeight = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 120],
  });

  return (
    <View style={[styles.container, { top, right }]} pointerEvents="box-none">
      <TouchableOpacity
        style={[styles.badge, { borderColor: effectiveColor + '50' }]}
        onPress={toggleExpand}
        activeOpacity={0.8}
      >
        <Animated.View style={[styles.badgeInner, { opacity: pulseAnim }]}>
          <View style={[styles.sourceDot, { backgroundColor: effectiveColor }]} />
          <Ionicons name={config.icon as any} size={10} color={effectiveColor} />
          <Text style={[styles.sourceLabel, { color: effectiveColor }]}>
            {!isOnline && source === 'none' ? 'OFFLINE' : config.shortLabel}
          </Text>
          {stats.total > 0 && (
            <Text style={[styles.hitRate, { color: effectiveColor }]}>
              {hitRate}%
            </Text>
          )}
        </Animated.View>
      </TouchableOpacity>

      {/* Expanded detail panel */}
      <Animated.View style={[styles.detailPanel, { maxHeight: expandHeight, opacity: expandAnim }]}>
        <View style={styles.detailInner}>
          {/* Source breakdown */}
          <View style={styles.breakdownRow}>
            <View style={styles.breakdownItem}>
              <View style={[styles.breakdownDot, { backgroundColor: SOURCE_CONFIG.network.color }]} />
              <Text style={styles.breakdownLabel}>NET</Text>
              <Text style={[styles.breakdownValue, { color: SOURCE_CONFIG.network.color }]}>
                {stats.networkHits}
              </Text>
            </View>
            <View style={styles.breakdownItem}>
              <View style={[styles.breakdownDot, { backgroundColor: SOURCE_CONFIG.cache.color }]} />
              <Text style={styles.breakdownLabel}>WEB</Text>
              <Text style={[styles.breakdownValue, { color: SOURCE_CONFIG.cache.color }]}>
                {stats.cacheHits}
              </Text>
            </View>
            <View style={styles.breakdownItem}>
              <View style={[styles.breakdownDot, { backgroundColor: SOURCE_CONFIG.native.color }]} />
              <Text style={styles.breakdownLabel}>DEV</Text>
              <Text style={[styles.breakdownValue, { color: SOURCE_CONFIG.native.color }]}>
                {stats.nativeHits}
              </Text>
            </View>
            <View style={styles.breakdownItem}>
              <View style={[styles.breakdownDot, { backgroundColor: SOURCE_CONFIG.none.color }]} />
              <Text style={styles.breakdownLabel}>MISS</Text>
              <Text style={[styles.breakdownValue, { color: SOURCE_CONFIG.none.color }]}>
                {stats.misses}
              </Text>
            </View>
          </View>

          {/* Offline serving indicator */}
          {stats.isOfflineServing && (
            <View style={styles.offlineServingRow}>
              <Ionicons name="shield-checkmark-outline" size={10} color={TACTICAL.amber} />
              <Text style={styles.offlineServingText}>
                OFFLINE TILES: {offlineRate}% of {stats.total} requests
              </Text>
            </View>
          )}

          {/* Connectivity status */}
          <View style={styles.connectivityRow}>
            <Ionicons
              name={isOnline ? 'wifi-outline' : 'cloud-offline-outline'}
              size={9}
              color={isOnline ? '#66BB6A' : '#EF5350'}
            />
            <Text style={[styles.connectivityText, { color: isOnline ? '#66BB6A' : '#EF5350' }]}>
              {isOnline ? 'CONNECTED' : 'NO NETWORK'}
            </Text>
            <Text style={styles.totalText}>
              {stats.total} tiles loaded
            </Text>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 50,
    alignItems: 'flex-end',
  },
  badge: {
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: 'rgba(11,15,18,0.85)',
    overflow: 'hidden',
  },
  badgeInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  sourceDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  sourceLabel: {
    ...TYPO.U2,
    fontSize: 7,
    letterSpacing: 1.5,
  },
  hitRate: {
    ...TYPO.K3,
    fontSize: 8,
    marginLeft: 2,
  },

  // Detail panel
  detailPanel: {
    overflow: 'hidden',
    marginTop: 2,
  },
  detailInner: {
    backgroundColor: 'rgba(11,15,18,0.92)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    padding: 8,
    gap: 6,
    minWidth: 180,
  },

  // Breakdown
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  breakdownItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  breakdownDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  breakdownLabel: {
    ...TYPO.U2,
    fontSize: 6,
    letterSpacing: 1,
    color: TACTICAL.textMuted,
  },
  breakdownValue: {
    ...TYPO.K3,
    fontSize: 10,
  },

  // Offline serving
  offlineServingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 4,
    backgroundColor: 'rgba(196,138,44,0.1)',
    borderWidth: 1,
    borderColor: TACTICAL.amber + '25',
  },
  offlineServingText: {
    ...TYPO.U2,
    fontSize: 7,
    letterSpacing: 1,
    color: TACTICAL.amber,
  },

  // Connectivity
  connectivityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  connectivityText: {
    ...TYPO.U2,
    fontSize: 6,
    letterSpacing: 1,
  },
  totalText: {
    ...TYPO.B2,
    fontSize: 7,
    color: TACTICAL.textMuted,
    marginLeft: 'auto',
  },
});



