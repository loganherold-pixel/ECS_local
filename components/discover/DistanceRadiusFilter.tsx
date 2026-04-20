// ============================================================
// DISTANCE RADIUS FILTER — Discover Tab Distance Control
// ============================================================
// Compact segmented filter for selecting maximum expedition
// distance from the user. ECS tactical styling with gold
// accents and dark panel background.
//
// Phase 4.5: Updated options (25|50|100|250|500), default 100mi,
// added loading indicator and GPS accuracy hint.
//
// Options: 25 mi | 50 mi | 100 mi | 250 mi | 500 mi
// ============================================================

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, useWindowDimensions } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, ECS } from '../../lib/theme';
import { hapticMicro } from '../../lib/haptics';
import { ECSBadge } from '../ECSStatus';
import { ECSSliderField } from '../ECSForm';
import {
  DISTANCE_RADIUS_OPTIONS,
  type DistanceRadius,
} from '../../lib/discoverEngine';

interface DistanceRadiusFilterProps {
  selectedRadius: DistanceRadius | null;
  onChangeRadius: (radius: DistanceRadius | null) => void;
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
  const { width } = useWindowDimensions();
  const compact = width < 380;

  return (
    <ECSSliderField
      label={compact ? 'Radius' : 'Distance Radius'}
      helper={
        filteredCount < totalCount
          ? selectedRadius == null
            ? `Showing ${filteredCount} of ${totalCount} trails across the current range`
            : `Showing ${filteredCount} of ${totalCount} trails within ${selectedRadius} mi`
          : hasGPSFix
            ? 'Using your live location for radius matching.'
            : 'Using approximate location until GPS improves.'
      }
      valueLabel={selectedRadius == null ? 'ALL RANGE' : `${selectedRadius} MI`}
      style={s.container}
    >
      {/* Header row */}
      <View style={[s.headerRow, compact && s.headerRowCompact]}>
        <View style={s.headerLeft}>
          <Ionicons name="locate-outline" size={11} color={TACTICAL.amber} />
          {isLoading && (
            <ActivityIndicator size="small" color={TACTICAL.amber} style={{ marginLeft: 6 }} />
          )}
        </View>
        <View style={[s.headerRight, compact && s.headerRightCompact]}>
          {!hasGPSFix && (
            <ECSBadge
              label={compact ? 'Approx' : 'Approx. Location'}
              icon="navigate-outline"
              tone="warning"
              compact
            />
          )}
          {hasGPSFix && (
            <ECSBadge label="GPS" tone="live" compact />
          )}
          <ECSBadge label={`${filteredCount}/${totalCount}`} tone="selected" compact />
        </View>
      </View>

      {/* Segmented control */}
      <View style={[s.segmentedRow, compact && s.segmentedRowCompact]}>
        {DISTANCE_RADIUS_OPTIONS.map((radius) => {
          const isActive = radius === selectedRadius;
          return (
            <TouchableOpacity
              key={radius}
              style={[
                s.segment,
                compact && s.segmentCompact,
                isActive && s.segmentActive,
              ]}
              activeOpacity={0.75}
              onPress={() => {
                hapticMicro();
                onChangeRadius(isActive ? null : radius);
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

    </ECSSliderField>
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
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 10,
    gap: 8,
  },

  // ── Header ────────────────────────────────────────────
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerRowCompact: {
    alignItems: 'flex-start',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  headerLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1.8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerRightCompact: {
    gap: 4,
  },
  gpsHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
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
    paddingHorizontal: 5,
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
    fontSize: 6,
    fontWeight: '800',
    color: '#66BB6A',
    letterSpacing: 1.1,
  },
  countBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '30',
    backgroundColor: TACTICAL.amber + '0A',
  },
  countText: {
    fontSize: 8,
    fontWeight: '800',
    fontFamily: 'Courier',
    color: TACTICAL.amber,
    letterSpacing: 0.5,
  },

  // ── Segmented Control ─────────────────────────────────
  segmentedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  segmentedRowCompact: {
    gap: 4,
  },
  segment: {
    minWidth: '18%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 7,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
  },
  segmentCompact: {
    paddingVertical: 6,
  },
  segmentActive: {
    borderColor: TACTICAL.amber + '50',
    backgroundColor: TACTICAL.amber + '14',
  },
  segmentText: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'Courier',
    color: TACTICAL.textMuted,
    letterSpacing: -0.5,
  },
  segmentTextActive: {
    color: TACTICAL.amber,
  },
  segmentUnit: {
    fontSize: 6,
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
    paddingTop: 1,
  },
  filterStatusText: {
    fontSize: 7,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 0.2,
  },
});



