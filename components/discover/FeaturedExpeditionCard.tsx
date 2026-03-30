// ============================================================
// FEATURED EXPEDITION CARD — Premium Curated Recommendation
// ============================================================
// Displays the single highest-match-score expedition as a
// premium card above the standard opportunity list.
//
// Phase 4.5: Added Match Score display alongside rig compat.
// ============================================================

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, GOLD_RAIL, ECS, TYPO } from '../../lib/theme';
import { hapticMicro } from '../../lib/haptics';
import {
  getTerrainColor,
  getRemotenessLabel,
  getRemotenessColor,
  getMatchScoreColor,
  getMatchScoreLabel,
  type ExpeditionOpportunity,
} from '../../lib/discoverEngine';
import {
  getCompatibilityColor,
  getDifficultyColor,
  type CompatibilityResult,
  type DifficultyRating,
} from '../../lib/rigCompatibilityEngine';
import {
  hasUpgradeSuggestions,
  getUpgradeHintColor,
} from '../../lib/rigUpgradeEngine';

interface FeaturedExpeditionCardProps {
  opportunity: ExpeditionOpportunity;
  compatResult: CompatibilityResult | null;
  onViewAnalysis: () => void;
}

export default function FeaturedExpeditionCard({
  opportunity,
  compatResult,
  onViewAnalysis,
}: FeaturedExpeditionCardProps) {
  const terrainColor = getTerrainColor(opportunity.terrainType);
  const remotenessColor = getRemotenessColor(opportunity.remotenessScore);
  const remotenessLabel = getRemotenessLabel(opportunity.remotenessScore);

  const compatScore = opportunity.rigCompatibility ?? null;
  const diffRating = (opportunity.difficultyRating as DifficultyRating) ?? null;
  const compatColor = compatScore != null ? getCompatibilityColor(compatScore) : TACTICAL.amber;
  const diffColor = diffRating ? getDifficultyColor(diffRating) : TACTICAL.textMuted;

  const userDistance = opportunity.distanceFromUserMiles;
  const matchScore = opportunity.matchScore ?? null;
  const matchColor = matchScore != null ? getMatchScoreColor(matchScore) : TACTICAL.amber;
  const matchLabel = matchScore != null ? getMatchScoreLabel(matchScore) : null;

  // Upgrade hint
  const showUpgradeHint = hasUpgradeSuggestions(compatScore ?? undefined);
  const upgradeHintColor = showUpgradeHint && compatScore != null ? getUpgradeHintColor(compatScore) : '#5AC8FA';

  return (
    <View style={s.wrapper}>
      {/* Section Label */}
      <View style={s.sectionLabel}>
        <Ionicons name="diamond-outline" size={11} color={TACTICAL.amber} />
        <Text style={s.sectionLabelText}>TOP MATCH FOR YOUR RIG</Text>
      </View>

      {/* Card */}
      <View style={s.card}>
        {/* Top gold accent bar */}
        <View style={s.topAccent} />

        {/* Subtle terrain-tinted background overlay */}
        <View style={[s.terrainOverlay, { backgroundColor: terrainColor }]} />

        {/* Card content */}
        <View style={s.cardContent}>
          {/* Header Row: Name + Match Score */}
          <View style={s.headerRow}>
            <View style={s.nameBlock}>
              <Text style={s.expeditionName} numberOfLines={1}>
                {opportunity.name}
              </Text>
              <Text style={s.expeditionRegion}>
                {opportunity.region}
              </Text>
            </View>

            {/* Match Score Badge (primary) */}
            {matchScore != null ? (
              <View style={[s.matchBadge, { borderColor: matchColor + '50', backgroundColor: matchColor + '10' }]}>
                <Text style={[s.matchBadgeLabel, { color: matchColor }]}>MATCH</Text>
                <View style={s.matchScoreRow}>
                  <Text style={[s.matchScoreText, { color: matchColor }]}>{matchScore}</Text>
                  <Text style={[s.matchPercentText, { color: matchColor }]}>%</Text>
                </View>
                {matchLabel && (
                  <Text style={[s.matchQualityLabel, { color: matchColor }]}>{matchLabel}</Text>
                )}
              </View>
            ) : compatScore != null ? (
              <View style={[s.compatBadge, { borderColor: compatColor + '50', backgroundColor: compatColor + '10' }]}>
                <Text style={[s.compatScoreText, { color: compatColor }]}>{compatScore}</Text>
                <Text style={[s.compatPercentText, { color: compatColor }]}>%</Text>
              </View>
            ) : null}
          </View>

          {/* Distance + Difficulty prominent row */}
          <View style={s.prominentRow}>
            {userDistance != null && (
              <View style={s.prominentItem}>
                <View style={s.distanceIconWrap}>
                  <Ionicons name="navigate-outline" size={11} color={TACTICAL.amber} />
                </View>
                <Text style={s.prominentLabel}>Distance:</Text>
                <Text style={s.prominentValue}>{userDistance} mi</Text>
              </View>
            )}

            {diffRating && (
              <View style={[s.diffBadgeLg, { borderColor: diffColor + '40', backgroundColor: diffColor + '0C' }]}>
                <Ionicons name="speedometer-outline" size={10} color={diffColor} />
                <Text style={[s.diffTextLg, { color: diffColor }]}>{diffRating}</Text>
              </View>
            )}
          </View>

          {/* Terrain descriptor line */}
          <View style={s.terrainLine}>
            <View style={[s.terrainDot, { backgroundColor: terrainColor }]} />
            <Text style={[s.terrainText, { color: terrainColor }]}>
              {opportunity.terrainType}
            </Text>
            <View style={s.terrainDivider} />
            <Ionicons name="resize-outline" size={10} color={TACTICAL.textMuted} />
            <Text style={s.terrainMeta}>{opportunity.distanceMiles} MI</Text>
            <View style={s.terrainDivider} />
            <Ionicons name="trending-up-outline" size={10} color={TACTICAL.textMuted} />
            <Text style={s.terrainMeta}>{opportunity.elevationGainFt.toLocaleString()} FT</Text>
          </View>

          {/* Gold separator */}
          <View style={s.goldSep} />

          {/* Stats Row */}
          <View style={s.statsRow}>
            {/* Difficulty */}
            <View style={s.statBlock}>
              <Text style={s.statLabel}>DIFFICULTY</Text>
              {diffRating ? (
                <View style={[s.diffBadge, { backgroundColor: diffColor + '14', borderColor: diffColor + '30' }]}>
                  <Ionicons name="speedometer-outline" size={10} color={diffColor} />
                  <Text style={[s.diffText, { color: diffColor }]}>{diffRating}</Text>
                </View>
              ) : (
                <Text style={s.statValueMuted}>—</Text>
              )}
            </View>

            {/* Suggested Camps */}
            <View style={s.statBlock}>
              <Text style={s.statLabel}>CAMPS</Text>
              <View style={s.statValueRow}>
                <Ionicons name="bonfire-outline" size={12} color={TACTICAL.amber} />
                <Text style={s.statValue}>{opportunity.suggestedCamps}</Text>
              </View>
            </View>

            {/* Estimated Days */}
            <View style={s.statBlock}>
              <Text style={s.statLabel}>DAYS</Text>
              <View style={s.statValueRow}>
                <Ionicons name="calendar-outline" size={12} color={TACTICAL.amber} />
                <Text style={s.statValue}>{opportunity.estimatedDays}</Text>
              </View>
            </View>

            {/* Fuel */}
            <View style={s.statBlock}>
              <Text style={s.statLabel}>FUEL EST.</Text>
              <View style={s.statValueRow}>
                <Ionicons name="flame-outline" size={12} color="#E67E22" />
                <Text style={s.statValue}>{opportunity.estimatedFuelRequired}</Text>
                <Text style={s.statUnit}>GAL</Text>
              </View>
            </View>
          </View>

          {/* Match Score bar (if available) */}
          {matchScore != null && (
            <View style={s.matchLine}>
              <View style={s.matchBarBg}>
                <View style={[s.matchBarFill, { width: `${matchScore}%`, backgroundColor: matchColor }]} />
              </View>
              <Text style={[s.matchBarLabel, { color: matchColor }]}>
                MATCH SCORE
              </Text>
            </View>
          )}

          {/* Compat bar (secondary, if vehicle configured) */}
          {compatScore != null && (
            <View style={s.compatLine}>
              <View style={s.compatBarBg}>
                <View style={[s.compatBarFill, { width: `${compatScore}%`, backgroundColor: compatColor }]} />
              </View>
              <Text style={[s.compatLabel, { color: compatColor }]}>
                RIG COMPATIBILITY
              </Text>
            </View>
          )}

          {/* Remoteness + Chips */}
          <View style={s.chipRow}>
            <View style={[s.chip, { borderColor: remotenessColor + '35', backgroundColor: remotenessColor + '0A' }]}>
              <Ionicons name="radio-outline" size={9} color={remotenessColor} />
              <Text style={[s.chipText, { color: remotenessColor }]}>{remotenessLabel}</Text>
            </View>

            {opportunity.permitRequired && (
              <View style={[s.chip, { borderColor: 'rgba(224,64,48,0.25)', backgroundColor: 'rgba(224,64,48,0.05)' }]}>
                <Ionicons name="document-text-outline" size={9} color="#E04030" />
                <Text style={[s.chipText, { color: '#E04030' }]}>PERMIT</Text>
              </View>
            )}

            <View style={[s.chip, { borderColor: TACTICAL.amber + '25', backgroundColor: TACTICAL.amber + '08' }]}>
              <Ionicons name="sunny-outline" size={9} color={TACTICAL.amber} />
              <Text style={[s.chipText, { color: TACTICAL.amber }]}>{opportunity.bestSeason.toUpperCase()}</Text>
            </View>

            {/* Upgrade Hint Chip */}
            {showUpgradeHint && (
              <View style={[s.chip, { borderColor: upgradeHintColor + '30', backgroundColor: upgradeHintColor + '08' }]}>
                <Ionicons name="build-outline" size={9} color={upgradeHintColor} />
                <Text style={[s.chipText, { color: upgradeHintColor }]}>UPGRADES AVAILABLE</Text>
              </View>
            )}
          </View>

          {/* View Analysis Button */}
          <TouchableOpacity
            style={s.viewBtn}
            activeOpacity={0.82}
            onPress={() => {
              hapticMicro();
              onViewAnalysis();
            }}
          >
            <Ionicons name="analytics-outline" size={14} color={ECS.bgPrimary} />
            <Text style={s.viewBtnText}>
              {showUpgradeHint ? 'VIEW ANALYSIS & UPGRADES' : 'VIEW ANALYSIS'}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={ECS.bgPrimary} />
          </TouchableOpacity>
        </View>

        {/* Bottom gold accent bar */}
        <View style={s.bottomAccent} />
      </View>
    </View>
  );
}

// ============================================================
// STYLES
// ============================================================
const s = StyleSheet.create({
  wrapper: {
    marginBottom: 18,
  },

  // ── Section Label ─────────────────────────────────────
  sectionLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  sectionLabelText: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 2.5,
  },

  // ── Card ──────────────────────────────────────────────
  card: {
    backgroundColor: ECS.bgPanel,
    borderRadius: ECS.radiusLg,
    borderWidth: 1.5,
    borderColor: 'rgba(212,160,23,0.30)',
    overflow: 'hidden',
    ...ECS.shadow,
  },

  topAccent: {
    height: 2,
    backgroundColor: 'rgba(212,160,23,0.45)',
  },

  bottomAccent: {
    height: 1,
    backgroundColor: 'rgba(212,160,23,0.15)',
  },

  terrainOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.025,
  },

  cardContent: {
    padding: 18,
    gap: 12,
  },

  // ── Header Row ────────────────────────────────────────
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  nameBlock: {
    flex: 1,
    gap: 3,
  },
  expeditionName: {
    fontSize: 17,
    fontWeight: '800',
    color: ECS.text,
    letterSpacing: 1.5,
  },
  expeditionRegion: {
    fontSize: 12,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },

  // ── Match Score Badge ─────────────────────────────────
  matchBadge: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1.5,
    gap: 1,
    minWidth: 56,
  },
  matchBadgeLabel: {
    fontSize: 6,
    fontWeight: '900',
    letterSpacing: 2,
  },
  matchScoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 1,
  },
  matchScoreText: {
    fontSize: 24,
    fontWeight: '900',
    fontFamily: 'Courier',
    letterSpacing: -0.5,
  },
  matchPercentText: {
    fontSize: 12,
    fontWeight: '700',
  },
  matchQualityLabel: {
    fontSize: 6,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginTop: 1,
  },

  // ── Compat Badge (fallback) ───────────────────────────
  compatBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1.5,
    gap: 1,
  },
  compatScoreText: {
    fontSize: 24,
    fontWeight: '900',
    fontFamily: 'Courier',
    letterSpacing: -0.5,
  },
  compatPercentText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Prominent Row (Distance + Difficulty) ─────────────
  prominentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 2,
  },
  prominentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  distanceIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: TACTICAL.amber + '14',
    borderWidth: 1,
    borderColor: TACTICAL.amber + '25',
    alignItems: 'center',
    justifyContent: 'center',
  },
  prominentLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    letterSpacing: 0.3,
  },
  prominentValue: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: 'Courier',
    color: TACTICAL.amber,
    letterSpacing: 0.5,
  },
  diffBadgeLg: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  diffTextLg: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.5,
  },

  // ── Terrain Line ──────────────────────────────────────
  terrainLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  terrainDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  terrainText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  terrainDivider: {
    width: 1,
    height: 10,
    backgroundColor: 'rgba(139,148,158,0.2)',
    marginHorizontal: 2,
  },
  terrainMeta: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
    fontFamily: 'Courier',
  },

  // ── Gold Separator ────────────────────────────────────
  goldSep: {
    height: GOLD_RAIL.subsectionWidth,
    backgroundColor: 'rgba(212,160,23,0.18)',
  },

  // ── Stats Row ─────────────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  statBlock: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    backgroundColor: ECS.bgElev,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ECS.stroke,
  },
  statLabel: {
    fontSize: 6,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '800',
    fontFamily: 'Courier',
    color: ECS.text,
  },
  statUnit: {
    fontSize: 7,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  statValueMuted: {
    fontSize: 14,
    fontWeight: '700',
    color: TACTICAL.textMuted,
  },

  // ── Difficulty Badge ──────────────────────────────────
  diffBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  diffText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.5,
  },

  // ── Match Score Line ──────────────────────────────────
  matchLine: {
    gap: 5,
  },
  matchBarBg: {
    height: 4,
    backgroundColor: 'rgba(30,35,43,0.8)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  matchBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  matchBarLabel: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 2.5,
  },

  // ── Compat Line ───────────────────────────────────────
  compatLine: {
    gap: 5,
  },
  compatBarBg: {
    height: 3,
    backgroundColor: 'rgba(30,35,43,0.8)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  compatBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  compatLabel: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 2.5,
  },

  // ── Chip Row ──────────────────────────────────────────
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // ── View Analysis Button ──────────────────────────────
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: TACTICAL.amber,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginTop: 2,
  },
  viewBtnText: {
    fontSize: 11,
    fontWeight: '900',
    color: ECS.bgPrimary,
    letterSpacing: 3,
  },
});



