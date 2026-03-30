/**
 * VehicleStatusScreen — Trip/Expedition Summary for Vehicle Surfaces
 *
 * HighwayDrive:
 *   - Trip distance, duration, daylight remaining, connectivity forecast
 *
 * ExpeditionDrive:
 *   - Remoteness index, distance from start, elevation gain
 *   - Vehicle systems summary, weather risk
 *   - Adaptive Expedition Guidance (Phase 11)
 *   - Collaborative Expedition Intelligence (Phase 12)
 */

import React from 'react';
import { View, StyleSheet, Text, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type {
  VehicleStatusData,
  VehicleSystemStatus,
} from '../../lib/vehicleDisplayTypes';

import AdaptiveGuidancePanel from '../../components/intelligence/AdaptiveGuidancePanel';
import CollaborativeIntelPanel from '../../components/intelligence/CollaborativeIntelPanel';

interface Props {
  data: VehicleStatusData;
}

export default function VehicleStatusScreen({ data }: Props) {
  const isHighway = data.mode === 'highway_drive';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.screenTitle}>
        {isHighway ? 'TRIP STATUS' : 'EXPEDITION STATUS'}
      </Text>

      {isHighway ? (
        <HighwayStatus data={data} />
      ) : (
        <ExpeditionStatus data={data} />
      )}
    </ScrollView>
  );
}

function HighwayStatus({ data }: { data: VehicleStatusData }) {
  return (
    <View style={styles.grid}>
      <StatusCard
        icon="speedometer-outline"
        label="TRIP DISTANCE"
        value={data.tripDistanceMiles != null ? `${data.tripDistanceMiles.toFixed(1)} mi` : '--'}
        color="#5B8DEF"
      />
      <StatusCard
        icon="time-outline"
        label="TRIP DURATION"
        value={data.tripDurationHours != null
          ? data.tripDurationHours < 1
            ? `${Math.round(data.tripDurationHours * 60)} min`
            : `${data.tripDurationHours.toFixed(1)} hrs`
          : '--'}
        color="#5B8DEF"
      />
      <StatusCard
        icon="sunny-outline"
        label="DAYLIGHT LEFT"
        value={data.daylightRemainingHours != null
          ? `${data.daylightRemainingHours.toFixed(1)} hrs`
          : '--'}
        color={data.daylightRemainingHours != null && data.daylightRemainingHours < 1 ? '#EF5350' : '#E0A030'}
      />
      <StatusCard
        icon="wifi"
        label="CONNECTIVITY"
        value={data.connectivityForecast.toUpperCase()}
        color={
          data.connectivityForecast === 'strong' ? '#4CAF50' :
          data.connectivityForecast === 'moderate' ? '#E0A030' :
          data.connectivityForecast === 'weak' ? '#EF5350' :
          data.connectivityForecast === 'none' ? '#C0392B' : '#8B949E'
        }
      />
    </View>
  );
}

function ExpeditionStatus({ data }: { data: VehicleStatusData }) {
  const remotenessColor =
    (data.remotenessIndex ?? 0) > 60 ? '#EF5350' :
    (data.remotenessIndex ?? 0) > 35 ? '#E67E22' :
    (data.remotenessIndex ?? 0) > 15 ? '#C48A2C' : '#4CAF50';

  const weatherRiskColor =
    data.weatherRisk === 'severe' ? '#C0392B' :
    data.weatherRisk === 'high' ? '#EF5350' :
    data.weatherRisk === 'moderate' ? '#E67E22' :
    data.weatherRisk === 'low' ? '#4CAF50' : '#8B949E';

  return (
    <View>
      {/* Primary KPIs */}
      <View style={styles.grid}>
        <StatusCard
          icon="radio-outline"
          label="REMOTENESS"
          value={data.remotenessIndex != null ? `${data.remotenessIndex}` : '--'}
          subtitle={data.remotenessTier || undefined}
          color={remotenessColor}
          large
        />
        <StatusCard
          icon="trail-sign-outline"
          label="FROM START"
          value={data.distanceFromStartMiles != null
            ? `${data.distanceFromStartMiles.toFixed(1)} mi`
            : '--'}
          color="#D4A017"
          large
        />
      </View>

      {/* Secondary KPIs */}
      <View style={styles.grid}>
        <StatusCard
          icon="trending-up-outline"
          label="ELEV GAIN"
          value={data.elevationGainFt != null ? `${data.elevationGainFt.toLocaleString()} ft` : '--'}
          color="#D4A017"
        />
        <StatusCard
          icon="thunderstorm-outline"
          label="WEATHER RISK"
          value={data.weatherRisk.toUpperCase()}
          color={weatherRiskColor}
        />
      </View>

      {/* ── Phase 11: Adaptive Expedition Guidance ── */}
      <View style={styles.guidanceSection}>
        <AdaptiveGuidancePanel />
      </View>

      {/* ── Phase 12: Collaborative Expedition Intelligence ── */}
      <View style={styles.guidanceSection}>
        <CollaborativeIntelPanel />
      </View>

      {/* Vehicle Systems */}
      {data.vehicleSystemsSummary.length > 0 && (
        <View style={styles.systemsSection}>
          <Text style={styles.sectionTitle}>VEHICLE SYSTEMS</Text>
          {data.vehicleSystemsSummary.map((sys) => (
            <SystemRow key={sys.id} system={sys} />
          ))}
        </View>
      )}

      {data.vehicleSystemsSummary.length === 0 && (
        <View style={styles.systemsSection}>
          <Text style={styles.sectionTitle}>VEHICLE SYSTEMS</Text>
          <View style={styles.noDataRow}>
            <Ionicons name="checkmark-circle-outline" size={16} color="#4CAF50" />
            <Text style={styles.noDataText}>All systems nominal</Text>
          </View>
        </View>
      )}
    </View>
  );
}

function StatusCard({
  icon,
  label,
  value,
  subtitle,
  color,
  large,
}: {
  icon: string;
  label: string;
  value: string;
  subtitle?: string;
  color: string;
  large?: boolean;
}) {
  return (
    <View style={[styles.card, large && styles.cardLarge]}>
      <View style={styles.cardHeader}>
        <Ionicons name={icon as any} size={large ? 22 : 18} color={color} />
        <Text style={styles.cardLabel}>{label}</Text>
      </View>
      <Text style={[styles.cardValue, large && styles.cardValueLarge, { color }]}>
        {value}
      </Text>
      {subtitle && (
        <Text style={styles.cardSubtitle}>{subtitle}</Text>
      )}
    </View>
  );
}

function SystemRow({ system }: { system: VehicleSystemStatus }) {
  const statusColor =
    system.status === 'nominal' ? '#4CAF50' :
    system.status === 'warning' ? '#E67E22' :
    system.status === 'critical' ? '#EF5350' : '#555';

  const statusIcon =
    system.status === 'nominal' ? 'checkmark-circle' :
    system.status === 'warning' ? 'alert-circle' :
    system.status === 'critical' ? 'close-circle' : 'remove-circle';

  return (
    <View style={styles.systemRow}>
      <Ionicons name={statusIcon as any} size={16} color={statusColor} />
      <Text style={styles.systemLabel}>{system.label}</Text>
      <Text style={[styles.systemStatus, { color: statusColor }]}>
        {system.status.toUpperCase()}
      </Text>
      {system.value && (
        <Text style={styles.systemValue}>{system.value}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0E12',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  screenTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 5,
    color: '#8B949E',
    marginBottom: 16,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  card: {
    flex: 1,
    backgroundColor: '#111418',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1E232B',
  },
  cardLarge: {
    paddingVertical: 18,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  cardLabel: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 3,
    color: '#8B949E',
  },
  cardValue: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'Courier',
    color: '#E6EDF3',
  },
  cardValueLarge: {
    fontSize: 24,
  },
  cardSubtitle: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 2,
    color: '#8B949E',
    marginTop: 4,
  },
  guidanceSection: {
    marginBottom: 12,
  },
  systemsSection: {
    marginTop: 8,
    backgroundColor: '#111418',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1E232B',
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 4,
    color: '#D4A017',
    marginBottom: 12,
  },
  systemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  systemLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: '#E6EDF3',
  },
  systemStatus: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
  },
  systemValue: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8B949E',
    fontFamily: 'Courier',
    marginLeft: 8,
  },
  noDataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  noDataText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#4CAF50',
  },
});




