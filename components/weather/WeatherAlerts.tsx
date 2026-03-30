/**
 * Weather Alerts
 * 
 * Displays severe weather alerts and advisories with color-coded severity levels.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import type { WeatherAlert } from '../../lib/weatherTypes';
import { getAlertColor } from '../../lib/weatherTypes';

interface Props {
  alerts: WeatherAlert[];
}

function getAlertIcon(type: string): string {
  switch (type) {
    case 'wind': case 'forecast_wind': return 'flag-outline';
    case 'precipitation': case 'forecast_rain': return 'rainy-outline';
    case 'snow': return 'snow-outline';
    case 'visibility': return 'eye-off-outline';
    case 'heat': return 'flame-outline';
    case 'cold': return 'thermometer-outline';
    case 'thunderstorm': return 'thunderstorm-outline';
    default: return 'warning-outline';
  }
}

function getSeverityLabel(severity: string): string {
  switch (severity) {
    case 'extreme': return 'EXTREME';
    case 'warning': return 'WARNING';
    case 'advisory': return 'ADVISORY';
    default: return 'NOTICE';
  }
}

export default function WeatherAlerts({ alerts }: Props) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  if (!alerts || alerts.length === 0) return null;

  // Sort by severity: extreme > warning > advisory
  const sorted = [...alerts].sort((a, b) => {
    const order: Record<string, number> = { extreme: 0, warning: 1, advisory: 2 };
    return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="warning-outline" size={13} color="#EF5350" />
        <Text style={styles.headerTitle}>WEATHER ALERTS</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{alerts.length}</Text>
        </View>
      </View>

      {sorted.map((alert, idx) => {
        const color = getAlertColor(alert.severity);
        const icon = getAlertIcon(alert.type);
        const isExpanded = expandedIdx === idx;

        return (
          <TouchableOpacity
            key={`${alert.type}_${idx}`}
            style={[
              styles.alertRow,
              idx < sorted.length - 1 && styles.alertRowBorder,
              { borderLeftColor: color },
            ]}
            onPress={() => setExpandedIdx(isExpanded ? null : idx)}
            activeOpacity={0.85}
          >
            <View style={styles.alertHeader}>
              <View style={[styles.alertIconBg, { backgroundColor: color + '18' }]}>
                <Ionicons name={icon as any} size={14} color={color} />
              </View>
              <View style={styles.alertTitleSection}>
                <View style={styles.alertTitleRow}>
                  <Text style={[styles.alertTitle, { color }]} numberOfLines={1}>
                    {alert.title}
                  </Text>
                  <View style={[styles.severityBadge, { backgroundColor: color + '18', borderColor: color + '40' }]}>
                    <Text style={[styles.severityText, { color }]}>
                      {getSeverityLabel(alert.severity)}
                    </Text>
                  </View>
                </View>
              </View>
              <Ionicons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={TACTICAL.textMuted}
              />
            </View>

            {isExpanded && (
              <Text style={styles.alertDescription}>{alert.description}</Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(239,83,80,0.25)',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(239,83,80,0.15)',
  },
  headerTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#EF5350',
    letterSpacing: 1.5,
    flex: 1,
  },
  countBadge: {
    backgroundColor: 'rgba(239,83,80,0.15)',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(239,83,80,0.30)',
  },
  countText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#EF5350',
    fontFamily: 'Courier',
  },
  alertRow: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderLeftWidth: 3,
  },
  alertRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62,79,60,0.12)',
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  alertIconBg: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertTitleSection: {
    flex: 1,
  },
  alertTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  alertTitle: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    flex: 1,
  },
  severityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  severityText: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  alertDescription: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    lineHeight: 16,
    marginTop: 8,
    marginLeft: 38,
  },
});



