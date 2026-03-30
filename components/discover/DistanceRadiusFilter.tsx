// ============================================================
// DISTANCE RADIUS FILTER — Discover Tab Distance Control
// ============================================================
// Compact segmented filter for selecting maximum expedition
// distance from the user. ECS tactical styling with gold
// accents and dark panel background.
//
// Phase 4.5: Updated options (50|100|200|500), default 200mi,
// added loading indicator and GPS accuracy hint.
//
// Options: 50 mi | 100 mi | 200 mi | 500 mi
// ============================================================

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, GOLD_RAIL, ECS } from '../../lib/theme';
import { hapticMicro } from '../../lib/haptics';
import {
  DISTANCE_RADIUS_OPTIONS,
  type DistanceRadius,
} from '../../lib/discoverEngine';

interface DistanceRadiusFilterProps {
  selectedRadius: DistanceRadius;
  onChangeRadius: (radius: DistanceRadius) => void;
  /** Whether user has a real GPS fix (affects label) */
  hasGPSFix: boolean;
  /** Total opportunities before filtering */
  totalCount: number;
  /** Filtered count after radius */
  filteredCount: number;
  /** Whether results are currently loading/refreshing */
  isLoading?: boolean;
}

export default function DistanceRadiusFilter({
  selectedRadius,
  onChangeRadius,
  hasGPSFix,
  totalCount,
  filteredCount,
  isLoading = false,
}: DistanceRadiusFilterProps) {
  return (
    <View style={s.container}>
      {/* Header row */}
      <View style={s.headerRow}>
        <View style={s.headerLeft}>
          <Ionicons name="locate-outline" size={11} color={TACTICAL.amber} />
          <Text style={s.headerLabel}>DISTANCE RADIUS</Text>
          {isLoading && (
            <ActivityIndicator size="small" color={TACTICAL.amber} style={{ marginLeft: 6 }} />
          )}
        </View>
        <View style={s.headerRight}>
          {!hasGPSFix && (
            <View style={s.gpsHint}>
              <Ionicons name="navigate-outline" size={8} color={TACTICAL.textMuted} />
              <Text style={s.gpsHintText}>APPROX. LOCATION</Text>
            </View>
          )}
          {hasGPSFix && (
            <View style={s.gpsActive}>
              <View style={s.gpsDot} />
              <Text style={s.gpsActiveText}>GPS</Text>
            </View>
          )}
          <View style={s.countBadge}>
            <Text style={s.countText}>
              {filteredCount}/{totalCount}
            </Text>
          </View>
        </View>
      </View>

      {/* Segmented control */}
      <View style={s.segmentedRow}>
        {DISTANCE_RADIUS_OPTIONS.map((radius) => {
          const isActive = radius === selectedRadius;
          return (
            <TouchableOpacity
              key={radius}
              style={[
                s.segment,
                isActive && s.segmentActive,
              ]}
              activeOpacity={0.75}
              onPress={() => {
                hapticMicro();
                onChangeRadius(radius);
              }}
            >
              <Text
                style={[
                  s.segmentText,
                  isActive && s.segmentTextActive,
                ]}
              >
                {radius}
              </Text>
              <Text
                style={[
                  s.segmentUnit,
                  isActive && s.segmentUnitActive,
                ]}
              >
                MI
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Filter status line */}
      {filteredCount < totalCount && (
        <View style={s.filterStatus}>
          <Ionicons name="funnel-outline" size={9} color={TACTICAL.textMuted} />
          <Text style={s.filterStatusText}>
            Showing {filteredCount} of {totalCount} trails within {selectedRadius} mi
          </Text>
        </View>
      )}
    </View>
  );
}

// ============================================================
// STYLES
// ============================================================
const s = StyleSheet.create({
  container: {
    backgroundColor: ECS.bgPanel,
    borderRadius: ECS.radius,
    borderWidth: 1,
    borderColor: ECS.stroke,
    padding: 12,
    marginBottom: 14,
    gap: 10,
  },

  // ── Header ────────────────────────────────────────────
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 2.5,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gpsHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(138,148,158,0.08)',
  },
  gpsHintText: {
    fontSize: 6,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  gpsActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(102,187,106,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(102,187,106,0.20)',
  },
  gpsDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#66BB6A',
  },
  gpsActiveText: {
    fontSize: 7,
    fontWeight: '800',
    color: '#66BB6A',
    letterSpacing: 1.5,
  },
  countBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '30',
    backgroundColor: TACTICAL.amber + '0A',
  },
  countText: {
    fontSize: 9,
    fontWeight: '800',
    fontFamily: 'Courier',
    color: TACTICAL.amber,
    letterSpacing: 0.5,
  },

  // ── Segmented Control ─────────────────────────────────
  segmentedRow: {
    flexDirection: 'row',
    gap: 6,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
  },
  segmentActive: {
    borderColor: TACTICAL.amber + '50',
    backgroundColor: TACTICAL.amber + '14',
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: 'Courier',
    color: TACTICAL.textMuted,
    letterSpacing: -0.5,
  },
  segmentTextActive: {
    color: TACTICAL.amber,
  },
  segmentUnit: {
    fontSize: 7,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
    opacity: 0.6,
  },
  segmentUnitActive: {
    color: TACTICAL.amber,
    opacity: 0.8,
  },

  // ── Filter Status ─────────────────────────────────────
  filterStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingTop: 2,
  },
  filterStatusText: {
    fontSize: 9,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    letterSpacing: 0.3,
  },
});



