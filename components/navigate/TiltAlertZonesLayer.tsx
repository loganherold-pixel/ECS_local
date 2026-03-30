/**
 * TiltAlertZonesLayer — Map overlay for tilt alert GPS markers
 *
 * Reads alert history from tiltAlertStore, filters events with GPS coords,
 * converts them to map markers (orange=warning, red=critical), and provides
 * a detail modal for tapped markers.
 *
 * Also provides a cluster summary when multiple alerts occurred near the
 * same location, helping identify dangerous terrain sections.
 */
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, TYPO } from '../../lib/theme';
import { hapticMicro, hapticCommand } from '../../lib/haptics';
import {
  loadAlertHistory,
  formatAlertTimestamp,
  formatCoordinate,
  type TiltAlertEvent,
  type AlertSeverity,
} from '../../lib/tiltAlertStore';

// ── Tilt Alert Marker Type ─────────────────────────────────────
export interface TiltAlertMarker {
  id: string;
  lat: number;
  lng: number;
  severity: AlertSeverity;
  axis: string;
  angleDeg: number;
  thresholdDeg: number;
  timestamp: number;
  color: string;
}

// ── Colors ─────────────────────────────────────────────────────
const WARN_COLOR = '#E67E22';
const CRIT_COLOR = '#E74C3C';
const WARN_BG = 'rgba(230, 126, 34, 0.12)';
const CRIT_BG = 'rgba(231, 76, 60, 0.12)';
const MUTED = TACTICAL.textMuted;

// ── Cluster helpers ────────────────────────────────────────────
interface AlertCluster {
  lat: number;
  lng: number;
  events: TiltAlertEvent[];
  warningCount: number;
  criticalCount: number;
  maxSeverity: AlertSeverity;
}

function clusterAlerts(events: TiltAlertEvent[], radiusDeg: number = 0.0005): AlertCluster[] {
  const clusters: AlertCluster[] = [];
  const used = new Set<number>();

  for (let i = 0; i < events.length; i++) {
    if (used.has(i)) continue;
    const e = events[i];
    const cluster: AlertCluster = {
      lat: e.latitude!,
      lng: e.longitude!,
      events: [e],
      warningCount: e.severity === 'WARNING' ? 1 : 0,
      criticalCount: e.severity === 'CRITICAL' ? 1 : 0,
      maxSeverity: e.severity,
    };
    used.add(i);

    for (let j = i + 1; j < events.length; j++) {
      if (used.has(j)) continue;
      const e2 = events[j];
      const dlat = Math.abs(e.latitude! - e2.latitude!);
      const dlng = Math.abs(e.longitude! - e2.longitude!);
      if (dlat < radiusDeg && dlng < radiusDeg) {
        cluster.events.push(e2);
        if (e2.severity === 'WARNING') cluster.warningCount++;
        else cluster.criticalCount++;
        if (e2.severity === 'CRITICAL') cluster.maxSeverity = 'CRITICAL';
        used.add(j);
      }
    }

    // Average position for cluster center
    if (cluster.events.length > 1) {
      let sumLat = 0, sumLng = 0;
      for (const ce of cluster.events) {
        sumLat += ce.latitude!;
        sumLng += ce.longitude!;
      }
      cluster.lat = sumLat / cluster.events.length;
      cluster.lng = sumLng / cluster.events.length;
    }

    clusters.push(cluster);
  }

  return clusters;
}

// ── Hook: useTiltAlertMarkers ──────────────────────────────────
export function useTiltAlertMarkers(visible: boolean): {
  markers: TiltAlertMarker[];
  clusters: AlertCluster[];
  totalCount: number;
  gpsCount: number;
  reload: () => void;
} {
  const [history, setHistory] = useState<TiltAlertEvent[]>([]);

  const reload = useCallback(() => {
    const h = loadAlertHistory();
    setHistory(h);
  }, []);

  useEffect(() => {
    if (visible) reload();
  }, [visible, reload]);

  const gpsEvents = useMemo(() => {
    return history.filter(e => e.latitude != null && e.longitude != null);
  }, [history]);

  const markers: TiltAlertMarker[] = useMemo(() => {
    if (!visible) return [];
    return gpsEvents.map(e => ({
      id: e.id,
      lat: e.latitude!,
      lng: e.longitude!,
      severity: e.severity,
      axis: e.axis,
      angleDeg: e.angleDeg,
      thresholdDeg: e.thresholdDeg,
      timestamp: e.timestamp,
      color: e.severity === 'CRITICAL' ? CRIT_COLOR : WARN_COLOR,
    }));
  }, [gpsEvents, visible]);

  const clusters = useMemo(() => {
    if (!visible || gpsEvents.length === 0) return [];
    return clusterAlerts(gpsEvents);
  }, [gpsEvents, visible]);

  return {
    markers,
    clusters,
    totalCount: history.length,
    gpsCount: gpsEvents.length,
    reload,
  };
}

// ── Detail Modal ───────────────────────────────────────────────
interface DetailModalProps {
  visible: boolean;
  event: TiltAlertEvent | null;
  cluster: AlertCluster | null;
  onClose: () => void;
}

export function TiltAlertDetailModal({ visible, event, cluster, onClose }: DetailModalProps) {
  const events = cluster ? cluster.events.sort((a, b) => b.timestamp - a.timestamp) : event ? [event] : [];
  const isCluster = cluster != null && cluster.events.length > 1;

  if (events.length === 0) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={sty.modalOverlay}>
        <View style={sty.modalContainer}>
          {/* Header */}
          <View style={sty.modalHeader}>
            <View style={sty.modalHeaderLeft}>
              <View style={[sty.modalHeaderIcon, {
                backgroundColor: isCluster
                  ? (cluster!.maxSeverity === 'CRITICAL' ? CRIT_BG : WARN_BG)
                  : (events[0].severity === 'CRITICAL' ? CRIT_BG : WARN_BG),
                borderColor: isCluster
                  ? (cluster!.maxSeverity === 'CRITICAL' ? CRIT_COLOR + '40' : WARN_COLOR + '40')
                  : (events[0].severity === 'CRITICAL' ? CRIT_COLOR + '40' : WARN_COLOR + '40'),
              }]}>
                <Ionicons
                  name="warning-outline"
                  size={16}
                  color={isCluster
                    ? (cluster!.maxSeverity === 'CRITICAL' ? CRIT_COLOR : WARN_COLOR)
                    : (events[0].severity === 'CRITICAL' ? CRIT_COLOR : WARN_COLOR)
                  }
                />
              </View>
              <View>
                <Text style={sty.modalTitle}>
                  {isCluster ? 'TILT ALERT ZONE' : 'TILT ALERT'}
                </Text>
                <Text style={sty.modalSubtitle}>
                  {isCluster
                    ? `${cluster!.events.length} alerts at this location`
                    : `${events[0].axis} ${events[0].severity}`
                  }
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={sty.modalCloseBtn}
              onPress={onClose}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={18} color={MUTED} />
            </TouchableOpacity>
          </View>

          {/* Cluster summary */}
          {isCluster && (
            <View style={sty.clusterSummary}>
              <View style={sty.clusterStat}>
                <View style={[sty.clusterDot, { backgroundColor: WARN_COLOR }]} />
                <Text style={sty.clusterStatLabel}>WARNINGS</Text>
                <Text style={[sty.clusterStatValue, { color: WARN_COLOR }]}>
                  {cluster!.warningCount}
                </Text>
              </View>
              <View style={sty.clusterDivider} />
              <View style={sty.clusterStat}>
                <View style={[sty.clusterDot, { backgroundColor: CRIT_COLOR }]} />
                <Text style={sty.clusterStatLabel}>CRITICAL</Text>
                <Text style={[sty.clusterStatValue, { color: CRIT_COLOR }]}>
                  {cluster!.criticalCount}
                </Text>
              </View>
              <View style={{ flex: 1 }} />
              <View style={sty.dangerZoneBadge}>
                <Ionicons name="alert-circle-outline" size={10} color={CRIT_COLOR} />
                <Text style={sty.dangerZoneText}>DANGER ZONE</Text>
              </View>
            </View>
          )}

          {/* GPS location */}
          <View style={sty.locationRow}>
            <Ionicons name="location-outline" size={12} color={TACTICAL.amber} />
            <Text style={sty.locationText}>
              {formatCoordinate(events[0].latitude, events[0].longitude)}
            </Text>
          </View>

          {/* Event list */}
          <ScrollView
            style={sty.eventScroll}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            {events.map((evt, idx) => (
              <View key={evt.id} style={sty.eventCard}>
                <View style={[sty.eventSeverityBar, {
                  backgroundColor: evt.severity === 'CRITICAL' ? CRIT_COLOR : WARN_COLOR,
                }]} />
                <View style={sty.eventBody}>
                  <View style={sty.eventTopRow}>
                    <View style={[sty.severityBadge, {
                      backgroundColor: evt.severity === 'CRITICAL' ? CRIT_BG : WARN_BG,
                      borderColor: evt.severity === 'CRITICAL' ? CRIT_COLOR + '40' : WARN_COLOR + '40',
                    }]}>
                      <Text style={[sty.severityBadgeText, {
                        color: evt.severity === 'CRITICAL' ? CRIT_COLOR : WARN_COLOR,
                      }]}>
                        {evt.severity}
                      </Text>
                    </View>
                    <View style={sty.axisBadge}>
                      <Text style={sty.axisBadgeText}>{evt.axis}</Text>
                    </View>
                    <View style={{ flex: 1 }} />
                    <Text style={sty.eventTimestamp}>
                      {formatAlertTimestamp(evt.timestamp)}
                    </Text>
                  </View>

                  <View style={sty.eventDataRow}>
                    <View style={sty.dataItem}>
                      <Text style={sty.dataLabel}>ANGLE</Text>
                      <Text style={[sty.dataValue, {
                        color: evt.severity === 'CRITICAL' ? CRIT_COLOR : WARN_COLOR,
                      }]}>
                        {evt.angleDeg >= 0 ? '+' : ''}{evt.angleDeg.toFixed(1)}°
                      </Text>
                    </View>
                    <View style={sty.dataItem}>
                      <Text style={sty.dataLabel}>THRESHOLD</Text>
                      <Text style={sty.dataValueMuted}>
                        {evt.thresholdDeg.toFixed(1)}°
                      </Text>
                    </View>
                    <View style={sty.dataItem}>
                      <Text style={sty.dataLabel}>EXCEEDED BY</Text>
                      <Text style={[sty.dataValue, {
                        color: evt.severity === 'CRITICAL' ? CRIT_COLOR : WARN_COLOR,
                      }]}>
                        +{(Math.abs(evt.angleDeg) - evt.thresholdDeg).toFixed(1)}°
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            ))}
            <View style={{ height: 12 }} />
          </ScrollView>

          {/* Footer */}
          <View style={sty.modalFooter}>
            <Text style={sty.footerNote}>
              Tilt alerts mark locations where vehicle exceeded configured angle limits.
              Multiple alerts at the same location indicate a persistent hazard zone.
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ─────────────────────────────────────────────────────
const sty = StyleSheet.create({
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 16,
    width: '90%',
    maxWidth: 420,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.25)',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: TACTICAL.border,
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  modalHeaderIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  modalTitle: {
    ...TYPO.T3,
    color: TACTICAL.amber,
    fontSize: 12,
    letterSpacing: 2,
  },
  modalSubtitle: {
    ...TYPO.B2,
    color: MUTED,
    fontSize: 10,
    marginTop: 1,
  },
  modalCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Cluster summary
  clusterSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62,79,60,0.15)',
    gap: 10,
  },
  clusterStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  clusterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  clusterStatLabel: {
    fontSize: 7,
    fontWeight: '800',
    color: MUTED,
    letterSpacing: 0.8,
  },
  clusterStatValue: {
    fontSize: 12,
    fontWeight: '900',
    fontFamily: 'Courier',
  },
  clusterDivider: {
    width: 1,
    height: 16,
    backgroundColor: 'rgba(62,79,60,0.25)',
  },
  dangerZoneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    backgroundColor: CRIT_BG,
    borderWidth: 1,
    borderColor: CRIT_COLOR + '30',
  },
  dangerZoneText: {
    fontSize: 7,
    fontWeight: '900',
    color: CRIT_COLOR,
    letterSpacing: 1,
  },

  // Location
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62,79,60,0.12)',
  },
  locationText: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.text,
    fontFamily: 'Courier',
    letterSpacing: 0.5,
    opacity: 0.8,
  },

  // Event list
  eventScroll: {
    maxHeight: 300,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  eventCard: {
    flexDirection: 'row',
    marginBottom: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
  },
  eventSeverityBar: {
    width: 3,
  },
  eventBody: {
    flex: 1,
    padding: 10,
    gap: 6,
  },
  eventTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  severityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  severityBadgeText: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  axisBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  axisBadgeText: {
    fontSize: 7,
    fontWeight: '900',
    color: MUTED,
    letterSpacing: 0.8,
  },
  eventTimestamp: {
    fontSize: 8,
    fontWeight: '700',
    color: MUTED,
    fontFamily: 'Courier',
    letterSpacing: 0.3,
  },

  // Event data
  eventDataRow: {
    flexDirection: 'row',
    gap: 14,
  },
  dataItem: {
    gap: 2,
  },
  dataLabel: {
    fontSize: 6,
    fontWeight: '800',
    color: MUTED,
    letterSpacing: 1.5,
    opacity: 0.7,
  },
  dataValue: {
    fontSize: 12,
    fontWeight: '900',
    fontFamily: 'Courier',
  },
  dataValueMuted: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: 'Courier',
    color: TACTICAL.text,
    opacity: 0.5,
  },

  // Footer
  modalFooter: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62,79,60,0.12)',
  },
  footerNote: {
    fontSize: 9,
    fontWeight: '500',
    color: MUTED,
    lineHeight: 13,
    opacity: 0.6,
  },
});



