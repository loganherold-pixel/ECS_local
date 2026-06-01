import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { TACTICAL } from '../../lib/theme';
import { buildNavigateRouteConfidenceSummary } from '../../lib/remote/routeConfidenceSummary';
import type { RouteConfidenceStatus } from '../../lib/remote/types';
import { formatRemotenessDistance } from '../../lib/remotenessDestinations';
import { remotenessStore } from '../../lib/remotenessStore';
import type { RemotenessIndexOutput } from '../../lib/remotenessTypes';
import {
  getWidgetToneColor,
  WidgetCompactRow,
  type WidgetTone,
} from './WidgetChrome';

function useRouteConfidenceInputs() {
  const [, setRevision] = useState(0);

  useEffect(() => {
    const unsubscribe = remotenessStore.subscribe(() => {
      setRevision((current) => current + 1);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    remotenessStore.start();
  }, []);

  return {
    index: remotenessStore.getIndex(),
    legacy: remotenessStore.get(),
  };
}

function toneForStatus(status: RouteConfidenceStatus | 'pending'): WidgetTone {
  switch (status) {
    case 'green':
      return 'good';
    case 'amber':
      return 'attention';
    case 'red':
      return 'critical';
    case 'pending':
    default:
      return 'unavailable';
  }
}

function labelForStatus(status: RouteConfidenceStatus | 'pending'): string {
  switch (status) {
    case 'green':
      return 'READY';
    case 'amber':
      return 'WATCH';
    case 'red':
      return 'PREPARE';
    case 'pending':
    default:
      return 'PENDING';
  }
}

function hasCachedRemoteContext(index: RemotenessIndexOutput | null): boolean {
  if (!index) return false;
  return [
    index.proximity.nearestPavedRoad.sourceState,
    index.proximity.nearestTown.sourceState,
    index.proximity.nearestFuelStation.sourceState,
  ].some((sourceState) => sourceState === 'cache');
}

function formatSignalLine(index: RemotenessIndexOutput | null, nextSignalMi?: number): string {
  if (nextSignalMi != null && Number.isFinite(nextSignalMi)) {
    return `Signal in ${formatRemotenessDistance(nextSignalMi)}`;
  }

  const forecast = index?.forecast;
  if (forecast?.available && forecast.peakScore >= 76) {
    return `High remoteness in ${formatRemotenessDistance(forecast.peakDistanceMi)}`;
  }

  if (forecast?.available && forecast.advisory) {
    return forecast.advisory;
  }

  return index ? 'Signal forecast nominal' : 'Signal forecast pending';
}

function buildWidgetModel(index: RemotenessIndexOutput | null, cacheReady: boolean) {
  if (!index || index.gpsLat == null || index.gpsLon == null) {
    return {
      confidenceLabel: '--%',
      status: 'pending' as const,
      tone: toneForStatus('pending'),
      statusLabel: labelForStatus('pending'),
      headline: 'Route confidence pending',
      signalLine: 'Signal forecast pending',
    };
  }

  const summary = buildNavigateRouteConfidenceSummary({
    remotenessScore: index.score,
    cacheReady,
    powerHours: null,
    weatherRisk: 0,
    teamCount: 1,
  });

  return {
    confidenceLabel: `${summary.confidence}%`,
    status: summary.status,
    tone: toneForStatus(summary.status),
    statusLabel: labelForStatus(summary.status),
    headline: summary.headline,
    signalLine: formatSignalLine(index, summary.nextSignalMi),
  };
}

export function RouteConfidenceCompact() {
  const { index, legacy } = useRouteConfidenceInputs();
  const model = useMemo(
    () => buildWidgetModel(index, legacy.signals.cacheReady || hasCachedRemoteContext(index)),
    [index, legacy.signals.cacheReady],
  );

  return (
    <WidgetCompactRow
      title="Confidence"
      summary={`${model.confidenceLabel} | ${model.signalLine}`}
      tone={model.tone}
      status={model.statusLabel}
      statusTone={model.tone}
    />
  );
}

export function RouteConfidenceWidget() {
  const { index, legacy } = useRouteConfidenceInputs();
  const model = useMemo(
    () => buildWidgetModel(index, legacy.signals.cacheReady || hasCachedRemoteContext(index)),
    [index, legacy.signals.cacheReady],
  );
  const toneColor = getWidgetToneColor(model.tone);

  return (
    <View style={styles.cardBody}>
      <View style={styles.headerRow}>
        <Text style={styles.kicker} numberOfLines={1}>
          Route Confidence
        </Text>
        <View style={[styles.statusPill, { borderColor: `${toneColor}55` }]}>
          <Text style={[styles.statusText, { color: toneColor }]} numberOfLines={1}>
            {model.statusLabel}
          </Text>
        </View>
      </View>

      <View style={styles.metricRow}>
        <Text style={[styles.confidenceValue, { color: toneColor }]} numberOfLines={1}>
          {model.confidenceLabel}
        </Text>
        <View style={styles.summaryStack}>
          <Text style={styles.headlineText} numberOfLines={1}>
            {model.headline}
          </Text>
          <Text style={styles.signalText} numberOfLines={1}>
            {model.signalLine}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardBody: {
    flex: 1,
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 2,
  },
  headerRow: {
    minHeight: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  kicker: {
    flex: 1,
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  statusPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  statusText: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  confidenceValue: {
    minWidth: 48,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '900',
    fontFamily: 'Courier',
  },
  summaryStack: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  headlineText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
    color: TACTICAL.text,
  },
  signalText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '700',
    color: TACTICAL.textMuted,
  },
});
