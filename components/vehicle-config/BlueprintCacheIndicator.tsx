/**
 * BlueprintCacheIndicator — Cache status display for vehicle blueprint images
 * ──────────────────────────────────────────────────────────────────────────
 * Shows whether the vehicle blueprint PNG is cached locally for offline use.
 * Displays cache status, file count, size, and provides clear/refresh actions.
 *
 * Used in the Vehicle Configuration screen to give users visibility into
 * the offline readiness of their vehicle blueprint images.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import {
  getBlueprintCacheInfo,
  getBlueprintCacheStatus,
  clearBlueprintCache,
  type BlueprintCacheInfo,
  type CacheStatus,
} from '../../lib/blueprintImageCache';
import { vehicleBlueprintMap } from '../vehicle-twin/BlueprintVehicleLayer';

/* ── Status display config ─────────────────────────────── */
const STATUS_CONFIG: Record<string, {
  icon: string;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}> = {
  cached: {
    icon: 'checkmark-circle',
    label: 'CACHED LOCALLY',
    color: '#66BB6A',
    bgColor: 'rgba(102, 187, 106, 0.08)',
    borderColor: 'rgba(102, 187, 106, 0.25)',
  },
  network: {
    icon: 'cloud-outline',
    label: 'NETWORK ONLY',
    color: TACTICAL.textMuted,
    bgColor: 'rgba(62, 79, 60, 0.08)',
    borderColor: 'rgba(62, 79, 60, 0.25)',
  },
  downloading: {
    icon: 'cloud-download-outline',
    label: 'DOWNLOADING...',
    color: TACTICAL.amber,
    bgColor: 'rgba(196, 138, 44, 0.08)',
    borderColor: 'rgba(196, 138, 44, 0.25)',
  },
  checking: {
    icon: 'hourglass-outline',
    label: 'CHECKING...',
    color: TACTICAL.textMuted,
    bgColor: 'rgba(62, 79, 60, 0.08)',
    borderColor: 'rgba(62, 79, 60, 0.25)',
  },
  unavailable: {
    icon: 'globe-outline',
    label: 'WEB MODE',
    color: TACTICAL.textMuted,
    bgColor: 'rgba(62, 79, 60, 0.06)',
    borderColor: 'rgba(62, 79, 60, 0.15)',
  },
  error: {
    icon: 'alert-circle-outline',
    label: 'CACHE ERROR',
    color: '#E57373',
    bgColor: 'rgba(229, 115, 115, 0.08)',
    borderColor: 'rgba(229, 115, 115, 0.25)',
  },
};

/* ═══════════════════════════════════════════════════════════
   BlueprintCacheIndicator (main export)
   ═══════════════════════════════════════════════════════════ */
export default function BlueprintCacheIndicator() {
  const [cacheInfo, setCacheInfo] = useState<BlueprintCacheInfo | null>(null);
  const [blueprintStatus, setBlueprintStatus] = useState<string>('checking');
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  const checkCache = useCallback(async () => {
    setLoading(true);

    // Web platform — caching not available
    if (Platform.OS === 'web') {
      setBlueprintStatus('unavailable');
      setCacheInfo({
        fileCount: 0,
        totalBytes: 0,
        totalSizeDisplay: '0 B',
        available: false,
      });
      setLoading(false);
      return;
    }

    try {
      // Check overall cache info
      const info = await getBlueprintCacheInfo();
      setCacheInfo(info);

      // Check if the primary blueprint URL is cached
      const truckUrl = vehicleBlueprintMap.truck;
      const status = await getBlueprintCacheStatus(truckUrl);

      if (status.isCached) {
        setBlueprintStatus('cached');
      } else {
        setBlueprintStatus('network');
      }
    } catch (err) {
      console.warn('[BlueprintCacheIndicator] Error checking cache:', err);
      setBlueprintStatus('error');
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    checkCache();
  }, [checkCache]);

  const handleClearCache = useCallback(async () => {
    setClearing(true);
    try {
      await clearBlueprintCache();
      await checkCache();
    } catch (err) {
      console.warn('[BlueprintCacheIndicator] Error clearing cache:', err);
    }
    setClearing(false);
  }, [checkCache]);

  const config = STATUS_CONFIG[blueprintStatus] || STATUS_CONFIG.checking;

  return (
    <View style={[st.container, { backgroundColor: config.bgColor, borderColor: config.borderColor }]}>
      {/* Header row */}
      <View style={st.headerRow}>
        <View style={st.titleGroup}>
          <Ionicons name="image-outline" size={13} color={TACTICAL.amber} />
          <Text style={st.title}>BLUEPRINT CACHE</Text>
        </View>
        {!loading && blueprintStatus !== 'unavailable' && (
          <TouchableOpacity
            style={st.refreshBtn}
            onPress={checkCache}
            activeOpacity={0.7}
          >
            <Ionicons name="refresh-outline" size={12} color={TACTICAL.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Status row */}
      <View style={st.statusRow}>
        {loading ? (
          <ActivityIndicator size="small" color={TACTICAL.amber} />
        ) : (
          <>
            <Ionicons name={config.icon as any} size={14} color={config.color} />
            <Text style={[st.statusLabel, { color: config.color }]}>{config.label}</Text>
          </>
        )}
      </View>

      {/* Cache details (only shown when cache info is available) */}
      {!loading && cacheInfo && cacheInfo.available && (
        <View style={st.detailsRow}>
          {/* File count */}
          <View style={st.detailItem}>
            <Ionicons name="document-outline" size={10} color={TACTICAL.textMuted} />
            <Text style={st.detailText}>
              {cacheInfo.fileCount} {cacheInfo.fileCount === 1 ? 'file' : 'files'}
            </Text>
          </View>

          {/* Cache size */}
          <View style={st.detailItem}>
            <Ionicons name="server-outline" size={10} color={TACTICAL.textMuted} />
            <Text style={st.detailText}>{cacheInfo.totalSizeDisplay}</Text>
          </View>

          {/* Storage engine */}
          <View style={st.detailItem}>
            <Ionicons name="hardware-chip-outline" size={10} color={TACTICAL.textMuted} />
            <Text style={st.detailText}>expo-file-system</Text>
          </View>
        </View>
      )}

      {/* Web platform notice */}
      {!loading && blueprintStatus === 'unavailable' && (
        <Text style={st.webNotice}>
          Blueprint caching requires a native device. Images are loaded from the network on web.
        </Text>
      )}

      {/* Clear cache button (only when there are cached files) */}
      {!loading && cacheInfo && cacheInfo.fileCount > 0 && (
        <TouchableOpacity
          style={st.clearBtn}
          onPress={handleClearCache}
          activeOpacity={0.7}
          disabled={clearing}
        >
          {clearing ? (
            <ActivityIndicator size="small" color={TACTICAL.textMuted} />
          ) : (
            <>
              <Ionicons name="trash-outline" size={11} color={TACTICAL.textMuted} />
              <Text style={st.clearBtnText}>CLEAR CACHE</Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════
   Styles
   ═══════════════════════════════════════════════════════════ */
const st = StyleSheet.create({
  container: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginTop: 16,
    marginBottom: 8,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },

  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  title: {
    fontSize: 9,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },

  refreshBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(62, 79, 60, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },

  statusLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },

  detailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(62, 79, 60, 0.2)',
  },

  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  detailText: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 0.3,
  },

  webNotice: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    lineHeight: 15,
    marginTop: 2,
  },

  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 10,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.3)',
    backgroundColor: 'rgba(62, 79, 60, 0.1)',
  },

  clearBtnText: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
});



