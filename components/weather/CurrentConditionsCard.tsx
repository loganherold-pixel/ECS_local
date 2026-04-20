/**
 * Current Conditions Card
 * 
 * Displays current weather conditions with temperature, wind, humidity,
 * pressure, visibility, and weather description.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import type { CurrentConditions } from '../../lib/weatherTypes';
import { getWeatherIcon, getWindDirection } from '../../lib/weatherTypes';

interface Props {
  conditions: CurrentConditions;
  locationName?: string | null;
  units?: 'imperial' | 'metric';
}

function MetricBox({ icon, label, value, unit, color }: {
  icon: string; label: string; value: string; unit?: string; color?: string;
}) {
  return (
    <View style={styles.metricBox}>
      <Ionicons name={icon as any} size={14} color={color || TACTICAL.textMuted} />
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={styles.metricValueRow}>
        <Text style={styles.metricValue}>{value}</Text>
        {unit ? <Text style={styles.metricUnit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

export default function CurrentConditionsCard({ conditions, locationName, units = 'imperial' }: Props) {
  const tempUnit = units === 'imperial' ? 'F' : 'C';
  const speedUnit = units === 'imperial' ? 'mph' : 'm/s';
  const weatherIcon = getWeatherIcon(conditions.weather_main, conditions.weather_id);
  const windDir = getWindDirection(conditions.wind_deg);

  // Determine temperature color
  const temp = conditions.temp;
  let tempColor: string = TACTICAL.text;
  if (temp != null) {
    if (units === 'imperial') {
      if (temp > 100) tempColor = '#EF5350';
      else if (temp > 90) tempColor = '#FF7043';
      else if (temp < 32) tempColor = '#42A5F5';
      else if (temp < 20) tempColor = '#64B5F6';
    }
  }

  const sunriseTime = conditions.sunrise
    ? new Date(conditions.sunrise * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '--';
  const sunsetTime = conditions.sunset
    ? new Date(conditions.sunset * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '--';

  return (
    <View style={styles.container}>
      {/* Location + description */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Ionicons name="location-outline" size={12} color={TACTICAL.amber} />
          <Text style={styles.locationName} numberOfLines={1}>
            {locationName || conditions.location_name || 'Current Location'}
          </Text>
        </View>
        {conditions.dt && (
          <Text style={styles.timestamp}>
            {new Date(conditions.dt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        )}
      </View>

      {/* Main temperature + weather */}
      <View style={styles.mainRow}>
        <View style={styles.tempSection}>
          <Ionicons name={weatherIcon as any} size={32} color={TACTICAL.amber} />
          <View style={styles.tempValues}>
            <Text style={[styles.tempBig, { color: tempColor }]}>
              {temp != null ? Math.round(temp) : '--'}°
            </Text>
            <Text style={styles.tempFeelsLike}>
              Feels {conditions.feels_like != null ? `${Math.round(conditions.feels_like)}°` : '--'}
            </Text>
          </View>
        </View>
        <View style={styles.descSection}>
          <Text style={styles.weatherMain}>{conditions.weather_main || '--'}</Text>
          <Text style={styles.weatherDesc}>{conditions.weather_description || '--'}</Text>
          <View style={styles.hiLoRow}>
            <Ionicons name="arrow-up-outline" size={10} color="#FF7043" />
            <Text style={styles.hiLoText}>{conditions.temp_max != null ? `${Math.round(conditions.temp_max)}°` : '--'}</Text>
            <Ionicons name="arrow-down-outline" size={10} color="#42A5F5" />
            <Text style={styles.hiLoText}>{conditions.temp_min != null ? `${Math.round(conditions.temp_min)}°` : '--'}</Text>
          </View>
        </View>
      </View>

      {/* Metrics grid */}
      <View style={styles.metricsGrid}>
        <MetricBox
          icon="speedometer-outline"
          label="WIND"
          value={conditions.wind_speed != null ? `${Math.round(conditions.wind_speed)}` : '--'}
          unit={`${speedUnit} ${windDir}`}
          color={conditions.wind_speed != null && conditions.wind_speed > 25 ? '#FF7043' : undefined}
        />
        <MetricBox
          icon="water-outline"
          label="HUMIDITY"
          value={conditions.humidity != null ? `${conditions.humidity}` : '--'}
          unit="%"
        />
        <MetricBox
          icon="eye-outline"
          label="VISIBILITY"
          value={conditions.visibility != null ? `${(conditions.visibility / 1000).toFixed(1)}` : '--'}
          unit="km"
        />
        <MetricBox
          icon="cellular-outline"
          label="PRESSURE"
          value={conditions.pressure != null ? `${conditions.pressure}` : '--'}
          unit="hPa"
        />
      </View>

      {/* Wind gust + sun times */}
      <View style={styles.bottomRow}>
        {conditions.wind_gust != null && (
          <View style={styles.bottomItem}>
            <Ionicons name="flag-outline" size={10} color={TACTICAL.textMuted} />
            <Text style={styles.bottomText}>Gusts {Math.round(conditions.wind_gust)} {speedUnit}</Text>
          </View>
        )}
        <View style={styles.bottomItem}>
          <Ionicons name="sunny-outline" size={10} color="#FFB300" />
          <Text style={styles.bottomText}>{sunriseTime}</Text>
        </View>
        <View style={styles.bottomItem}>
          <Ionicons name="moon-outline" size={10} color="#7986CB" />
          <Text style={styles.bottomText}>{sunsetTime}</Text>
        </View>
        {conditions.clouds != null && (
          <View style={styles.bottomItem}>
            <Ionicons name="cloud-outline" size={10} color={TACTICAL.textMuted} />
            <Text style={styles.bottomText}>{conditions.clouds}%</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.35)',
    padding: 14,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  locationName: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 0.8,
    flex: 1,
  },
  timestamp: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  tempSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tempValues: {
    alignItems: 'flex-start',
  },
  tempBig: {
    fontSize: 36,
    fontWeight: '900',
    color: TACTICAL.text,
    fontFamily: 'Courier',
    lineHeight: 40,
  },
  tempFeelsLike: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    fontWeight: '600',
    marginTop: -2,
  },
  descSection: {
    flex: 1,
    alignItems: 'flex-end',
  },
  weatherMain: {
    fontSize: 13,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 1,
  },
  weatherDesc: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    textTransform: 'capitalize',
    marginTop: 2,
  },
  hiLoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  hiLoText: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  metricBox: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(62,79,60,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.20)',
  },
  metricLabel: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  metricValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '900',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  metricUnit: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
  },
  bottomRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  bottomItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  bottomText: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
  },
});



