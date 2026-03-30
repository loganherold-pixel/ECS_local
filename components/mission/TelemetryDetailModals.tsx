// ============================================================
// TELEMETRY DETAIL MODALS — Consumption History & Analysis
// ============================================================
// Tappable from stat chips. Shows consumption history graph,
// rate analysis, plan comparison, and trend indicators.
// ============================================================

import React, { useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Pressable, ScrollView,
} from 'react-native';
import ECSModal from '../ECSModal';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import ConsumptionGraph from './ConsumptionGraph';
import type {
  ConsumptionRate,
  FuelRangeEstimate,
  ResourceHistoryPoint,
  StatusColor,
} from '../../lib/telemetryPolling';
import { getStatusHex, buildResourceHistory } from '../../lib/telemetryPolling';
import type { TelemetryConfig, TelemetryReadout } from '../../lib/missionTypes';

// ── Shared Detail Modal Shell ────────────────────────────────

function DetailSheet({
  visible,
  onClose,
  title,
  icon,
  iconColor,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  icon: string;
  iconColor: string;
  children: React.ReactNode;
}) {
  return (
    <ECSModal visible={visible} onClose={onClose} tier="global">
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
          <View style={styles.handleBar} />
          <View style={styles.sheetHeader}>
            <View style={[styles.sheetIconWrap, { backgroundColor: `${iconColor}15` }]}>
              <Ionicons name={icon as any} size={18} color={iconColor} />
            </View>
            <Text style={styles.sheetTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={18} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 500 }}>
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
    </ECSModal>
  );
}

// ── Rate Comparison Row ──────────────────────────────────────

function RateRow({
  label,
  actual,
  planned,
  unit,
  status,
}: {
  label: string;
  actual: number;
  planned: number;
  unit: string;
  status: StatusColor;
}) {
  const ratio = planned > 0 ? actual / planned : 0;
  const barWidth = Math.min(ratio * 100, 150);
  const hex = getStatusHex(status);

  return (
    <View style={styles.rateRow}>
      <Text style={styles.rateLabel}>{label}</Text>
      <View style={styles.rateBarContainer}>
        {/* Planned line */}
        <View style={[styles.ratePlannedLine, { left: '100%' }]} />
        {/* Actual bar */}
        <View style={[styles.rateBar, { width: `${Math.min(barWidth, 100)}%`, backgroundColor: `${hex}60` }]}>
          <View style={[styles.rateBarFill, { backgroundColor: hex }]} />
        </View>
      </View>
      <View style={styles.rateValues}>
        <Text style={[styles.rateActual, { color: hex }]}>{actual.toFixed(1)}</Text>
        <Text style={styles.ratePlanned}>/ {planned.toFixed(1)} {unit}</Text>
      </View>
    </View>
  );
}

// ── Trend Badge ──────────────────────────────────────────────

function TrendBadge({ trend, color }: { trend: string; color: string }) {
  const icon = trend === 'increasing' ? 'trending-up' : trend === 'decreasing' ? 'trending-down' : 'remove-outline';
  const label = trend === 'increasing' ? 'INCREASING' : trend === 'decreasing' ? 'DECREASING' : 'STABLE';
  return (
    <View style={[styles.trendBadge, { borderColor: `${color}40`, backgroundColor: `${color}08` }]}>
      <Ionicons name={icon as any} size={12} color={color} />
      <Text style={[styles.trendText, { color }]}>{label}</Text>
    </View>
  );
}

// ============================================================
// FUEL DETAIL MODAL
// ============================================================

interface FuelDetailProps {
  visible: boolean;
  onClose: () => void;
  expeditionId: string;
  rate: ConsumptionRate | null;
  range: FuelRangeEstimate;
  readout: TelemetryReadout;
  config: TelemetryConfig;
  status: StatusColor;
}

export function FuelDetailModal({
  visible,
  onClose,
  expeditionId,
  rate,
  range,
  readout,
  config,
  status,
}: FuelDetailProps) {
  const history = useMemo(() => buildResourceHistory(expeditionId, 'fuel'), [expeditionId, visible]);
  const hex = getStatusHex(status);

  return (
    <DetailSheet visible={visible} onClose={onClose} title="FUEL ANALYSIS" icon="flame-outline" iconColor="#FF9500">
      {/* Current Status */}
      <View style={[styles.statusCard, { borderColor: `${hex}40` }]}>
        <View style={styles.statusRow}>
          <View style={styles.statusItem}>
            <Text style={[styles.statusValue, { color: hex }]}>
              {readout.fuelPercent !== null ? `${readout.fuelPercent}%` : '--'}
            </Text>
            <Text style={styles.statusLabel}>REMAINING</Text>
          </View>
          <View style={styles.statusDivider} />
          <View style={styles.statusItem}>
            <Text style={[styles.statusValue, { color: '#FF9500' }]}>
              {readout.fuelRemainingGal?.toFixed(1) ?? '--'}
            </Text>
            <Text style={styles.statusLabel}>GALLONS</Text>
          </View>
          <View style={styles.statusDivider} />
          <View style={styles.statusItem}>
            <Text style={[styles.statusValue, { color: '#FF9500' }]}>
              {config.fuelMpg ?? '--'}
            </Text>
            <Text style={styles.statusLabel}>MPG</Text>
          </View>
        </View>
      </View>

      {/* Fuel Range Estimator */}
      <View style={styles.rangeCard}>
        <View style={styles.rangeHeader}>
          <Ionicons name="speedometer-outline" size={14} color="#FF9500" />
          <Text style={styles.rangeTitle}>RANGE ESTIMATOR</Text>
          {range.confidence !== 'low' && (
            <View style={[styles.confidenceBadge, {
              backgroundColor: range.confidence === 'high' ? 'rgba(76,175,80,0.12)' : 'rgba(196,138,44,0.12)',
              borderColor: range.confidence === 'high' ? 'rgba(76,175,80,0.3)' : 'rgba(196,138,44,0.3)',
            }]}>
              <Text style={[styles.confidenceText, {
                color: range.confidence === 'high' ? '#4CAF50' : '#C48A2C',
              }]}>{range.confidence.toUpperCase()}</Text>
            </View>
          )}
        </View>
        <View style={styles.rangeGrid}>
          <View style={styles.rangeItem}>
            <Text style={styles.rangeValue}>{range.currentRangeMi ?? '--'}</Text>
            <Text style={styles.rangeUnit}>mi</Text>
            <Text style={styles.rangeLabel}>RATED</Text>
          </View>
          <View style={styles.rangeItem}>
            <Text style={[styles.rangeValue, { color: '#FF9500' }]}>{range.trendRangeMi ?? '--'}</Text>
            <Text style={[styles.rangeUnit, { color: '#FF9500' }]}>mi</Text>
            <Text style={styles.rangeLabel}>TREND</Text>
          </View>
          <View style={styles.rangeItem}>
            <Text style={[styles.rangeValue, { color: '#4CAF50' }]}>{range.safeRangeMi ?? '--'}</Text>
            <Text style={[styles.rangeUnit, { color: '#4CAF50' }]}>mi</Text>
            <Text style={styles.rangeLabel}>SAFE (75%)</Text>
          </View>
        </View>
        {range.consumptionMpg && range.consumptionMpg !== config.fuelMpg && (
          <View style={styles.mpgCompare}>
            <Ionicons name="analytics-outline" size={11} color={TACTICAL.textMuted} />
            <Text style={styles.mpgCompareText}>
              Actual MPG: {range.consumptionMpg} vs Rated: {config.fuelMpg}
            </Text>
          </View>
        )}
        {range.hoursRemaining !== null && (
          <Text style={styles.rangeSubtext}>
            Est. {range.hoursRemaining}h ({range.daysRemaining}d) remaining at current rate
          </Text>
        )}
      </View>

      {/* Consumption Rate */}
      {rate && (
        <View style={styles.rateCard}>
          <View style={styles.rateHeader}>
            <Text style={styles.rateTitle}>CONSUMPTION RATE</Text>
            <TrendBadge trend={rate.trend} color={hex} />
          </View>
          <RateRow
            label="PER DAY"
            actual={rate.ratePerDay}
            planned={rate.plannedRatePerDay}
            unit="gal/day"
            status={rate.status}
          />
          <RateRow
            label="PER HOUR"
            actual={rate.ratePerHour}
            planned={rate.plannedRatePerDay / 24}
            unit="gal/hr"
            status={rate.status}
          />
          <View style={styles.ratioRow}>
            <Text style={styles.ratioLabel}>VS PLAN</Text>
            <Text style={[styles.ratioValue, { color: hex }]}>
              {(rate.ratioVsPlan * 100).toFixed(0)}%
            </Text>
            <Text style={styles.ratioDesc}>
              {rate.ratioVsPlan <= 1 ? 'Under plan' : rate.ratioVsPlan <= 1.1 ? 'On plan' : 'Over plan'}
            </Text>
          </View>
        </View>
      )}

      {/* Consumption History Graph */}
      <View style={styles.graphCard}>
        <Text style={styles.graphTitle}>CONSUMPTION HISTORY</Text>
        <ConsumptionGraph data={history} color="#FF9500" height={140} />
      </View>

      {/* Event Log */}
      {history.length > 1 && (
        <View style={styles.eventLogCard}>
          <Text style={styles.graphTitle}>FUEL EVENTS</Text>
          {history.filter(h => h.eventType !== 'INITIAL' && h.eventType !== 'CURRENT').slice(-8).reverse().map((h, i) => (
            <View key={i} style={styles.eventLogRow}>
              <View style={[styles.eventLogDot, { backgroundColor: h.percent > 35 ? '#4CAF50' : h.percent >= 15 ? '#C48A2C' : '#E53935' }]} />
              <Text style={styles.eventLogTime}>
                {new Date(h.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </Text>
              <Text style={styles.eventLogDelta}>
                {h.delta ? `-${h.delta.toFixed(1)} gal` : ''}
              </Text>
              <Text style={styles.eventLogRemaining}>{h.percent}%</Text>
            </View>
          ))}
        </View>
      )}

      <View style={{ height: 20 }} />
    </DetailSheet>
  );
}

// ============================================================
// WATER DETAIL MODAL
// ============================================================

interface WaterDetailProps {
  visible: boolean;
  onClose: () => void;
  expeditionId: string;
  rate: ConsumptionRate | null;
  readout: TelemetryReadout;
  config: TelemetryConfig;
  status: StatusColor;
}

export function WaterDetailModal({
  visible,
  onClose,
  expeditionId,
  rate,
  readout,
  config,
  status,
}: WaterDetailProps) {
  const history = useMemo(() => buildResourceHistory(expeditionId, 'water'), [expeditionId, visible]);
  const hex = getStatusHex(status);
  const waterPct = config.waterCapacityL && config.waterRemainingL !== null
    ? Math.round((config.waterRemainingL / config.waterCapacityL) * 100)
    : null;

  return (
    <DetailSheet visible={visible} onClose={onClose} title="WATER ANALYSIS" icon="water-outline" iconColor="#4FC3F7">
      {/* Current Status */}
      <View style={[styles.statusCard, { borderColor: `${hex}40` }]}>
        <View style={styles.statusRow}>
          <View style={styles.statusItem}>
            <Text style={[styles.statusValue, { color: hex }]}>
              {waterPct !== null ? `${waterPct}%` : '--'}
            </Text>
            <Text style={styles.statusLabel}>REMAINING</Text>
          </View>
          <View style={styles.statusDivider} />
          <View style={styles.statusItem}>
            <Text style={[styles.statusValue, { color: '#4FC3F7' }]}>
              {readout.waterRemainingL?.toFixed(1) ?? '--'}
            </Text>
            <Text style={styles.statusLabel}>LITERS</Text>
          </View>
          <View style={styles.statusDivider} />
          <View style={styles.statusItem}>
            <Text style={[styles.statusValue, { color: '#4FC3F7' }]}>
              {readout.waterAutonomyDays?.toFixed(1) ?? '--'}
            </Text>
            <Text style={styles.statusLabel}>DAYS LEFT</Text>
          </View>
        </View>
      </View>

      {/* Water Autonomy Card */}
      <View style={styles.rangeCard}>
        <View style={styles.rangeHeader}>
          <Ionicons name="hourglass-outline" size={14} color="#4FC3F7" />
          <Text style={styles.rangeTitle}>WATER AUTONOMY</Text>
        </View>
        <View style={styles.rangeGrid}>
          <View style={styles.rangeItem}>
            <Text style={styles.rangeValue}>{config.waterCapacityL?.toFixed(0) ?? '--'}</Text>
            <Text style={styles.rangeUnit}>L</Text>
            <Text style={styles.rangeLabel}>CAPACITY</Text>
          </View>
          <View style={styles.rangeItem}>
            <Text style={[styles.rangeValue, { color: '#4FC3F7' }]}>
              {config.waterDailyBurnL?.toFixed(1) ?? '--'}
            </Text>
            <Text style={[styles.rangeUnit, { color: '#4FC3F7' }]}>L/day</Text>
            <Text style={styles.rangeLabel}>PLANNED</Text>
          </View>
          <View style={styles.rangeItem}>
            <Text style={[styles.rangeValue, { color: rate ? getStatusHex(rate.status) : '#4FC3F7' }]}>
              {rate ? rate.ratePerDay.toFixed(1) : '--'}
            </Text>
            <Text style={[styles.rangeUnit, { color: rate ? getStatusHex(rate.status) : '#4FC3F7' }]}>L/day</Text>
            <Text style={styles.rangeLabel}>ACTUAL</Text>
          </View>
        </View>
      </View>

      {/* Consumption Rate */}
      {rate && (
        <View style={styles.rateCard}>
          <View style={styles.rateHeader}>
            <Text style={styles.rateTitle}>CONSUMPTION RATE</Text>
            <TrendBadge trend={rate.trend} color={hex} />
          </View>
          <RateRow
            label="PER DAY"
            actual={rate.ratePerDay}
            planned={rate.plannedRatePerDay}
            unit="L/day"
            status={rate.status}
          />
          <RateRow
            label="PER HOUR"
            actual={rate.ratePerHour}
            planned={rate.plannedRatePerDay / 24}
            unit="L/hr"
            status={rate.status}
          />
          <View style={styles.ratioRow}>
            <Text style={styles.ratioLabel}>VS PLAN</Text>
            <Text style={[styles.ratioValue, { color: hex }]}>
              {(rate.ratioVsPlan * 100).toFixed(0)}%
            </Text>
            <Text style={styles.ratioDesc}>
              {rate.ratioVsPlan <= 1 ? 'Under plan' : rate.ratioVsPlan <= 1.1 ? 'On plan' : 'Over plan'}
            </Text>
          </View>
        </View>
      )}

      {/* Graph */}
      <View style={styles.graphCard}>
        <Text style={styles.graphTitle}>CONSUMPTION HISTORY</Text>
        <ConsumptionGraph data={history} color="#4FC3F7" height={140} />
      </View>

      {/* Event Log */}
      {history.length > 1 && (
        <View style={styles.eventLogCard}>
          <Text style={styles.graphTitle}>WATER EVENTS</Text>
          {history.filter(h => h.eventType !== 'INITIAL' && h.eventType !== 'CURRENT').slice(-8).reverse().map((h, i) => (
            <View key={i} style={styles.eventLogRow}>
              <View style={[styles.eventLogDot, { backgroundColor: h.percent > 35 ? '#4CAF50' : h.percent >= 15 ? '#C48A2C' : '#E53935' }]} />
              <Text style={styles.eventLogTime}>
                {new Date(h.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </Text>
              <Text style={styles.eventLogDelta}>
                {h.delta ? `-${h.delta.toFixed(1)} L` : ''}
              </Text>
              <Text style={styles.eventLogRemaining}>{h.percent}%</Text>
            </View>
          ))}
        </View>
      )}

      <View style={{ height: 20 }} />
    </DetailSheet>
  );
}

// ============================================================
// POWER DETAIL MODAL
// ============================================================

interface PowerDetailProps {
  visible: boolean;
  onClose: () => void;
  expeditionId: string;
  rate: ConsumptionRate | null;
  readout: TelemetryReadout;
  config: TelemetryConfig;
  status: StatusColor;
}

export function PowerDetailModal({
  visible,
  onClose,
  expeditionId,
  rate,
  readout,
  config,
  status,
}: PowerDetailProps) {
  const history = useMemo(() => buildResourceHistory(expeditionId, 'power'), [expeditionId, visible]);
  const hex = getStatusHex(status);

  return (
    <DetailSheet visible={visible} onClose={onClose} title="POWER ANALYSIS" icon="flash-outline" iconColor="#7C4DFF">
      {/* Current Status */}
      <View style={[styles.statusCard, { borderColor: `${hex}40` }]}>
        <View style={styles.statusRow}>
          <View style={styles.statusItem}>
            <Text style={[styles.statusValue, { color: hex }]}>
              {readout.powerPercent !== null ? `${readout.powerPercent}%` : '--'}
            </Text>
            <Text style={styles.statusLabel}>REMAINING</Text>
          </View>
          <View style={styles.statusDivider} />
          <View style={styles.statusItem}>
            <Text style={[styles.statusValue, { color: '#7C4DFF' }]}>
              {readout.powerRemainingWh?.toFixed(0) ?? '--'}
            </Text>
            <Text style={styles.statusLabel}>Wh LEFT</Text>
          </View>
          <View style={styles.statusDivider} />
          <View style={styles.statusItem}>
            <Text style={[styles.statusValue, { color: '#7C4DFF' }]}>
              {readout.powerEstHours?.toFixed(1) ?? '--'}
            </Text>
            <Text style={styles.statusLabel}>HOURS</Text>
          </View>
        </View>
      </View>

      {/* Power System Card */}
      <View style={styles.rangeCard}>
        <View style={styles.rangeHeader}>
          <Ionicons name="battery-charging-outline" size={14} color="#7C4DFF" />
          <Text style={styles.rangeTitle}>POWER SYSTEM</Text>
        </View>
        <View style={styles.rangeGrid}>
          <View style={styles.rangeItem}>
            <Text style={styles.rangeValue}>{config.powerCapacityWh?.toFixed(0) ?? '--'}</Text>
            <Text style={styles.rangeUnit}>Wh</Text>
            <Text style={styles.rangeLabel}>CAPACITY</Text>
          </View>
          <View style={styles.rangeItem}>
            <Text style={[styles.rangeValue, { color: '#7C4DFF' }]}>
              {config.powerAvgDrawW ?? '--'}
            </Text>
            <Text style={[styles.rangeUnit, { color: '#7C4DFF' }]}>W</Text>
            <Text style={styles.rangeLabel}>AVG DRAW</Text>
          </View>
          <View style={styles.rangeItem}>
            <Text style={[styles.rangeValue, { color: rate ? getStatusHex(rate.status) : '#7C4DFF' }]}>
              {rate ? (rate.ratePerHour).toFixed(0) : '--'}
            </Text>
            <Text style={[styles.rangeUnit, { color: rate ? getStatusHex(rate.status) : '#7C4DFF' }]}>Wh/hr</Text>
            <Text style={styles.rangeLabel}>ACTUAL</Text>
          </View>
        </View>
      </View>

      {/* Consumption Rate */}
      {rate && (
        <View style={styles.rateCard}>
          <View style={styles.rateHeader}>
            <Text style={styles.rateTitle}>CONSUMPTION RATE</Text>
            <TrendBadge trend={rate.trend} color={hex} />
          </View>
          <RateRow
            label="PER DAY"
            actual={rate.ratePerDay}
            planned={rate.plannedRatePerDay}
            unit="Wh/day"
            status={rate.status}
          />
          <RateRow
            label="PER HOUR"
            actual={rate.ratePerHour}
            planned={rate.plannedRatePerDay / 24}
            unit="Wh/hr"
            status={rate.status}
          />
          <View style={styles.ratioRow}>
            <Text style={styles.ratioLabel}>VS PLAN</Text>
            <Text style={[styles.ratioValue, { color: hex }]}>
              {(rate.ratioVsPlan * 100).toFixed(0)}%
            </Text>
            <Text style={styles.ratioDesc}>
              {rate.ratioVsPlan <= 1 ? 'Under plan' : rate.ratioVsPlan <= 1.1 ? 'On plan' : 'Over plan'}
            </Text>
          </View>
        </View>
      )}

      {/* Graph */}
      <View style={styles.graphCard}>
        <Text style={styles.graphTitle}>CONSUMPTION HISTORY</Text>
        <ConsumptionGraph data={history} color="#7C4DFF" height={140} />
      </View>

      {/* Event Log */}
      {history.length > 1 && (
        <View style={styles.eventLogCard}>
          <Text style={styles.graphTitle}>POWER EVENTS</Text>
          {history.filter(h => h.eventType !== 'INITIAL' && h.eventType !== 'CURRENT').slice(-8).reverse().map((h, i) => (
            <View key={i} style={styles.eventLogRow}>
              <View style={[styles.eventLogDot, { backgroundColor: h.percent > 35 ? '#4CAF50' : h.percent >= 15 ? '#C48A2C' : '#E53935' }]} />
              <Text style={styles.eventLogTime}>
                {new Date(h.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </Text>
              <Text style={styles.eventLogDelta}>
                {h.delta ? `-${h.delta.toFixed(0)} Wh` : ''}
              </Text>
              <Text style={styles.eventLogRemaining}>{h.percent}%</Text>
            </View>
          ))}
        </View>
      )}

      <View style={{ height: 20 }} />
    </DetailSheet>
  );
}

// ============================================================
// STYLES
// ============================================================
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#151A1F',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: '85%',
    borderTopWidth: 1,
    borderColor: TACTICAL.border,
  },
  handleBar: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: TACTICAL.textMuted, alignSelf: 'center',
    marginTop: 10, marginBottom: 16, opacity: 0.4,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16,
  },
  sheetIconWrap: {
    width: 32, height: 32, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  sheetTitle: {
    flex: 1, fontSize: 13, fontWeight: '900',
    color: TACTICAL.text, letterSpacing: 2,
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },

  // Status card
  statusCard: {
    borderRadius: 12, borderWidth: 1, borderColor: TACTICAL.border,
    backgroundColor: 'rgba(0,0,0,0.2)', padding: 14, marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row', alignItems: 'center',
  },
  statusItem: {
    flex: 1, alignItems: 'center', gap: 4,
  },
  statusValue: {
    fontSize: 22, fontWeight: '900', fontFamily: 'Courier',
    color: TACTICAL.text,
  },
  statusLabel: {
    fontSize: 7, fontWeight: '800', color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  statusDivider: {
    width: 1, height: 30, backgroundColor: TACTICAL.border,
  },

  // Range card
  rangeCard: {
    borderRadius: 12, borderWidth: 1, borderColor: TACTICAL.border,
    backgroundColor: 'rgba(0,0,0,0.15)', padding: 14, marginBottom: 12,
  },
  rangeHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12,
  },
  rangeTitle: {
    flex: 1, fontSize: 10, fontWeight: '900',
    color: TACTICAL.text, letterSpacing: 1.5,
  },
  confidenceBadge: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
    borderWidth: 1,
  },
  confidenceText: {
    fontSize: 7, fontWeight: '900', letterSpacing: 1,
  },
  rangeGrid: {
    flexDirection: 'row', gap: 8,
  },
  rangeItem: {
    flex: 1, alignItems: 'center', gap: 2,
    padding: 10, borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderWidth: 1, borderColor: 'rgba(62,79,60,0.2)',
  },
  rangeValue: {
    fontSize: 18, fontWeight: '900', fontFamily: 'Courier',
    color: TACTICAL.text,
  },
  rangeUnit: {
    fontSize: 9, fontWeight: '700', color: TACTICAL.textMuted,
  },
  rangeLabel: {
    fontSize: 7, fontWeight: '800', color: TACTICAL.textMuted,
    letterSpacing: 1, marginTop: 2,
  },
  mpgCompare: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 10, paddingTop: 8,
    borderTopWidth: 1, borderTopColor: 'rgba(62,79,60,0.2)',
  },
  mpgCompareText: {
    fontSize: 10, color: TACTICAL.textMuted, fontFamily: 'Courier',
  },
  rangeSubtext: {
    fontSize: 10, color: TACTICAL.textMuted, marginTop: 8,
    textAlign: 'center', fontStyle: 'italic',
  },

  // Rate card
  rateCard: {
    borderRadius: 12, borderWidth: 1, borderColor: TACTICAL.border,
    backgroundColor: 'rgba(0,0,0,0.15)', padding: 14, marginBottom: 12,
  },
  rateHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12,
  },
  rateTitle: {
    fontSize: 10, fontWeight: '900', color: TACTICAL.text, letterSpacing: 1.5,
  },
  rateRow: {
    marginBottom: 10,
  },
  rateLabel: {
    fontSize: 8, fontWeight: '800', color: TACTICAL.textMuted,
    letterSpacing: 1.5, marginBottom: 4,
  },
  rateBarContainer: {
    height: 6, borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.3)',
    overflow: 'hidden', position: 'relative',
    marginBottom: 4,
  },
  ratePlannedLine: {
    position: 'absolute', top: 0, bottom: 0, width: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  rateBar: {
    height: '100%', borderRadius: 3,
    flexDirection: 'row', alignItems: 'center',
  },
  rateBarFill: {
    width: 3, height: '100%', borderRadius: 3,
    position: 'absolute', right: 0,
  },
  rateValues: {
    flexDirection: 'row', alignItems: 'baseline', gap: 4,
  },
  rateActual: {
    fontSize: 14, fontWeight: '900', fontFamily: 'Courier',
  },
  ratePlanned: {
    fontSize: 10, color: TACTICAL.textMuted, fontFamily: 'Courier',
  },
  ratioRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(62,79,60,0.2)',
  },
  ratioLabel: {
    fontSize: 8, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 1.5,
  },
  ratioValue: {
    fontSize: 16, fontWeight: '900', fontFamily: 'Courier',
  },
  ratioDesc: {
    fontSize: 10, color: TACTICAL.textMuted,
  },

  // Trend badge
  trendBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
    borderWidth: 1,
  },
  trendText: {
    fontSize: 7, fontWeight: '900', letterSpacing: 1,
  },

  // Graph card
  graphCard: {
    borderRadius: 12, borderWidth: 1, borderColor: TACTICAL.border,
    backgroundColor: 'rgba(0,0,0,0.15)', padding: 14, marginBottom: 12,
  },
  graphTitle: {
    fontSize: 9, fontWeight: '800', color: TACTICAL.textMuted,
    letterSpacing: 2, marginBottom: 12,
  },

  // Event log
  eventLogCard: {
    borderRadius: 12, borderWidth: 1, borderColor: TACTICAL.border,
    backgroundColor: 'rgba(0,0,0,0.15)', padding: 14, marginBottom: 12,
  },
  eventLogRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: 'rgba(62,79,60,0.1)',
  },
  eventLogDot: {
    width: 6, height: 6, borderRadius: 3,
  },
  eventLogTime: {
    fontSize: 9, fontWeight: '700', color: TACTICAL.textMuted,
    fontFamily: 'Courier', width: 55,
  },
  eventLogDelta: {
    flex: 1, fontSize: 10, fontWeight: '700', color: TACTICAL.text,
  },
  eventLogRemaining: {
    fontSize: 11, fontWeight: '900', color: TACTICAL.text,
    fontFamily: 'Courier',
  },
});



