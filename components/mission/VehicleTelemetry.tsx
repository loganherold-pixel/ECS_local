// ============================================================
// VEHICLE SYSTEMS — MISSION TELEMETRY WIDGET
// ============================================================
// State-driven: shows Mission Telemetry when expedition active,
// otherwise shows Planning Estimator (placeholder).
// 2x2 primary readout grid + secondary ops strip.
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, Platform,
} from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import type { TelemetryReadout, MissionExpedition } from '../../lib/missionTypes';
import { telemetryConfigStore, computeTelemetryReadout } from '../../lib/telemetryStore';
import { LogFuelModal, LogWaterModal, PowerModal, BufferExplanationModal } from './TelemetryModals';

interface Props {
  expedition: MissionExpedition;
  isOnline: boolean;
  onTelemetryUpdate?: () => void;
}

// ── Color helpers ────────────────────────────────────────────
const GREEN = '#4CAF50';
const AMBER = '#C48A2C';
const RED = '#E53935';

function fuelColor(pct: number | null): string {
  if (pct === null) return AMBER;
  if (pct > 35) return GREEN;
  if (pct >= 15) return AMBER;
  return RED;
}

function waterColor(days: number | null): string {
  if (days === null) return AMBER;
  if (days > 2) return GREEN;
  if (days >= 1) return AMBER;
  return RED;
}

function powerColor(pct: number | null, configured: boolean): string {
  if (!configured) return AMBER;
  if (pct === null) return AMBER;
  if (pct > 35) return GREEN;
  if (pct >= 15) return AMBER;
  return RED;
}

function bufferColor(level: string): string {
  if (level === 'HIGH') return GREEN;
  if (level === 'MED') return AMBER;
  return RED;
}

function stateColor(state: string): string {
  if (state === 'LIVE') return GREEN;
  if (state === 'PARTIAL') return AMBER;
  return RED;
}

export default function VehicleTelemetry({ expedition, isOnline, onTelemetryUpdate }: Props) {
  const [readout, setReadout] = useState<TelemetryReadout | null>(null);
  const [activeModal, setActiveModal] = useState<'fuel' | 'water' | 'power' | 'buffer' | null>(null);
  const [updatedTile, setUpdatedTile] = useState<string | null>(null);

  // Pulse animation for LIVE indicator
  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  // Tile flash animations
  const tileFlashAnims = useRef({
    fuel: new Animated.Value(0),
    water: new Animated.Value(0),
    power: new Animated.Value(0),
    buffer: new Animated.Value(0),
  }).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 1200, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const refreshReadout = useCallback(() => {
    const r = computeTelemetryReadout(expedition.id);
    setReadout(r);
  }, [expedition.id]);

  useEffect(() => {
    refreshReadout();
  }, [refreshReadout]);

  // Flash tile on update
  const flashTile = (tile: string) => {
    const anim = tileFlashAnims[tile as keyof typeof tileFlashAnims];
    if (!anim) return;
    setUpdatedTile(tile);
    Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 150, useNativeDriver: false }),
      Animated.timing(anim, { toValue: 0, duration: 350, useNativeDriver: false }),
    ]).start(() => setUpdatedTile(null));
  };

  // ── Modal handlers ─────────────────────────────────────────
  const handleFuelSave = (gallons: number, mode: 'added' | 'used') => {
    telemetryConfigStore.logFuel(expedition.id, gallons, mode);
    refreshReadout();
    flashTile('fuel');
    onTelemetryUpdate?.();
  };

  const handleFuelMpgUpdate = (mpg: number) => {
    telemetryConfigStore.updateMpg(expedition.id, mpg);
    refreshReadout();
  };

  const handleWaterSave = (liters: number) => {
    telemetryConfigStore.logWater(expedition.id, liters);
    refreshReadout();
    flashTile('water');
    onTelemetryUpdate?.();
  };

  const handlePowerConfigure = (capacityWh: number, avgDrawW: number) => {
    telemetryConfigStore.configurePower(expedition.id, capacityWh, avgDrawW);
    refreshReadout();
    flashTile('power');
    onTelemetryUpdate?.();
  };

  const handlePowerLog = (whUsed?: number, percentUsed?: number) => {
    telemetryConfigStore.logPower(expedition.id, whUsed, percentUsed);
    refreshReadout();
    flashTile('power');
    onTelemetryUpdate?.();
  };

  if (!readout) return null;

  const borderCol = stateColor(readout.state);
  const config = telemetryConfigStore.get(expedition.id);

  return (
    <View style={[styles.container, { borderColor: `${borderCol}40` }]}>
      {/* Critical banners */}
      {readout.criticals.length > 0 && (
        <View style={styles.criticalBanner}>
          {readout.criticals.map((msg, i) => (
            <View key={i} style={styles.criticalRow}>
              <Ionicons name="alert-circle" size={12} color={RED} />
              <Text style={styles.criticalText}>{msg}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Top bar */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Text style={styles.widgetLabel}>VEHICLE SYSTEMS</Text>
          <Text style={styles.widgetSubLabel}>MISSION TELEMETRY</Text>
        </View>
        <View style={styles.topBarRight}>
          <View style={[styles.statePill, { backgroundColor: `${stateColor(readout.state)}15`, borderColor: `${stateColor(readout.state)}40` }]}>
            <Animated.View style={[styles.statePulseDot, { backgroundColor: stateColor(readout.state), opacity: pulseAnim }]} />
            <Text style={[styles.statePillText, { color: stateColor(readout.state) }]}>{readout.state}</Text>
          </View>
          <View style={styles.syncBadge}>
            <Ionicons
              name={isOnline ? 'cloud-done-outline' : 'cloud-offline-outline'}
              size={11}
              color={isOnline ? GREEN : TACTICAL.textMuted}
            />
            <Text style={[styles.syncText, { color: isOnline ? GREEN : TACTICAL.textMuted }]}>
              {isOnline ? 'SYNCED' : 'OFFLINE'}
            </Text>
          </View>
        </View>
      </View>

      {/* 2x2 Primary Readout Grid */}
      <View style={styles.grid}>
        {/* Tile A — FUEL RANGE */}
        <TouchableOpacity
          style={[styles.tile, tileBorderStyle(tileFlashAnims.fuel, fuelColor(readout.fuelPercent))]}
          onPress={() => setActiveModal('fuel')}
          activeOpacity={0.85}
        >
          <Animated.View style={[
            StyleSheet.absoluteFill,
            styles.tileFlash,
            {
              backgroundColor: fuelColor(readout.fuelPercent),
              opacity: tileFlashAnims.fuel.interpolate({ inputRange: [0, 1], outputRange: [0, 0.08] }),
            },
          ]} />
          <View style={styles.tileHeader}>
            <Ionicons name="flame-outline" size={12} color={fuelColor(readout.fuelPercent)} />
            <Text style={[styles.tileTitle, { color: fuelColor(readout.fuelPercent) }]}>FUEL RANGE</Text>
          </View>
          {readout.fuelConfigured ? (
            <>
              <Text style={[styles.tilePrimary, { color: fuelColor(readout.fuelPercent) }]}>
                {readout.fuelRangeMi ?? '--'}<Text style={styles.tilePrimaryUnit}> mi</Text>
              </Text>
              <Text style={styles.tileSecondary}>
                Safe Range: {readout.fuelSafeRangeMi ?? '--'} mi
              </Text>
              <Text style={styles.tileFooter}>
                Fuel Remaining: {readout.fuelRemainingGal?.toFixed(1) ?? '--'} gal
                {readout.fuelPercent !== null ? ` (${readout.fuelPercent}%)` : ''}
              </Text>
            </>
          ) : (
            <>
              <Text style={[styles.tilePrimary, { color: AMBER, fontSize: 16 }]}>NOT SET</Text>
              <Text style={styles.tileSecondary}>Tap to configure fuel</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Tile B — WATER AUTONOMY */}
        <TouchableOpacity
          style={[styles.tile, tileBorderStyle(tileFlashAnims.water, waterColor(readout.waterAutonomyDays))]}
          onPress={() => setActiveModal('water')}
          activeOpacity={0.85}
        >
          <Animated.View style={[
            StyleSheet.absoluteFill,
            styles.tileFlash,
            {
              backgroundColor: waterColor(readout.waterAutonomyDays),
              opacity: tileFlashAnims.water.interpolate({ inputRange: [0, 1], outputRange: [0, 0.08] }),
            },
          ]} />
          <View style={styles.tileHeader}>
            <Ionicons name="water-outline" size={12} color="#4FC3F7" />
            <Text style={[styles.tileTitle, { color: '#4FC3F7' }]}>WATER</Text>
          </View>
          {readout.waterConfigured ? (
            <>
              <Text style={[styles.tilePrimary, { color: waterColor(readout.waterAutonomyDays) }]}>
                {readout.waterAutonomyDays?.toFixed(1) ?? '--'}<Text style={styles.tilePrimaryUnit}> days</Text>
              </Text>
              <Text style={styles.tileSecondary}>
                Remaining: {readout.waterRemainingL?.toFixed(1) ?? '--'} L
              </Text>
              <Text style={styles.tileFooter}>
                Daily Burn: {readout.waterDailyBurnL?.toFixed(1) ?? '--'} L/day
              </Text>
            </>
          ) : (
            <>
              <Text style={[styles.tilePrimary, { color: AMBER, fontSize: 16 }]}>NOT SET</Text>
              <Text style={styles.tileSecondary}>Tap to configure water</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Tile C — POWER STATUS */}
        <TouchableOpacity
          style={[styles.tile, tileBorderStyle(tileFlashAnims.power, powerColor(readout.powerPercent, readout.powerConfigured))]}
          onPress={() => setActiveModal('power')}
          activeOpacity={0.85}
        >
          <Animated.View style={[
            StyleSheet.absoluteFill,
            styles.tileFlash,
            {
              backgroundColor: powerColor(readout.powerPercent, readout.powerConfigured),
              opacity: tileFlashAnims.power.interpolate({ inputRange: [0, 1], outputRange: [0, 0.08] }),
            },
          ]} />
          <View style={styles.tileHeader}>
            <Ionicons name="flash-outline" size={12} color="#7C4DFF" />
            <Text style={[styles.tileTitle, { color: '#7C4DFF' }]}>POWER</Text>
          </View>
          {readout.powerConfigured ? (
            <>
              <Text style={[styles.tilePrimary, { color: powerColor(readout.powerPercent, true) }]}>
                {readout.powerPercent ?? '--'}<Text style={styles.tilePrimaryUnit}>%</Text>
              </Text>
              <Text style={styles.tileSecondary}>
                Est. Hours: {readout.powerEstHours?.toFixed(1) ?? '--'} hr
              </Text>
              <Text style={styles.tileFooter}>
                Avg Draw: {readout.powerAvgDrawW ?? '--'} W
              </Text>
            </>
          ) : (
            <>
              <Text style={[styles.tilePrimary, { color: AMBER, fontSize: 14 }]}>NOT CONFIGURED</Text>
              <Text style={styles.tileSecondary}>Tap to set power source</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Tile D — MISSION BUFFER */}
        <TouchableOpacity
          style={[styles.tile, tileBorderStyle(tileFlashAnims.buffer, bufferColor(readout.bufferLevel))]}
          onPress={() => setActiveModal('buffer')}
          activeOpacity={0.85}
        >
          <Animated.View style={[
            StyleSheet.absoluteFill,
            styles.tileFlash,
            {
              backgroundColor: bufferColor(readout.bufferLevel),
              opacity: tileFlashAnims.buffer.interpolate({ inputRange: [0, 1], outputRange: [0, 0.08] }),
            },
          ]} />
          <View style={styles.tileHeader}>
            <Ionicons name="shield-outline" size={12} color={bufferColor(readout.bufferLevel)} />
            <Text style={[styles.tileTitle, { color: bufferColor(readout.bufferLevel) }]}>BUFFER</Text>
          </View>
          <Text style={[styles.tilePrimary, { color: bufferColor(readout.bufferLevel) }]}>
            {readout.bufferLevel}
          </Text>
          <Text style={styles.tileSecondary}>
            Margin: {readout.bufferPercent}%
          </Text>
          <Text style={styles.tileFooter}>
            Based on fuel + water + power
          </Text>
          {readout.bufferLimiter !== 'none' && (
            <Text style={[styles.limiterLine, { color: bufferColor(readout.bufferLevel) }]}>
              Limiter: {readout.bufferLimiter.charAt(0).toUpperCase() + readout.bufferLimiter.slice(1)}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Secondary Strip — Ops Metrics */}
      <View style={styles.secondaryStrip}>
        <View style={styles.stripItem}>
          <Ionicons name="speedometer-outline" size={11} color={TACTICAL.textMuted} />
          <Text style={styles.stripLabel}>DISTANCE</Text>
          <Text style={styles.stripValue}>{readout.distanceMi} mi</Text>
        </View>
        <View style={styles.stripDivider} />
        <View style={styles.stripItem}>
          <Ionicons name="time-outline" size={11} color={TACTICAL.textMuted} />
          <Text style={styles.stripLabel}>DURATION</Text>
          <Text style={styles.stripValue}>{readout.durationStr}</Text>
        </View>
        <View style={styles.stripDivider} />
        <View style={styles.stripItem}>
          <Ionicons name="sync-outline" size={11} color={TACTICAL.textMuted} />
          <Text style={styles.stripLabel}>LAST UPDATE</Text>
          <Text style={styles.stripValue}>{readout.lastUpdateStr}</Text>
        </View>
      </View>

      {/* ── Modals ──────────────────────────────────────────── */}
      <LogFuelModal
        visible={activeModal === 'fuel'}
        onClose={() => setActiveModal(null)}
        onSave={handleFuelSave}
        currentMpg={config.fuelMpg}
        onUpdateMpg={handleFuelMpgUpdate}
      />
      <LogWaterModal
        visible={activeModal === 'water'}
        onClose={() => setActiveModal(null)}
        onSave={handleWaterSave}
      />
      <PowerModal
        visible={activeModal === 'power'}
        onClose={() => setActiveModal(null)}
        isConfigured={readout.powerConfigured}
        onConfigure={handlePowerConfigure}
        onLogPower={handlePowerLog}
      />
      {readout && (
        <BufferExplanationModal
          visible={activeModal === 'buffer'}
          onClose={() => setActiveModal(null)}
          readout={readout}
          onOpenFuel={() => setActiveModal('fuel')}
          onOpenWater={() => setActiveModal('water')}
          onOpenPower={() => setActiveModal('power')}
        />
      )}
    </View>
  );
}

// Helper: dynamic border style for tiles (can't use Animated in StyleSheet)
function tileBorderStyle(_flashAnim: Animated.Value, color: string) {
  return { borderColor: `${color}25` };
}

// ============================================================
// STYLES
// ============================================================
const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: `${GREEN}30`,
    marginBottom: 14,
    overflow: 'hidden',
  },

  // Critical banner
  criticalBanner: {
    backgroundColor: 'rgba(229,57,53,0.08)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(229,57,53,0.2)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 4,
  },
  criticalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  criticalText: {
    fontSize: 10,
    fontWeight: '800',
    color: RED,
    letterSpacing: 0.5,
    flex: 1,
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  topBarLeft: { gap: 2 },
  widgetLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2.5,
  },
  widgetSubLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 1.5,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  statePulseDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  statePillText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  syncText: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // 2x2 Grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 10,
    gap: 6,
  },
  tile: {
    width: '48.5%' as any,
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    padding: 12,
    overflow: 'hidden',
    minHeight: 110,
  },
  tileFlash: {
    borderRadius: 12,
  },
  tileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 6,
  },
  tileTitle: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 2,
    color: TACTICAL.textMuted,
  },
  tilePrimary: {
    fontSize: 26,
    fontWeight: '900',
    fontFamily: 'Courier',
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  tilePrimaryUnit: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
  },
  tileSecondary: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    fontWeight: '600',
    marginBottom: 2,
  },
  tileFooter: {
    fontSize: 9,
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
    opacity: 0.7,
  },
  limiterLine: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 3,
  },

  // Secondary strip
  secondaryStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 10,
    marginTop: 8,
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.3)',
  },
  stripItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  stripLabel: {
    fontSize: 6,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  stripValue: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  stripDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(62,79,60,0.3)',
  },
});



