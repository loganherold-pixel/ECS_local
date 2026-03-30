/**
 * MapOverlayControls — Compact pill-button overlay for map
 *
 * Streamlined controls:
 *   - Layer toggle: DAY / TAC / SAT (TOP-RIGHT)
 *   - Storage dashboard button (TOP-RIGHT)
 *   - Download Map Area button
 */
import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  type ViewStyle,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL, TYPO } from '../../lib/theme';
import type { MapStyleKey } from '../../lib/mapConfig';
import type { RunHealthLevel } from '../../lib/runStore';
import type { SegmentHazardLevel } from './RouteCorridorWeather';
import type { CompassMode } from '../../lib/useVehicleHeading';

interface DownloadProgress {
  status: string;
  totalTiles: number;
  downloadedTiles: number;
  failedTiles: number;
  percent: number;
  message: string;
}

interface Props {
  currentStyle: MapStyleKey;
  onStyleChange: (style: MapStyleKey) => void;
  onCenterRoute: () => void;
  onCenterUser: () => void;
  followUser: boolean;
  onToggleFollow: () => void;
  healthLevel?: RunHealthLevel;
  hasUserLocation: boolean;
  hasRoute: boolean;
  onDownloadArea?: () => void;
  downloadProgress?: DownloadProgress | null;
  cachedTileCount?: number;
  cachedSizeMB?: number;
  showTiltAlertZones?: boolean;
  onToggleTiltAlertZones?: () => void;
  tiltAlertCount?: number;
  compassMode?: CompassMode;
  onCompassModeChange?: (mode: CompassMode) => void;
  headingLockActive?: boolean;
  onToggleHeadingLock?: () => void;
  showWeatherAlerts?: boolean;
  onToggleWeatherAlerts?: () => void;
  weatherAlertCount?: number;
  weatherSevereCount?: number;
  showRouteWeather?: boolean;
  onToggleRouteWeather?: () => void;
  routeWeatherHazard?: SegmentHazardLevel;
  routeWeatherHazardCount?: number;
  onStorageDashboard?: () => void;
  bottomOffset?: number;
}

export default function MapOverlayControls({
  currentStyle,
  onStyleChange,
  hasRoute,
  onDownloadArea,
  downloadProgress,
  onStorageDashboard,
  bottomOffset = 96,
}: Props) {
  const isDownloading =
    downloadProgress?.status === 'downloading' || downloadProgress?.status === 'calculating';

  const downloadComplete = downloadProgress?.status === 'complete';

  const bottomRowStyle = useMemo<ViewStyle>(
    () => ({
      position: 'absolute',
      bottom: bottomOffset,
      left: 10,
      right: 10,
    }),
    [bottomOffset],
  );

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.topRow} pointerEvents="box-none">
        <View style={styles.leftControls} />

        <View style={styles.rightControls}>
          <View style={styles.styleSelector}>
            <TouchableOpacity
              style={[
                styles.styleSegment,
                styles.styleSegmentLeft,
                currentStyle === 'ecs' && styles.styleSegmentActive,
              ]}
              onPress={() => onStyleChange('ecs')}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.styleSegmentText,
                  currentStyle === 'ecs' && styles.styleSegmentTextActive,
                ]}
              >
                DAY
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.styleSegment,
                styles.styleSegmentMiddle,
                currentStyle === 'tactical' && styles.styleSegmentActive,
              ]}
              onPress={() => onStyleChange('tactical')}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.styleSegmentText,
                  currentStyle === 'tactical' && styles.styleSegmentTextActive,
                ]}
              >
                TAC
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.styleSegment,
                styles.styleSegmentRight,
                currentStyle === 'satellite' && styles.styleSegmentActive,
              ]}
              onPress={() => onStyleChange('satellite')}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.styleSegmentText,
                  currentStyle === 'satellite' && styles.styleSegmentTextActive,
                ]}
              >
                SAT
              </Text>
            </TouchableOpacity>
          </View>

          {onStorageDashboard && (
            <TouchableOpacity
              style={styles.storageDashboardBtn}
              onPress={onStorageDashboard}
              activeOpacity={0.7}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="server-outline" size={14} color={TACTICAL.amber} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isDownloading && downloadProgress && (
        <View style={styles.downloadProgressContainer}>
          <View style={styles.downloadProgressBar}>
            <View style={styles.downloadProgressInfo}>
              <ActivityIndicator
                size="small"
                color={TACTICAL.amber}
                style={{ transform: [{ scale: 0.6 }] }}
              />
              <Text style={styles.downloadProgressText}>
                {downloadProgress.status === 'calculating'
                  ? 'CALCULATING...'
                  : `${downloadProgress.downloadedTiles}/${downloadProgress.totalTiles}`}
              </Text>
              <Text style={styles.downloadProgressPercent}>
                {downloadProgress.percent}%
              </Text>
            </View>

            <View style={styles.downloadTrack}>
              <View
                style={[
                  styles.downloadFill,
                  { width: `${Math.max(downloadProgress.percent, 2)}%` as const },
                ]}
              />
            </View>
          </View>
        </View>
      )}

      {downloadComplete && downloadProgress && (
        <View style={styles.downloadProgressContainer}>
          <View style={styles.downloadCompleteBadge}>
            <Ionicons name="checkmark-circle" size={14} color="#66BB6A" />
            <Text style={styles.downloadCompleteText}>
              {downloadProgress.downloadedTiles} TILES CACHED
            </Text>
          </View>
        </View>
      )}

      <View style={[styles.bottomRow, bottomRowStyle]} pointerEvents="box-none">
        <View style={styles.actionPills}>
          {onDownloadArea && hasRoute && (
            <TouchableOpacity
              style={[
                styles.actionPill,
                styles.downloadPill,
                isDownloading && styles.downloadPillActive,
              ]}
              onPress={isDownloading ? undefined : onDownloadArea}
              activeOpacity={isDownloading ? 1 : 0.8}
              disabled={isDownloading}
            >
              <Ionicons
                name={isDownloading ? 'hourglass-outline' : 'cloud-download-outline'}
                size={14}
                color={isDownloading ? TACTICAL.textMuted : TACTICAL.amber}
              />
              <Text
                style={[
                  styles.actionPillText,
                  !isDownloading && { color: TACTICAL.amber },
                ]}
              >
                {isDownloading ? 'CACHING' : 'OFFLINE'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
  },

  topRow: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  padding: 10,
},

  leftControls: {
    minWidth: 1,
  },

  rightControls: {
    position: 'relative',
    alignItems: 'flex-end',
  },

  downloadProgressContainer: {
    paddingHorizontal: 10,
  },

  downloadProgressBar: {
    backgroundColor: 'rgba(11,15,18,0.92)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.3)',
    padding: 8,
  },

  downloadProgressInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },

  downloadProgressText: {
    ...TYPO.U2,
    fontSize: 7,
    color: TACTICAL.text,
    letterSpacing: 2,
    flex: 1,
  },

  downloadProgressPercent: {
    ...TYPO.K3,
    fontSize: 11,
    color: TACTICAL.amber,
  },

  downloadTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(62,79,60,0.3)',
    overflow: 'hidden',
  },

  downloadFill: {
    height: 3,
    borderRadius: 2,
    backgroundColor: TACTICAL.amber,
  },

  downloadCompleteBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(11,15,18,0.92)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(102,187,106,0.3)',
    padding: 8,
    alignSelf: 'flex-start',
  },

  downloadCompleteText: {
    ...TYPO.U2,
    fontSize: 7,
    color: '#66BB6A',
    letterSpacing: 3,
  },

  bottomRow: {
    paddingHorizontal: 10,
    paddingTop: 10,
  },

  actionPills: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    alignItems: 'flex-end',
  },

  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(11,15,18,0.88)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.4)',
  },

  actionPillText: {
    ...TYPO.U2,
    fontSize: 7,
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },

  downloadPill: {
    borderColor: 'rgba(196,138,44,0.3)',
    backgroundColor: 'rgba(196,138,44,0.06)',
  },

  downloadPillActive: {
    borderColor: 'rgba(196,138,44,0.5)',
    backgroundColor: 'rgba(196,138,44,0.15)',
  },

  storageDashboardBtn: {
  width: 44,
  height: 44,
  borderRadius: 10,
  backgroundColor: 'rgba(11,15,18,0.90)',
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.35)',
  alignItems: 'center',
  justifyContent: 'center',
  marginTop: 6,
  alignSelf: 'flex-end',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.4,
  shadowRadius: 4,
  elevation: 6,
},

  styleSelector: {
  flexDirection: 'row',
  backgroundColor: 'rgba(11,15,18,0.92)',
  borderRadius: 10,
  borderWidth: 1,
  borderColor: 'rgba(62,79,60,0.45)',
  overflow: 'hidden',
  alignSelf: 'flex-end',
},

  styleSegment: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 52,
  },

  styleSegmentLeft: {
    borderRightWidth: 1,
    borderRightColor: 'rgba(62,79,60,0.35)',
  },

  styleSegmentMiddle: {
    borderRightWidth: 1,
    borderRightColor: 'rgba(62,79,60,0.35)',
  },

  styleSegmentRight: {},

  styleSegmentActive: {
    backgroundColor: 'rgba(196,138,44,0.15)',
  },

  styleSegmentText: {
    ...TYPO.U2,
    fontSize: 8,
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },

  styleSegmentTextActive: {
    color: TACTICAL.amber,
  },
});