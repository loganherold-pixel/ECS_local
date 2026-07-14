import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { TACTICAL, TYPO } from '../../lib/theme';
import {
  routeConfidenceTimelineItemCopy,
  type RouteConfidenceTimeline,
  type RouteConfidenceTimelineItem,
} from '../../lib/routeContext';

export type RouteConfidenceTimelinePanelProps = {
  timeline: RouteConfidenceTimeline | null;
  selectedItemId: string | null;
  onSelectItem: (item: RouteConfidenceTimelineItem) => void;
  formatMeasure: (value: number | null | undefined) => string;
};

/** Presents Route Context output without selecting or changing a route. */
export function RouteConfidenceTimelinePanel({
  timeline,
  selectedItemId,
  onSelectItem,
  formatMeasure,
}: RouteConfidenceTimelinePanelProps) {
  const selectedItem = timeline?.items.find((item) => item.id === selectedItemId) ?? timeline?.items[0] ?? null;
  const timelineUnavailable = !timeline || timeline.completeness === 'unavailable';
  const timelineLimited = timeline?.completeness === 'partial' || timeline?.completeness === 'source_limited';
  const notableOnly = timeline?.coverageMode === 'notable_spans_only';
  return (
    <View style={styles.routeConfidenceTimelinePanel}>
      <View style={styles.routeConfidenceTimelineHeader}>
        <View style={styles.routeConfidenceTimelineTitleBlock}>
          <Text style={styles.intelSectionTitle}>Route Confidence Timeline</Text>
          <Text style={styles.routeConfidenceTimelineSubtitle}>What certainty changes along this route?</Text>
        </View>
        <View style={styles.routeConfidenceTimelineBadge}>
          <Text style={styles.routeConfidenceTimelineBadgeText}>FEATURE-FLAGGED</Text>
        </View>
      </View>
      <Text style={styles.routeConfidenceTimelineSafetyCopy}>
        Unknown/low confidence means uncertainty, not confirmed danger.
      </Text>
      <Text style={styles.routeConfidenceTimelineSafetyCopy}>
        Timeline diagnostics do not affect route readiness or route choice.
      </Text>
      {timelineLimited ? (
        <Text style={styles.routeConfidenceTimelineSafetyCopy}>Timeline limited by available source data.</Text>
      ) : null}
      {notableOnly ? (
        <Text style={styles.routeConfidenceTimelineSafetyCopy}>Showing notable confidence changes only.</Text>
      ) : null}
      {timeline && timeline.items.length > 0 ? (
        <>
          <View style={styles.routeConfidenceTimelineTrack}>
            {timeline.items.map((item) => {
              const color = routeConfidenceTimelineTone(item);
              const selected = item.id === selectedItem?.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.routeConfidenceTimelineSpan,
                    {
                      flexGrow: Math.max(1, item.endMeasure - item.startMeasure),
                      borderColor: selected ? color : `${color}55`,
                      backgroundColor: `${color}${selected ? '44' : '24'}`,
                    },
                  ]}
                  activeOpacity={0.82}
                  onPress={() => onSelectItem(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Route confidence timeline segment ${item.label}`}
                />
              );
            })}
          </View>
          {selectedItem ? (
            <View style={styles.routeConfidenceTimelineDetail}>
              <Text style={styles.intelPrimaryLine}>{selectedItem.label}</Text>
              <Text style={styles.intelSecondaryLine}>{routeConfidenceTimelineItemCopy(selectedItem)}</Text>
              <Text style={styles.intelCalloutText}>
                {formatMeasure(selectedItem.startMeasure)} to {formatMeasure(selectedItem.endMeasure)} - {selectedItem.primaryDriver.category.replace(/_/g, ' ')}
              </Text>
              <Text style={styles.intelCalloutText}>
                Source: {routeConfidenceTimelineSourceName(selectedItem.primaryDriver.source)}
              </Text>
              <Text style={styles.intelCalloutText}>
                Freshness: {selectedItem.primaryDriver.source.freshness.replace(/_/g, ' ')}
              </Text>
              <Text style={styles.intelCalloutText}>
                Observed: {routeConfidenceTimelineTimestampLabel(selectedItem.primaryDriver.source.observedAt)}
              </Text>
              <Text style={styles.intelCalloutText}>
                Generated: {routeConfidenceTimelineTimestampLabel(selectedItem.primaryDriver.source.generatedAt)}
              </Text>
              <Text style={styles.intelCalloutText}>
                Expires: {routeConfidenceTimelineTimestampLabel(selectedItem.primaryDriver.source.expiresAt)}
              </Text>
              <Text style={styles.intelCalloutText}>
                Contributing drivers: {routeConfidenceTimelineDriverSummary(selectedItem)}
              </Text>
              {routeConfidenceTimelineHasLimitedSource(selectedItem) ? (
                <Text style={styles.intelCalloutText}>Stale/unavailable source metadata present.</Text>
              ) : null}
              {selectedItem.drivers.slice(0, 3).map((driver) => (
                <Text key={`${selectedItem.id}:${driver.id}`} style={styles.intelCalloutText}>
                  {driver.label}: {driver.confidenceLevel} confidence / {driver.conditionState.replace(/_/g, ' ')}
                </Text>
              ))}
            </View>
          ) : null}
        </>
      ) : (
        <Text style={styles.intelEmptyText}>
          {timelineUnavailable ? 'Route confidence timeline unavailable.' : 'No notable confidence changes from available sources.'}
        </Text>
      )}
    </View>
  );
}

function routeConfidenceTimelineTone(item: RouteConfidenceTimelineItem): string {
  if (item.conditionState === 'known_risky') return '#EF5350';
  if (item.confidenceLevel === 'low' || item.confidenceLevel === 'unknown' || item.conditionState === 'unknown') {
    return TACTICAL.amber;
  }
  if (item.confidenceLevel === 'medium') return '#65D4FF';
  return '#66BB6A';
}

function routeConfidenceTimelineString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function routeConfidenceTimelineSourceName(
  source: RouteConfidenceTimelineItem['primaryDriver']['source'] | null | undefined,
): string {
  const label = routeConfidenceTimelineString(source?.label) ?? routeConfidenceTimelineString(source?.sourceType);
  return label ? label.replace(/_/g, ' ') : 'Unknown source';
}

function routeConfidenceTimelineTimestampLabel(value: string | null | undefined): string {
  if (!value) return 'unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function routeConfidenceTimelineDriverSummary(item: RouteConfidenceTimelineItem): string {
  const drivers = item.contributingDrivers?.length ? item.contributingDrivers : item.drivers;
  const labels = Array.from(new Set(
    drivers
      .map((driver) => driver.category.replace(/_/g, ' '))
      .filter(Boolean),
  ));
  return labels.length ? labels.join(', ') : 'No contributing drivers';
}

function routeConfidenceTimelineHasLimitedSource(item: RouteConfidenceTimelineItem): boolean {
  const sources = item.sources?.length ? item.sources : item.sourceFreshness;
  return sources.some((source) =>
    source.freshness === 'stale' ||
    source.freshness === 'expired' ||
    source.freshness === 'missing' ||
    source.freshness === 'unavailable',
  );
}

const styles = StyleSheet.create({
  routeConfidenceTimelinePanel: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.14)',
    backgroundColor: 'rgba(12,16,20,0.9)',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  routeConfidenceTimelineHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  routeConfidenceTimelineTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  routeConfidenceTimelineSubtitle: {
    ...TYPO.B2,
    color: TACTICAL.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  routeConfidenceTimelineBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(101,212,255,0.3)',
    backgroundColor: 'rgba(101,212,255,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  routeConfidenceTimelineBadgeText: {
    ...TYPO.U2,
    color: '#65D4FF',
    fontSize: 7.5,
    letterSpacing: 1,
  },
  routeConfidenceTimelineSafetyCopy: {
    ...TYPO.B2,
    color: TACTICAL.textMuted,
    fontSize: 10.5,
    lineHeight: 15,
  },
  routeConfidenceTimelineTrack: {
    minHeight: 28,
    flexDirection: 'row',
    gap: 4,
  },
  routeConfidenceTimelineSpan: {
    minWidth: 18,
    borderRadius: 8,
    borderWidth: 1,
  },
  routeConfidenceTimelineDetail: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 5,
  },
  intelSectionTitle: {
    ...TYPO.U2,
    color: TACTICAL.amber,
    fontSize: 9,
    letterSpacing: 2,
  },
  intelPrimaryLine: {
    ...TYPO.T3,
    color: TACTICAL.text,
    fontSize: 13,
    lineHeight: 18,
  },
  intelSecondaryLine: {
    ...TYPO.B2,
    color: TACTICAL.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  intelCalloutText: {
    ...TYPO.B2,
    color: '#F3D28A',
    fontSize: 11,
    lineHeight: 16,
  },
  intelEmptyText: {
    ...TYPO.B2,
    color: TACTICAL.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
});

