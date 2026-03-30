// ============================================================
// REGION SECTION — Grouped Expedition Region Display
// ============================================================
// Renders a region header with ECS tactical styling and up to
// 3 expedition opportunity cards within the region group.
//
// Visual hierarchy:
//   - Gold-tinted region header with icon + name
//   - Distance summary badge
//   - Trail count indicator
//   - Up to 3 OpportunityCards
//
// Designed for curated browsing — not a flat database dump.
// Phase 13: Added completedIds prop for exploration progress tracking.
// ============================================================

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, GOLD_RAIL, ECS } from '../../lib/theme';
import OpportunityCard from './OpportunityCard';
import {
  type RegionGroupResult,
  type ExpeditionOpportunity,
} from '../../lib/discoverEngine';
import { type CompatibilityResult } from '../../lib/rigCompatibilityEngine';

interface RegionSectionProps {
  regionGroup: RegionGroupResult;
  compatResults: Map<string, CompatibilityResult>;
  hasVehicle: boolean;
  onSelectOpportunity: (op: ExpeditionOpportunity) => void;
  /** Phase 13: Set of completed route IDs for exploration progress */
  completedIds?: Set<string>;
}

export default function RegionSection({
  regionGroup,
  compatResults,
  hasVehicle,
  onSelectOpportunity,
  completedIds,
}: RegionSectionProps) {

  const { name, icon, color, opportunities, minDistanceFromUser, trailCount } = regionGroup;

  const showMoreIndicator = trailCount > opportunities.length;

  return (
    <View style={s.container}>
      {/* ── Region Header ──────────────────────────────────── */}
      <View style={s.header}>
        {/* Gold divider line */}
        <View style={[s.goldDivider, { backgroundColor: color }]} />

        <View style={s.headerContent}>
          {/* Left: Icon + Region Name */}
          <View style={s.headerLeft}>
            <View style={[s.iconWrap, { borderColor: color + '40', backgroundColor: color + '0C' }]}>
              <Ionicons name={icon as any} size={13} color={color} />
            </View>
            <View style={s.headerTextBlock}>
              <Text style={[s.regionName, { color }]}>{name.toUpperCase()}</Text>
              <Text style={s.trailCountText}>
                {trailCount} TRAIL{trailCount !== 1 ? 'S' : ''}
              </Text>
            </View>
          </View>

          {/* Right: Distance badge */}
          <View style={s.headerRight}>
            {minDistanceFromUser !== Infinity && (
              <View style={s.distanceBadge}>
                <Ionicons name="navigate-outline" size={9} color={TACTICAL.textMuted} />
                <Text style={s.distanceText}>
                  {minDistanceFromUser < 100 ? `${minDistanceFromUser}` : `${minDistanceFromUser}`}
                </Text>
                <Text style={s.distanceUnit}>MI</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* ── Opportunity Cards ──────────────────────────────── */}
      {opportunities.map(op => (
        <OpportunityCard
          key={op.id}
          opportunity={op}
          compatResult={compatResults.get(op.id) || null}
          hasVehicle={hasVehicle}
          onSelect={() => onSelectOpportunity(op)}
          isCompleted={completedIds?.has(op.id) ?? false}
        />
      ))}


      {/* ── More trails indicator ──────────────────────────── */}
      {showMoreIndicator && (
        <View style={s.moreIndicator}>
          <View style={s.moreDot} />
          <Text style={s.moreText}>
            +{trailCount - opportunities.length} MORE IN {name.toUpperCase()}
          </Text>
          <View style={s.moreDot} />
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
    marginBottom: 8,
  },

  // ── Header ────────────────────────────────────────────
  header: {
    marginBottom: 10,
  },
  goldDivider: {
    height: 1,
    opacity: 0.35,
    marginBottom: 10,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextBlock: {
    gap: 2,
  },
  regionName: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2.5,
  },
  trailCountText: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  distanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
  },
  distanceText: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'Courier',
    color: TACTICAL.amber,
    letterSpacing: -0.5,
  },
  distanceUnit: {
    fontSize: 7,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },

  // ── More Indicator ────────────────────────────────────
  moreIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 6,
    marginBottom: 4,
  },
  moreDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: TACTICAL.textMuted,
    opacity: 0.3,
  },
  moreText: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
    opacity: 0.6,
  },
});



