/**
 * ElevationProfile — Collapsible elevation chart panel (Phase 2.8.2)
 *
 * Displays distance vs elevation for recorded trail.
 * Compact mode: sparkline + key stats.
 * Expanded mode: full chart with current position marker.
 * Live updates throttled to every 5-10 seconds.
 * ECS dark glass styling with amber accents.
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform, LayoutChangeEvent,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL, TYPO, DENSITY } from '../../lib/theme';
import type { TrailAnalytics, TrailChartPoint } from '../../lib/trailStore';
import { hapticMicro } from '../../lib/haptics';

interface Props {
  analytics: TrailAnalytics | null;
  /** Current replay position index (for position marker on chart) */
  currentIndex?: number | null;
  /** Callback when user taps on chart at a specific index */
  onChartTap?: (index: number) => void;
  /** Trail style mode */
  trailStyle?: 'normal' | 'speed' | 'grade';
  onTrailStyleChange?: (style: 'normal' | 'speed' | 'grade') => void;
}

const CHART_HEIGHT = 120;
const SPARKLINE_HEIGHT = 32;

export default function ElevationProfile({
  analytics, currentIndex, onChartTap, trailStyle = 'normal', onTrailStyleChange,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [chartWidth, setChartWidth] = useState(280);

  const toggleExpanded = useCallback(() => {
    hapticMicro();
    setExpanded(prev => !prev);
  }, []);

  const onChartLayout = useCallback((e: LayoutChangeEvent) => {
    setChartWidth(e.nativeEvent.layout.width);
  }, []);

  const hasData = analytics && analytics.chart_series.length > 1;
  const hasElev = analytics?.has_elevation ?? false;

  // ── Compute chart path data ────────────────────────────────
  const chartData = useMemo(() => {
    if (!analytics || analytics.chart_series.length < 2) return null;
    const series = analytics.chart_series;
    const maxDist = series[series.length - 1].distance_mi || 1;

    // Find elevation range
    const elevValues = series.map(p => p.elevation_ft).filter((v): v is number => v != null);
    if (elevValues.length === 0) return null;

    const minElev = Math.min(...elevValues);
    const maxElev = Math.max(...elevValues);
    const elevRange = Math.max(maxElev - minElev, 50); // min 50ft range

    return { series, maxDist, minElev, maxElev, elevRange };
  }, [analytics]);

  // ── Sparkline points (compact mode) ────────────────────────
  const sparklinePoints = useMemo(() => {
    if (!chartData) return '';
    const { series, maxDist, minElev, elevRange } = chartData;
    const w = chartWidth;
    const h = SPARKLINE_HEIGHT;
    const padding = 2;

    return series.map((p, i) => {
      const x = padding + ((p.distance_mi / maxDist) * (w - padding * 2));
      const elev = p.elevation_ft ?? minElev;
      const y = h - padding - ((elev - minElev) / elevRange * (h - padding * 2));
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }, [chartData, chartWidth]);

  // ── Full chart bars ────────────────────────────────────────
  const chartBars = useMemo(() => {
    if (!chartData) return [];
    const { series, maxDist, minElev, elevRange } = chartData;
    const w = chartWidth;
    const h = CHART_HEIGHT;
    const barCount = Math.min(series.length, 150);
    const step = Math.max(1, Math.floor(series.length / barCount));
    const barWidth = Math.max(1.5, (w / barCount) - 0.5);

    const bars: {
      x: number; height: number; color: string; index: number;
    }[] = [];

    for (let i = 0; i < series.length; i += step) {
      const p = series[i];
      const x = (p.distance_mi / maxDist) * w;
      const elev = p.elevation_ft ?? minElev;
      const barH = Math.max(2, ((elev - minElev) / elevRange) * (h - 8));
      
      // Color by speed if in speed mode
      let color = 'rgba(196,138,44,0.6)';
      if (trailStyle === 'speed' && p.speed_mph != null) {
        const maxSpd = analytics?.chart_series.reduce((m, s) => Math.max(m, s.speed_mph ?? 0), 0) || 30;
        const ratio = Math.min((p.speed_mph || 0) / maxSpd, 1);
        if (ratio < 0.25) color = 'rgba(107,78,26,0.7)';
        else if (ratio < 0.5) color = 'rgba(155,110,32,0.7)';
        else if (ratio < 0.75) color = 'rgba(196,138,44,0.7)';
        else color = 'rgba(255,213,79,0.8)';
      }

      bars.push({ x, height: barH, color, index: p.index });
    }

    return bars;
  }, [chartData, chartWidth, trailStyle, analytics]);

  // ── Current position marker ────────────────────────────────
  const currentMarkerX = useMemo(() => {
    if (!chartData || currentIndex == null) return null;
    const { series, maxDist } = chartData;
    // Find the chart point closest to currentIndex
    let closest = series[0];
    for (const p of series) {
      if (Math.abs(p.index - currentIndex) < Math.abs(closest.index - currentIndex)) {
        closest = p;
      }
    }
    return (closest.distance_mi / maxDist) * chartWidth;
  }, [chartData, currentIndex, chartWidth]);

  if (!hasData) {
    return (
      <View style={styles.container}>
        <TouchableOpacity style={styles.headerRow} onPress={toggleExpanded} activeOpacity={0.8}>
          <View style={styles.headerLeft}>
            <Ionicons name="analytics-outline" size={14} color={TACTICAL.amber} />
            <Text style={styles.headerTitle}>ELEVATION</Text>
            <View style={styles.noDataBadge}>
              <Text style={styles.noDataText}>NO DATA</Text>
            </View>
          </View>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={TACTICAL.textMuted} />
        </TouchableOpacity>
        {expanded && (
          <View style={styles.emptyContent}>
            <Text style={styles.emptyText}>
              {analytics && analytics.chart_series.length > 0 && !hasElev
                ? 'Elevation data unavailable for this trail. Distance and speed stats shown below.'
                : 'Record a trail to view elevation profile.'}
            </Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ── Header ─────────────────────────────────────────── */}
      <TouchableOpacity style={styles.headerRow} onPress={toggleExpanded} activeOpacity={0.8}>
        <View style={styles.headerLeft}>
          <Ionicons name="analytics-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.headerTitle}>ELEVATION</Text>
          {analytics && (
            <Text style={styles.headerStat}>
              {analytics.total_distance_miles.toFixed(1)} MI
            </Text>
          )}
        </View>
        <View style={styles.headerRight}>
          {/* Compact sparkline */}
          {!expanded && hasElev && (
            <View style={[styles.sparklineContainer, { width: Math.min(chartWidth * 0.35, 100) }]}>
              {Platform.OS === 'web' ? (
                <View
                  style={{ width: '100%', height: SPARKLINE_HEIGHT }}
                  // @ts-ignore web-only
                  dangerouslySetInnerHTML={{
                    __html: `<svg width="100%" height="${SPARKLINE_HEIGHT}" viewBox="0 0 ${chartWidth} ${SPARKLINE_HEIGHT}" preserveAspectRatio="none"><path d="${sparklinePoints}" fill="none" stroke="rgba(196,138,44,0.7)" stroke-width="1.5"/></svg>`,
                  }}
                />
              ) : (
                <View style={styles.sparklineFallback}>
                  <View style={[styles.sparklineBar, { height: '60%' }]} />
                  <View style={[styles.sparklineBar, { height: '80%' }]} />
                  <View style={[styles.sparklineBar, { height: '45%' }]} />
                  <View style={[styles.sparklineBar, { height: '70%' }]} />
                  <View style={[styles.sparklineBar, { height: '55%' }]} />
                </View>
              )}
            </View>
          )}
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={TACTICAL.textMuted} />
        </View>
      </TouchableOpacity>

      {/* ── Expanded Content ────────────────────────────────── */}
      {expanded && (
        <View style={styles.expandedContent}>
          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{analytics!.total_distance_miles.toFixed(2)}</Text>
              <Text style={styles.statLabel}>DIST MI</Text>
            </View>
            <View style={styles.statDivider} />
            {hasElev ? (
              <>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: '#66BB6A' }]}>
                    +{analytics!.elevation_gain_ft.toLocaleString()}
                  </Text>
                  <Text style={styles.statLabel}>GAIN FT</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: '#EF5350' }]}>
                    -{analytics!.elevation_loss_ft.toLocaleString()}
                  </Text>
                  <Text style={styles.statLabel}>LOSS FT</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>
                    {analytics!.min_elevation_ft?.toLocaleString() ?? '—'}
                  </Text>
                  <Text style={styles.statLabel}>MIN FT</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>
                    {analytics!.max_elevation_ft?.toLocaleString() ?? '—'}
                  </Text>
                  <Text style={styles.statLabel}>MAX FT</Text>
                </View>
              </>
            ) : (
              <>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>—</Text>
                  <Text style={styles.statLabel}>ELEV N/A</Text>
                </View>
              </>
            )}
          </View>

          {analytics!.max_grade_pct > 0 && (
            <View style={styles.gradeRow}>
              <Ionicons name="trending-up-outline" size={11} color={TACTICAL.textMuted} />
              <Text style={styles.gradeText}>MAX GRADE: {analytics!.max_grade_pct}%</Text>
            </View>
          )}

          {/* Chart */}
          {hasElev && (
            <View style={styles.chartContainer} onLayout={onChartLayout}>
              {/* Y-axis labels */}
              <View style={styles.yAxis}>
                <Text style={styles.axisLabel}>
                  {chartData?.maxElev.toLocaleString()}
                </Text>
                <Text style={styles.axisLabel}>
                  {chartData?.minElev.toLocaleString()}
                </Text>
              </View>

              {/* Chart area */}
              <View style={styles.chartArea}>
                {/* Grid lines */}
                <View style={[styles.gridLine, { top: 0 }]} />
                <View style={[styles.gridLine, { top: '25%' }]} />
                <View style={[styles.gridLine, { top: '50%' }]} />
                <View style={[styles.gridLine, { top: '75%' }]} />
                <View style={[styles.gridLine, { bottom: 0 }]} />

                {/* Bars */}
                {chartBars.map((bar, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[
                      styles.chartBar,
                      {
                        left: bar.x - 1,
                        height: bar.height,
                        backgroundColor: bar.color,
                        width: Math.max(1.5, (chartWidth / chartBars.length) - 0.5),
                      },
                    ]}
                    onPress={() => onChartTap?.(bar.index)}
                    activeOpacity={0.7}
                  />
                ))}

                {/* Current position marker */}
                {currentMarkerX != null && (
                  <View style={[styles.positionMarker, { left: currentMarkerX }]}>
                    <View style={styles.positionLine} />
                    <View style={styles.positionDot} />
                  </View>
                )}
              </View>

              {/* X-axis */}
              <View style={styles.xAxis}>
                <Text style={styles.axisLabel}>0</Text>
                <Text style={styles.axisLabel}>
                  {((chartData?.maxDist || 0) / 2).toFixed(1)}
                </Text>
                <Text style={styles.axisLabel}>
                  {(chartData?.maxDist || 0).toFixed(1)} mi
                </Text>
              </View>
            </View>
          )}

          {/* Trail style toggle */}
          {onTrailStyleChange && (
            <View style={styles.styleToggle}>
              <Text style={styles.styleLabel}>TRAIL STYLE</Text>
              <View style={styles.styleChips}>
                {(['normal', 'speed', 'grade'] as const).map(s => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.styleChip, trailStyle === s && styles.styleChipActive]}
                    onPress={() => { hapticMicro(); onTrailStyleChange(s); }}
                    activeOpacity={0.8}
                  >
                    <Text style={[
                      styles.styleChipText,
                      trailStyle === s && styles.styleChipTextActive,
                    ]}>
                      {s.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: DENSITY.screenPad,
    marginBottom: DENSITY.cardGap,
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    overflow: 'hidden',
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    ...TYPO.T4,
    color: TACTICAL.amber,
    fontSize: 10,
    letterSpacing: 4,
  },
  headerStat: {
    fontFamily: 'Courier',
    fontSize: 11,
    fontWeight: '700',
    color: TACTICAL.text,
    letterSpacing: 0.5,
  },

  noDataBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  noDataText: {
    ...TYPO.U2,
    fontSize: 6,
    color: TACTICAL.textMuted,
    letterSpacing: 3,
  },

  sparklineContainer: {
    height: SPARKLINE_HEIGHT,
    overflow: 'hidden',
  },
  sparklineFallback: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: SPARKLINE_HEIGHT,
    gap: 2,
  },
  sparklineBar: {
    flex: 1,
    backgroundColor: 'rgba(196,138,44,0.4)',
    borderRadius: 1,
  },

  emptyContent: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: TACTICAL.border,
    paddingTop: 12,
  },
  emptyText: {
    ...TYPO.B2,
    color: TACTICAL.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },

  expandedContent: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: TACTICAL.border,
    paddingTop: 12,
    gap: 10,
  },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontFamily: 'Courier',
    fontSize: 13,
    fontWeight: '700',
    color: TACTICAL.text,
    letterSpacing: 0.5,
  },
  statLabel: {
    ...TYPO.U2,
    fontSize: 6,
    color: TACTICAL.textMuted,
    letterSpacing: 3,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: TACTICAL.border,
  },

  gradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  gradeText: {
    ...TYPO.U2,
    fontSize: 7,
    color: TACTICAL.textMuted,
    letterSpacing: 3,
  },

  // ── Chart ──────────────────────────────────────────────────
  chartContainer: {
    flexDirection: 'row',
    gap: 4,
  },
  yAxis: {
    width: 36,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingRight: 4,
    height: CHART_HEIGHT,
  },
  chartArea: {
    flex: 1,
    height: CHART_HEIGHT,
    position: 'relative',
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(62,79,60,0.3)',
    overflow: 'hidden',
  },
  xAxis: {
    position: 'absolute',
    bottom: -16,
    left: 40,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  axisLabel: {
    fontFamily: 'Courier',
    fontSize: 8,
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },

  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(62,79,60,0.15)',
  },

  chartBar: {
    position: 'absolute',
    bottom: 0,
    borderTopLeftRadius: 1,
    borderTopRightRadius: 1,
  },

  positionMarker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    alignItems: 'center',
    zIndex: 10,
  },
  positionLine: {
    flex: 1,
    width: 1.5,
    backgroundColor: '#4A90D9',
    opacity: 0.8,
  },
  positionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4A90D9',
    borderWidth: 1.5,
    borderColor: '#fff',
    position: 'absolute',
    top: 0,
  },

  // ── Trail style toggle ─────────────────────────────────────
  styleToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  styleLabel: {
    ...TYPO.U2,
    fontSize: 7,
    color: TACTICAL.textMuted,
    letterSpacing: 3,
  },
  styleChips: {
    flexDirection: 'row',
    gap: 6,
  },
  styleChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: 'transparent',
  },
  styleChipActive: {
    borderColor: TACTICAL.amber + '60',
    backgroundColor: 'rgba(196,138,44,0.12)',
  },
  styleChipText: {
    ...TYPO.U2,
    fontSize: 7,
    color: TACTICAL.textMuted,
    letterSpacing: 3,
  },
  styleChipTextActive: {
    color: TACTICAL.amber,
  },
});



