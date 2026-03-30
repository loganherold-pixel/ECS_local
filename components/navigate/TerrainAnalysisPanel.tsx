/**
 * Terrain Analysis Panel — ECS Terrain Intelligence
 *
 * Floating panel displayed on the Navigate tab when terrain intelligence
 * is available. Shows:
 *   - Steep segment count
 *   - High elevation segment count
 *   - Mountain pass detection
 *   - Highest elevation
 *   - Overall terrain risk
 *   - Warning breakdown by type
 *   - Per-warning detail list (expandable)
 *   - Segment highlight legend
 *
 * Positioned as a floating overlay on the map.
 * Collapsible to a compact badge.
 */


import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import { TACTICAL, TYPO, GOLD_RAIL, ECS } from '../../lib/theme';
import {
  type TerrainIntelligence,
  type TerrainWarning,
  type TerrainWarningType,
  TERRAIN_WARNING_COLORS,
  TERRAIN_WARNING_ICONS,
  TERRAIN_WARNING_LABELS,
  RISK_META,
  terrainAnalysisEngine,
} from '../../lib/terrainAnalysisEngine';

interface TerrainAnalysisPanelProps {
  intelligence: TerrainIntelligence | null;
  visible: boolean;
  onClose?: () => void;
  /** When true, shows a loading indicator instead of empty state */
  loading?: boolean;
}


// ── Warning Row Component ────────────────────────────────────

function WarningRow({ warning }: { warning: TerrainWarning }) {
  const iconName = TERRAIN_WARNING_ICONS[warning.warningType];
  const label = TERRAIN_WARNING_LABELS[warning.warningType];

  return (
    <View style={warnStyles.row}>
      <View style={[warnStyles.typeBadge, { borderColor: warning.color + '40' }]}>
        <Ionicons name={iconName as any} size={10} color={warning.color} />
        <Text style={[warnStyles.typeLabel, { color: warning.color }]}>{label}</Text>
      </View>
      <View style={warnStyles.detailCol}>
        <Text style={warnStyles.rangeText}>Seg {warning.segmentIndex + 1}</Text>
        <Text style={warnStyles.rangeSubText}>{warning.segmentRange}</Text>
      </View>
      <View style={warnStyles.metricCol}>
        <Text style={[warnStyles.metricValue, { color: warning.color }]}>
          {warning.metricValue.toLocaleString()}
        </Text>
        <Text style={warnStyles.metricUnit}>{warning.metricUnit}</Text>
      </View>
    </View>
  );
}

const warnStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(30,35,43,0.4)',
    gap: 8,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 0.5,
    minWidth: 95,
  },
  typeLabel: {
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  detailCol: {
    flex: 1,
    gap: 1,
  },
  rangeText: {
    fontSize: 10,
    fontFamily: 'Courier',
    fontWeight: '700',
    color: TACTICAL.text,
  },
  rangeSubText: {
    fontSize: 8,
    fontFamily: 'Courier',
    fontWeight: '500',
    color: TACTICAL.textMuted,
  },
  metricCol: {
    alignItems: 'flex-end',
    gap: 1,
  },
  metricValue: {
    fontSize: 11,
    fontFamily: 'Courier',
    fontWeight: '800',
  },
  metricUnit: {
    fontSize: 7,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },
});

// ── Stat Cell ────────────────────────────────────────────────

function StatCell({
  label,
  value,
  unit,
  icon,
  iconColor,
  highlight,
}: {
  label: string;
  value: string;
  unit?: string;
  icon: string;
  iconColor: string;
  highlight?: boolean;
}) {
  return (
    <View style={[styles.statCell, highlight && styles.statCellHighlight]}>
      <View style={styles.statCellHeader}>
        <Ionicons name={icon as any} size={9} color={iconColor} />
        <Text style={styles.statCellLabel}>{label}</Text>
      </View>
      <View style={styles.statCellValueRow}>
        <Text style={[styles.statCellValue, highlight && { color: iconColor }]}>{value}</Text>
        {unit ? <Text style={styles.statCellUnit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

// ── Warning Type Summary Chip ────────────────────────────────

function WarningTypeChip({
  type,
  count,
}: {
  type: TerrainWarningType;
  count: number;
}) {
  if (count === 0) return null;
  const color = TERRAIN_WARNING_COLORS[type];
  const icon = TERRAIN_WARNING_ICONS[type];
  const label = TERRAIN_WARNING_LABELS[type];

  return (
    <View style={[chipStyles.chip, { borderColor: color + '30' }]}>
      <Ionicons name={icon as any} size={10} color={color} />
      <Text style={[chipStyles.count, { color }]}>{count}</Text>
      <Text style={[chipStyles.label, { color: color + 'CC' }]}>{label}</Text>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 0.5,
    backgroundColor: 'rgba(11,14,18,0.5)',
  },
  count: {
    fontSize: 11,
    fontFamily: 'Courier',
    fontWeight: '800',
  },
  label: {
    fontSize: 7,
    fontWeight: '600',
    letterSpacing: 1,
  },
});

// ── Segment Highlight Legend ──────────────────────────────────

function HighlightLegend() {
  return (
    <View style={legendStyles.container}>
      <Text style={legendStyles.title}>MAP SEGMENT COLORS</Text>
      <View style={legendStyles.items}>
        <View style={legendStyles.item}>
          <View style={[legendStyles.swatch, { backgroundColor: TERRAIN_WARNING_COLORS.STEEP_GRADE }]} />
          <Text style={legendStyles.label}>STEEP GRADE</Text>
        </View>
        <View style={legendStyles.item}>
          <View style={[legendStyles.swatch, { backgroundColor: TERRAIN_WARNING_COLORS.MOUNTAIN_PASS }]} />
          <Text style={legendStyles.label}>MOUNTAIN PASS</Text>
        </View>
        <View style={legendStyles.item}>
          <View style={[legendStyles.swatch, { backgroundColor: TERRAIN_WARNING_COLORS.HIGH_ELEVATION }]} />
          <Text style={legendStyles.label}>HIGH ELEVATION</Text>
        </View>
      </View>
    </View>
  );
}

const legendStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderTopWidth: GOLD_RAIL.subsectionWidth,
    borderTopColor: GOLD_RAIL.subsection,
  },
  title: {
    fontSize: 7,
    fontWeight: '600',
    letterSpacing: 3,
    color: TACTICAL.textMuted,
    marginBottom: 5,
  },
  items: {
    flexDirection: 'row',
    gap: 12,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  swatch: {
    width: 14,
    height: 4,
    borderRadius: 2,
  },
  label: {
    fontSize: 7,
    fontWeight: '600',
    letterSpacing: 1,
    color: TACTICAL.textMuted,
  },
});

// ── Main Panel ───────────────────────────────────────────────

export default function TerrainAnalysisPanel({
  intelligence,
  visible,
  onClose,
  loading,
}: TerrainAnalysisPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [showWarnings, setShowWarnings] = useState(false);

  const toggleExpanded = useCallback(() => {
    setExpanded(prev => !prev);
  }, []);

  const toggleWarnings = useCallback(() => {
    setShowWarnings(prev => !prev);
  }, []);

  if (!visible) return null;

  // ── Loading state ──
  if (loading && !intelligence) {
    return (
      <View style={styles.panel}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="layers-outline" size={14} color={TACTICAL.textMuted} />
            <Text style={styles.headerTitle}>TERRAIN ANALYSIS</Text>
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
            Analyzing terrain...
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
            <Ionicons name="layers-outline" size={14} color={TACTICAL.textMuted} />
            <Text style={styles.headerTitle}>TERRAIN ANALYSIS</Text>
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
          <Ionicons name="layers-outline" size={24} color={TACTICAL.textMuted} />
          <Text style={{ fontSize: 11, fontWeight: '600', color: TACTICAL.textMuted, marginTop: 8, textAlign: 'center', letterSpacing: 0.5 }}>
            Load a route to view terrain analysis.
          </Text>
        </View>
      </View>
    );
  }



  const riskMeta = RISK_META[intelligence.overallRisk];
  const warningCounts = terrainAnalysisEngine.getWarningCounts(intelligence);
  const warningCoverage = terrainAnalysisEngine.getWarningCoverage(intelligence);
  const hasWarnings = intelligence.terrainWarnings.length > 0;

  // ── Collapsed badge ──
  if (!expanded) {
    return (
      <TouchableOpacity
        style={styles.collapsedBadge}
        onPress={toggleExpanded}
        activeOpacity={0.85}
      >
        <Ionicons name="layers-outline" size={12} color={riskMeta.color} />
        <Text style={styles.collapsedTitle}>TERRAIN</Text>
        <View style={styles.collapsedStats}>
          {intelligence.steepSegments > 0 && (
            <View style={styles.collapsedChip}>
              <View style={[styles.collapsedDot, { backgroundColor: TERRAIN_WARNING_COLORS.STEEP_GRADE }]} />
              <Text style={styles.collapsedChipText}>{intelligence.steepSegments}S</Text>
            </View>
          )}
          {intelligence.highElevationSegments > 0 && (
            <View style={styles.collapsedChip}>
              <View style={[styles.collapsedDot, { backgroundColor: TERRAIN_WARNING_COLORS.HIGH_ELEVATION }]} />
              <Text style={styles.collapsedChipText}>{intelligence.highElevationSegments}H</Text>
            </View>
          )}
          {intelligence.mountainPassDetected && (
            <View style={styles.collapsedChip}>
              <View style={[styles.collapsedDot, { backgroundColor: TERRAIN_WARNING_COLORS.MOUNTAIN_PASS }]} />
              <Text style={styles.collapsedChipText}>PASS</Text>
            </View>
          )}
          {!hasWarnings && (
            <Text style={[styles.collapsedChipText, { color: '#66BB6A' }]}>CLEAR</Text>
          )}
          <View style={[styles.riskBadgeSmall, { borderColor: riskMeta.color + '40' }]}>
            <Text style={[styles.riskBadgeSmallText, { color: riskMeta.color }]}>
              {riskMeta.label}
            </Text>
          </View>
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
          <Ionicons name="layers-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.headerTitle}>TERRAIN ANALYSIS</Text>
          <View style={[styles.riskBadge, { borderColor: riskMeta.color + '40' }]}>
            <Ionicons name={riskMeta.icon as any} size={9} color={riskMeta.color} />
            <Text style={[styles.riskBadgeText, { color: riskMeta.color }]}>
              {riskMeta.label}
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

      {/* Primary stats grid */}
      <View style={styles.statsGrid}>
        <StatCell
          label="STEEP SEGS"
          value={`${intelligence.steepSegments}`}
          icon="trending-up-outline"
          iconColor={intelligence.steepSegments > 0 ? TERRAIN_WARNING_COLORS.STEEP_GRADE : TACTICAL.textMuted}
          highlight={intelligence.steepSegments > 0}
        />
        <StatCell
          label="HIGH ELEV"
          value={`${intelligence.highElevationSegments}`}
          icon="arrow-up-circle-outline"
          iconColor={intelligence.highElevationSegments > 0 ? TERRAIN_WARNING_COLORS.HIGH_ELEVATION : TACTICAL.textMuted}
          highlight={intelligence.highElevationSegments > 0}
        />
        <StatCell
          label="MTN PASS"
          value={intelligence.mountainPassDetected ? 'YES' : 'NO'}
          icon="triangle-outline"
          iconColor={intelligence.mountainPassDetected ? TERRAIN_WARNING_COLORS.MOUNTAIN_PASS : TACTICAL.textMuted}
          highlight={intelligence.mountainPassDetected}
        />
        <StatCell
          label="HIGHEST"
          value={terrainAnalysisEngine.formatElevation(intelligence.highestElevationFeet)}
          unit="ft"
          icon="arrow-up-outline"
          iconColor="#CE93D8"
        />
        <StatCell
          label="ELEV GAIN"
          value={terrainAnalysisEngine.formatElevation(intelligence.totalElevationGainFeet)}
          unit="ft"
          icon="swap-vertical-outline"
          iconColor="#66BB6A"
        />
        <StatCell
          label="WARNINGS"
          value={`${intelligence.terrainWarnings.length}`}
          icon="alert-outline"
          iconColor={intelligence.terrainWarnings.length > 0 ? '#FFB74D' : TACTICAL.textMuted}
          highlight={intelligence.terrainWarnings.length > 0}
        />
      </View>

      {/* Elevation range row */}
      {intelligence.hasElevation && (
        <View style={styles.elevationRow}>
          <View style={styles.elevationStat}>
            <Ionicons name="arrow-down-outline" size={9} color="#42A5F5" />
            <Text style={styles.elevationLabel}>LOWEST</Text>
            <Text style={styles.elevationValue}>
              {terrainAnalysisEngine.formatElevation(intelligence.lowestElevationFeet)} ft
            </Text>
          </View>
          <View style={styles.elevationDivider} />
          <View style={styles.elevationStat}>
            <Ionicons name="resize-outline" size={9} color={TACTICAL.textMuted} />
            <Text style={styles.elevationLabel}>AVG</Text>
            <Text style={styles.elevationValue}>
              {terrainAnalysisEngine.formatElevation(intelligence.avgElevationFeet)} ft
            </Text>
          </View>
          <View style={styles.elevationDivider} />
          <View style={styles.elevationStat}>
            <Ionicons name="pie-chart-outline" size={9} color={TACTICAL.textMuted} />
            <Text style={styles.elevationLabel}>COVERAGE</Text>
            <Text style={styles.elevationValue}>
              {warningCoverage}%
            </Text>
          </View>
          <View style={styles.elevationDivider} />
          <View style={styles.elevationStat}>
            <Ionicons name="grid-outline" size={9} color={TACTICAL.textMuted} />
            <Text style={styles.elevationLabel}>SEGMENTS</Text>
            <Text style={styles.elevationValue}>
              {intelligence.totalSegments}
            </Text>
          </View>
        </View>
      )}

      {/* Warning type chips */}
      {hasWarnings && (
        <View style={styles.warningChipsRow}>
          <WarningTypeChip type="STEEP_GRADE" count={warningCounts.STEEP_GRADE} />
          <WarningTypeChip type="HIGH_ELEVATION" count={warningCounts.HIGH_ELEVATION} />
          <WarningTypeChip type="MOUNTAIN_PASS" count={warningCounts.MOUNTAIN_PASS} />
        </View>
      )}

      {/* Segment highlight legend */}
      {intelligence.segmentHighlights.length > 0 && (
        <HighlightLegend />
      )}

      {/* Warnings toggle */}
      {hasWarnings && (
        <>
          <TouchableOpacity
            style={styles.warningsToggle}
            onPress={toggleWarnings}
            activeOpacity={0.8}
          >
            <Ionicons name="warning-outline" size={11} color={TACTICAL.amber} />
            <Text style={styles.warningsToggleText}>
              {showWarnings ? 'HIDE' : 'SHOW'} WARNING DETAIL ({intelligence.terrainWarnings.length})
            </Text>
            <Ionicons
              name={showWarnings ? 'chevron-up-outline' : 'chevron-down-outline'}
              size={10}
              color={TACTICAL.textMuted}
            />
          </TouchableOpacity>

          {showWarnings && (
            <View style={styles.warningsList}>
              <ScrollView
                style={styles.warningsScroll}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
                {intelligence.terrainWarnings.map((w, idx) => (
                  <WarningRow key={`${w.warningType}-${w.segmentIndex}-${idx}`} warning={w} />
                ))}
              </ScrollView>
            </View>
          )}
        </>
      )}

      {/* No warnings message */}
      {!hasWarnings && (
        <View style={styles.noWarnings}>
          <Ionicons name="shield-checkmark-outline" size={14} color="#66BB6A" />
          <Text style={styles.noWarningsText}>No terrain warnings detected</Text>
        </View>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          ECS TERRAIN INTELLIGENCE
        </Text>
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
    zIndex: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(11,14,18,0.94)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.15)',
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
  collapsedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  collapsedDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  collapsedChipText: {
    fontSize: 9,
    fontFamily: 'Courier',
    fontWeight: '700',
    color: TACTICAL.text,
  },
  riskBadgeSmall: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
    borderWidth: 0.5,
  },
  riskBadgeSmallText: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 1.5,
  },

  // ── Expanded Panel ──
  panel: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    zIndex: 38,
    backgroundColor: 'rgba(17,20,24,0.97)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ECS.stroke,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 10,
    maxHeight: 480,
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
    flex: 1,
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

  // ── Risk Badge ──
  riskBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 0.5,
    marginLeft: 4,
  },
  riskBadgeText: {
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
  statCellHighlight: {
    backgroundColor: 'rgba(11,14,18,0.7)',
    borderColor: 'rgba(62,79,60,0.3)',
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

  // ── Elevation Row ──
  elevationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderTopWidth: GOLD_RAIL.subsectionWidth,
    borderTopColor: GOLD_RAIL.subsection,
    gap: 6,
  },
  elevationStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  elevationLabel: {
    fontSize: 7,
    fontWeight: '600',
    letterSpacing: 1,
    color: TACTICAL.textMuted,
  },
  elevationValue: {
    fontSize: 9,
    fontFamily: 'Courier',
    fontWeight: '700',
    color: TACTICAL.text,
  },
  elevationDivider: {
    width: 1,
    height: 10,
    backgroundColor: 'rgba(30,35,43,0.5)',
  },

  // ── Warning Chips Row ──
  warningChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
    borderTopWidth: GOLD_RAIL.subsectionWidth,
    borderTopColor: GOLD_RAIL.subsection,
    flexWrap: 'wrap',
  },

  // ── Warnings Toggle ──
  warningsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderTopWidth: GOLD_RAIL.sectionWidth,
    borderTopColor: GOLD_RAIL.section,
  },
  warningsToggleText: {
    flex: 1,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 3,
    color: TACTICAL.amber,
  },

  // ── Warnings List ──
  warningsList: {
    borderTopWidth: GOLD_RAIL.subsectionWidth,
    borderTopColor: GOLD_RAIL.subsection,
  },
  warningsScroll: {
    maxHeight: 160,
  },

  // ── No Warnings ──
  noWarnings: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: GOLD_RAIL.subsectionWidth,
    borderTopColor: GOLD_RAIL.subsection,
  },
  noWarningsText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#66BB6A',
    letterSpacing: 0.5,
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



