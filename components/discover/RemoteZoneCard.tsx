// ============================================================
// REMOTE ZONE CARD — Individual Remote Zone Display
// ============================================================
// Tactical card showing zone name, isolation score, nearest town,
// terrain type, suggested camps, and optional rig compatibility.
// Tap to select → parent opens zone detail / map view.
// ============================================================

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, GOLD_RAIL, ECS } from '../../lib/theme';
import { hapticMicro } from '../../lib/haptics';
import {
  getIsolationColor,
  getIsolationLabel,
  getAccessTypeLabel,
  getAccessTypeColor,
  getCellCoverageLabel,
  getCellCoverageColor,
  type RemoteZone,
} from '../../lib/remoteExplorerEngine';
import {
  getCompatibilityColor,
  getDifficultyColor,
  type CompatibilityResult,
  type DifficultyRating,
} from '../../lib/rigCompatibilityEngine';

interface RemoteZoneCardProps {
  zone: RemoteZone;
  compatResult: CompatibilityResult | null;
  hasVehicle: boolean;
  onSelect: () => void;
}

export default function RemoteZoneCard({
  zone,
  compatResult,
  hasVehicle,
  onSelect,
}: RemoteZoneCardProps) {
  const isolationColor = getIsolationColor(zone.isolationScore);
  const isolationLabel = getIsolationLabel(zone.isolationScore);
  const accessColor = getAccessTypeColor(zone.accessType);
  const accessLabel = getAccessTypeLabel(zone.accessType);
  const cellColor = getCellCoverageColor(zone.cellCoverage);
  const cellLabel = getCellCoverageLabel(zone.cellCoverage);

  const compatScore = zone.rigCompatibility ?? null;
  const diffRating = (zone.difficultyRating as DifficultyRating) ?? null;
  const compatColor = compatScore != null ? getCompatibilityColor(compatScore) : TACTICAL.textMuted;
  const diffColor = diffRating ? getDifficultyColor(diffRating) : TACTICAL.textMuted;

  return (
    <TouchableOpacity
      style={s.card}
      activeOpacity={0.82}
      onPress={() => {
        hapticMicro();
        onSelect();
      }}
    >
      {/* Left accent bar — isolation color */}
      <View style={[s.accentBar, { backgroundColor: isolationColor }]} />

      <View style={s.cardBody}>
        {/* Top Row: Name + Isolation Badge */}
        <View style={s.topRow}>
          <View style={s.nameBlock}>
            <Text style={s.cardName} numberOfLines={1}>{zone.name}</Text>
            <Text style={s.cardRegion}>{zone.region}</Text>
          </View>

          {/* Isolation Score Badge */}
          <View style={[s.isolationBadge, { borderColor: isolationColor + '40', backgroundColor: isolationColor + '12' }]}>
            <Text style={[s.isolationScore, { color: isolationColor }]}>
              {zone.isolationScore.toFixed(1)}
            </Text>
            <Text style={[s.isolationUnit, { color: isolationColor }]}>ISO</Text>
          </View>
        </View>

        {/* Stats Row */}
        <View style={s.statsRow}>
          <View style={s.statItem}>
            <Ionicons name="navigate-outline" size={10} color={TACTICAL.textMuted} />
            <Text style={s.statValue}>{zone.nearestTownMiles}</Text>
            <Text style={s.statUnit}>MI TO TOWN</Text>
          </View>

          <View style={s.statDot} />

          <View style={s.statItem}>
            <Ionicons name="bonfire-outline" size={10} color={TACTICAL.textMuted} />
            <Text style={s.statValue}>{zone.suggestedCamps}</Text>
            <Text style={s.statUnit}>CAMPS</Text>
          </View>

          <View style={s.statDot} />

          <View style={s.statItem}>
            <Ionicons name="water-outline" size={10} color={TACTICAL.textMuted} />
            <Text style={s.statValue}>{zone.waterSources}</Text>
            <Text style={s.statUnit}>WATER</Text>
          </View>

          <View style={s.statDot} />

          <View style={s.statItem}>
            <Ionicons name="trending-up-outline" size={10} color={TACTICAL.textMuted} />
            <Text style={s.statValue}>
              {zone.elevationRangeFt[0].toLocaleString()}–{zone.elevationRangeFt[1].toLocaleString()}
            </Text>
            <Text style={s.statUnit}>FT</Text>
          </View>
        </View>

        {/* Bottom Row: Chips */}
        <View style={s.chipRow}>
          {/* Terrain Chip */}
          <View style={[s.chip, { borderColor: 'rgba(138,138,133,0.25)', backgroundColor: 'rgba(138,138,133,0.06)' }]}>
            <Ionicons name="trail-sign-outline" size={8} color={TACTICAL.textMuted} />
            <Text style={[s.chipText, { color: TACTICAL.textMuted }]}>{zone.terrainType.toUpperCase()}</Text>
          </View>

          {/* Access Type Chip */}
          <View style={[s.chip, { borderColor: accessColor + '40', backgroundColor: accessColor + '0C' }]}>
            <Ionicons name="shield-outline" size={8} color={accessColor} />
            <Text style={[s.chipText, { color: accessColor }]}>{accessLabel}</Text>
          </View>

          {/* Cell Coverage Chip */}
          <View style={[s.chip, { borderColor: cellColor + '40', backgroundColor: cellColor + '0C' }]}>
            <Ionicons name="cellular-outline" size={8} color={cellColor} />
            <Text style={[s.chipText, { color: cellColor }]}>{cellLabel}</Text>
          </View>
        </View>

        {/* Rig Compatibility Row (if scored) */}
        {compatScore != null && (
          <View style={s.compatRow}>
            <View style={s.compatLeft}>
              <Ionicons name="construct-outline" size={9} color={compatColor} />
              <Text style={[s.compatLabel, { color: compatColor }]}>RIG COMPATIBILITY</Text>
            </View>
            <View style={s.compatRight}>
              <View style={s.compatBarBg}>
                <View style={[s.compatBarFill, { width: `${compatScore}%`, backgroundColor: compatColor }]} />
              </View>
              <Text style={[s.compatValue, { color: compatColor }]}>{compatScore}%</Text>
              {diffRating && (
                <View style={[s.diffChip, { borderColor: diffColor + '35', backgroundColor: diffColor + '10' }]}>
                  <Text style={[s.diffChipText, { color: diffColor }]}>{diffRating}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Map indicator */}
        <View style={s.mapRow}>
          <View style={s.mapHint}>
            <Ionicons name="map-outline" size={9} color={TACTICAL.textMuted} />
            <Text style={s.mapHintText}>TAP TO EXPLORE ZONE</Text>
          </View>
          <Ionicons name="chevron-forward" size={12} color={TACTICAL.textMuted} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ============================================================
// STYLES
// ============================================================
const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: ECS.bgPanel,
    borderRadius: ECS.radius,
    borderWidth: 1,
    borderColor: ECS.stroke,
    marginBottom: 10,
    overflow: 'hidden',
  },

  accentBar: {
    width: 4,
  },

  cardBody: {
    flex: 1,
    padding: 14,
    gap: 10,
  },

  // ── Top Row ───────────────────────────────────────────
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  nameBlock: {
    flex: 1,
  },
  cardName: {
    fontSize: 13,
    fontWeight: '700',
    color: ECS.text,
    letterSpacing: 3,
  },
  cardRegion: {
    fontSize: 11,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
    marginTop: 2,
  },

  // ── Isolation Badge ───────────────────────────────────
  isolationBadge: {
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    gap: 0,
  },
  isolationScore: {
    fontSize: 16,
    fontWeight: '900',
    fontFamily: 'Courier',
    letterSpacing: -0.5,
  },
  isolationUnit: {
    fontSize: 6,
    fontWeight: '800',
    letterSpacing: 2,
    marginTop: -1,
  },

  // ── Stats Row ─────────────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 4,
    borderTopWidth: GOLD_RAIL.subsectionWidth,
    borderTopColor: GOLD_RAIL.internal,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  statValue: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'Courier',
    color: ECS.text,
  },
  statUnit: {
    fontSize: 6,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  statDot: {
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: TACTICAL.textMuted,
    opacity: 0.4,
  },

  // ── Chip Row ──────────────────────────────────────────
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 5,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // ── Compat Row ────────────────────────────────────────
  compatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: GOLD_RAIL.subsectionWidth,
    borderTopColor: GOLD_RAIL.internal,
    gap: 8,
  },
  compatLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  compatLabel: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  compatRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    justifyContent: 'flex-end',
  },
  compatBarBg: {
    flex: 1,
    maxWidth: 60,
    height: 4,
    backgroundColor: 'rgba(30,35,43,0.8)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  compatBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  compatValue: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: 'Courier',
    minWidth: 28,
    textAlign: 'right',
  },
  diffChip: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  diffChipText: {
    fontSize: 6,
    fontWeight: '900',
    letterSpacing: 1,
  },

  // ── Map Row ───────────────────────────────────────────
  mapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    borderTopWidth: GOLD_RAIL.subsectionWidth,
    borderTopColor: GOLD_RAIL.internal,
  },
  mapHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  mapHintText: {
    fontSize: 7,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
});



