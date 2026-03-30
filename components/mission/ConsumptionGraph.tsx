// ============================================================
// CONSUMPTION GRAPH — Pure RN View-based chart
// ============================================================
// Renders a consumption history line/area chart using Views.
// No external charting library required.
// ============================================================

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TACTICAL } from '../../lib/theme';
import type { ResourceHistoryPoint } from '../../lib/telemetryPolling';

interface Props {
  data: ResourceHistoryPoint[];
  color: string;
  height?: number;
  showLabels?: boolean;
  showGrid?: boolean;
}

export default function ConsumptionGraph({
  data,
  color,
  height = 120,
  showLabels = true,
  showGrid = true,
}: Props) {
  const chartData = useMemo(() => {
    if (data.length === 0) return { bars: [], maxVal: 100, minVal: 0, timeLabels: [] };

    const percents = data.map(d => d.percent);
    const maxVal = 100;
    const minVal = 0;

    const bars = data.map((point, i) => ({
      percent: point.percent,
      heightRatio: (point.percent - minVal) / (maxVal - minVal),
      color: point.percent > 35 ? '#4CAF50' : point.percent >= 15 ? '#C48A2C' : '#E53935',
      isLast: i === data.length - 1,
      delta: point.delta,
      eventType: point.eventType,
    }));

    // Time labels (first, middle, last)
    const timeLabels: { label: string; position: number }[] = [];
    if (data.length > 0) {
      const formatTime = (iso: string) => {
        try {
          return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        } catch { return ''; }
      };
      timeLabels.push({ label: formatTime(data[0].timestamp), position: 0 });
      if (data.length > 2) {
        const mid = Math.floor(data.length / 2);
        timeLabels.push({ label: formatTime(data[mid].timestamp), position: 50 });
      }
      timeLabels.push({ label: formatTime(data[data.length - 1].timestamp), position: 100 });
    }

    return { bars, maxVal, minVal, timeLabels };
  }, [data]);

  if (data.length === 0) {
    return (
      <View style={[styles.container, { height }]}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>NO DATA YET</Text>
          <Text style={styles.emptySubtext}>Log resource usage to see trends</Text>
        </View>
      </View>
    );
  }

  const barWidth = Math.max(4, Math.min(20, (280 / Math.max(data.length, 1)) - 2));

  return (
    <View style={[styles.container, { height: height + (showLabels ? 30 : 0) }]}>
      {/* Y-axis labels */}
      {showGrid && (
        <View style={styles.yAxis}>
          <Text style={styles.yLabel}>100%</Text>
          <Text style={styles.yLabel}>50%</Text>
          <Text style={styles.yLabel}>0%</Text>
        </View>
      )}

      {/* Chart area */}
      <View style={[styles.chartArea, { height }]}>
        {/* Grid lines */}
        {showGrid && (
          <>
            <View style={[styles.gridLine, { top: 0 }]} />
            <View style={[styles.gridLine, { top: '25%' }]} />
            <View style={[styles.gridLine, { top: '50%' }]} />
            <View style={[styles.gridLine, { top: '75%' }]} />
            <View style={[styles.gridLine, { bottom: 0 }]} />
            {/* Danger zone */}
            <View style={[styles.dangerZone, { height: '15%' }]} />
            {/* Warning zone */}
            <View style={[styles.warningZone, { height: '20%', bottom: '15%' }]} />
          </>
        )}

        {/* Bars */}
        <View style={styles.barsContainer}>
          {chartData.bars.map((bar, i) => (
            <View key={i} style={styles.barWrapper}>
              <View
                style={[
                  styles.bar,
                  {
                    height: `${Math.max(bar.heightRatio * 100, 2)}%`,
                    width: barWidth,
                    backgroundColor: bar.isLast ? color : `${bar.color}90`,
                    borderTopLeftRadius: 2,
                    borderTopRightRadius: 2,
                  },
                  bar.isLast && {
                    borderWidth: 1,
                    borderColor: color,
                    backgroundColor: `${color}40`,
                  },
                ]}
              />
              {/* Delta indicator */}
              {bar.delta != null && bar.delta > 0 && !bar.isLast && bar.eventType !== 'INITIAL' && (
                <View style={[styles.deltaDot, { backgroundColor: bar.color }]} />
              )}
            </View>
          ))}
        </View>

        {/* Current value line */}
        {data.length > 0 && (
          <View
            style={[
              styles.currentLine,
              {
                bottom: `${data[data.length - 1].percent}%`,
                borderColor: `${color}60`,
              },
            ]}
          />
        )}
      </View>

      {/* X-axis labels */}
      {showLabels && (
        <View style={styles.xAxis}>
          {chartData.timeLabels.map((tl, i) => (
            <Text
              key={i}
              style={[
                styles.xLabel,
                i === 0 && { textAlign: 'left' },
                i === chartData.timeLabels.length - 1 && { textAlign: 'right' },
              ]}
            >
              {tl.label}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Mini Sparkline variant ───────────────────────────────────

export function MiniSparkline({
  data,
  color,
  width = 60,
  height = 20,
}: {
  data: ResourceHistoryPoint[];
  color: string;
  width?: number;
  height?: number;
}) {
  if (data.length < 2) {
    return (
      <View style={{ width, height, justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ width: width * 0.8, height: 1, backgroundColor: `${color}30` }} />
      </View>
    );
  }

  const barW = Math.max(2, Math.floor(width / data.length) - 1);

  return (
    <View style={{ width, height, flexDirection: 'row', alignItems: 'flex-end', gap: 1 }}>
      {data.slice(-Math.floor(width / (barW + 1))).map((point, i) => (
        <View
          key={i}
          style={{
            width: barW,
            height: Math.max(1, (point.percent / 100) * height),
            backgroundColor: point.percent > 35 ? `${color}80` : point.percent >= 15 ? '#C48A2C80' : '#E5393580',
            borderTopLeftRadius: 1,
            borderTopRightRadius: 1,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  emptyText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  emptySubtext: {
    fontSize: 9,
    color: TACTICAL.textMuted,
    opacity: 0.6,
  },
  yAxis: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 30,
    width: 30,
    justifyContent: 'space-between',
    zIndex: 1,
  },
  yLabel: {
    fontSize: 7,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
    opacity: 0.6,
  },
  chartArea: {
    flex: 1,
    marginLeft: 32,
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(62,79,60,0.3)',
    position: 'relative',
    overflow: 'hidden',
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(62,79,60,0.15)',
  },
  dangerZone: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(229,57,53,0.04)',
  },
  warningZone: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: 'rgba(196,138,44,0.03)',
  },
  barsContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-evenly',
    paddingHorizontal: 4,
    paddingBottom: 1,
  },
  barWrapper: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    flex: 1,
    maxWidth: 24,
  },
  bar: {
    minHeight: 2,
  },
  deltaDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    marginTop: 2,
  },
  currentLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed',
  },
  xAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginLeft: 32,
    marginTop: 4,
    paddingHorizontal: 2,
  },
  xLabel: {
    fontSize: 7,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
    opacity: 0.6,
    flex: 1,
    textAlign: 'center',
  },
});



