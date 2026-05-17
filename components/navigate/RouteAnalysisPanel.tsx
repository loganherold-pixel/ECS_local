/**
 * Route Analysis Panel — Predictive Expedition Intelligence (Phase 1)
 *
 * Debug/info panel displayed on the Navigate tab when route intelligence
 * is available. Shows:
 *   - Total distance
 *   - Estimated drive time
 *   - Elevation gain / loss
 *   - Highest / lowest elevation
 *   - Segment count
 *   - Overall difficulty
 *   - Per-segment breakdown (expandable)
 *   - Elevation profile mini-chart
 *
 * Positioned as a floating overlay on the map.
 * Collapsible to a compact badge.
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Animated,
} from 'react-native';
import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import { TACTICAL, TYPO, GOLD_RAIL, ECS } from '../../lib/theme';
import {
  type RouteIntelligence,
  type RouteAnalysisSegment,
  DIFFICULTY_META,
  routeAnalysisEngine,
} from '../../lib/routeAnalysisEngine';


interface RouteAnalysisPanelProps {
  intelligence: RouteIntelligence | null;
  visible: boolean;
  onClose?: () => void;
  /** When true, shows a loading indicator instead of empty state */
  loading?: boolean;
}

// ── Elevation Profile Mini-Chart ─────────────────────────────

function ElevationMiniChart({
  profile,
  width,
  height,
}: {
  profile: { distanceMi: number; elevationFt: number }[];
  width: number;
  height: number;
}) {
  if (profile.length < 2) return null;

  const maxDist = profile[profile.length - 1].distanceMi;
  const elevations = profile.map(p => p.elevationFt);
  const minEle = Math.min(...elevations);
  const maxEle = Math.max(...elevations);
  const eleRange = maxEle - minEle || 1;

  // Build SVG-like path using View elements
  const points = profile.map((p, i) => ({
    x: maxDist > 0 ? (p.distanceMi / maxDist) * width : 0,
    y: height - ((p.elevationFt - minEle) / eleRange) * (height - 4) - 2,
  }));

  return (
    <View style={[miniStyles.chartContainer, { width, height }]}>
      {/* Grid lines */}
      <View style={[miniStyles.gridLine, { top: 0 }]} />
      <View style={[miniStyles.gridLine, { top: height * 0.33 }]} />
      <View style={[miniStyles.gridLine, { top: height * 0.66 }]} />
      <View style={[miniStyles.gridLine, { bottom: 0 }]} />

      {/* Profile line segments */}
      {points.map((pt, i) => {
        if (i === 0) return null;
        const prev = points[i - 1];
        const dx = pt.x - prev.x;
        const dy = pt.y - prev.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);

        return (
          <View
            key={i}
            style={[
              miniStyles.lineSegment,
              {
                left: prev.x,
                top: prev.y,
                width: length,
                transform: [{ rotate: `${angle}deg` }],
              },
            ]}
          />
        );
      })}

      {/* Labels */}
      <Text style={[miniStyles.chartLabel, { top: -1, right: 0 }]}>
        {routeAnalysisEngine.formatElevation(maxEle)} ft
      </Text>
      <Text style={[miniStyles.chartLabel, { bottom: -1, right: 0 }]}>
        {routeAnalysisEngine.formatElevation(minEle)} ft
      </Text>
    </View>
  );
}

const miniStyles = StyleSheet.create({
  chartContainer: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 4,
    backgroundColor: 'rgba(11,14,18,0.6)',
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(30,35,43,0.5)',
  },
  lineSegment: {
    position: 'absolute',
    height: 1.5,
    backgroundColor: TACTICAL.amber,
    transformOrigin: 'left center',
    opacity: 0.8,
  },
  chartLabel: {
    position: 'absolute',
    fontSize: 7,
    fontFamily: 'Courier',
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },
});

// ── Segment Row ──────────────────────────────────────────────

function SegmentRow({ segment }: { segment: RouteAnalysisSegment }) {
  const diffMeta = DIFFICULTY_META[segment.difficulty];
  const distLabel = `${segment.distanceStart.toFixed(0)}–${segment.distanceEnd.toFixed(0)} mi`;

  return (
    <View style={segStyles.row}>
      <View style={segStyles.indexCol}>
        <Text style={segStyles.indexText}>{segment.segmentIndex + 1}</Text>
      </View>
      <View style={segStyles.distCol}>
        <Text style={segStyles.distText}>{distLabel}</Text>
      </View>
      <View style={segStyles.eleCol}>
        <Ionicons name="trending-up-outline" size={9} color="#66BB6A" />
        <Text style={segStyles.eleText}>{routeAnalysisEngine.formatElevation(segment.elevationGain)}</Text>
      </View>
      <View style={segStyles.gradeCol}>
        <Text style={segStyles.gradeText}>{segment.avgGradePercent}%</Text>
      </View>
      <View style={[segStyles.diffBadge, { borderColor: diffMeta.color + '40' }]}>
        <View style={[segStyles.diffDot, { backgroundColor: diffMeta.color }]} />
        <Text style={[segStyles.diffText, { color: diffMeta.color }]}>
          {diffMeta.label}
        </Text>
      </View>
    </View>
  );
}

const segStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(30,35,43,0.4)',
    gap: 6,
  },
  indexCol: {
    width: 20,
    alignItems: 'center',
  },
  indexText: {
    fontSize: 9,
    fontFamily: 'Courier',
    fontWeight: '700',
    color: TACTICAL.textMuted,
  },
  distCol: {
    flex: 1,
    minWidth: 60,
  },
  distText: {
    fontSize: 10,
    fontFamily: 'Courier',
    fontWeight: '600',
    color: TACTICAL.text,
    letterSpacing: 0.5,
  },
  eleCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minWidth: 50,
  },
  eleText: {
    fontSize: 9,
    fontFamily: 'Courier',
    fontWeight: '600',
    color: '#66BB6A',
  },
  gradeCol: {
    width: 30,
    alignItems: 'center',
  },
  gradeText: {
    fontSize: 9,
    fontFamily: 'Courier',
    fontWeight: '600',
    color: TACTICAL.textMuted,
  },
  diffBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
    borderWidth: 0.5,
  },
  diffDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  diffText: {
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 2,
  },
});

// ── Main Panel ───────────────────────────────────────────────

export default function RouteAnalysisPanel({
  intelligence,
  visible,
  onClose,
  loading,
}: RouteAnalysisPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [showSegments, setShowSegments] = useState(false);

  const toggleExpanded = useCallback(() => {
    setExpanded(prev => !prev);
  }, []);

  const toggleSegments = useCallback(() => {
    setShowSegments(prev => !prev);
  }, []);

  if (!visible) return null;

  // ── Loading state ──
  if (loading && !intelligence) {
    return (
      <View style={styles.panel}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="analytics-outline" size={14} color={TACTICAL.textMuted} />
            <Text style={styles.headerTitle}>ROUTE ANALYSIS</Text>
          </View>
          <View style={styles.headerRight}>
            {onClose && (
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={14} color={TACTICAL.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>
        <View style={{ paddingHorizontal: 16, paddingVertical: 20, alignItems: 'center' }}>
          <Ionicons name="hourglass-outline" size={24} color={TACTICAL.textMuted} />
          <Text style={{ fontSize: 11, fontWeight: '600', color: TACTICAL.textMuted, marginTop: 8, textAlign: 'center', letterSpacing: 0.5 }}>
            Analyzing route...
          </Text>
        </View>
      </View>
    );
  }

  // ── Empty state ──
  if (!intelligence) {
    return (
      <View style={styles.panel}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="analytics-outline" size={14} color={TACTICAL.textMuted} />
            <Text style={styles.headerTitle}>ROUTE ANALYSIS</Text>
          </View>
          <View style={styles.headerRight}>
            {onClose && (
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={14} color={TACTICAL.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>
        <View style={{ paddingHorizontal: 16, paddingVertical: 20, alignItems: 'center' }}>
          <Ionicons name="map-outline" size={24} color={TACTICAL.textMuted} />
          <Text style={{ fontSize: 11, fontWeight: '600', color: TACTICAL.textMuted, marginTop: 8, textAlign: 'center', letterSpacing: 0.5 }}>
            Load a route to view analysis.
          </Text>
        </View>
      </View>
    );
  }



  const diffMeta = DIFFICULTY_META[intelligence.overallDifficulty];
  const diffDist = routeAnalysisEngine.getDifficultyDistribution(intelligence);

  // ── Collapsed badge ──
  if (!expanded) {
    return (
      <TouchableOpacity
        style={styles.collapsedBadge}
        onPress={toggleExpanded}
        activeOpacity={0.85}
      >
        <Ionicons name="analytics-outline" size={12} color={TACTICAL.amber} />
        <Text style={styles.collapsedTitle}>ROUTE ANALYSIS</Text>
        <View style={styles.collapsedStats}>
          <Text style={styles.collapsedStatValue}>
            {intelligence.totalDistanceMiles.toFixed(1)} mi
          </Text>
          <View style={styles.collapsedDivider} />
          <Text style={styles.collapsedStatValue}>
            {routeAnalysisEngine.formatDriveTime(intelligence.estimatedDriveTimeHours)}
          </Text>
          <View style={styles.collapsedDivider} />
          <Text style={styles.collapsedStatValue}>
            {intelligence.segmentCount} seg
          </Text>
        </View>
        <Ionicons name="chevron-down-outline" size={10} color={TACTICAL.textMuted} />
      </TouchableOpacity>
    );
  }

  // ── Expanded panel ──
  return (
    <View style={styles.panel}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="analytics-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.headerTitle}>ROUTE ANALYSIS</Text>
          <View style={[styles.difficultyBadge, { borderColor: diffMeta.color + '40' }]}>
            <View style={[styles.difficultyDot, { backgroundColor: diffMeta.color }]} />
            <Text style={[styles.difficultyLabel, { color: diffMeta.color }]}>
              {diffMeta.label}
            </Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={toggleExpanded}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-up-outline" size={14} color={TACTICAL.textMuted} />
          </TouchableOpacity>
          {onClose && (
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{ marginLeft: 8 }}
            >
              <Ionicons name="close" size={14} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Route name */}
      <Text style={styles.routeName} numberOfLines={1}>
        {intelligence.routeName}
      </Text>
      <Text style={styles.truthNote} numberOfLines={2}>
        ECS-estimated from route geometry. Access, weather, closures, and field conditions need current verification.
      </Text>

      {/* Primary stats grid */}
      <View style={styles.statsGrid}>
        <StatCell
          label="DISTANCE"
          value={`${intelligence.totalDistanceMiles.toFixed(1)}`}
          unit="mi"
          icon="speedometer-outline"
          iconColor={TACTICAL.amber}
        />
        <StatCell
          label="DRIVE TIME"
          value={routeAnalysisEngine.formatDriveTime(intelligence.estimatedDriveTimeHours)}
          unit=""
          icon="time-outline"
          iconColor="#42A5F5"
        />
        <StatCell
          label="ELEV GAIN"
          value={routeAnalysisEngine.formatElevation(intelligence.elevationGainFeet)}
          unit="ft"
          icon="trending-up-outline"
          iconColor="#66BB6A"
        />
        <StatCell
          label="HIGHEST"
          value={routeAnalysisEngine.formatElevation(intelligence.highestElevationFeet)}
          unit="ft"
          icon="arrow-up-outline"
          iconColor="#CE93D8"
        />
        <StatCell
          label="SEGMENTS"
          value={`${intelligence.segmentCount}`}
          unit=""
          icon="grid-outline"
          iconColor="#FFB74D"
        />
        <StatCell
          label="POINTS"
          value={intelligence.totalPoints.toLocaleString()}
          unit=""
          icon="ellipse-outline"
          iconColor={TACTICAL.textMuted}
        />
      </View>

      {/* Secondary stats row */}
      {intelligence.hasElevation && (
        <View style={styles.secondaryRow}>
          <View style={styles.secondaryStat}>
            <Ionicons name="trending-down-outline" size={9} color="#EF5350" />
            <Text style={styles.secondaryLabel}>LOSS</Text>
            <Text style={styles.secondaryValue}>
              {routeAnalysisEngine.formatElevation(intelligence.elevationLossFeet)} ft
            </Text>
          </View>
          <View style={styles.secondaryDivider} />
          <View style={styles.secondaryStat}>
            <Ionicons name="arrow-down-outline" size={9} color="#42A5F5" />
            <Text style={styles.secondaryLabel}>LOWEST</Text>
            <Text style={styles.secondaryValue}>
              {routeAnalysisEngine.formatElevation(intelligence.lowestElevationFeet)} ft
            </Text>
          </View>
          <View style={styles.secondaryDivider} />
          <View style={styles.secondaryStat}>
            <Ionicons name="resize-outline" size={9} color={TACTICAL.textMuted} />
            <Text style={styles.secondaryLabel}>AVG</Text>
            <Text style={styles.secondaryValue}>
              {routeAnalysisEngine.formatElevation(intelligence.avgElevationFeet)} ft
            </Text>
          </View>
          <View style={styles.secondaryDivider} />
          <View style={styles.secondaryStat}>
            <Ionicons name="speedometer-outline" size={9} color={TACTICAL.textMuted} />
            <Text style={styles.secondaryLabel}>AVG SPD</Text>
            <Text style={styles.secondaryValue}>
              {intelligence.avgSpeedAssumption} mph
            </Text>
          </View>
        </View>
      )}

      {/* Difficulty distribution */}
      {intelligence.segments.length > 1 && (
        <View style={styles.diffDistRow}>
          {Object.entries(diffDist).map(([key, count]) => {
            if (count === 0) return null;
            const meta = DIFFICULTY_META[key];
            return (
              <View key={key} style={styles.diffDistItem}>
                <View style={[styles.diffDistDot, { backgroundColor: meta.color }]} />
                <Text style={[styles.diffDistLabel, { color: meta.color }]}>
                  {count}
                </Text>
                <Text style={styles.diffDistName}>{meta.label}</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Elevation profile mini-chart */}
      {intelligence.hasElevation && intelligence.elevationProfile.length > 2 && (
        <View style={styles.chartSection}>
          <Text style={styles.chartSectionLabel}>ELEVATION PROFILE</Text>
          <ElevationMiniChart
            profile={intelligence.elevationProfile}
            width={280}
            height={48}
          />
        </View>
      )}

      {/* Segments toggle */}
      {intelligence.segments.length > 0 && (
        <>
          <TouchableOpacity
            style={styles.segmentsToggle}
            onPress={toggleSegments}
            activeOpacity={0.8}
          >
            <Ionicons name="list-outline" size={11} color={TACTICAL.amber} />
            <Text style={styles.segmentsToggleText}>
              {showSegments ? 'HIDE' : 'SHOW'} SEGMENT DETAIL ({intelligence.segmentCount})
            </Text>
            <Ionicons
              name={showSegments ? 'chevron-up-outline' : 'chevron-down-outline'}
              size={10}
              color={TACTICAL.textMuted}
            />
          </TouchableOpacity>

          {showSegments && (
            <View style={styles.segmentsList}>
              {/* Header row */}
              <View style={styles.segmentHeader}>
                <Text style={[styles.segHeaderText, { width: 20, textAlign: 'center' }]}>#</Text>
                <Text style={[styles.segHeaderText, { flex: 1 }]}>RANGE</Text>
                <Text style={[styles.segHeaderText, { width: 50 }]}>GAIN</Text>
                <Text style={[styles.segHeaderText, { width: 30, textAlign: 'center' }]}>GRD</Text>
                <Text style={[styles.segHeaderText, { width: 70 }]}>DIFF</Text>
              </View>
              <ScrollView
                style={styles.segmentsScroll}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
                {intelligence.segments.map(seg => (
                  <SegmentRow key={seg.segmentIndex} segment={seg} />
                ))}
              </ScrollView>
            </View>
          )}
        </>
      )}

      {/* Footer */}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          ECS ROUTE INTELLIGENCE
        </Text>
      </View>

    </View>
  );
}

// ── Stat Cell ────────────────────────────────────────────────

function StatCell({
  label,
  value,
  unit,
  icon,
  iconColor,
}: {
  label: string;
  value: string;
  unit: string;
  icon: string;
  iconColor: string;
}) {
  return (
    <View style={styles.statCell}>
      <View style={styles.statCellHeader}>
        <Ionicons name={icon as any} size={9} color={iconColor} />
        <Text style={styles.statCellLabel}>{label}</Text>
      </View>
      <View style={styles.statCellValueRow}>
        <Text style={styles.statCellValue}>{value}</Text>
        {unit ? <Text style={styles.statCellUnit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Collapsed Badge ──
  collapsedBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    zIndex: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(11,14,18,0.94)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 6,
  },
  collapsedTitle: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 3,
    color: TACTICAL.amber,
    textTransform: 'uppercase',
  },
  collapsedStats: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  collapsedStatValue: {
    fontSize: 10,
    fontFamily: 'Courier',
    fontWeight: '700',
    color: TACTICAL.text,
  },
  collapsedDivider: {
    width: 1,
    height: 10,
    backgroundColor: 'rgba(30,35,43,0.6)',
  },

  // ── Expanded Panel ──
  panel: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    zIndex: 40,
    backgroundColor: 'rgba(17,20,24,0.97)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ECS.stroke,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 10,
    maxHeight: 500,
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    borderBottomWidth: GOLD_RAIL.sectionWidth,
    borderBottomColor: GOLD_RAIL.section,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 4,
    color: TACTICAL.amber,
    textTransform: 'uppercase',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // ── Difficulty Badge ──
  difficultyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 0.5,
    marginLeft: 4,
  },
  difficultyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  difficultyLabel: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 2,
  },

  // ── Route Name ──
  routeName: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    color: TACTICAL.text,
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 2,
    opacity: 0.8,
  },
  truthNote: {
    fontSize: 8,
    fontWeight: '600',
    letterSpacing: 1,
    lineHeight: 12,
    color: TACTICAL.textMuted,
    paddingHorizontal: 12,
    paddingBottom: 5,
    opacity: 0.72,
  },

  // ── Stats Grid ──
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 2,
  },
  statCell: {
    width: '31%',
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(11,14,18,0.5)',
    borderWidth: 0.5,
    borderColor: 'rgba(30,35,43,0.4)',
  },
  statCellHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 3,
  },
  statCellLabel: {
    fontSize: 7,
    fontWeight: '600',
    letterSpacing: 2,
    color: TACTICAL.textMuted,
    textTransform: 'uppercase',
  },
  statCellValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  statCellValue: {
    fontSize: 14,
    fontFamily: 'Courier',
    fontWeight: '700',
    color: TACTICAL.text,
  },
  statCellUnit: {
    fontSize: 8,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },

  // ── Secondary Stats Row ──
  secondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderTopWidth: GOLD_RAIL.subsectionWidth,
    borderTopColor: GOLD_RAIL.subsection,
    gap: 6,
  },
  secondaryStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  secondaryLabel: {
    fontSize: 7,
    fontWeight: '600',
    letterSpacing: 1,
    color: TACTICAL.textMuted,
  },
  secondaryValue: {
    fontSize: 9,
    fontFamily: 'Courier',
    fontWeight: '700',
    color: TACTICAL.text,
  },
  secondaryDivider: {
    width: 1,
    height: 10,
    backgroundColor: 'rgba(30,35,43,0.5)',
  },

  // ── Difficulty Distribution ──
  diffDistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    gap: 10,
    borderTopWidth: GOLD_RAIL.subsectionWidth,
    borderTopColor: GOLD_RAIL.subsection,
  },
  diffDistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  diffDistDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  diffDistLabel: {
    fontSize: 10,
    fontFamily: 'Courier',
    fontWeight: '800',
  },
  diffDistName: {
    fontSize: 7,
    fontWeight: '600',
    letterSpacing: 1,
    color: TACTICAL.textMuted,
  },

  // ── Chart Section ──
  chartSection: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderTopWidth: GOLD_RAIL.subsectionWidth,
    borderTopColor: GOLD_RAIL.subsection,
  },
  chartSectionLabel: {
    fontSize: 7,
    fontWeight: '600',
    letterSpacing: 3,
    color: TACTICAL.textMuted,
    marginBottom: 4,
  },

  // ── Segments Toggle ──
  segmentsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderTopWidth: GOLD_RAIL.sectionWidth,
    borderTopColor: GOLD_RAIL.section,
  },
  segmentsToggleText: {
    flex: 1,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 3,
    color: TACTICAL.amber,
  },

  // ── Segments List ──
  segmentsList: {
    borderTopWidth: GOLD_RAIL.subsectionWidth,
    borderTopColor: GOLD_RAIL.subsection,
  },
  segmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 6,
    backgroundColor: 'rgba(11,14,18,0.4)',
  },
  segHeaderText: {
    fontSize: 7,
    fontWeight: '600',
    letterSpacing: 2,
    color: TACTICAL.textMuted,
    textTransform: 'uppercase',
  },
  segmentsScroll: {
    maxHeight: 180,
  },

  // ── Footer ──
  footer: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderTopWidth: GOLD_RAIL.subsectionWidth,
    borderTopColor: GOLD_RAIL.subsection,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 6,
    fontWeight: '600',
    letterSpacing: 3,
    color: TACTICAL.textMuted,
    opacity: 0.5,
  },
});



