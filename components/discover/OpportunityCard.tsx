// ============================================================
// OPPORTUNITY CARD — Expedition Opportunity Display
// ============================================================
// Tactical card showing expedition name, region, distance,
// rig compatibility %, difficulty, suggested camps, distance
// from user, Match Score badge, upgrade hint, Camping
// Potential indicator, Expedition Fit score, contextual
// recommendation explanations, exploration completion status,
// and Local Knowledge highlights.
// Tap to select → parent opens Expedition Analysis.
//
// Phase 4.5: Added Match Score indicator badge.
// Phase 10: Added Camping Potential chip with score indicator.
// Phase 11: Added Route Recommendation Explanations.
// Phase 12: Added Expedition Fit Indicator.
// Phase 13: Added Exploration Completion Indicator.
// Phase 14: Added Local Knowledge Highlights — displays
//           contextual environmental features (scenic overlooks,
//           water crossings, historic sites, dark sky areas, etc.)
//           as compact chips between the chip row and explanation.
// ============================================================


import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, GOLD_RAIL, ECS, TYPO } from '../../lib/theme';
import { hapticMicro } from '../../lib/haptics';
import {
  getTerrainColor,
  getRemotenessLabel,
  getRemotenessColor,
  getMatchScoreColor,
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
  getUpgradeHintLabel,
  getUpgradeHintColor,
} from '../../lib/rigUpgradeEngine';
import {
  getCampingPotentialLabel,
  getCampingPotentialColor,
} from '../../lib/campingIntelligenceEngine';
import {
  generateRouteExplanation,
  getExplanationTextColor,
  getExplanationIconColor,
  MAX_DISPLAY_REASONS,
} from '../../lib/routeRecommendationEngine';
import {
  calculateExpeditionFit,
  getExpeditionFitColor,
  getExpeditionFitLabel,
  type ExpeditionFitResult,
} from '../../lib/expeditionFitEngine';
import {
  detectLocalHighlights,
  getHighlightShortLabel,
  type LocalHighlight,
} from '../../lib/localKnowledgeEngine';

interface OpportunityCardProps {
  opportunity: ExpeditionOpportunity;
  compatResult: CompatibilityResult | null;
  hasVehicle: boolean;
  onSelect: () => void;
  /** Optional category hint for contextual explanation boosting */
  categoryHint?: 'weekend' | 'quiet' | 'expedition' | null;
  /** Phase 13: Whether this route has been completed */
  isCompleted?: boolean;
}

export default function OpportunityCard({
  opportunity,
  compatResult,
  hasVehicle,
  onSelect,
  categoryHint,
  isCompleted = false,
}: OpportunityCardProps) {
  const terrainColor = getTerrainColor(opportunity.terrainType);
  const remotenessColor = getRemotenessColor(opportunity.remotenessScore);
  const remotenessLabel = getRemotenessLabel(opportunity.remotenessScore);

  const compatScore = opportunity.rigCompatibility ?? null;
  const diffRating = (opportunity.difficultyRating as DifficultyRating) ?? null;
  const compatColor = compatScore != null ? getCompatibilityColor(compatScore) : TACTICAL.textMuted;
  const diffColor = diffRating ? getDifficultyColor(diffRating) : TACTICAL.textMuted;

  const userDistance = opportunity.distanceFromUserMiles;
  const matchScore = opportunity.matchScore ?? null;
  const matchColor = matchScore != null ? getMatchScoreColor(matchScore) : TACTICAL.textMuted;

  // Camping potential
  const campingScore = opportunity.campingPotentialScore ?? null;
  const campingColor = campingScore != null ? getCampingPotentialColor(campingScore) : '#66BB6A';
  const campingLabel = campingScore != null ? getCampingPotentialLabel(campingScore) : null;

  // Upgrade hint
  const showUpgradeHint = hasVehicle && hasUpgradeSuggestions(compatScore ?? undefined);
  const upgradeHintLabel = showUpgradeHint ? getUpgradeHintLabel(compatScore ?? undefined) : null;
  const upgradeHintColor = showUpgradeHint && compatScore != null ? getUpgradeHintColor(compatScore) : '#5AC8FA';

  // ── Phase 12: Expedition Fit Score ─────────────────────────
  const expeditionFit: ExpeditionFitResult = useMemo(() => {
    if (opportunity.expeditionFitScore != null) {
      const score = opportunity.expeditionFitScore;
      return {
        score,
        label: getExpeditionFitLabel(score),
        color: getExpeditionFitColor(score),
        factors: {
          vehicleCapability: 0,
          routeDifficulty: 0,
          loadoutWeight: 0,
          remoteness: 0,
          campingPotential: 0,
          routeDuration: 0,
        },
        hasVehicleData: hasVehicle,
        hasCompleteRouteData: true,
        simplifiedLabel: '',
        offlineAvailable: true,
      };
    }
    return calculateExpeditionFit(opportunity, compatResult, {
      hasVehicle,
    });
  }, [opportunity, compatResult, hasVehicle]);

  const fitColor = expeditionFit.color;
  const fitScore = expeditionFit.score;
  const fitLabel = expeditionFit.label;

  // ── Phase 11: Route Recommendation Explanation ─────────────
  const explanation = useMemo(() => {
    return generateRouteExplanation(opportunity, compatResult, {
      hasVehicle,
      maxReasons: MAX_DISPLAY_REASONS,
      categoryHint: categoryHint ?? null,
    });
  }, [opportunity, compatResult, hasVehicle, categoryHint]);

  const explanationTextColor = getExplanationTextColor();
  const explanationIconColor = getExplanationIconColor();
  // ── Phase 14: Local Knowledge Highlights ────────────────────

  const localHighlights: LocalHighlight[] = useMemo(() => {
    // Use pre-computed highlights from opportunity if available
    if (opportunity.localHighlights && opportunity.localHighlights.length > 0) {
      return opportunity.localHighlights;
    }
    // Otherwise, detect on-the-fly (memoized per opportunity)
    const result = detectLocalHighlights(opportunity);
    return result.cardHighlights;
  }, [opportunity.id, opportunity.highlights, opportunity.regionGroup]);

  // ── Phase 13: Completed card styling ───────────────────────
  const completedAccentColor = '#66BB6A';

  return (
    <TouchableOpacity
      style={[
        s.card,
        isCompleted && s.cardCompleted,
      ]}
      activeOpacity={0.82}
      onPress={() => {
        hapticMicro();
        onSelect();
      }}
    >
      {/* Left accent bar */}
      <View style={[s.accentBar, {
        backgroundColor: isCompleted
          ? completedAccentColor
          : fitScore > 0 ? fitColor : matchScore != null ? matchColor : compatScore != null ? compatColor : terrainColor,
      }]} />

      <View style={s.cardBody}>
        {/* Top Row: Name + Expedition Fit Badge */}
        <View style={s.topRow}>
          <View style={s.nameBlock}>
            <View style={s.nameRow}>
              {/* Phase 13: Completion checkmark */}
              {isCompleted && (
                <View style={s.completedBadge}>
                  <Ionicons name="checkmark-circle" size={14} color={completedAccentColor} />
                </View>
              )}
              <Text style={[s.cardName, isCompleted && { color: completedAccentColor }]} numberOfLines={1}>
                {opportunity.name}
              </Text>
            </View>
            <View style={s.regionRow}>
              <Text style={s.cardRegion}>{opportunity.region}</Text>
              {isCompleted && (
                <View style={s.exploredTag}>
                  <Text style={s.exploredTagText}>EXPLORED</Text>
                </View>
              )}
            </View>
          </View>

          {/* Phase 12: Expedition Fit Badge (primary) */}
          <View style={[s.fitBadge, { borderColor: fitColor + '45', backgroundColor: fitColor + '12' }]}>
            <Text style={[s.fitBadgeLabel, { color: fitColor }]}>FIT</Text>
            <View style={s.fitScoreRow}>
              <Text style={[s.fitScoreValue, { color: fitColor }]}>{fitScore}</Text>
              <Text style={[s.fitScorePercent, { color: fitColor }]}>%</Text>
            </View>
            <Text style={[s.fitScoreTag, { color: fitColor }]}>{fitLabel}</Text>
          </View>
        </View>

        {/* Distance + Difficulty prominent row */}
        <View style={s.prominentRow}>
          {userDistance != null && (
            <View style={s.prominentItem}>
              <Ionicons name="navigate-outline" size={11} color={TACTICAL.amber} />
              <Text style={s.prominentValue}>{userDistance}</Text>
              <Text style={s.prominentUnit}>MI AWAY</Text>
            </View>
          )}

          {diffRating && (
            <View style={[s.diffBadge, { borderColor: diffColor + '35', backgroundColor: diffColor + '0C' }]}>
              <Ionicons name="speedometer-outline" size={9} color={diffColor} />
              <Text style={[s.diffText, { color: diffColor }]}>{diffRating}</Text>
            </View>
          )}

          <View style={s.prominentItem}>
            <Ionicons name="resize-outline" size={10} color={TACTICAL.textMuted} />
            <Text style={s.prominentValue}>{opportunity.distanceMiles}</Text>
            <Text style={s.prominentUnit}>MI TRAIL</Text>
          </View>

          {matchScore != null && (
            <View style={s.prominentItem}>
              <Ionicons name="analytics-outline" size={10} color={matchColor} />
              <Text style={[s.prominentValue, { color: matchColor }]}>{matchScore}</Text>
              <Text style={s.prominentUnit}>MATCH</Text>
            </View>
          )}
        </View>

        {/* Stats Row */}
        <View style={s.statsRow}>
          <View style={s.statItem}>
            <Ionicons name="bonfire-outline" size={10} color={TACTICAL.textMuted} />
            <Text style={s.statValue}>{opportunity.suggestedCamps}</Text>
            <Text style={s.statUnit}>CAMPS</Text>
          </View>
          <View style={s.statDot} />
          <View style={s.statItem}>
            <Ionicons name="calendar-outline" size={10} color={TACTICAL.textMuted} />
            <Text style={s.statValue}>{opportunity.estimatedDays}</Text>
            <Text style={s.statUnit}>DAYS</Text>
          </View>
          <View style={s.statDot} />
          <View style={s.statItem}>
            <Ionicons name="flame-outline" size={10} color={TACTICAL.textMuted} />
            <Text style={s.statValue}>{opportunity.estimatedFuelRequired}</Text>
            <Text style={s.statUnit}>GAL</Text>
          </View>
          <View style={s.statDot} />
          <View style={s.statItem}>
            <Ionicons name="trending-up-outline" size={10} color={TACTICAL.textMuted} />
            <Text style={s.statValue}>{(opportunity.elevationGainFt / 1000).toFixed(1)}k</Text>
            <Text style={s.statUnit}>FT</Text>
          </View>
        </View>

        {/* Bottom Row: Chips */}
        <View style={s.chipRow}>
          <View style={[s.chip, { borderColor: terrainColor + '40', backgroundColor: terrainColor + '0C' }]}>
            <Ionicons name="trail-sign-outline" size={8} color={terrainColor} />
            <Text style={[s.chipText, { color: terrainColor }]}>{opportunity.terrainType.toUpperCase()}</Text>
          </View>

          <View style={[s.chip, { borderColor: remotenessColor + '40', backgroundColor: remotenessColor + '0C' }]}>
            <Ionicons name="radio-outline" size={8} color={remotenessColor} />
            <Text style={[s.chipText, { color: remotenessColor }]}>{remotenessLabel}</Text>
          </View>

          {campingScore != null && (
            <View style={[s.chip, { borderColor: campingColor + '40', backgroundColor: campingColor + '0C' }]}>
              <Ionicons name="bonfire-outline" size={8} color={campingColor} />
              <Text style={[s.chipText, { color: campingColor }]}>CAMP {campingScore}%</Text>
            </View>
          )}

          {showUpgradeHint && upgradeHintLabel && (
            <View style={[s.chip, { borderColor: upgradeHintColor + '30', backgroundColor: upgradeHintColor + '08' }]}>
              <Ionicons name="build-outline" size={8} color={upgradeHintColor} />
              <Text style={[s.chipText, { color: upgradeHintColor }]}>{upgradeHintLabel}</Text>
            </View>
          )}

          <View style={{ flex: 1 }} />
          <Ionicons name="chevron-forward" size={12} color={TACTICAL.textMuted} />
        </View>

        {/* ── Phase 14: Local Knowledge Highlights ────────────── */}
        {localHighlights.length > 0 && (
          <View style={s.highlightSection}>
            <View style={s.highlightDivider} />
            <View style={s.highlightHeader}>
              <Ionicons name="compass-outline" size={9} color={ECS.accent} />
              <Text style={s.highlightLabel}>LOCAL KNOWLEDGE</Text>
            </View>
            <View style={s.highlightChipRow}>
              {localHighlights.map((h) => (
                <View
                  key={h.id}
                  style={[s.highlightChip, { borderColor: h.color + '35', backgroundColor: h.color + '0A' }]}
                >
                  <Ionicons name={h.icon as any} size={9} color={h.color} />
                  <Text style={[s.highlightChipText, { color: h.color }]}>
                    {getHighlightShortLabel(h.type)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Phase 11: Recommendation Explanation ────────────── */}
        {explanation.reasons.length > 0 && (
          <View style={s.explanationSection}>
            <View style={s.explanationDivider} />
            <View style={s.explanationHeader}>
              <Ionicons name="bulb-outline" size={9} color={explanationIconColor} />
              <Text style={[s.explanationLabel, { color: explanationIconColor }]}>
                WHY THIS ROUTE
              </Text>
            </View>
            {explanation.reasons.map((reason, idx) => (
              <View key={idx} style={s.explanationRow}>
                <View style={[s.explanationBullet, { backgroundColor: explanationIconColor }]} />
                <Text
                  style={[s.explanationText, { color: explanationTextColor }]}
                  numberOfLines={2}
                >
                  {reason}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ============================================================
// STYLES
// ============================================================
const s = StyleSheet.create({
  card: { flexDirection: 'row', backgroundColor: ECS.bgPanel, borderRadius: ECS.radius, borderWidth: 1, borderColor: ECS.stroke, marginBottom: 10, overflow: 'hidden' },
  cardCompleted: { borderColor: '#66BB6A25', backgroundColor: '#66BB6A06' },
  accentBar: { width: 4 },
  cardBody: { flex: 1, padding: 14, gap: 10 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  nameBlock: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  regionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  cardName: { ...TYPO.T3, color: ECS.text, flex: 1 },
  cardRegion: { fontSize: 11, fontWeight: '500', color: TACTICAL.textMuted, letterSpacing: 0.5 },
  completedBadge: { marginRight: -2 },
  exploredTag: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3, borderWidth: 1, borderColor: '#66BB6A30', backgroundColor: '#66BB6A0C' },
  exploredTagText: { fontSize: 6, fontWeight: '900', color: '#66BB6A', letterSpacing: 1.5 },
  fitBadge: { alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, gap: 0, minWidth: 52 },
  fitBadgeLabel: { fontSize: 5, fontWeight: '900', letterSpacing: 1.5 },
  fitScoreRow: { flexDirection: 'row', alignItems: 'baseline', gap: 1 },
  fitScoreValue: { fontSize: 18, fontWeight: '900', fontFamily: 'Courier', letterSpacing: -0.5 },
  fitScorePercent: { fontSize: 10, fontWeight: '700', letterSpacing: 0 },
  fitScoreTag: { fontSize: 5, fontWeight: '800', letterSpacing: 1, marginTop: 1 },
  prominentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4, paddingHorizontal: 2, borderTopWidth: GOLD_RAIL.subsectionWidth, borderTopColor: GOLD_RAIL.internal },
  prominentItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  prominentValue: { fontSize: 13, fontWeight: '800', fontFamily: 'Courier', color: TACTICAL.amber, letterSpacing: -0.5 },
  prominentUnit: { fontSize: 7, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1 },
  diffBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5, borderWidth: 1 },
  diffText: { fontSize: 7, fontWeight: '900', letterSpacing: 1.5 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statValue: { fontSize: 12, fontWeight: '800', fontFamily: 'Courier', color: ECS.text },
  statUnit: { fontSize: 7, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1 },
  statDot: { width: 2, height: 2, borderRadius: 1, backgroundColor: TACTICAL.textMuted, opacity: 0.4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5, borderWidth: 1, borderColor: ECS.stroke, backgroundColor: ECS.bgElev },
  chipText: { fontSize: 7, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 0.5 },
  highlightSection: { marginTop: 2, gap: 5 },
  highlightDivider: { height: GOLD_RAIL.subsectionWidth, backgroundColor: GOLD_RAIL.internal, marginBottom: 2 },
  highlightHeader: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  highlightLabel: { fontSize: 6, fontWeight: '800', letterSpacing: 2, color: ECS.accent },
  highlightChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  highlightChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  highlightChipText: { fontSize: 8, fontWeight: '700', letterSpacing: 0.5 },
  explanationSection: { marginTop: 2, gap: 5 },
  explanationDivider: { height: GOLD_RAIL.subsectionWidth, backgroundColor: GOLD_RAIL.internal, marginBottom: 2 },
  explanationHeader: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  explanationLabel: { fontSize: 6, fontWeight: '800', letterSpacing: 2 },
  explanationRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingLeft: 2 },
  explanationBullet: { width: 3, height: 3, borderRadius: 1.5, marginTop: 4, opacity: 0.5 },
  explanationText: { fontSize: 10, fontWeight: '500', lineHeight: 14, flex: 1, letterSpacing: 0.2 },
});



