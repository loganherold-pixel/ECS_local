import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import type { TrailConditions, TrailFactorStatus } from '../../lib/weatherTypes';
import { getTrailStatusColor, getTrailOverallColor } from '../../lib/weatherTypes';

interface Props {
  conditions: TrailConditions | null | undefined;
}

function getFactorIcon(factor?: string | null): string {
  switch ((factor ?? '').toLowerCase()) {
    case 'surface': return 'trail-sign-outline';
    case 'visibility': return 'eye-outline';
    case 'wind': return 'flag-outline';
    case 'temperature': return 'thermometer-outline';
    case 'water crossings': return 'water-outline';
    default: return 'alert-circle-outline';
  }
}

function getStatusLabel(status?: TrailFactorStatus | null): string {
  switch (status) {
    case 'good': return 'GOOD';
    case 'caution': return 'CAUTION';
    case 'warning': return 'WARNING';
    case 'danger': return 'DANGER';
    default: return 'UNKNOWN';
  }
}

function getOverallLabel(overall?: string | null): string {
  switch (overall) {
    case 'good': return 'GOOD CONDITIONS';
    case 'fair': return 'FAIR — USE CAUTION';
    case 'poor': return 'POOR — ELEVATED RISK';
    case 'hazardous': return 'HAZARDOUS — HIGH RISK';
    default: return 'UNKNOWN';
  }
}

function safeUpper(value?: string | null): string {
  return (value ?? 'unknown').toUpperCase();
}

export default function TrailConditionsCard({ conditions }: Props) {
  const overall = conditions?.overall ?? 'fair';
  const factors = Array.isArray(conditions?.factors) ? conditions!.factors : [];

  const overallColor = getTrailOverallColor(overall as any);

  return (
    <View style={styles.container}>
      {/* Header with overall status */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="trail-sign-outline" size={13} color={TACTICAL.amber} />
          <Text style={styles.headerTitle}>TRAIL CONDITIONS</Text>
        </View>
        <View
          style={[
            styles.overallBadge,
            {
              backgroundColor: overallColor + '18',
              borderColor: overallColor + '40',
            },
          ]}
        >
          <View style={[styles.overallDot, { backgroundColor: overallColor }]} />
          <Text style={[styles.overallText, { color: overallColor }]}>
            {safeUpper(overall)}
          </Text>
        </View>
      </View>

      {/* Overall status bar */}
      <View style={[styles.overallBar, { borderColor: overallColor + '30' }]}>
        <Ionicons
          name={
            overall === 'good'
              ? 'checkmark-circle-outline'
              : overall === 'hazardous'
                ? 'alert-circle-outline'
                : 'information-circle-outline'
          }
          size={16}
          color={overallColor}
        />
        <Text style={[styles.overallLabel, { color: overallColor }]}>
          {getOverallLabel(overall)}
        </Text>
      </View>

      {/* Factor rows */}
      {factors.length > 0 ? (
        factors.map((factor, idx) => {
          const factorName = factor?.factor ?? 'Unknown Factor';
          const factorStatus = factor?.status;
          const factorDetail = factor?.detail ?? 'No detail available.';
          const color = getTrailStatusColor((factorStatus ?? 'caution') as TrailFactorStatus);
          const icon = getFactorIcon(factorName);

          return (
            <View
              key={`${factorName}_${idx}`}
              style={[
                styles.factorRow,
                idx < factors.length - 1 && styles.factorRowBorder,
              ]}
            >
              <View style={styles.factorHeader}>
                <Ionicons name={icon as any} size={13} color={color} />
                <Text style={styles.factorName}>{factorName}</Text>
                <View
                  style={[
                    styles.statusPill,
                    {
                      backgroundColor: color + '15',
                      borderColor: color + '35',
                    },
                  ]}
                >
                  <View style={[styles.statusDot, { backgroundColor: color }]} />
                  <Text style={[styles.statusText, { color }]}>
                    {getStatusLabel(factorStatus)}
                  </Text>
                </View>
              </View>
              <Text style={styles.factorDetail}>{factorDetail}</Text>
            </View>
          );
        })
      ) : (
        <View style={styles.emptyRow}>
          <Ionicons name="information-circle-outline" size={13} color={TACTICAL.textMuted} />
          <Text style={styles.emptyText}>
            Trail condition detail is not available for this weather source yet.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.35)',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62,79,60,0.20)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },
  overallBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  overallDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  overallText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  overallBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 14,
    marginTop: 10,
    marginBottom: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(62,79,60,0.06)',
    borderWidth: 1,
  },
  overallLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  factorRow: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  factorRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62,79,60,0.12)',
  },
  factorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  factorName: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 0.5,
    flex: 1,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  factorDetail: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    lineHeight: 15,
    marginLeft: 21,
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  emptyText: {
    flex: 1,
    fontSize: 10,
    color: TACTICAL.textMuted,
    lineHeight: 15,
  },
});