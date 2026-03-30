/**
 * Expedition Forecast Panel — Predictive Expedition Intelligence (Phase 4)
 *
 * Unified predictive expedition briefing panel that combines:
 *   - Route Intelligence (Phase 1): distance, drive time, elevation
 *   - Resource Forecast (Phase 2): fuel, water, power status
 *   - Terrain Intelligence (Phase 3): steep segments, passes, elevation
 *
 * Displays:
 *   - Overall forecast status (OK / CAUTION / WARNING)
 *   - Route summary (distance, drive time, elevation gain, highest elevation)
 *   - Alerts with severity indicators
 *   - Positive confirmations for OK resources
 *
 * Supports two display modes:
 *   - 'floating' (Navigate tab): positioned as absolute overlay
 *   - 'inline' (Dashboard): rendered inline in scroll flow
 *
 * ECS tactical dark styling with gold accents.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, TYPO, GOLD_RAIL, ECS } from '../../lib/theme';
import {
  type ExpeditionForecast,
  type ForecastAlert,
  type ForecastConfirmation,
  type ExpeditionForecastStatus,
  FORECAST_STATUS_META,
  ALERT_TYPE_META,
  SEVERITY_META,
  expeditionForecastEngine,
} from '../../lib/expeditionForecastEngine';

// ── Props ────────────────────────────────────────────────────

interface ExpeditionForecastPanelProps {
  /** The expedition forecast to display */
  forecast: ExpeditionForecast | null;
  /** Whether the panel is visible */
  visible: boolean;
  /** Close handler (hides the panel) */
  onClose?: () => void;
  /** Display mode: 'floating' for Navigate overlay, 'inline' for Dashboard */
  mode?: 'floating' | 'inline';
}

// ── Safe meta lookup fallbacks ───────────────────────────────

const FALLBACK_SEVERITY = { color: '#8A8A85', label: 'UNKNOWN', icon: 'help-outline' };
const FALLBACK_TYPE_META = { color: '#8A8A85', label: '—' };
const FALLBACK_STATUS_META = { color: '#8A8A85', label: 'UNKNOWN', icon: 'help-outline', bgColor: 'rgba(138,138,133,0.1)' };

// ── Alert Row Component ──────────────────────────────────────

function AlertRow({ alert }: { alert: ForecastAlert }) {
  if (!alert) return null;
  const severityMeta = SEVERITY_META[alert.severity] ?? FALLBACK_SEVERITY;
  const typeMeta = ALERT_TYPE_META[alert.type] ?? FALLBACK_TYPE_META;

  return (
    <View style={alertStyles.row}>
      <View style={[alertStyles.severityBar, { backgroundColor: severityMeta.color }]} />
      <View style={alertStyles.iconContainer}>
        <Ionicons
          name={(alert.icon || 'alert-circle-outline') as any}
          size={13}
          color={severityMeta.color}
        />
      </View>
      <View style={alertStyles.textContainer}>
        <Text style={[alertStyles.message, { color: severityMeta.color }]} numberOfLines={2}>
          {alert.message || 'Unknown alert'}
        </Text>
      </View>
      <View style={[alertStyles.typeBadge, { borderColor: (typeMeta.color || '#8A8A85') + '30' }]}>
        <Text style={[alertStyles.typeLabel, { color: typeMeta.color || '#8A8A85' }]}>
          {typeMeta.label || '—'}
        </Text>
      </View>
    </View>
  );
}


const alertStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(30,35,43,0.3)',
  },
  severityBar: {
    width: 3,
    height: 24,
    borderRadius: 1.5,
  },
  iconContainer: {
    width: 20,
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
  },
  message: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
    lineHeight: 15,
  },
  typeBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
    borderWidth: 0.5,
  },
  typeLabel: {
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 2,
  },
});

// ── Confirmation Row Component (Stabilized) ──────────────────

function ConfirmationRow({ confirmation }: { confirmation: ForecastConfirmation }) {
  if (!confirmation) return null;
  const typeMeta = ALERT_TYPE_META[confirmation.type] ?? FALLBACK_TYPE_META;

  return (
    <View style={confirmStyles.row}>
      <Ionicons
        name={(confirmation.icon || 'checkmark-circle-outline') as any}
        size={11}
        color="#66BB6A"
      />
      <Text style={confirmStyles.message} numberOfLines={1}>
        {confirmation.message || 'OK'}
      </Text>
      <Text style={[confirmStyles.typeHint, { color: typeMeta.color || '#8A8A85' }]}>
        {typeMeta.label || '—'}
      </Text>
    </View>
  );
}


const confirmStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    gap: 6,
  },
  message: {
    flex: 1,
    fontSize: 10,
    fontWeight: '500',
    color: 'rgba(102,187,106,0.85)',
    letterSpacing: 0.3,
  },
  typeHint: {
    fontSize: 7,
    fontWeight: '600',
    letterSpacing: 1,
    opacity: 0.5,
  },
});

// ── Summary Stat Chip ────────────────────────────────────────

function SummaryChip({
  icon,
  iconColor,
  label,
  value,
  unit,
}: {
  icon: string;
  iconColor: string;
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <View style={chipStyles.container}>
      <View style={chipStyles.header}>
        <Ionicons name={icon as any} size={9} color={iconColor} />
        <Text style={chipStyles.label}>{label}</Text>
      </View>
      <View style={chipStyles.valueRow}>
        <Text style={chipStyles.value}>{value}</Text>
        {unit ? <Text style={chipStyles.unit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  container: {
    flex: 1,
    minWidth: 70,
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(11,14,18,0.5)',
    borderWidth: 0.5,
    borderColor: 'rgba(30,35,43,0.4)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 2,
  },
  label: {
    fontSize: 7,
    fontWeight: '600',
    letterSpacing: 2,
    color: TACTICAL.textMuted,
    textTransform: 'uppercase',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  value: {
    fontSize: 13,
    fontFamily: 'Courier',
    fontWeight: '700',
    color: TACTICAL.text,
  },
  unit: {
    fontSize: 8,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },
});

// ── Status Badge (Stabilized) ────────────────────────────────

function StatusBadge({ status }: { status: ExpeditionForecastStatus }) {
  const meta = FORECAST_STATUS_META[status] ?? FALLBACK_STATUS_META;

  return (
    <View style={[statusStyles.badge, { backgroundColor: meta.bgColor || 'rgba(138,138,133,0.1)', borderColor: (meta.color || '#8A8A85') + '30' }]}>
      <Ionicons name={(meta.icon || 'help-outline') as any} size={12} color={meta.color || '#8A8A85'} />
      <Text style={[statusStyles.label, { color: meta.color || '#8A8A85' }]}>
        {meta.label || 'UNKNOWN'}
      </Text>
    </View>
  );
}


const statusStyles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 0.5,
  },
  label: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 3,
  },
});

// ── Main Panel Component ─────────────────────────────────────

export default function ExpeditionForecastPanel({
  forecast,
  visible,
  onClose,
  mode = 'floating',
}: ExpeditionForecastPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [showConfirmations, setShowConfirmations] = useState(false);
  const toggleExpanded = useCallback(() => {
    setExpanded(prev => !prev);
  }, []);

  const toggleConfirmations = useCallback(() => {
    setShowConfirmations(prev => !prev);
  }, []);

  // ── Stabilized: show fallback message when visible but no forecast ──
  if (!forecast) {
    if (!visible) return null;
    const isFloating = mode === 'floating';
    return (
      <View style={[
        styles.panel,
        isFloating && styles.panelFloating,
        !isFloating && styles.panelInline,
      ]}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="pulse-outline" size={14} color={TACTICAL.textMuted} />
            <Text style={styles.headerTitle}>EXPEDITION FORECAST</Text>
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
            Load a route to generate an expedition forecast.
          </Text>
        </View>
      </View>
    );
  }

  if (!visible) return null;

  // ── Stabilized: safe access to forecast properties ──
  const safeAlerts = forecast.alerts ?? [];
  const safeConfirmations = forecast.confirmations ?? [];
  const safeSummary = forecast.summary ?? {
    routeName: 'Unknown Route', routeDistance: 0, estimatedDriveTime: 0,
    elevationGain: 0, highestElevation: 0, estimatedDays: 1, terrainDifficulty: 'unknown',
  };

  const statusMeta = FORECAST_STATUS_META[forecast.status] ?? FALLBACK_STATUS_META;
  const alertCounts = expeditionForecastEngine.getAlertCounts(forecast);
  const { warnings, cautions } = alertCounts;
  const isFloating = mode === 'floating';

  // ── Collapsed badge (floating mode only) ──
  if (isFloating && !expanded) {
    return (
      <TouchableOpacity style={styles.collapsedBadge} onPress={toggleExpanded} activeOpacity={0.85}>
        <Ionicons name="pulse-outline" size={12} color={TACTICAL.amber} />
        <Text style={styles.collapsedTitle}>FORECAST</Text>
        <StatusBadge status={forecast.status} />
        {safeAlerts.length > 0 && (
          <View style={styles.collapsedAlertCount}>
            <Text style={[styles.collapsedAlertCountText, { color: statusMeta.color || '#8A8A85' }]}>{safeAlerts.length}</Text>
          </View>
        )}
        <Text style={styles.collapsedDist}>{(safeSummary.routeDistance ?? 0).toFixed(0)} mi</Text>
        <Ionicons name="chevron-down-outline" size={10} color={TACTICAL.textMuted} />
      </TouchableOpacity>
    );
  }

  // ── Expanded panel ──
  return (
    <View style={[styles.panel, isFloating && styles.panelFloating, !isFloating && styles.panelInline]}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="pulse-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.headerTitle}>EXPEDITION FORECAST</Text>
        </View>
        <View style={styles.headerRight}>
          <StatusBadge status={forecast.status} />
          {isFloating && (
            <TouchableOpacity onPress={toggleExpanded} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ marginLeft: 8 }}>
              <Ionicons name="chevron-up-outline" size={14} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          )}
          {onClose && (
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ marginLeft: 6 }}>
              <Ionicons name="close" size={14} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ROUTE NAME */}
      <Text style={styles.routeName} numberOfLines={1}>{safeSummary.routeName ?? 'Unknown Route'}</Text>

      {/* EXPEDITION BRIEF */}
      {forecast.brief ? (
        <View style={styles.briefContainer}>
          <View style={styles.briefHeader}>
            <Ionicons name="document-text-outline" size={10} color={TACTICAL.amber} />
            <Text style={styles.briefLabel}>EXPEDITION BRIEF</Text>
          </View>
          <View style={styles.briefBody}>
            <View style={styles.briefGoldBar} />
            <Text style={styles.briefText}>{forecast.brief}</Text>
          </View>
        </View>
      ) : null}

      {/* SUMMARY STATS */}
      <View style={styles.summaryGrid}>
        <SummaryChip icon="speedometer-outline" iconColor={TACTICAL.amber} label="DISTANCE" value={(safeSummary.routeDistance ?? 0).toFixed(1)} unit="mi" />
        <SummaryChip icon="time-outline" iconColor="#42A5F5" label="DRIVE TIME" value={expeditionForecastEngine.formatDriveTime(safeSummary.estimatedDriveTime ?? 0)} />
        <SummaryChip icon="trending-up-outline" iconColor="#66BB6A" label="ELEV GAIN" value={expeditionForecastEngine.formatElevation(safeSummary.elevationGain ?? 0)} unit="ft" />
        <SummaryChip icon="arrow-up-outline" iconColor="#CE93D8" label="HIGHEST" value={expeditionForecastEngine.formatElevation(safeSummary.highestElevation ?? 0)} unit="ft" />
      </View>

      {/* DURATION ROW */}
      <View style={styles.durationRow}>
        <View style={styles.durationItem}>
          <Ionicons name="calendar-outline" size={9} color={TACTICAL.textMuted} />
          <Text style={styles.durationLabel}>EST DURATION</Text>
          <Text style={styles.durationValue}>{safeSummary.estimatedDays ?? 1} day{(safeSummary.estimatedDays ?? 1) > 1 ? 's' : ''}</Text>
        </View>
        <View style={styles.durationDivider} />
        <View style={styles.durationItem}>
          <Ionicons name="trail-sign-outline" size={9} color={TACTICAL.textMuted} />
          <Text style={styles.durationLabel}>TERRAIN</Text>
          <Text style={styles.durationValue}>{(safeSummary.terrainDifficulty ?? 'unknown').toUpperCase()}</Text>
        </View>
        {warnings > 0 && (<><View style={styles.durationDivider} /><View style={styles.durationItem}><Ionicons name="warning-outline" size={9} color="#EF5350" /><Text style={[styles.durationLabel, { color: '#EF5350' }]}>WARNINGS</Text><Text style={[styles.durationValue, { color: '#EF5350' }]}>{warnings}</Text></View></>)}
        {cautions > 0 && (<><View style={styles.durationDivider} /><View style={styles.durationItem}><Ionicons name="alert-circle-outline" size={9} color="#FFB74D" /><Text style={[styles.durationLabel, { color: '#FFB74D' }]}>CAUTIONS</Text><Text style={[styles.durationValue, { color: '#FFB74D' }]}>{cautions}</Text></View></>)}
      </View>

      {/* ALERTS SECTION */}
      {safeAlerts.length > 0 && (
        <View style={styles.alertsSection}>
          <View style={styles.alertsSectionHeader}>
            <Ionicons name="alert-circle-outline" size={10} color={statusMeta.color || '#8A8A85'} />
            <Text style={[styles.alertsSectionTitle, { color: statusMeta.color || '#8A8A85' }]}>ALERTS</Text>
            <View style={[styles.alertCountBadge, { backgroundColor: (statusMeta.color || '#8A8A85') + '15', borderColor: (statusMeta.color || '#8A8A85') + '30' }]}>
              <Text style={[styles.alertCountText, { color: statusMeta.color || '#8A8A85' }]}>{safeAlerts.length}</Text>
            </View>
          </View>
          {safeAlerts.map((alert, i) => (<AlertRow key={`alert-${i}`} alert={alert} />))}
        </View>
      )}

      {/* CONFIRMATIONS SECTION */}
      {safeConfirmations.length > 0 && (
        <View style={styles.confirmationsSection}>
          <TouchableOpacity style={styles.confirmationsToggle} onPress={toggleConfirmations} activeOpacity={0.8}>
            <Ionicons name="checkmark-circle-outline" size={10} color="#66BB6A" />
            <Text style={styles.confirmationsTitle}>{showConfirmations ? 'HIDE' : 'SHOW'} CONFIRMATIONS ({safeConfirmations.length})</Text>
            <Ionicons name={showConfirmations ? 'chevron-up-outline' : 'chevron-down-outline'} size={10} color={TACTICAL.textMuted} />
          </TouchableOpacity>
          {showConfirmations && (
            <View style={styles.confirmationsList}>
              {safeConfirmations.map((conf, i) => (<ConfirmationRow key={`conf-${i}`} confirmation={conf} />))}
            </View>
          )}
        </View>
      )}

      {/* FOOTER */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>ECS EXPEDITION INTELLIGENCE</Text>
      </View>

    </View>
  );
}


// ── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Collapsed Badge (floating mode) ──
  collapsedBadge: {
    position: 'absolute',
    bottom: 56,
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
  collapsedAlertCount: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(239,83,80,0.12)',
  },
  collapsedAlertCountText: {
    fontSize: 9,
    fontFamily: 'Courier',
    fontWeight: '800',
  },
  collapsedDist: {
    flex: 1,
    textAlign: 'right',
    fontSize: 10,
    fontFamily: 'Courier',
    fontWeight: '700',
    color: TACTICAL.text,
  },

  // ── Expanded Panel ──
  panel: {
    backgroundColor: 'rgba(17,20,24,0.97)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ECS.stroke,
    overflow: 'hidden',
  },
  panelFloating: {
    position: 'absolute',
    bottom: 56,
    left: 8,
    right: 8,
    zIndex: 38,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 10,
    maxHeight: 480,
  },
  panelInline: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
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

  // ── Expedition Brief ──
  briefContainer: {
    marginHorizontal: 10,
    marginTop: 6,
    marginBottom: 2,
    borderTopWidth: GOLD_RAIL.subsectionWidth,
    borderTopColor: GOLD_RAIL.subsection,
    paddingTop: 6,
  },
  briefHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 5,
  },
  briefLabel: {
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 4,
    color: TACTICAL.amber,
    textTransform: 'uppercase',
  },
  briefBody: {
    flexDirection: 'row',
    backgroundColor: '#0F141A',
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: 'rgba(30,35,43,0.4)',
    overflow: 'hidden',
  },
  briefGoldBar: {
    width: 3,
    backgroundColor: TACTICAL.amber,
  },
  briefText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.3,
    lineHeight: 16,
    color: TACTICAL.text,
    paddingVertical: 10,
    paddingHorizontal: 10,
    opacity: 0.9,
  },


  // ── Summary Grid ──
  summaryGrid: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 4,
  },

  // ── Duration Row ──
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderTopWidth: GOLD_RAIL.subsectionWidth,
    borderTopColor: GOLD_RAIL.subsection,
    gap: 8,
    flexWrap: 'wrap',
  },
  durationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  durationLabel: {
    fontSize: 7,
    fontWeight: '600',
    letterSpacing: 1,
    color: TACTICAL.textMuted,
  },
  durationValue: {
    fontSize: 10,
    fontFamily: 'Courier',
    fontWeight: '700',
    color: TACTICAL.text,
  },
  durationDivider: {
    width: 1,
    height: 10,
    backgroundColor: 'rgba(30,35,43,0.5)',
  },

  // ── Alerts Section ──
  alertsSection: {
    borderTopWidth: GOLD_RAIL.sectionWidth,
    borderTopColor: GOLD_RAIL.section,
  },
  alertsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: GOLD_RAIL.subsectionWidth,
    borderBottomColor: GOLD_RAIL.subsection,
  },
  alertsSectionTitle: {
    flex: 1,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
  alertCountBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 0.5,
  },
  alertCountText: {
    fontSize: 9,
    fontFamily: 'Courier',
    fontWeight: '800',
  },

  // ── Confirmations Section ──
  confirmationsSection: {
    borderTopWidth: GOLD_RAIL.subsectionWidth,
    borderTopColor: GOLD_RAIL.subsection,
  },
  confirmationsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  confirmationsTitle: {
    flex: 1,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 3,
    color: 'rgba(102,187,106,0.7)',
  },
  confirmationsList: {
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(30,35,43,0.3)',
    paddingBottom: 4,
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



