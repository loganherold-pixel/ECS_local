/**
 * Resource Forecast Panel — Predictive Expedition Intelligence (Phase 2)
 *
 * Compact, ECS-styled floating panel on the Navigate tab.
 * Shows fuel, water, power forecast status with margin values.
 *
 * Collapsible: badge mode → expanded panel.
 * Dark panel, thin ECS gold accents, no huge charts.
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
  type ResourceForecast,
  type ForecastStatus,
  resourceForecastEngine,
  FORECAST_DEFAULTS,
} from '../../lib/resourceForecastEngine';

// ── Props ────────────────────────────────────────────────────

interface ResourceForecastPanelProps {
  forecast: ResourceForecast | null;
  visible: boolean;
  onClose?: () => void;
  /** When true, shows a loading indicator instead of empty state */
  loading?: boolean;
}


// ── Status Badge ─────────────────────────────────────────────

function StatusBadge({ status, size = 'sm' }: { status: ForecastStatus; size?: 'sm' | 'lg' }) {
  const color = resourceForecastEngine.getStatusColor(status);
  const iconName = resourceForecastEngine.getStatusIcon(status);
  const iconSize = size === 'lg' ? 14 : 10;

  return (
    <View style={[badgeStyles.container, { borderColor: color + '40' }]}>
      <Ionicons name={iconName as any} size={iconSize} color={color} />
      <Text style={[badgeStyles.label, { color, fontSize: size === 'lg' ? 9 : 7 }]}>
        {status}
      </Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 0.5,
  },
  label: {
    fontWeight: '800',
    letterSpacing: 2,
  },
});

// ── Resource Row ─────────────────────────────────────────────

function ResourceRow({
  label,
  icon,
  iconColor,
  status,
  margin,
  marginUnit,
  available,
  required,
  unit,
  notes,
  expanded,
}: {
  label: string;
  icon: string;
  iconColor: string;
  status: ForecastStatus;
  margin: number;
  marginUnit: string;
  available: number;
  required: number;
  unit: string;
  notes: string[];
  expanded: boolean;
}) {
  const statusColor = resourceForecastEngine.getStatusColor(status);
  const marginStr = resourceForecastEngine.formatMargin(margin, marginUnit);

  return (
    <View style={rowStyles.container}>
      {/* Main row */}
      <View style={rowStyles.mainRow}>
        <View style={rowStyles.labelCol}>
          <Ionicons name={icon as any} size={13} color={iconColor} />
          <Text style={rowStyles.label}>{label}</Text>
        </View>
        <View style={rowStyles.statusCol}>
          <StatusBadge status={status} />
        </View>
        <View style={rowStyles.marginCol}>
          <Text style={[rowStyles.marginValue, { color: statusColor }]}>
            {marginStr}
          </Text>
        </View>
      </View>

      {/* Expanded detail */}
      {expanded && (
        <View style={rowStyles.detail}>
          {/* Bar visualization */}
          <View style={rowStyles.barContainer}>
            <View style={rowStyles.barTrack}>
              <View
                style={[
                  rowStyles.barFill,
                  {
                    width: `${Math.min(100, required > 0 ? (available / required) * 100 : 100)}%`,
                    backgroundColor: statusColor,
                  },
                ]}
              />
              {/* Required marker */}
              <View style={[rowStyles.barMarker, { left: '100%' }]} />
            </View>
            <View style={rowStyles.barLabels}>
              <Text style={rowStyles.barLabel}>
                {available.toFixed(1)} {unit} avail
              </Text>
              <Text style={rowStyles.barLabel}>
                {required.toFixed(1)} {unit} req
              </Text>
            </View>
          </View>

          {/* Notes */}
          {notes.map((note, i) => (
            <View key={i} style={rowStyles.noteRow}>
              <View style={[rowStyles.noteDot, { backgroundColor: i === 0 ? statusColor : TACTICAL.textMuted + '60' }]} />
              <Text style={rowStyles.noteText}>{note}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const rowStyles = StyleSheet.create({
  container: {
    borderBottomWidth: GOLD_RAIL.subsectionWidth,
    borderBottomColor: GOLD_RAIL.subsection,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 6,
  },
  labelCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minWidth: 70,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    color: TACTICAL.text,
    textTransform: 'uppercase',
  },
  statusCol: {
    flex: 1,
    alignItems: 'center',
  },
  marginCol: {
    minWidth: 80,
    alignItems: 'flex-end',
  },
  marginValue: {
    fontSize: 12,
    fontFamily: 'Courier',
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  detail: {
    paddingHorizontal: 10,
    paddingBottom: 8,
    gap: 4,
  },
  barContainer: {
    marginBottom: 2,
  },
  barTrack: {
    height: 4,
    backgroundColor: 'rgba(30,35,43,0.6)',
    borderRadius: 2,
    overflow: 'hidden',
    position: 'relative',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
    opacity: 0.7,
  },
  barMarker: {
    position: 'absolute',
    top: -1,
    width: 2,
    height: 6,
    backgroundColor: TACTICAL.text,
    opacity: 0.4,
    marginLeft: -1,
  },
  barLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  barLabel: {
    fontSize: 8,
    fontFamily: 'Courier',
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
    paddingLeft: 2,
  },
  noteDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 4,
  },
  noteText: {
    fontSize: 9,
    color: TACTICAL.textMuted,
    lineHeight: 13,
    flex: 1,
  },
});

// ── Main Panel ───────────────────────────────────────────────

export default function ResourceForecastPanel({
  forecast,
  visible,
  onClose,
  loading,
}: ResourceForecastPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  const toggleExpanded = useCallback(() => {
    setExpanded(prev => !prev);
  }, []);

  const toggleDetail = useCallback(() => {
    setShowDetail(prev => !prev);
  }, []);

  if (!visible) return null;

  // ── Loading state ──
  if (loading && !forecast) {
    return (
      <View style={styles.panel}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="flask-outline" size={13} color={TACTICAL.textMuted} />
            <Text style={styles.headerTitle}>RESOURCE FORECAST</Text>
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
            Generating resource forecast...
          </Text>
        </View>
      </View>
    );
  }

  // ── Empty state ──
  if (!forecast) {
    return (
      <View style={styles.panel}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="flask-outline" size={13} color={TACTICAL.textMuted} />
            <Text style={styles.headerTitle}>RESOURCE FORECAST</Text>
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
          <Ionicons name="flask-outline" size={24} color={TACTICAL.textMuted} />
          <Text style={{ fontSize: 11, fontWeight: '600', color: TACTICAL.textMuted, marginTop: 8, textAlign: 'center', letterSpacing: 0.5 }}>
            Load a route to generate resource forecast.
          </Text>
        </View>
      </View>
    );
  }



  const overallColor = resourceForecastEngine.getStatusColor(forecast.overallStatus);

  // ── Collapsed badge ──
  if (!expanded) {
    return (
      <TouchableOpacity
        style={styles.collapsedBadge}
        onPress={toggleExpanded}
        activeOpacity={0.85}
      >
        <Ionicons name="flask-outline" size={11} color={overallColor} />
        <Text style={[styles.collapsedTitle, { color: overallColor }]}>FORECAST</Text>
        <View style={styles.collapsedStats}>
          <Text style={styles.collapsedStatLabel}>F:</Text>
          <Text style={[styles.collapsedStatValue, { color: resourceForecastEngine.getStatusColor(forecast.fuel.status) }]}>
            {forecast.fuel.status}
          </Text>
          <View style={styles.collapsedDivider} />
          <Text style={styles.collapsedStatLabel}>W:</Text>
          <Text style={[styles.collapsedStatValue, { color: resourceForecastEngine.getStatusColor(forecast.water.status) }]}>
            {forecast.water.status}
          </Text>
          <View style={styles.collapsedDivider} />
          <Text style={styles.collapsedStatLabel}>P:</Text>
          <Text style={[styles.collapsedStatValue, { color: resourceForecastEngine.getStatusColor(forecast.power.status) }]}>
            {forecast.power.status}
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
          <Ionicons name="flask-outline" size={13} color={TACTICAL.amber} />
          <Text style={styles.headerTitle}>RESOURCE FORECAST</Text>
          <StatusBadge status={forecast.overallStatus} size="lg" />
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

      {/* Route summary */}
      <View style={styles.routeSummary}>
        <View style={styles.summaryChip}>
          <Ionicons name="speedometer-outline" size={9} color={TACTICAL.amber} />
          <Text style={styles.summaryValue}>{forecast.routeMiles} mi</Text>
        </View>
        <View style={styles.summaryChip}>
          <Ionicons name="time-outline" size={9} color="#42A5F5" />
          <Text style={styles.summaryValue}>{forecast.estimatedDriveHours} hrs</Text>
        </View>
        <View style={styles.summaryChip}>
          <Ionicons name="calendar-outline" size={9} color="#CE93D8" />
          <Text style={styles.summaryValue}>~{forecast.estimatedDays}d</Text>
        </View>
        {!forecast.hasRealData && (
          <View style={[styles.summaryChip, { borderColor: '#FFB74D40' }]}>
            <Ionicons name="information-circle-outline" size={9} color="#FFB74D" />
            <Text style={[styles.summaryValue, { color: '#FFB74D' }]}>DEFAULTS</Text>
          </View>
        )}
      </View>

      {/* Resource rows */}
      <ResourceRow
        label="FUEL"
        icon="flame-outline"
        iconColor="#FFB74D"
        status={forecast.fuel.status}
        margin={forecast.fuel.marginGallons}
        marginUnit="gal"
        available={forecast.fuel.availableGallons}
        required={forecast.fuel.requiredGallons}
        unit="gal"
        notes={forecast.fuel.notes}
        expanded={showDetail}
      />

      <ResourceRow
        label="WATER"
        icon="water-outline"
        iconColor="#4FC3F7"
        status={forecast.water.status}
        margin={forecast.water.marginGallons}
        marginUnit="gal"
        available={forecast.water.availableGallons}
        required={forecast.water.requiredGallons}
        unit="gal"
        notes={forecast.water.notes}
        expanded={showDetail}
      />

      <ResourceRow
        label="POWER"
        icon="battery-charging-outline"
        iconColor="#FFD54F"
        status={forecast.power.status}
        margin={forecast.power.marginHours}
        marginUnit="hrs"
        available={forecast.power.availableHours}
        required={forecast.power.requiredHours}
        unit="hrs"
        notes={forecast.power.notes}
        expanded={showDetail}
      />

      {/* Detail toggle */}
      <TouchableOpacity
        style={styles.detailToggle}
        onPress={toggleDetail}
        activeOpacity={0.8}
      >
        <Ionicons name="list-outline" size={10} color={TACTICAL.amber} />
        <Text style={styles.detailToggleText}>
          {showDetail ? 'HIDE' : 'SHOW'} DETAIL
        </Text>
        <Ionicons
          name={showDetail ? 'chevron-up-outline' : 'chevron-down-outline'}
          size={9}
          color={TACTICAL.textMuted}
        />
      </TouchableOpacity>

      {/* Drivers */}
      {forecast.drivers.length > 0 && forecast.overallStatus !== 'OK' && (
        <View style={styles.driversSection}>
          {forecast.drivers.map((driver, i) => (
            <View key={i} style={styles.driverRow}>
              <Ionicons
                name={i === 0 ? 'alert-circle' : 'alert-circle-outline'}
                size={10}
                color={i === 0 ? overallColor : TACTICAL.textMuted}
              />
              <Text style={[styles.driverText, i === 0 && { color: overallColor }]}>
                {driver}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          ECS RESOURCE INTELLIGENCE
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
    top: 42,
    left: 8,
    right: 8,
    zIndex: 39,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(11,14,18,0.94)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 5,
  },
  collapsedTitle: {
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  collapsedStats: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 3,
  },
  collapsedStatLabel: {
    fontSize: 8,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },
  collapsedStatValue: {
    fontSize: 9,
    fontFamily: 'Courier',
    fontWeight: '800',
    letterSpacing: 1,
  },
  collapsedDivider: {
    width: 1,
    height: 8,
    backgroundColor: 'rgba(30,35,43,0.6)',
    marginHorizontal: 1,
  },

  // ── Expanded Panel ──
  panel: {
    position: 'absolute',
    top: 42,
    left: 8,
    right: 8,
    zIndex: 39,
    backgroundColor: 'rgba(17,20,24,0.97)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ECS.stroke,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 10,
    maxHeight: 420,
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingTop: 9,
    paddingBottom: 5,
    borderBottomWidth: GOLD_RAIL.sectionWidth,
    borderBottomColor: GOLD_RAIL.section,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 4,
    color: TACTICAL.amber,
    textTransform: 'uppercase',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // ── Route Summary ──
  routeSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 6,
    borderBottomWidth: GOLD_RAIL.subsectionWidth,
    borderBottomColor: GOLD_RAIL.subsection,
    flexWrap: 'wrap',
  },
  summaryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: 'rgba(30,35,43,0.5)',
    backgroundColor: 'rgba(11,14,18,0.5)',
  },
  summaryValue: {
    fontSize: 9,
    fontFamily: 'Courier',
    fontWeight: '700',
    color: TACTICAL.text,
    letterSpacing: 0.5,
  },

  // ── Detail Toggle ──
  detailToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: GOLD_RAIL.subsectionWidth,
    borderBottomColor: GOLD_RAIL.subsection,
  },
  detailToggleText: {
    flex: 1,
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 3,
    color: TACTICAL.amber,
  },

  // ── Drivers ──
  driversSection: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 3,
    borderBottomWidth: GOLD_RAIL.subsectionWidth,
    borderBottomColor: GOLD_RAIL.subsection,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  driverText: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },

  // ── Footer ──
  footer: {
    paddingHorizontal: 10,
    paddingVertical: 5,
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



