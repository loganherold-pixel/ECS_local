/**
 * PowerForecastPanel — Phase 3H-2 / 3H-3
 *
 * Compact panel showing power forecast derived from current telemetry:
 *   • Net watts (+/-)
 *   • Estimated time to depletion OR time to full
 *   • Confidence indicator chip (Low / Med / High)
 *   • Stale data warning chip
 *   • System capacity display (Phase 3H-3)
 *
 * Uses computePowerForecast() from Phase 3H-1.
 * Dark ECS card with amber accents, compact vertical layout.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeIcon } from '../../../components/SafeIcon';
import { SPACING, RADIUS, GOLD_RAIL } from '../../../lib/theme';
import {
  computePowerForecast,
  type PowerForecast,
  type PowerForecastStatus,
  type PowerForecastConfidence,
} from '../../power/forecast/powerForecast';

// ── Props ────────────────────────────────────────────────────────────────
export interface PowerForecastPanelProps {
  socPct?: number;
  wattsIn?: number;
  wattsOut?: number;
  capacityWh?: number;
  stale?: boolean;
  /** Palette from ThemeContext */
  palette?: {
    panel: string;
    text: string;
    textMuted: string;
    amber: string;
    border: string;
  };
}

// ── Defaults ─────────────────────────────────────────────────────────────
const DEFAULT_PALETTE = {
  panel: '#111418',
  text: '#E6EDF3',
  textMuted: '#8B949E',
  amber: '#D4A017',
  border: '#1E232B',
};

// ── Status colors ────────────────────────────────────────────────────────
const STATUS_COLORS: Record<PowerForecastStatus, string> = {
  draining: '#FF9500',
  charging: '#34C759',
  balanced: '#5AC8FA',
  unknown: '#8B949E',
};

const STATUS_ICONS: Record<PowerForecastStatus, string> = {
  draining: 'trending-down-outline',
  charging: 'trending-up-outline',
  balanced: 'swap-horizontal-outline',
  unknown: 'help-circle-outline',
};

const STATUS_LABELS: Record<PowerForecastStatus, string> = {
  draining: 'DRAINING',
  charging: 'CHARGING',
  balanced: 'BALANCED',
  unknown: 'UNKNOWN',
};

// ── Confidence colors ────────────────────────────────────────────────────
const CONFIDENCE_COLORS: Record<PowerForecastConfidence, string> = {
  high: '#34C759',
  medium: '#FFB800',
  low: '#FF9500',
};

const CONFIDENCE_LABELS: Record<PowerForecastConfidence, string> = {
  high: 'HIGH',
  medium: 'MED',
  low: 'LOW',
};

// ── Format helpers ───────────────────────────────────────────────────────

/** Format minutes into human-readable duration string */
function fmtDuration(min: number | undefined): string {
  if (min === undefined || min === null) return '--';
  if (min <= 0) return '0m';
  if (min < 1) return '<1m';

  const totalMin = Math.round(min);

  if (totalMin >= 1440) {
    const d = Math.floor(totalMin / 1440);
    const h = Math.floor((totalMin % 1440) / 60);
    return h > 0 ? `${d}d ${h}h` : `${d}d`;
  }

  if (totalMin >= 60) {
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  return `${totalMin}m`;
}

/** Format net watts with sign */
function fmtNetWatts(w: number | undefined): string {
  if (w === undefined || w === null) return '--';
  const sign = w >= 0 ? '+' : '';
  if (Math.abs(w) >= 1000) {
    return `${sign}${(w / 1000).toFixed(1)} kW`;
  }
  return `${sign}${Math.round(w)} W`;
}

/** Format capacity Wh for display */
function fmtCapacity(wh: number | undefined): string {
  if (wh === undefined || wh === null) return '--';
  if (wh >= 1000) {
    return `${(wh / 1000).toFixed(1)} kWh`;
  }
  return `${Math.round(wh)} Wh`;
}

// ── Main Component ───────────────────────────────────────────────────────
export default function PowerForecastPanel({
  socPct,
  wattsIn,
  wattsOut,
  capacityWh,
  stale,
  palette: paletteProp,
}: PowerForecastPanelProps) {
  const p = paletteProp ?? DEFAULT_PALETTE;

  // Compute forecast
  const forecast: PowerForecast = useMemo(
    () =>
      computePowerForecast({
        socPct,
        wattsIn,
        wattsOut,
        capacityWh,
      }),
    [socPct, wattsIn, wattsOut, capacityWh],
  );

  const statusColor = STATUS_COLORS[forecast.status];
  const statusIcon = STATUS_ICONS[forecast.status];
  const confColor = CONFIDENCE_COLORS[forecast.confidence];
  const confLabel = CONFIDENCE_LABELS[forecast.confidence];

  // Determine the primary estimate message
  const estimateMessage = useMemo(() => {
    switch (forecast.status) {
      case 'draining':
        return forecast.estDepletionMin !== undefined
          ? `Depletion in ${fmtDuration(forecast.estDepletionMin)}`
          : 'Draining — estimate unavailable';
      case 'charging':
        if (forecast.estFullMin !== undefined && forecast.estFullMin <= 0) {
          return 'Fully charged';
        }
        return forecast.estFullMin !== undefined
          ? `Full in ${fmtDuration(forecast.estFullMin)}`
          : 'Charging — estimate unavailable';
      case 'balanced':
        return 'Net near zero';
      case 'unknown':
      default:
        return 'Need capacity + SOC to forecast';
    }
  }, [forecast]);

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
      {/* ── Header row ──────────────────────────────────────── */}
      <View style={styles.headerRow}>
        <View style={[styles.iconWrap, { backgroundColor: p.amber + '12' }]}>
          <SafeIcon name="analytics-outline" size={16} color={p.amber} />
        </View>
        <Text style={[styles.headerTitle, { color: p.amber }]}>FORECAST</Text>

        {/* Chips: stale + confidence */}
        <View style={styles.chipRow}>
          {stale && (
            <View
              style={[
                styles.chip,
                {
                  backgroundColor: '#FF9500' + '18',
                  borderColor: '#FF9500' + '40',
                },
              ]}
            >
              <SafeIcon name="warning-outline" size={10} color="#FF9500" />
              <Text style={[styles.chipText, { color: '#FF9500' }]}>STALE</Text>
            </View>
          )}
          <View
            style={[
              styles.chip,
              {
                backgroundColor: confColor + '15',
                borderColor: confColor + '35',
              },
            ]}
          >
            <View style={[styles.confDot, { backgroundColor: confColor }]} />
            <Text style={[styles.chipText, { color: confColor }]}>
              {confLabel}
            </Text>
          </View>
        </View>
      </View>

      {/* ── Amber divider ───────────────────────────────────── */}
      <View
        style={[styles.divider, { backgroundColor: GOLD_RAIL.subsection }]}
      />

      {/* ── Status + Net watts row ──────────────────────────── */}
      <View style={styles.mainRow}>
        {/* Status icon + label */}
        <View style={styles.statusCol}>
          <View
            style={[
              styles.statusIconWrap,
              { backgroundColor: statusColor + '15' },
            ]}
          >
            <SafeIcon name={statusIcon} size={18} color={statusColor} />
          </View>
          <Text style={[styles.statusLabel, { color: statusColor }]}>
            {STATUS_LABELS[forecast.status]}
          </Text>
        </View>

        {/* Net watts */}
        <View style={styles.netCol}>
          <Text style={[styles.netLabel, { color: p.textMuted }]}>NET</Text>
          <Text
            style={[
              styles.netValue,
              {
                color:
                  forecast.netWatts !== undefined ? statusColor : p.textMuted,
              },
            ]}
          >
            {fmtNetWatts(forecast.netWatts)}
          </Text>
        </View>
      </View>

      {/* ── Estimate message ────────────────────────────────── */}
      <View
        style={[
          styles.estimateRow,
          { backgroundColor: statusColor + '08', borderColor: statusColor + '20' },
        ]}
      >
        <SafeIcon
          name={
            forecast.status === 'draining'
              ? 'hourglass-outline'
              : forecast.status === 'charging'
                ? 'battery-charging-outline'
                : forecast.status === 'balanced'
                  ? 'checkmark-circle-outline'
                  : 'information-circle-outline'
          }
          size={14}
          color={statusColor}
        />
        <Text style={[styles.estimateText, { color: p.text }]}>
          {estimateMessage}
        </Text>
      </View>

      {/* ── System Capacity (Phase 3H-3) ────────────────────── */}
      {capacityWh !== undefined && capacityWh > 0 && (
        <View style={styles.capacityRow}>
          <SafeIcon name="cube-outline" size={13} color={p.textMuted} />
          <Text style={[styles.capacityLabel, { color: p.textMuted }]}>
            System Capacity
          </Text>
          <Text style={[styles.capacityValue, { color: p.text }]}>
            {fmtCapacity(capacityWh)}
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
  },

  // ── Header ────────────────────────────────────────────────
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  confDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },

  // ── Divider ───────────────────────────────────────────────
  divider: {
    height: GOLD_RAIL.subsectionWidth,
    marginVertical: SPACING.sm,
  },

  // ── Main row ──────────────────────────────────────────────
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  statusCol: {
    alignItems: 'center',
    gap: 4,
  },
  statusIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusLabel: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 2,
  },
  netCol: {
    flex: 1,
    alignItems: 'flex-end',
  },
  netLabel: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  netValue: {
    fontSize: 26,
    fontWeight: '900',
    fontFamily: 'Courier',
    letterSpacing: -0.5,
  },

  // ── Estimate row ──────────────────────────────────────────
  estimateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  estimateText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // ── System Capacity row (Phase 3H-3) ──────────────────────
  capacityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
  },
  capacityLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  capacityValue: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: 'Courier',
    letterSpacing: 0.5,
  },
});


