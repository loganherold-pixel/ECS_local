/**
 * PowerDeviceCard — Phase 3G-2
 *
 * Compact card showing per-device power telemetry contributions.
 * Displays device name, model badge, SOC, solar input, and load output.
 *
 * Rules:
 *   - Hides rows with undefined values
 *   - Shows "Idle" if all telemetry values are undefined
 *   - Dark ECS card with subtle amber divider
 *   - Compact vertical layout with rounded corners
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeIcon } from '../../../components/SafeIcon';
import { SPACING, RADIUS, GOLD_RAIL } from '../../../lib/theme';

// ── Props ────────────────────────────────────────────────────
export interface PowerDeviceCardProps {
  name?: string;
  model?: string;
  deviceId?: string;
  socPct?: number;
  wattsIn?: number;
  wattsOut?: number;
  solarWatts?: number;
  /** Palette from ThemeContext — optional, falls back to ECS defaults */
  palette?: {
    panel: string;
    text: string;
    textMuted: string;
    amber: string;
    border: string;
  };
}

// ── Defaults ─────────────────────────────────────────────────
const DEFAULT_PALETTE = {
  panel: '#111418',
  text: '#E6EDF3',
  textMuted: '#8B949E',
  amber: '#D4A017',
  border: '#1E232B',
};

// ── SOC color helper ─────────────────────────────────────────
function socColor(soc: number | undefined): string {
  if (soc === undefined) return '#555';
  if (soc >= 60) return '#34C759';
  if (soc >= 30) return '#FFB800';
  if (soc >= 15) return '#FF9500';
  return '#FF3B30';
}

// ── Format watts ─────────────────────────────────────────────
function fmtW(w: number | undefined): string {
  if (w === undefined || w === null) return '--';
  if (w >= 1000) return `${(w / 1000).toFixed(1)}k`;
  return `${Math.round(w)}`;
}

// ── Stat Row sub-component ───────────────────────────────────
function StatRow({
  icon,
  label,
  value,
  unit,
  valueColor,
  mutedColor,
  amberColor,
}: {
  icon: string;
  label: string;
  value: string;
  unit: string;
  valueColor: string;
  mutedColor: string;
  amberColor: string;
}) {
  return (
    <View style={statStyles.row}>
      <SafeIcon name={icon} size={13} color={amberColor} />
      <Text style={[statStyles.label, { color: mutedColor }]}>{label}</Text>
      <Text style={[statStyles.value, { color: valueColor }]}>{value}</Text>
      <Text style={[statStyles.unit, { color: mutedColor }]}>{unit}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
  },
  label: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  value: {
    fontSize: 15,
    fontWeight: '800',
    fontFamily: 'Courier',
    letterSpacing: 0.5,
    minWidth: 36,
    textAlign: 'right',
  },
  unit: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    width: 18,
  },
});

// ── Main Component ───────────────────────────────────────────
export default function PowerDeviceCard({
  name,
  model,
  deviceId,
  socPct,
  wattsIn,
  wattsOut,
  solarWatts,
  palette: paletteProp,
}: PowerDeviceCardProps) {
  const p = paletteProp ?? DEFAULT_PALETTE;

  // Determine if all telemetry values are undefined → "Idle"
  const hasAnyValue =
    socPct !== undefined ||
    wattsIn !== undefined ||
    wattsOut !== undefined ||
    solarWatts !== undefined;

  const displayName = name || deviceId || 'Unknown Device';

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: p.panel,
          borderColor: p.border,
        },
      ]}
    >
      {/* ── Header row: name + model badge ──────────────── */}
      <View style={styles.headerRow}>
        <View
          style={[
            styles.iconWrap,
            { backgroundColor: p.amber + '12' },
          ]}
        >
          <SafeIcon name="hardware-chip-outline" size={16} color={p.amber} />
        </View>
        <View style={styles.headerInfo}>
          <Text
            style={[styles.deviceName, { color: p.text }]}
            numberOfLines={1}
          >
            {displayName}
          </Text>
          {model && (
            <View
              style={[
                styles.modelBadge,
                {
                  backgroundColor: p.amber + '10',
                  borderColor: p.amber + '25',
                },
              ]}
            >
              <Text style={[styles.modelText, { color: p.amber }]}>
                {model}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Amber divider ───────────────────────────────── */}
      <View
        style={[
          styles.divider,
          { backgroundColor: GOLD_RAIL.subsection },
        ]}
      />

      {/* ── Telemetry values ────────────────────────────── */}
      {hasAnyValue ? (
        <View style={styles.statsContainer}>
          {socPct !== undefined && (
            <StatRow
              icon="battery-half-outline"
              label="SOC"
              value={`${socPct.toFixed(1)}`}
              unit="%"
              valueColor={socColor(socPct)}
              mutedColor={p.textMuted}
              amberColor={p.amber}
            />
          )}
          {solarWatts !== undefined && (
            <StatRow
              icon="sunny-outline"
              label="Solar"
              value={fmtW(solarWatts)}
              unit="W"
              valueColor={solarWatts > 0 ? '#FFD700' : p.textMuted}
              mutedColor={p.textMuted}
              amberColor={p.amber}
            />
          )}
          {wattsOut !== undefined && (
            <StatRow
              icon="flash-outline"
              label="Load"
              value={fmtW(wattsOut)}
              unit="W"
              valueColor={wattsOut > 50 ? '#FF9500' : p.textMuted}
              mutedColor={p.textMuted}
              amberColor={p.amber}
            />
          )}
          {wattsIn !== undefined && wattsIn > 0 && (
            <StatRow
              icon="arrow-down-outline"
              label="Input"
              value={fmtW(wattsIn)}
              unit="W"
              valueColor="#34C759"
              mutedColor={p.textMuted}
              amberColor={p.amber}
            />
          )}
        </View>
      ) : (
        /* ── Idle state ──────────────────────────────────── */
        <View style={styles.idleContainer}>
          <SafeIcon name="moon-outline" size={16} color={p.textMuted} />
          <Text style={[styles.idleText, { color: p.textMuted }]}>
            Idle
          </Text>
        </View>
      )}

      {/* ── Device ID footer ────────────────────────────── */}
      {deviceId && (
        <Text
          style={[styles.deviceIdText, { color: p.textMuted }]}
          numberOfLines={1}
        >
          {deviceId}
        </Text>
      )}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },

  // ── Header ────────────────────────────────────────────
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  deviceName: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  modelBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  modelText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 2,
  },

  // ── Divider ───────────────────────────────────────────
  divider: {
    height: GOLD_RAIL.subsectionWidth,
    marginVertical: SPACING.sm,
  },

  // ── Stats ─────────────────────────────────────────────
  statsContainer: {
    gap: 0,
  },

  // ── Idle ──────────────────────────────────────────────
  idleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SPACING.sm,
  },
  idleText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },

  // ── Device ID footer ──────────────────────────────────
  deviceIdText: {
    fontSize: 9,
    fontFamily: 'Courier',
    letterSpacing: 0.5,
    marginTop: SPACING.xs,
    textAlign: 'right',
  },
});

