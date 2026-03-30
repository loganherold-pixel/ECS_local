/**
 * ElevationProfile — Pure React Native elevation chart
 *
 * Renders elevation data as a filled area chart with:
 *   - Y-axis elevation labels (ft)
 *   - X-axis distance labels (mi)
 *   - Gradient-like fill using stacked bars
 *   - Min/max/gain KPI badges
 *
 * Uses TACTICAL theme + TYPO tokens.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TACTICAL, TYPO, DENSITY } from '../../lib/theme';

interface ElevationPoint {
  distanceMiles: number;
  elevationFt: number;
}

interface Props {
  points: ElevationPoint[];
  width: number;
  height?: number;
  totalDistanceMiles: number;
}

// Downsample points to a target count for rendering
function downsample(pts: ElevationPoint[], target: number): ElevationPoint[] {
  if (pts.length <= target) return pts;
  const step = (pts.length - 1) / (target - 1);
  const result: ElevationPoint[] = [];
  for (let i = 0; i < target; i++) {
    const idx = Math.min(Math.round(i * step), pts.length - 1);
    result.push(pts[idx]);
  }
  return result;
}

export default function ElevationProfile({ points, width, height = 120, totalDistanceMiles }: Props) {
  const chartData = useMemo(() => {
    if (points.length < 2) return null;

    const sampled = downsample(points, Math.min(points.length, Math.floor(width / 3)));
    const elevations = sampled.map(p => p.elevationFt);
    const minEle = Math.min(...elevations);
    const maxEle = Math.max(...elevations);
    const eleRange = maxEle - minEle;

    // Calculate elevation gain
    let gain = 0;
    for (let i = 1; i < sampled.length; i++) {
      const diff = sampled[i].elevationFt - sampled[i - 1].elevationFt;
      if (diff > 0) gain += diff;
    }

    // Y-axis ticks (3-4 ticks)
    const tickCount = 4;
    const niceRange = eleRange || 100;
    const tickStep = Math.ceil(niceRange / (tickCount - 1) / 50) * 50 || 50;
    const yMin = Math.floor(minEle / tickStep) * tickStep;
    const yMax = yMin + tickStep * (tickCount - 1);
    const yTicks: number[] = [];
    for (let v = yMin; v <= yMax; v += tickStep) yTicks.push(v);
    if (yTicks.length === 0) yTicks.push(yMin, yMax);

    // X-axis ticks (distance markers)
    const xTickCount = Math.min(5, Math.max(2, Math.floor(totalDistanceMiles / 5) + 1));
    const xStep = totalDistanceMiles / (xTickCount - 1);
    const xTicks: number[] = [];
    for (let i = 0; i < xTickCount; i++) {
      xTicks.push(Math.round(i * xStep * 10) / 10);
    }

    return {
      sampled,
      minEle,
      maxEle,
      eleRange: yMax - yMin || 100,
      yMin,
      yMax,
      yTicks,
      xTicks,
      gain: Math.round(gain),
    };
  }, [points, width, totalDistanceMiles]);

  if (!chartData || points.length < 2) {
    return (
      <View style={[styles.container, { width }]}>
        <View style={styles.noDataContainer}>
          <Text style={styles.noDataText}>NO ELEVATION DATA</Text>
        </View>
      </View>
    );
  }

  const PADDING_LEFT = 42;
  const PADDING_RIGHT = 12;
  const PADDING_TOP = 8;
  const PADDING_BOTTOM = 22;
  const chartW = width - PADDING_LEFT - PADDING_RIGHT;
  const chartH = height - PADDING_TOP - PADDING_BOTTOM;

  const { sampled, yMin, yMax, eleRange, yTicks, xTicks, gain, minEle, maxEle } = chartData;

  // Map a point to chart coordinates
  const toX = (distMi: number) => PADDING_LEFT + (distMi / totalDistanceMiles) * chartW;
  const toY = (eleFt: number) => PADDING_TOP + chartH - ((eleFt - yMin) / eleRange) * chartH;

  // Build bars for the area chart
  const barWidth = Math.max(1.5, chartW / sampled.length);
  const bars = sampled.map((pt, i) => {
    const x = toX(pt.distanceMiles);
    const y = toY(pt.elevationFt);
    const barH = PADDING_TOP + chartH - y;
    return { x, y, barH, ele: pt.elevationFt, dist: pt.distanceMiles, idx: i };
  });

  // Find highest point for marker
  const highestIdx = sampled.reduce((best, pt, i) =>
    pt.elevationFt > sampled[best].elevationFt ? i : best, 0);
  const lowestIdx = sampled.reduce((best, pt, i) =>
    pt.elevationFt < sampled[best].elevationFt ? i : best, 0);

  return (
    <View style={[styles.container, { width }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>ELEVATION PROFILE</Text>
        <View style={styles.kpiBadges}>
          <View style={styles.kpiBadge}>
            <Text style={styles.kpiBadgeLabel}>GAIN</Text>
            <Text style={styles.kpiBadgeValue}>{gain.toLocaleString()} ft</Text>
          </View>
          <View style={styles.kpiBadge}>
            <Text style={styles.kpiBadgeLabel}>HIGH</Text>
            <Text style={styles.kpiBadgeValue}>{Math.round(maxEle).toLocaleString()} ft</Text>
          </View>
          <View style={styles.kpiBadge}>
            <Text style={styles.kpiBadgeLabel}>LOW</Text>
            <Text style={styles.kpiBadgeValue}>{Math.round(minEle).toLocaleString()} ft</Text>
          </View>
        </View>
      </View>

      {/* Chart area */}
      <View style={[styles.chartArea, { height }]}>
        {/* Y-axis grid lines + labels */}
        {yTicks.map((tick, i) => {
          const y = toY(tick);
          return (
            <React.Fragment key={`ytick-${i}`}>
              <View style={[styles.gridLineH, { top: y, left: PADDING_LEFT, width: chartW }]} />
              <Text style={[styles.yLabel, { top: y - 6, left: 0 }]}>
                {tick >= 1000 ? `${(tick / 1000).toFixed(1)}k` : `${tick}`}
              </Text>
            </React.Fragment>
          );
        })}

        {/* X-axis labels */}
        {xTicks.map((tick, i) => {
          const x = toX(tick);
          return (
            <Text key={`xtick-${i}`} style={[styles.xLabel, { left: x - 12, top: PADDING_TOP + chartH + 4 }]}>
              {tick.toFixed(1)}
            </Text>
          );
        })}

        {/* Area fill bars */}
        {bars.map((bar, i) => (
          <View
            key={`bar-${i}`}
            style={[
              styles.bar,
              {
                left: bar.x - barWidth / 2,
                top: bar.y,
                width: barWidth,
                height: Math.max(0, bar.barH),
              },
              i === highestIdx && styles.barHighlight,
            ]}
          />
        ))}

        {/* Top edge line (connecting bar tops) */}
        {bars.map((bar, i) => {
          if (i === 0) return null;
          const prev = bars[i - 1];
          const dx = bar.x - prev.x;
          const dy = bar.y - prev.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx) * (180 / Math.PI);
          const midX = (prev.x + bar.x) / 2;
          const midY = (prev.y + bar.y) / 2;
          return (
            <View
              key={`edge-${i}`}
              style={[
                styles.edgeLine,
                {
                  left: midX - len / 2,
                  top: midY - 1,
                  width: len,
                  transform: [{ rotate: `${angle}deg` }],
                },
              ]}
            />
          );
        })}

        {/* Highest point marker */}
        {bars[highestIdx] && (
          <View style={[styles.peakMarker, { left: bars[highestIdx].x - 3, top: bars[highestIdx].y - 3 }]}>
            <View style={styles.peakDot} />
          </View>
        )}

        {/* Baseline */}
        <View style={[styles.baseline, { top: PADDING_TOP + chartH, left: PADDING_LEFT, width: chartW }]} />

        {/* Y-axis line */}
        <View style={[styles.yAxisLine, { left: PADDING_LEFT, top: PADDING_TOP, height: chartH }]} />

        {/* Unit labels */}
        <Text style={[styles.unitLabel, { left: 0, top: PADDING_TOP - 6 }]}>FT</Text>
        <Text style={[styles.unitLabel, { left: PADDING_LEFT + chartW - 10, top: PADDING_TOP + chartH + 10 }]}>MI</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: DENSITY.borderDefault,
    borderColor: TACTICAL.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: DENSITY.cardPad,
    paddingTop: DENSITY.cardPad,
    paddingBottom: 6,
  },
  headerTitle: {
    ...TYPO.T4,
    color: TACTICAL.amber,
  },
  kpiBadges: {
    flexDirection: 'row',
    gap: 10,
  },
  kpiBadge: {
    alignItems: 'center',
  },
  kpiBadgeLabel: {
    ...TYPO.U2,
    fontSize: 7,
    color: TACTICAL.textMuted,
    letterSpacing: 3,
  },
  kpiBadgeValue: {
    ...TYPO.K3,
    fontSize: 10,
    color: TACTICAL.text,
    marginTop: 1,
  },
  chartArea: {
    position: 'relative',
    marginHorizontal: 4,
    marginBottom: 8,
  },
  gridLineH: {
    position: 'absolute',
    height: 1,
    backgroundColor: 'rgba(62,79,60,0.2)',
  },
  yLabel: {
    position: 'absolute',
    width: 38,
    textAlign: 'right',
    ...TYPO.U2,
    fontSize: 8,
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  xLabel: {
    position: 'absolute',
    width: 28,
    textAlign: 'center',
    ...TYPO.U2,
    fontSize: 8,
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  bar: {
    position: 'absolute',
    backgroundColor: 'rgba(62,79,60,0.35)',
    borderTopLeftRadius: 1,
    borderTopRightRadius: 1,
  },
  barHighlight: {
    backgroundColor: 'rgba(196,138,44,0.3)',
  },
  edgeLine: {
    position: 'absolute',
    height: 2,
    backgroundColor: TACTICAL.accent,
  },
  peakMarker: {
    position: 'absolute',
    width: 6,
    height: 6,
    zIndex: 10,
  },
  peakDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: TACTICAL.amber,
  },
  baseline: {
    position: 'absolute',
    height: 1,
    backgroundColor: 'rgba(62,79,60,0.5)',
  },
  yAxisLine: {
    position: 'absolute',
    width: 1,
    backgroundColor: 'rgba(62,79,60,0.5)',
  },
  unitLabel: {
    position: 'absolute',
    ...TYPO.U2,
    fontSize: 7,
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  noDataContainer: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noDataText: {
    ...TYPO.T4,
    color: TACTICAL.textMuted,
  },
});



