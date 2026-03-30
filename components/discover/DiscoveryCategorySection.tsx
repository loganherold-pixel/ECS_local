// ============================================================
// DISCOVERY CATEGORY SECTION — Curated Route Category Panel
// ============================================================
// Phase 8: Reusable section component for displaying categorized
// routes (Quiet Exploration or Expedition Routes) with category
// header, stats summary, route cards, and empty state.
//
// Phase 9: Extended to support Weekend Adventures category.
// Phase 11: Added categoryHint prop for contextual explanation boosting.
// Phase 12: Added Expedition Fit stat chip.
// Phase 13: Added completedIds prop for exploration progress tracking.
//           Passes isCompleted to each OpportunityCard for visual
//           differentiation of completed vs undiscovered routes.
//
// Uses existing OpportunityCard for route display to maintain
// visual consistency with the ECS design language.
// ============================================================

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, GOLD_RAIL, ECS } from '../../lib/theme';
import OpportunityCard from './OpportunityCard';
import type { CompatibilityResult } from '../../lib/rigCompatibilityEngine';
import {
  computeCategoryStats,
  getCategoryScoreColor,
  formatTripDuration,
  getTripDurationColor,
  type CategorizedRoute,
} from '../../lib/discoverCategoryEngine';
import {
  calculateExpeditionFit,
  getExpeditionFitColor,
  getExpeditionFitLabel,
} from '../../lib/expeditionFitEngine';

// ── Props ────────────────────────────────────────────────────
interface DiscoveryCategorySectionProps {
  title: string;
  subtitle: string;
  icon: string;
  accentColor: string;
  emptyTitle: string;
  emptyDesc: string;
  footerText: string;
  routes: CategorizedRoute[];
  compatResults: Map<string, CompatibilityResult>;
  hasVehicle: boolean;
  onSelectRoute: (route: CategorizedRoute) => void;
  /** Optional category hint for contextual explanation boosting */
  categoryHint?: 'weekend' | 'quiet' | 'expedition' | null;
  /** Phase 13: Set of completed route IDs for exploration progress */
  completedIds?: Set<string>;
}




// ── Quick Stat Chip ──────────────────────────────────────────
function StatChip({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: string;
  color: string;
}) {
  return (
    <View style={s.statChip}>
      <Ionicons name={icon as any} size={11} color={color} />
      <Text style={[s.statChipValue, { color }]}>{value}</Text>
      <Text style={s.statChipLabel}>{label}</Text>
    </View>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function DiscoveryCategorySection({
  title,
  subtitle,
  icon,
  accentColor,
  emptyTitle,
  emptyDesc,
  footerText,
  routes,
  compatResults,
  hasVehicle,
  onSelectRoute,
  categoryHint,
  completedIds,
}: DiscoveryCategorySectionProps) {


  // Compute category stats
  const stats = useMemo(
    () => computeCategoryStats(routes, compatResults),
    [routes, compatResults],
  );

  // Average category score
  const avgCategoryScore = useMemo(() => {
    if (routes.length === 0) return null;
    const sum = routes.reduce((acc, r) => acc + r.categoryScore, 0);
    return Math.round(sum / routes.length);
  }, [routes]);

  const avgScoreColor = avgCategoryScore != null
    ? getCategoryScoreColor(avgCategoryScore)
    : TACTICAL.textMuted;

  // Trip duration display
  const durationLabel = formatTripDuration(stats.avgEstimatedDays);
  const durationColor = getTripDurationColor(stats.avgEstimatedDays);

  return (
    <View style={s.panel}>
      {/* Panel Header */}
      <View style={s.panelHeader}>
        <View style={s.panelHeaderLeft}>
          <View style={[s.panelIconWrap, { borderColor: accentColor + '40', backgroundColor: accentColor + '14' }]}>
            <Ionicons name={icon as any} size={16} color={accentColor} />
          </View>
          <View style={s.panelHeaderText}>
            <Text style={[s.panelTitle, { color: accentColor }]}>{title}</Text>
            <Text style={s.panelSubtitle} numberOfLines={2}>{subtitle}</Text>
          </View>
        </View>
        {/* Route count badge */}
        <View style={[s.countBadge, { borderColor: accentColor + '30', backgroundColor: accentColor + '0A' }]}>
          <Text style={[s.countBadgeText, { color: accentColor }]}>
            {routes.length} ROUTE{routes.length !== 1 ? 'S' : ''}
          </Text>
        </View>
      </View>

      {/* Gold divider */}
      <View style={s.goldDivider} />

      {/* Stats Summary Row */}
      {routes.length > 0 && (
        <View style={s.statsRow}>
          <StatChip
            label="AVG REMOTE"
            value={`${stats.avgRemoteness}`}
            icon="radio-outline"
            color="#E67E22"
          />
          <View style={s.statDivider} />
          <StatChip
            label="AVG TRAIL"
            value={`${stats.avgDistance} MI`}
            icon="resize-outline"
            color={TACTICAL.amber}
          />
          <View style={s.statDivider} />
          <StatChip
            label="TOTAL CAMPS"
            value={`${stats.totalCamps}`}
            icon="bonfire-outline"
            color="#66BB6A"
          />
          <View style={s.statDivider} />
          <StatChip
            label="AVG DURATION"
            value={durationLabel}
            icon="time-outline"
            color={durationColor}
          />
          {stats.avgVehicleMatch != null && (
            <>
              <View style={s.statDivider} />
              <StatChip
                label="RIG MATCH"
                value={`${stats.avgVehicleMatch}%`}
                icon="car-outline"
                color="#5AC8FA"
              />
            </>
          )}
        </View>
      )}

      {/* Category Score Summary */}
      {routes.length > 0 && avgCategoryScore != null && (
        <View style={s.scoreSummary}>
          <View style={[s.scoreBar, { backgroundColor: avgScoreColor + '18' }]}>
            <View
              style={[
                s.scoreBarFill,
                {
                  backgroundColor: avgScoreColor + '40',
                  width: `${avgCategoryScore}%`,
                },
              ]}
            />
          </View>
          <Text style={[s.scoreText, { color: avgScoreColor }]}>
            AVG SCORE {avgCategoryScore}%
          </Text>
        </View>
      )}

      {/* Gold sub-divider */}
      {routes.length > 0 && <View style={s.goldDividerSub} />}

      {/* Route Cards (Phase 11+13: categoryHint + completedIds) */}
      <View style={s.routeCards}>
        {routes.map((route) => (
          <OpportunityCard
            key={route.id}
            opportunity={route}
            compatResult={compatResults.get(route.id) ?? null}
            hasVehicle={hasVehicle}
            onSelect={() => onSelectRoute(route)}
            categoryHint={categoryHint}
            isCompleted={completedIds?.has(route.id) ?? false}
          />
        ))}




        {/* Empty State */}
        {routes.length === 0 && (
          <View style={s.emptyState}>
            <Ionicons name={icon as any} size={28} color={TACTICAL.textMuted} />
            <Text style={s.emptyTitle}>{emptyTitle}</Text>
            <Text style={s.emptyDesc}>{emptyDesc}</Text>
          </View>
        )}
      </View>

      {/* Footer */}
      {routes.length > 0 && (
        <View style={s.panelFooter}>
          <Ionicons name="information-circle-outline" size={10} color={TACTICAL.textMuted} />
          <Text style={s.panelFooterText}>{footerText}</Text>
        </View>
      )}
    </View>
  );
}

// ============================================================
// STYLES
// ============================================================
const s = StyleSheet.create({
  panel: {
    backgroundColor: ECS.bgPanel,
    borderRadius: ECS.radius,
    borderWidth: 1,
    borderColor: ECS.stroke,
    marginBottom: 16,
    overflow: 'hidden',
  },

  // ── Header ────────────────────────────────────────────
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
  },
  panelHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  panelIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelHeaderText: {
    flex: 1,
  },
  panelTitle: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 2.5,
  },
  panelSubtitle: {
    fontSize: 10,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    letterSpacing: 0.3,
    marginTop: 2,
    lineHeight: 14,
  },

  // ── Count Badge ───────────────────────────────────────
  countBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
  },
  countBadgeText: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 1.5,
  },

  // ── Gold Dividers ─────────────────────────────────────
  goldDivider: {
    height: GOLD_RAIL.subsectionWidth,
    backgroundColor: GOLD_RAIL.subsection,
    marginHorizontal: 14,
  },
  goldDividerSub: {
    height: GOLD_RAIL.subsectionWidth,
    backgroundColor: GOLD_RAIL.internal,
    marginHorizontal: 14,
  },

  // ── Stats Row ─────────────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 10,
    paddingVertical: 12,
    flexWrap: 'wrap',
  },
  statChip: {
    alignItems: 'center',
    flex: 1,
    gap: 2,
    minWidth: 50,
  },
  statChipValue: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: 'Courier',
  },
  statChipLabel: {
    fontSize: 6,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  statDivider: {
    width: 1,
    height: 26,
    backgroundColor: GOLD_RAIL.internal,
  },

  // ── Score Summary ─────────────────────────────────────
  scoreSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  scoreBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  scoreBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  scoreText: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 1.5,
  },

  // ── Route Cards ───────────────────────────────────────
  routeCards: {
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 4,
  },

  // ── Empty State ───────────────────────────────────────
  emptyState: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    backgroundColor: ECS.bgElev,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ECS.stroke,
    marginBottom: 10,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 3,
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: 10,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 10,
  },

  // ── Footer ────────────────────────────────────────────
  panelFooter: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: GOLD_RAIL.subsectionWidth,
    borderTopColor: GOLD_RAIL.internal,
    marginTop: 4,
  },
  panelFooterText: {
    fontSize: 9,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    lineHeight: 14,
    flex: 1,
  },
});



