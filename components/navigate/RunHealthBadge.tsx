/**
 * RunHealthBadge — Displays run health status (Green/Yellow/Red)
 *
 * Shows:
 *   - Overall health indicator with color-coded dot
 *   - Individual warnings for range, roof, hitch
 *   - Expandable warning detail list
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL, TYPO, DENSITY } from '../../lib/theme';
import { type RunHealthResult, type RunHealthLevel } from '../../lib/runStore';

const HEALTH_COLORS: Record<RunHealthLevel, string> = {
  green: '#66BB6A',
  yellow: '#FFB74D',
  red: '#EF5350',
};

const HEALTH_LABELS: Record<RunHealthLevel, string> = {
  green: 'NOMINAL',
  yellow: 'CAUTION',
  red: 'CRITICAL',
};

const HEALTH_ICONS: Record<RunHealthLevel, string> = {
  green: 'checkmark-circle',
  yellow: 'warning',
  red: 'alert-circle',
};

interface Props {
  health: RunHealthResult;
  compact?: boolean;
}

export default function RunHealthBadge({ health, compact = false }: Props) {
  const [expanded, setExpanded] = useState(false);
  const color = HEALTH_COLORS[health.overall];
  const label = HEALTH_LABELS[health.overall];
  const icon = HEALTH_ICONS[health.overall];

  if (compact) {
    return (
      <View style={[styles.compactBadge, { borderColor: color + '60' }]}>
        <View style={[styles.healthDot, { backgroundColor: color }]} />
        <Text style={[styles.compactLabel, { color }]}>{label}</Text>
      </View>
    );
  }

  const hasWarnings = health.warnings.length > 0;
  const checks = [health.range, health.roof, health.hitch].filter(Boolean);

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.headerRow}
        onPress={() => hasWarnings && setExpanded(!expanded)}
        activeOpacity={hasWarnings ? 0.7 : 1}
      >
        <View style={styles.statusRow}>
          <Ionicons name={icon as any} size={18} color={color} />
          <Text style={[styles.statusLabel, { color }]}>{label}</Text>
          <Text style={styles.statusSub}>RUN HEALTH</Text>
        </View>
        {hasWarnings && (
          <View style={styles.expandRow}>
            <View style={[styles.warningCount, { backgroundColor: color + '20' }]}>
              <Text style={[styles.warningCountText, { color }]}>
                {health.warnings.length}
              </Text>
            </View>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={TACTICAL.textMuted}
            />
          </View>
        )}
      </TouchableOpacity>

      {/* Health checks row */}
      <View style={styles.checksRow}>
        {health.range && (
          <HealthCheck label="RANGE" level={health.range.level} message={health.range.message} />
        )}
        {health.roof && (
          <HealthCheck label="ROOF" level={health.roof.level} message={health.roof.message} />
        )}
        {health.hitch && (
          <HealthCheck label="HITCH" level={health.hitch.level} message={health.hitch.message} />
        )}
        {checks.length === 0 && (
          <Text style={styles.noChecks}>No build data — health checks unavailable</Text>
        )}
      </View>

      {/* Expanded warnings */}
      {expanded && hasWarnings && (
        <View style={styles.warningsList}>
          {health.warnings.map((w, i) => (
            <View key={i} style={styles.warningItem}>
              <Ionicons name="alert-circle" size={12} color={HEALTH_COLORS.red} />
              <Text style={styles.warningText}>{w}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function HealthCheck({ label, level, message }: { label: string; level: RunHealthLevel; message: string }) {
  const color = HEALTH_COLORS[level];
  return (
    <View style={styles.checkItem}>
      <View style={[styles.checkDot, { backgroundColor: color }]} />
      <View style={styles.checkInfo}>
        <Text style={styles.checkLabel}>{label}</Text>
        <Text style={[styles.checkMessage, { color: level === 'green' ? TACTICAL.textMuted : color }]} numberOfLines={1}>
          {message}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: DENSITY.borderDefault,
    borderColor: TACTICAL.border,
    padding: DENSITY.cardPad,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: DENSITY.internalRowGap,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusLabel: {
    ...TYPO.T3,
    letterSpacing: 3,
  },
  statusSub: {
    ...TYPO.T4,
    fontSize: 8,
    color: TACTICAL.textMuted,
    marginLeft: 4,
  },
  expandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  warningCount: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  warningCountText: {
    ...TYPO.K3,
    fontSize: 10,
  },
  checksRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 90,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(62,79,60,0.08)',
    borderRadius: 8,
  },
  checkDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  checkInfo: {
    flex: 1,
  },
  checkLabel: {
    ...TYPO.T4,
    fontSize: 7,
    letterSpacing: 3,
    marginBottom: 1,
  },
  checkMessage: {
    ...TYPO.B2,
    fontSize: 9,
  },
  noChecks: {
    ...TYPO.B2,
    fontSize: 10,
    color: TACTICAL.textMuted,
    fontStyle: 'italic',
  },
  warningsList: {
    marginTop: DENSITY.internalRowGap,
    paddingTop: DENSITY.internalRowGap,
    borderTopWidth: 1,
    borderTopColor: TACTICAL.border,
    gap: 6,
  },
  warningItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  warningText: {
    ...TYPO.B2,
    fontSize: 10,
    color: '#EF5350',
    flex: 1,
  },
  // Compact badge
  compactBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  healthDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  compactLabel: {
    ...TYPO.U2,
    fontSize: 8,
    letterSpacing: 3,
  },
});



