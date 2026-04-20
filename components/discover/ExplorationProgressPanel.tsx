// ============================================================
// EXPLORATION PROGRESS PANEL — Discovery Route Tracking Display
// ============================================================
// Phase 13: Displays exploration progress within the Discover tab.
//
// SECTIONS:
//   - Progress header with completion percentage
//   - Stats row: routes completed, miles explored, regions
//   - Visual progress bar
//   - Recent completion indicator
//   - Continue Exploring recommendations (nearby unexplored routes)
//
// DESIGN:
//   - ECS dark-mode tactical styling
//   - Muted styling to avoid competing with route cards
//   - Readable on phones and tablets
//   - Gold accent for progress indicators
//
// PERFORMANCE:
//   - Memoized stats computation
//   - Only re-renders when completions change
//   - No expensive calculations in render path
// ============================================================

import React, { useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, GOLD_RAIL, ECS } from '../../lib/theme';
import { hapticMicro } from '../../lib/haptics';
import {
  type ExplorationStats,
  type ContinueExploringRecommendation,
  type RouteCompletion,
  getProgressColor,
  getProgressLabel,
  formatExplorationMiles,
  formatCompletionDate,
} from '../../lib/explorationProgressStore';
import type { ExpeditionOpportunity } from '../../lib/discoverEngine';

// ── Props ────────────────────────────────────────────────────

interface ExplorationProgressPanelProps {
  stats: ExplorationStats;
  recommendations: ContinueExploringRecommendation[];
  onSelectRoute: (opportunity: ExpeditionOpportunity) => void;
  totalAvailableRoutes: number;
}

// ── Stat Chip ────────────────────────────────────────────────

function ProgressStatChip({
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
      <Ionicons name={icon as any} size={14} color={color} />
      <Text style={[s.statValue, { color }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

// ── Recommendation Card ──────────────────────────────────────

function RecommendationCard({
  recommendation,
  onSelect,
}: {
  recommendation: ContinueExploringRecommendation;
  onSelect: () => void;
}) {
  const op = recommendation.opportunity;
  return (
    <TouchableOpacity
      style={s.recCard}
      activeOpacity={0.82}
      onPress={() => {
        hapticMicro();
        onSelect();
      }}
    >
      <View style={s.recLeft}>
        <View style={s.recIconWrap}>
          <Ionicons name="compass-outline" size={12} color={TACTICAL.amber} />
        </View>
        <View style={s.recTextBlock}>
          <Text style={s.recName} numberOfLines={1}>{op.name}</Text>
          <Text style={s.recReason} numberOfLines={1}>{recommendation.reason}</Text>
        </View>
      </View>
      <View style={s.recRight}>
        <Text style={s.recDistance}>
          {op.distanceMiles} MI
        </Text>
        <Ionicons name="chevron-forward" size={10} color={TACTICAL.textMuted} />
      </View>
    </TouchableOpacity>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function ExplorationProgressPanel({
  stats,
  recommendations,
  onSelectRoute,
  totalAvailableRoutes,
}: ExplorationProgressPanelProps) {
  const progressColor = useMemo(
    () => getProgressColor(stats.completionPercentage),
    [stats.completionPercentage],
  );

  const progressLabel = useMemo(
    () => getProgressLabel(stats.completionPercentage),
    [stats.completionPercentage],
  );

  const hasCompletions = stats.totalRoutesCompleted > 0;
  const hasRecommendations = recommendations.length > 0;

  return (
    <View style={s.panel}>
      {/* ── Panel Header ─────────────────────────────────────── */}
      <View style={s.panelHeader}>
        <View style={s.panelHeaderLeft}>
          <View style={[s.panelIconWrap, {
            borderColor: progressColor + '40',
            backgroundColor: progressColor + '14',
          }]}>
            <Ionicons name="map-outline" size={16} color={progressColor} />
          </View>
          <View style={s.panelHeaderText}>
            <Text style={[s.panelTitle, { color: progressColor }]}>
              EXPLORATION PROGRESS
            </Text>
            <Text style={s.panelSubtitle}>
              {hasCompletions
                ? `${progressLabel} · ${stats.completionPercentage}% of routes explored`
                : 'Track your completed Explore routes'
              }
            </Text>
          </View>
        </View>
        {/* Completion count badge */}
        <View style={[s.countBadge, {
          borderColor: progressColor + '30',
          backgroundColor: progressColor + '0A',
        }]}>
          <Text style={[s.countBadgeText, { color: progressColor }]}>
            {stats.totalRoutesCompleted}/{totalAvailableRoutes}
          </Text>
        </View>
      </View>

      {/* ── Gold Divider ─────────────────────────────────────── */}
      <View style={s.goldDivider} />

      {/* ── Progress Bar ─────────────────────────────────────── */}
      <View style={s.progressBarSection}>
        <View style={s.progressBarTrack}>
          <View
            style={[
              s.progressBarFill,
              {
                backgroundColor: progressColor + '60',
                width: `${Math.max(stats.completionPercentage, 2)}%`,
              },
            ]}
          />
          <View
            style={[
              s.progressBarGlow,
              {
                backgroundColor: progressColor,
                width: `${Math.max(stats.completionPercentage, 2)}%`,
              },
            ]}
          />
        </View>
        <Text style={[s.progressBarLabel, { color: progressColor }]}>
          {stats.completionPercentage}%
        </Text>
      </View>

      {/* ── Stats Row ────────────────────────────────────────── */}
      <View style={s.statsRow}>
        <ProgressStatChip
          label="ROUTES"
          value={`${stats.totalRoutesCompleted}`}
          icon="flag-outline"
          color={hasCompletions ? TACTICAL.amber : TACTICAL.textMuted}
        />
        <View style={s.statDivider} />
        <ProgressStatChip
          label="MILES"
          value={formatExplorationMiles(stats.totalMilesExplored)}
          icon="speedometer-outline"
          color={hasCompletions ? '#5AC8FA' : TACTICAL.textMuted}
        />
        <View style={s.statDivider} />
        <ProgressStatChip
          label="REGIONS"
          value={`${stats.regionsExplored}`}
          icon="globe-outline"
          color={hasCompletions ? '#66BB6A' : TACTICAL.textMuted}
        />
        <View style={s.statDivider} />
        <ProgressStatChip
          label="AVG MI"
          value={stats.avgDistancePerRoute > 0 ? `${stats.avgDistancePerRoute}` : '--'}
          icon="resize-outline"
          color={hasCompletions ? '#E67E22' : TACTICAL.textMuted}
        />
      </View>

      {/* ── Recent Completion ────────────────────────────────── */}
      {hasCompletions && stats.lastCompletedRouteName && (
        <>
          <View style={s.goldDividerSub} />
          <View style={s.recentSection}>
            <View style={s.recentRow}>
              <Ionicons name="checkmark-circle" size={12} color="#66BB6A" />
              <Text style={s.recentLabel}>LAST COMPLETED</Text>
            </View>
            <Text style={s.recentRoute} numberOfLines={1}>
              {stats.lastCompletedRouteName}
            </Text>
            {stats.lastCompletionDate && (
              <Text style={s.recentDate}>
                {formatCompletionDate(stats.lastCompletionDate)}
              </Text>
            )}
          </View>
        </>
      )}

      {/* ── Explored Regions List ────────────────────────────── */}
      {stats.regionNames.length > 0 && (
        <>
          <View style={s.goldDividerSub} />
          <View style={s.regionsSection}>
            <View style={s.regionsSectionHeader}>
              <Ionicons name="layers-outline" size={10} color={TACTICAL.textMuted} />
              <Text style={s.regionsSectionTitle}>EXPLORED REGIONS</Text>
            </View>
            <View style={s.regionChipsRow}>
              {stats.regionNames.map((name, idx) => (
                <View key={idx} style={s.regionChip}>
                  <Ionicons name="checkmark" size={8} color="#66BB6A" />
                  <Text style={s.regionChipText}>{name.toUpperCase()}</Text>
                </View>
              ))}
            </View>
          </View>
        </>
      )}

      {/* ── Continue Exploring ────────────────────────────────── */}
      {hasRecommendations && (
        <>
          <View style={s.goldDividerSub} />
          <View style={s.continueSection}>
            <View style={s.continueSectionHeader}>
              <Ionicons name="arrow-forward-circle-outline" size={11} color={TACTICAL.amber} />
              <Text style={s.continueSectionTitle}>CONTINUE EXPLORING</Text>
            </View>
            <Text style={s.continueSectionSubtitle}>
              Nearby routes you haven't explored yet
            </Text>
            {recommendations.map((rec) => (
              <RecommendationCard
                key={rec.opportunity.id}
                recommendation={rec}
                onSelect={() => onSelectRoute(rec.opportunity)}
              />
            ))}
          </View>
        </>
      )}

      {/* ── Empty State ──────────────────────────────────────── */}
      {!hasCompletions && (
        <>
          <View style={s.goldDividerSub} />
          <View style={s.emptyState}>
            <Ionicons name="trail-sign-outline" size={24} color={TACTICAL.textMuted} />
            <Text style={s.emptyTitle}>NO ROUTES EXPLORED YET</Text>
            <Text style={s.emptyDesc}>
              Drive Explore routes to track your exploration progress.
              ECS will record completed routes and visualize your journey.
            </Text>
          </View>
        </>
      )}

      {/* ── Footer ───────────────────────────────────────────── */}
      <View style={s.panelFooter}>
        <Ionicons name="information-circle-outline" size={10} color={TACTICAL.textMuted} />
        <Text style={s.panelFooterText}>
          {hasCompletions
            ? `${stats.totalRoutesCompleted} of ${totalAvailableRoutes} routes explored · ${stats.totalMilesExplored} total miles · ${stats.regionsExplored} region${stats.regionsExplored !== 1 ? 's' : ''} visited. Routes are marked complete when 60% of trail distance is traveled.`
            : 'Exploration progress tracks routes you complete through Explore. Data is stored locally and survives app restarts.'
          }
        </Text>
      </View>
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
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
    fontFamily: 'Courier',
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

  // ── Progress Bar ──────────────────────────────────────
  progressBarSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  progressBarTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(58, 66, 80, 0.4)',
    overflow: 'hidden',
    position: 'relative',
  },
  progressBarFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    borderRadius: 3,
  },
  progressBarGlow: {
    position: 'absolute',
    top: 2,
    left: 0,
    height: 2,
    borderRadius: 1,
    opacity: 0.6,
  },
  progressBarLabel: {
    fontSize: 10,
    fontWeight: '900',
    fontFamily: 'Courier',
    letterSpacing: 0.5,
    minWidth: 32,
    textAlign: 'right',
  },

  // ── Stats Row ─────────────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  statChip: {
    alignItems: 'center',
    flex: 1,
    gap: 3,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '900',
    fontFamily: 'Courier',
  },
  statLabel: {
    fontSize: 6,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: GOLD_RAIL.internal,
  },

  // ── Recent Completion ─────────────────────────────────
  recentSection: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 3,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  recentLabel: {
    fontSize: 7,
    fontWeight: '800',
    color: '#66BB6A',
    letterSpacing: 2,
  },
  recentRoute: {
    fontSize: 12,
    fontWeight: '700',
    color: ECS.text,
    letterSpacing: 0.5,
  },
  recentDate: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },

  // ── Explored Regions ──────────────────────────────────
  regionsSection: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  regionsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  regionsSectionTitle: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  regionChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  regionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#66BB6A25',
    backgroundColor: '#66BB6A08',
  },
  regionChipText: {
    fontSize: 7,
    fontWeight: '700',
    color: '#66BB6A',
    letterSpacing: 1,
  },

  // ── Continue Exploring ────────────────────────────────
  continueSection: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 6,
  },
  continueSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  continueSectionTitle: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },
  continueSectionSubtitle: {
    fontSize: 9,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    letterSpacing: 0.3,
    marginBottom: 4,
  },

  // ── Recommendation Card ───────────────────────────────
  recCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
    marginBottom: 4,
  },
  recLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  recIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '30',
    backgroundColor: TACTICAL.amber + '0A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recTextBlock: {
    flex: 1,
    gap: 1,
  },
  recName: {
    fontSize: 11,
    fontWeight: '700',
    color: ECS.text,
    letterSpacing: 0.3,
  },
  recReason: {
    fontSize: 9,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    letterSpacing: 0.2,
  },
  recRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 8,
  },
  recDistance: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: 'Courier',
    color: TACTICAL.amber,
    letterSpacing: -0.5,
  },

  // ── Empty State ───────────────────────────────────────
  emptyState: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 20,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 10,
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



