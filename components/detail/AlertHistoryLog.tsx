/**
 * AlertHistoryLog
 *
 * Displays a scrollable log of past tilt alert events with timestamps,
 * severity levels, angle data, and GPS coordinates when available.
 */
import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { TACTICAL } from '../../lib/theme';
import { hapticCommand } from '../../lib/haptics';
import {
  type TiltAlertEvent,
  formatAlertTimestamp,
  formatCoordinate,
} from '../../lib/tiltAlertStore';

// ── Colors ─────────────────────────────────────────────────────
const WARN_COLOR = '#E67E22';
const CRIT_COLOR = '#C0392B';
const MUTED = TACTICAL.textMuted;

interface Props {
  history: TiltAlertEvent[];
  onClear: () => void;
  onClose: () => void;
}

function getSeverityColor(severity: string): string {
  return severity === 'CRITICAL' ? CRIT_COLOR : WARN_COLOR;
}

function AlertEventRow({ event }: { event: TiltAlertEvent }) {
  const color = getSeverityColor(event.severity);
  const hasGPS = event.latitude != null && event.longitude != null;

  return (
    <View style={sty.eventRow}>
      {/* Severity indicator bar */}
      <View style={[sty.severityBar, { backgroundColor: color }]} />

      <View style={sty.eventContent}>
        {/* Top row: severity + axis + timestamp */}
        <View style={sty.eventTopRow}>
          <View style={sty.eventBadgeRow}>
            <View style={[sty.severityBadge, { backgroundColor: `${color}18`, borderColor: `${color}40` }]}>
              <View style={[sty.severityDot, { backgroundColor: color }]} />
              <Text style={[sty.severityText, { color }]}>{event.severity}</Text>
            </View>
            <View style={sty.axisBadge}>
              <Text style={sty.axisText}>{event.axis}</Text>
            </View>
          </View>
          <Text style={sty.timestampText}>
            {formatAlertTimestamp(event.timestamp)}
          </Text>
        </View>

        {/* Angle data */}
        <View style={sty.angleRow}>
          <Text style={sty.angleLabel}>Angle:</Text>
          <Text style={[sty.angleValue, { color }]}>
            {event.angleDeg >= 0 ? '+' : ''}{event.angleDeg.toFixed(1)}°
          </Text>
          <Text style={sty.thresholdLabel}>Limit:</Text>
          <Text style={sty.thresholdValue}>
            {event.thresholdDeg.toFixed(1)}°
          </Text>
        </View>

        {/* GPS coordinates */}
        <View style={sty.gpsRow}>
          <View style={sty.gpsIcon}>
            <View style={sty.gpsDot} />
            <View style={sty.gpsRing} />
          </View>
          <Text style={[sty.gpsText, !hasGPS && sty.gpsTextMuted]}>
            {formatCoordinate(event.latitude, event.longitude)}
          </Text>
          {event.scenarioName && (
            <View style={sty.demoBadge}>
              <Text style={sty.demoBadgeText}>DEMO</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

export default function AlertHistoryLog({ history, onClear, onClose }: Props) {
  const sortedHistory = [...history].reverse(); // newest first
  const warningCount = history.filter((e) => e.severity === 'WARNING').length;
  const criticalCount = history.filter((e) => e.severity === 'CRITICAL').length;

  const handleClear = useCallback(() => {
    hapticCommand();
    onClear();
  }, [onClear]);

  return (
    <View style={sty.container}>
      {/* Header */}
      <View style={sty.header}>
        <View style={sty.headerLeft}>
          <View style={sty.logIconWrap}>
            <View style={sty.logLine1} />
            <View style={sty.logLine2} />
            <View style={sty.logLine3} />
          </View>
          <Text style={sty.headerTitle}>ALERT HISTORY</Text>
          <View style={sty.countBadge}>
            <Text style={sty.countText}>{history.length}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={sty.closeBtn}
          onPress={onClose}
          activeOpacity={0.7}>
          <View style={sty.closeX1} />
          <View style={sty.closeX2} />
        </TouchableOpacity>
      </View>

      {/* Summary bar */}
      {history.length > 0 && (
        <View style={sty.summaryBar}>
          <View style={sty.summaryItem}>
            <View style={[sty.summaryDot, { backgroundColor: WARN_COLOR }]} />
            <Text style={sty.summaryLabel}>WARNINGS</Text>
            <Text style={[sty.summaryValue, { color: WARN_COLOR }]}>
              {warningCount}
            </Text>
          </View>
          <View style={sty.summaryDivider} />
          <View style={sty.summaryItem}>
            <View style={[sty.summaryDot, { backgroundColor: CRIT_COLOR }]} />
            <Text style={sty.summaryLabel}>CRITICAL</Text>
            <Text style={[sty.summaryValue, { color: CRIT_COLOR }]}>
              {criticalCount}
            </Text>
          </View>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={sty.clearBtn}
            onPress={handleClear}
            activeOpacity={0.7}>
            <View style={sty.trashIcon}>
              <View style={sty.trashLid} />
              <View style={sty.trashBody} />
            </View>
            <Text style={sty.clearBtnText}>CLEAR</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Event list */}
      {history.length === 0 ? (
        <View style={sty.emptyState}>
          <View style={sty.emptyIcon}>
            <View style={sty.emptyCheckShort} />
            <View style={sty.emptyCheckLong} />
          </View>
          <Text style={sty.emptyTitle}>NO ALERTS RECORDED</Text>
          <Text style={sty.emptyDesc}>
            Alert events will appear here when tilt thresholds are exceeded.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={sty.eventList}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled>
          {sortedHistory.map((event) => (
            <AlertEventRow key={event.id} event={event} />
          ))}
          <View style={{ height: 8 }} />
        </ScrollView>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────
const sty = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(230, 126, 34, 0.20)',
    marginTop: 4,
    marginBottom: 6,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.18)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  logIconWrap: {
    width: 12,
    height: 12,
    justifyContent: 'center',
    gap: 2,
  },
  logLine1: {
    width: 10,
    height: 1.5,
    backgroundColor: TACTICAL.amber,
    borderRadius: 0.75,
  },
  logLine2: {
    width: 8,
    height: 1.5,
    backgroundColor: TACTICAL.amber,
    borderRadius: 0.75,
    opacity: 0.7,
  },
  logLine3: {
    width: 6,
    height: 1.5,
    backgroundColor: TACTICAL.amber,
    borderRadius: 0.75,
    opacity: 0.4,
  },
  headerTitle: {
    fontSize: 9,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },
  countBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(196, 138, 44, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.25)',
  },
  countText: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.amber,
    fontFamily: 'Courier',
  },
  closeBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeX1: {
    position: 'absolute',
    width: 10,
    height: 1.5,
    backgroundColor: MUTED,
    transform: [{ rotate: '45deg' }],
  },
  closeX2: {
    position: 'absolute',
    width: 10,
    height: 1.5,
    backgroundColor: MUTED,
    transform: [{ rotate: '-45deg' }],
  },

  // ── Summary bar ──────────────────────────────────────────
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.12)',
    gap: 10,
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  summaryDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  summaryLabel: {
    fontSize: 7,
    fontWeight: '800',
    color: MUTED,
    letterSpacing: 0.8,
  },
  summaryValue: {
    fontSize: 10,
    fontWeight: '900',
    fontFamily: 'Courier',
  },
  summaryDivider: {
    width: 1,
    height: 14,
    backgroundColor: 'rgba(62, 79, 60, 0.20)',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
    backgroundColor: 'rgba(192, 57, 43, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(192, 57, 43, 0.20)',
  },
  clearBtnText: {
    fontSize: 7,
    fontWeight: '900',
    color: CRIT_COLOR,
    letterSpacing: 0.8,
  },
  trashIcon: {
    width: 8,
    height: 10,
    alignItems: 'center',
  },
  trashLid: {
    width: 8,
    height: 2,
    backgroundColor: CRIT_COLOR,
    borderRadius: 1,
  },
  trashBody: {
    width: 6,
    height: 6,
    borderBottomLeftRadius: 1,
    borderBottomRightRadius: 1,
    backgroundColor: CRIT_COLOR,
    opacity: 0.6,
    marginTop: 1,
  },

  // ── Event list ───────────────────────────────────────────
  eventList: {
    maxHeight: 300,
    paddingHorizontal: 8,
    paddingTop: 6,
  },
  eventRow: {
    flexDirection: 'row',
    marginBottom: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
  },
  severityBar: {
    width: 3,
  },
  eventContent: {
    flex: 1,
    padding: 8,
    gap: 4,
  },
  eventTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eventBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  severityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
    borderWidth: 1,
  },
  severityDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  severityText: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  axisBadge: {
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  axisText: {
    fontSize: 7,
    fontWeight: '900',
    color: MUTED,
    letterSpacing: 0.8,
  },
  timestampText: {
    fontSize: 8,
    fontWeight: '700',
    color: MUTED,
    fontFamily: 'Courier',
    letterSpacing: 0.3,
  },

  // ── Angle data ───────────────────────────────────────────
  angleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  angleLabel: {
    fontSize: 8,
    fontWeight: '700',
    color: MUTED,
    letterSpacing: 0.3,
  },
  angleValue: {
    fontSize: 10,
    fontWeight: '900',
    fontFamily: 'Courier',
  },
  thresholdLabel: {
    fontSize: 8,
    fontWeight: '700',
    color: MUTED,
    letterSpacing: 0.3,
    marginLeft: 6,
  },
  thresholdValue: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.text,
    fontFamily: 'Courier',
    opacity: 0.6,
  },

  // ── GPS row ──────────────────────────────────────────────
  gpsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  gpsIcon: {
    width: 8,
    height: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gpsDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: MUTED,
  },
  gpsRing: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 3.5,
    borderWidth: 1,
    borderColor: MUTED,
    opacity: 0.4,
  },
  gpsText: {
    fontSize: 8,
    fontWeight: '600',
    color: TACTICAL.text,
    fontFamily: 'Courier',
    letterSpacing: 0.3,
    opacity: 0.7,
  },
  gpsTextMuted: {
    color: MUTED,
    opacity: 0.4,
  },
  demoBadge: {
    marginLeft: 'auto',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: 'rgba(91, 141, 239, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(91, 141, 239, 0.25)',
  },
  demoBadgeText: {
    fontSize: 6,
    fontWeight: '900',
    color: '#5B8DEF',
    letterSpacing: 1,
  },

  // ── Empty state ──────────────────────────────────────────
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    gap: 6,
  },
  emptyIcon: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyCheckShort: {
    position: 'absolute',
    width: 6,
    height: 2,
    backgroundColor: '#4CAF50',
    bottom: 4,
    left: 2,
    transform: [{ rotate: '45deg' }],
    borderRadius: 1,
  },
  emptyCheckLong: {
    position: 'absolute',
    width: 12,
    height: 2,
    backgroundColor: '#4CAF50',
    bottom: 6,
    right: 1,
    transform: [{ rotate: '-45deg' }],
    borderRadius: 1,
  },
  emptyTitle: {
    fontSize: 9,
    fontWeight: '900',
    color: MUTED,
    letterSpacing: 1.2,
  },
  emptyDesc: {
    fontSize: 9,
    fontWeight: '500',
    color: MUTED,
    textAlign: 'center',
    lineHeight: 13,
    opacity: 0.6,
  },
});



