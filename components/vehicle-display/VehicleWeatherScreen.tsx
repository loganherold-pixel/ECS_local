/**
 * VehicleWeatherScreen — Weather Display for Vehicle Surfaces
 *
 * Common:
 *   - Radar overlay, storm movement, wind speed/direction
 *   - Temperature trend, weather alerts
 *
 * ExpeditionDrive extras:
 *   - Lightning risk, wind exposure, temperature drop forecast
 */

import React from 'react';
import { View, StyleSheet, Text, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { VehicleWeatherData, VehicleWeatherAlert } from '../../lib/vehicleDisplayTypes';

interface Props {
  data: VehicleWeatherData;
}

export default function VehicleWeatherScreen({ data }: Props) {
  const isExpedition = data.mode === 'expedition_drive';
  const accentColor = isExpedition ? '#D4A017' : '#5B8DEF';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.screenTitle}>WEATHER INTELLIGENCE</Text>

      {/* Current conditions */}
      <View style={styles.currentSection}>
        <View style={styles.tempRow}>
          <View style={styles.tempMain}>
            <Text style={[styles.tempValue, { color: accentColor }]}>
              {data.temperatureF != null ? `${Math.round(data.temperatureF)}\u00B0` : '--'}
            </Text>
            <Text style={styles.tempUnit}>F</Text>
          </View>
          <View style={styles.tempDetails}>
            <Text style={styles.weatherMain}>
              {data.weatherMain || 'Unknown'}
            </Text>
            <Text style={styles.weatherDesc}>
              {data.weatherDescription || 'No data available'}
            </Text>
            {data.feelsLikeF != null && (
              <Text style={styles.feelsLike}>
                Feels like {Math.round(data.feelsLikeF)}\u00B0F
              </Text>
            )}
          </View>
        </View>

        {/* Temperature trend */}
        <View style={styles.trendRow}>
          <Ionicons
            name={
              data.temperatureTrend === 'rising' ? 'trending-up' :
              data.temperatureTrend === 'falling' ? 'trending-down' :
              'remove-outline'
            }
            size={18}
            color={
              data.temperatureTrend === 'rising' ? '#EF5350' :
              data.temperatureTrend === 'falling' ? '#5AC8FA' :
              '#8B949E'
            }
          />
          <Text style={styles.trendText}>
            Temperature {data.temperatureTrend === 'unknown' ? 'trend unknown' : data.temperatureTrend}
          </Text>
        </View>
      </View>

      {/* Wind & Conditions Grid */}
      <View style={styles.grid}>
        <WeatherCard
          icon="flag-outline"
          label="WIND"
          value={data.windSpeedMph != null ? `${Math.round(data.windSpeedMph)} mph` : '--'}
          subtitle={data.windDirection || undefined}
          color={accentColor}
        />
        <WeatherCard
          icon="water-outline"
          label="HUMIDITY"
          value={data.humidity != null ? `${data.humidity}%` : '--'}
          color={accentColor}
        />
      </View>

      <View style={styles.grid}>
        <WeatherCard
          icon="cloudy-outline"
          label="STORM MOVEMENT"
          value={data.stormMovement || 'None detected'}
          color={data.stormMovement ? '#E67E22' : '#4CAF50'}
        />
        <WeatherCard
          icon="radio-outline"
          label="RADAR"
          value={data.radarOverlay ? 'Active' : 'Inactive'}
          color={data.radarOverlay ? '#4CAF50' : '#8B949E'}
        />
      </View>

      {/* ExpeditionDrive extras */}
      {isExpedition && (
        <View style={styles.expeditionExtras}>
          <Text style={styles.sectionTitle}>EXPEDITION WEATHER RISKS</Text>

          <View style={styles.grid}>
            <RiskCard
              icon="flash-outline"
              label="LIGHTNING"
              risk={data.lightningRisk}
            />
            <RiskCard
              icon="flag-outline"
              label="WIND EXPOSURE"
              risk={data.windExposure}
            />
          </View>

          {data.temperatureDropForecastF != null && (
            <View style={styles.tempDropCard}>
              <Ionicons name="thermometer-outline" size={20} color="#5AC8FA" />
              <View style={styles.tempDropContent}>
                <Text style={styles.tempDropLabel}>TEMPERATURE DROP FORECAST</Text>
                <Text style={styles.tempDropValue}>
                  -{Math.abs(data.temperatureDropForecastF)}\u00B0F expected
                </Text>
              </View>
            </View>
          )}
        </View>
      )}

      {/* Weather Alerts */}
      {data.weatherAlerts.length > 0 && (
        <View style={styles.alertsSection}>
          <Text style={styles.sectionTitle}>ACTIVE ALERTS</Text>
          {data.weatherAlerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} />
          ))}
        </View>
      )}

      {data.weatherAlerts.length === 0 && (
        <View style={styles.noAlertsRow}>
          <Ionicons name="checkmark-circle-outline" size={16} color="#4CAF50" />
          <Text style={styles.noAlertsText}>No active weather alerts</Text>
        </View>
      )}
    </ScrollView>
  );
}

function WeatherCard({
  icon,
  label,
  value,
  subtitle,
  color,
}: {
  icon: string;
  label: string;
  value: string;
  subtitle?: string;
  color: string;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name={icon as any} size={18} color={color} />
        <Text style={styles.cardLabel}>{label}</Text>
      </View>
      <Text style={[styles.cardValue, { color }]}>{value}</Text>
      {subtitle && <Text style={styles.cardSubtitle}>{subtitle}</Text>}
    </View>
  );
}

function RiskCard({
  icon,
  label,
  risk,
}: {
  icon: string;
  label: string;
  risk: string;
}) {
  const riskColor =
    risk === 'high' || risk === 'exposed' ? '#EF5350' :
    risk === 'moderate' ? '#E67E22' :
    risk === 'low' || risk === 'sheltered' ? '#4CAF50' : '#8B949E';

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name={icon as any} size={18} color={riskColor} />
        <Text style={styles.cardLabel}>{label}</Text>
      </View>
      <Text style={[styles.riskValue, { color: riskColor }]}>
        {risk.toUpperCase()}
      </Text>
    </View>
  );
}

function AlertCard({ alert }: { alert: VehicleWeatherAlert }) {
  const severityColor =
    alert.severity === 'emergency' ? '#C0392B' :
    alert.severity === 'warning' ? '#EF5350' :
    alert.severity === 'watch' ? '#E67E22' : '#5AC8FA';

  const severityIcon =
    alert.severity === 'emergency' ? 'alert-circle' :
    alert.severity === 'warning' ? 'warning' :
    alert.severity === 'watch' ? 'eye' : 'information-circle';

  return (
    <View style={[styles.alertCard, { borderLeftColor: severityColor }]}>
      <View style={styles.alertHeader}>
        <Ionicons name={severityIcon as any} size={18} color={severityColor} />
        <Text style={[styles.alertTitle, { color: severityColor }]}>
          {alert.title}
        </Text>
        <Text style={styles.alertSeverity}>
          {alert.severity.toUpperCase()}
        </Text>
      </View>
      <Text style={styles.alertDescription} numberOfLines={2}>
        {alert.description}
      </Text>
      {alert.expiresAt && (
        <Text style={styles.alertExpires}>
          Expires: {new Date(alert.expiresAt).toLocaleTimeString()}
        </Text>
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
  currentSection: {
    backgroundColor: '#111418',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1E232B',
  },
  tempRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  tempMain: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  tempValue: {
    fontSize: 42,
    fontWeight: '700',
    fontFamily: 'Courier',
  },
  tempUnit: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8B949E',
    marginTop: 8,
  },
  tempDetails: {
    flex: 1,
  },
  weatherMain: {
    fontSize: 16,
    fontWeight: '700',
    color: '#E6EDF3',
    marginBottom: 2,
  },
  weatherDesc: {
    fontSize: 12,
    color: '#8B949E',
    marginBottom: 2,
  },
  feelsLike: {
    fontSize: 11,
    color: '#8B949E',
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  trendText: {
    fontSize: 12,
    color: '#8B949E',
  },
  grid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  card: {
    flex: 1,
    backgroundColor: '#111418',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1E232B',
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
    fontSize: 16,
    fontWeight: '700',
    color: '#E6EDF3',
  },
  cardSubtitle: {
    fontSize: 10,
    color: '#8B949E',
    marginTop: 2,
  },
  riskValue: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
  },
  expeditionExtras: {
    marginTop: 4,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 4,
    color: '#D4A017',
    marginBottom: 10,
  },
  tempDropCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(90,200,250,0.1)',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(90,200,250,0.2)',
  },
  tempDropContent: {
    flex: 1,
  },
  tempDropLabel: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 3,
    color: '#5AC8FA',
    marginBottom: 4,
  },
  tempDropValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#5AC8FA',
  },
  alertsSection: {
    marginTop: 4,
  },
  alertCard: {
    backgroundColor: '#111418',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1E232B',
    borderLeftWidth: 3,
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  alertTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  alertSeverity: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#8B949E',
  },
  alertDescription: {
    fontSize: 12,
    color: '#8B949E',
    lineHeight: 18,
  },
  alertExpires: {
    fontSize: 10,
    color: '#555',
    marginTop: 4,
  },
  noAlertsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
    paddingVertical: 16,
  },
  noAlertsText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#4CAF50',
  },
});





