// ============================================================
// TELEMETRY STAT CHIPS — Live Resource Status Bar
// ============================================================
// Compact stat chips for fuel/water/power with:
// - Live percentages (color-coded green/amber/red)
// - Mini sparklines
// - Fuel range estimator
// - Tappable to open detail modals
// - Polling-driven updates
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import {
  pollTelemetry,
  getStatusHex,
  buildResourceHistory,
  POLL_INTERVAL_MS,
} from '../../lib/telemetryPolling';

import type { LiveTelemetryState } from '../../lib/telemetryPolling';

import { MiniSparkline } from './ConsumptionGraph';
import { FuelDetailModal, WaterDetailModal, PowerDetailModal } from './TelemetryDetailModals';

interface Props {
  expeditionId: string;
  onTelemetryPoll?: (state: LiveTelemetryState) => void;
}

export default function TelemetryStatChips({ expeditionId, onTelemetryPoll }: Props) {
  const [telemetry, setTelemetry] = useState<LiveTelemetryState | null>(null);
  const [activeModal, setActiveModal] = useState<'fuel' | 'water' | 'power' | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(0.5)).current;

  // Pulse animation for live indicator
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.5, duration: 1000, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  // Poll telemetry
  const doPoll = useCallback(() => {
    try {
      const state = pollTelemetry(expeditionId);
      setTelemetry(state);
      setPollCount(c => c + 1);
      onTelemetryPoll?.(state);
    } catch (err) {
      console.warn('[TelemetryStatChips] Poll error:', err);
    }
  }, [expeditionId, onTelemetryPoll]);

  // Initial poll + interval
  useEffect(() => {
    doPoll(); // immediate first poll

    pollIntervalRef.current = setInterval(doPoll, POLL_INTERVAL_MS);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [doPoll]);

  // Re-poll when modal closes (user may have logged resources)
  const handleModalClose = useCallback((modal: 'fuel' | 'water' | 'power') => {
    setActiveModal(null);
    // Fast re-poll
    setTimeout(doPoll, 300);
  }, [doPoll]);

  if (!telemetry) return null;

  const { readout, config, fuelRate, waterRate, powerRate, fuelRange, fuelStatus, waterStatus, powerStatus } = telemetry;

  // Build history for sparklines
  const fuelHistory = buildResourceHistory(expeditionId, 'fuel');
  const waterHistory = buildResourceHistory(expeditionId, 'water');
  const powerHistory = buildResourceHistory(expeditionId, 'power');

  // Compute water percent
  const waterPct = config.waterCapacityL && config.waterRemainingL !== null
    ? Math.round((config.waterRemainingL / config.waterCapacityL) * 100)
    : null;

  return (
    <View style={styles.container}>
      {/* Header Row */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Animated.View style={[styles.liveDot, { opacity: pulseAnim, backgroundColor: getStatusHex(telemetry.overallStatus) }]} />
          <Text style={styles.headerLabel}>LIVE TELEMETRY</Text>
        </View>
        <Text style={styles.pollBadge}>
          {telemetry.readout.lastUpdateStr}
        </Text>
      </View>

      {/* Stat Chips Row */}
      <View style={styles.chipsRow}>
        {/* FUEL CHIP */}
        <TouchableOpacity
          style={[styles.chip, { borderColor: `${getStatusHex(fuelStatus)}30` }]}
          onPress={() => setActiveModal('fuel')}
          activeOpacity={0.7}
        >
          <View style={styles.chipTop}>
            <View style={[styles.chipIconWrap, { backgroundColor: `${getStatusHex(fuelStatus)}12` }]}>
              <Ionicons name="flame-outline" size={11} color={getStatusHex(fuelStatus)} />
            </View>
            <Text style={[styles.chipLabel, { color: getStatusHex(fuelStatus) }]}>FUEL</Text>
          </View>
          <View style={styles.chipValueRow}>
            <Text style={[styles.chipValue, { color: getStatusHex(fuelStatus) }]}>
              {readout.fuelPercent !== null ? `${readout.fuelPercent}%` : '--'}
            </Text>
            <MiniSparkline data={fuelHistory} color={getStatusHex(fuelStatus)} width={36} height={14} />
          </View>
          <Text style={styles.chipSub}>
            {readout.fuelConfigured
              ? `${readout.fuelRemainingGal?.toFixed(1) ?? '--'} gal`
              : 'NOT SET'}
          </Text>
          {/* Rate indicator */}
          {fuelRate && (
            <View style={[styles.ratePill, { backgroundColor: `${getStatusHex(fuelRate.status)}10`, borderColor: `${getStatusHex(fuelRate.status)}30` }]}>
              <Ionicons
                name={fuelRate.trend === 'increasing' ? 'trending-up' : fuelRate.trend === 'decreasing' ? 'trending-down' : 'remove-outline'}
                size={8}
                color={getStatusHex(fuelRate.status)}
              />
              <Text style={[styles.rateText, { color: getStatusHex(fuelRate.status) }]}>
                {fuelRate.ratePerDay.toFixed(1)}/d
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* WATER CHIP */}
        <TouchableOpacity
          style={[styles.chip, { borderColor: `${getStatusHex(waterStatus)}30` }]}
          onPress={() => setActiveModal('water')}
          activeOpacity={0.7}
        >
          <View style={styles.chipTop}>
            <View style={[styles.chipIconWrap, { backgroundColor: `${getStatusHex(waterStatus)}12` }]}>
              <Ionicons name="water-outline" size={11} color={getStatusHex(waterStatus)} />
            </View>
            <Text style={[styles.chipLabel, { color: getStatusHex(waterStatus) }]}>WATER</Text>
          </View>
          <View style={styles.chipValueRow}>
            <Text style={[styles.chipValue, { color: getStatusHex(waterStatus) }]}>
              {waterPct !== null ? `${waterPct}%` : '--'}
            </Text>
            <MiniSparkline data={waterHistory} color={getStatusHex(waterStatus)} width={36} height={14} />
          </View>
          <Text style={styles.chipSub}>
            {readout.waterConfigured
              ? `${readout.waterRemainingL?.toFixed(1) ?? '--'} L`
              : 'NOT SET'}
          </Text>
          {waterRate && (
            <View style={[styles.ratePill, { backgroundColor: `${getStatusHex(waterRate.status)}10`, borderColor: `${getStatusHex(waterRate.status)}30` }]}>
              <Ionicons
                name={waterRate.trend === 'increasing' ? 'trending-up' : waterRate.trend === 'decreasing' ? 'trending-down' : 'remove-outline'}
                size={8}
                color={getStatusHex(waterRate.status)}
              />
              <Text style={[styles.rateText, { color: getStatusHex(waterRate.status) }]}>
                {waterRate.ratePerDay.toFixed(1)}/d
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* POWER CHIP */}
        <TouchableOpacity
          style={[styles.chip, { borderColor: `${getStatusHex(powerStatus)}30` }]}
          onPress={() => setActiveModal('power')}
          activeOpacity={0.7}
        >
          <View style={styles.chipTop}>
            <View style={[styles.chipIconWrap, { backgroundColor: `${getStatusHex(powerStatus)}12` }]}>
              <Ionicons name="flash-outline" size={11} color={getStatusHex(powerStatus)} />
            </View>
            <Text style={[styles.chipLabel, { color: getStatusHex(powerStatus) }]}>POWER</Text>
          </View>
          <View style={styles.chipValueRow}>
            <Text style={[styles.chipValue, { color: getStatusHex(powerStatus) }]}>
              {readout.powerPercent !== null ? `${readout.powerPercent}%` : '--'}
            </Text>
            <MiniSparkline data={powerHistory} color={getStatusHex(powerStatus)} width={36} height={14} />
          </View>
          <Text style={styles.chipSub}>
            {readout.powerConfigured
              ? `${readout.powerEstHours?.toFixed(1) ?? '--'} hr`
              : 'NOT SET'}
          </Text>
          {powerRate && (
            <View style={[styles.ratePill, { backgroundColor: `${getStatusHex(powerRate.status)}10`, borderColor: `${getStatusHex(powerRate.status)}30` }]}>
              <Ionicons
                name={powerRate.trend === 'increasing' ? 'trending-up' : powerRate.trend === 'decreasing' ? 'trending-down' : 'remove-outline'}
                size={8}
                color={getStatusHex(powerRate.status)}
              />
              <Text style={[styles.rateText, { color: getStatusHex(powerRate.status) }]}>
                {powerRate.ratePerDay.toFixed(0)}/d
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Mini Fuel Range Estimator */}
      {readout.fuelConfigured && (
        <TouchableOpacity
          style={styles.rangeStrip}
          onPress={() => setActiveModal('fuel')}
          activeOpacity={0.7}
        >
          <View style={styles.rangeLeft}>
            <Ionicons name="speedometer-outline" size={12} color="#FF9500" />
            <Text style={styles.rangeLabel}>FUEL RANGE</Text>
          </View>
          <View style={styles.rangeCenter}>
            <View style={styles.rangeItem}>
              <Text style={styles.rangeItemValue}>{fuelRange.trendRangeMi ?? '--'}</Text>
              <Text style={styles.rangeItemUnit}>mi est</Text>
            </View>
            <View style={styles.rangeDivider} />
            <View style={styles.rangeItem}>
              <Text style={[styles.rangeItemValue, { color: '#4CAF50' }]}>{fuelRange.safeRangeMi ?? '--'}</Text>
              <Text style={styles.rangeItemUnit}>mi safe</Text>
            </View>
            {fuelRange.hoursRemaining !== null && (
              <>
                <View style={styles.rangeDivider} />
                <View style={styles.rangeItem}>
                  <Text style={[styles.rangeItemValue, { color: TACTICAL.text }]}>{fuelRange.hoursRemaining}</Text>
                  <Text style={styles.rangeItemUnit}>hr left</Text>
                </View>
              </>
            )}
          </View>
          {fuelRange.confidence !== 'low' && (
            <View style={[styles.confidenceDot, {
              backgroundColor: fuelRange.confidence === 'high' ? '#4CAF50' : '#C48A2C',
            }]} />
          )}
        </TouchableOpacity>
      )}

      {/* Detail Modals */}
      <FuelDetailModal
        visible={activeModal === 'fuel'}
        onClose={() => handleModalClose('fuel')}
        expeditionId={expeditionId}
        rate={fuelRate}
        range={fuelRange}
        readout={readout}
        config={config}
        status={fuelStatus}
      />
      <WaterDetailModal
        visible={activeModal === 'water'}
        onClose={() => handleModalClose('water')}
        expeditionId={expeditionId}
        rate={waterRate}
        readout={readout}
        config={config}
        status={waterStatus}
      />
      <PowerDetailModal
        visible={activeModal === 'power'}
        onClose={() => handleModalClose('power')}
        expeditionId={expeditionId}
        rate={powerRate}
        readout={readout}
        config={config}
        status={powerStatus}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  headerLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  pollBadge: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },

  // Chips row
  chipsRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
  },

  // Individual chip
  chip: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    padding: 10,
    gap: 4,
  },
  chipTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  chipIconWrap: {
    width: 18,
    height: 18,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipLabel: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  chipValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chipValue: {
    fontSize: 18,
    fontWeight: '900',
    fontFamily: 'Courier',
    letterSpacing: -0.5,
  },
  chipSub: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
  },
  ratePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    alignSelf: 'flex-start',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    marginTop: 2,
  },
  rateText: {
    fontSize: 7,
    fontWeight: '800',
    fontFamily: 'Courier',
  },

  // Range strip
  rangeStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,149,0,0.04)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,149,0,0.15)',
    gap: 8,
  },
  rangeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  rangeLabel: {
    fontSize: 7,
    fontWeight: '900',
    color: '#FF9500',
    letterSpacing: 1.5,
  },
  rangeCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  rangeItem: {
    alignItems: 'center',
  },
  rangeItemValue: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FF9500',
    fontFamily: 'Courier',
  },
  rangeItemUnit: {
    fontSize: 6,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },
  rangeDivider: {
    width: 1,
    height: 18,
    backgroundColor: 'rgba(255,149,0,0.15)',
  },
  confidenceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});



