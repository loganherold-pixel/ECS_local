/**
 * Forecast Timeline
 * 
 * Displays a multi-day weather forecast with temperature ranges,
 * precipitation probability, wind speed, and weather conditions.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import type { DailyForecast } from '../../lib/weatherTypes';
import { getWeatherIcon, getWindDirection } from '../../lib/weatherTypes';
import { normalizeDailyForecastRows } from '../../lib/weatherForecastTimeline';

interface Props {
  forecast: DailyForecast[];
  units?: 'imperial' | 'metric';
}

function getDayLabel(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (dateStr === today.toISOString().split('T')[0]) return 'TODAY';
  if (dateStr === tomorrow.toISOString().split('T')[0]) return 'TOMORROW';
  return date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
}

function getDateLabel(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getPrecipColor(pop: number): string {
  if (pop >= 80) return '#42A5F5';
  if (pop >= 50) return '#64B5F6';
  if (pop >= 30) return '#90CAF9';
  return TACTICAL.textMuted;
}

function getTempBarWidth(temp: number | null, minAll: number, maxAll: number): number {
  if (temp == null || maxAll === minAll) return 0;
  return Math.max(0, Math.min(100, ((temp - minAll) / (maxAll - minAll)) * 100));
}

function finiteTemperature(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatForecastTemperature(value: number | null | undefined): string {
  const temp = finiteTemperature(value);
  return temp != null ? `${Math.round(temp)}°` : '—';
}

export default function ForecastTimeline({ forecast }: Props) {
  const dailyForecast = React.useMemo(
    () => normalizeDailyForecastRows(forecast ?? []),
    [forecast],
  );

  if (dailyForecast.length === 0) return null;

  // Compute global min/max for temperature bar scaling
  const allTemps = dailyForecast.flatMap(d => [d.temp_min, d.temp_max].filter(t => t != null) as number[]);
  const globalMin = allTemps.length > 0 ? Math.min(...allTemps) : 0;
  const globalMax = allTemps.length > 0 ? Math.max(...allTemps) : 100;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="calendar-outline" size={13} color={TACTICAL.amber} />
        <Text style={styles.headerTitle}>FORECAST</Text>
        <Text style={styles.headerSub}>{dailyForecast.length}-DAY</Text>
      </View>

      {dailyForecast.map((day, idx) => {
        const icon = getWeatherIcon(day.weather_main, day.weather_id);
        const isToday = getDayLabel(day.date) === 'TODAY';
        const dailyLow = finiteTemperature(day.temp_min);
        const dailyHigh = finiteTemperature(day.temp_max);
        const lowPct = getTempBarWidth(dailyLow, globalMin, globalMax);
        const highPct = getTempBarWidth(dailyHigh, globalMin, globalMax);
        const windMax = typeof day.wind_max === 'number' && Number.isFinite(day.wind_max) ? day.wind_max : null;
        const gustMax = typeof day.wind_gust_max === 'number' && Number.isFinite(day.wind_gust_max) ? day.wind_gust_max : null;
        const windDir = typeof day.wind_deg === 'number' && Number.isFinite(day.wind_deg)
          ? getWindDirection(day.wind_deg)
          : null;
        const dayTemp = typeof day.temp_day === 'number' && Number.isFinite(day.temp_day)
          ? day.temp_day
          : dailyLow != null && dailyHigh != null
            ? Math.round((dailyLow + dailyHigh) / 2)
            : dailyHigh ?? dailyLow ?? null;
        const hasPrecipChance = typeof day.pop === 'number' && Number.isFinite(day.pop) && day.pop > 0;

        return (
          <View
            key={day.date}
            style={[
              styles.dayRow,
              isToday && styles.dayRowToday,
              idx < dailyForecast.length - 1 && styles.dayRowBorder,
            ]}
          >
            {/* Day label */}
            <View style={styles.dayLabelCol}>
              <Text style={[styles.dayName, isToday && styles.dayNameToday]}>
                {getDayLabel(day.date)}
              </Text>
              <Text style={styles.dayDate}>{getDateLabel(day.date)}</Text>
            </View>

            {/* Weather icon + condition */}
            <View style={styles.conditionCol}>
              <Ionicons name={icon as any} size={16} color={isToday ? TACTICAL.amber : TACTICAL.textMuted} />
              <Text style={styles.dayTempText}>
                {dayTemp != null ? `${Math.round(dayTemp)}°` : '--'}
              </Text>
            </View>

            {/* Precipitation */}
            <View style={styles.precipCol}>
              {hasPrecipChance ? (
                <View style={styles.precipRow}>
                  <Ionicons name="water-outline" size={9} color={getPrecipColor(day.pop)} />
                  <Text style={[styles.precipText, { color: getPrecipColor(day.pop) }]}>
                    {day.pop}%
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Temperature range bar */}
            <View style={styles.tempBarCol}>
              <Text style={styles.tempLow}>
                {formatForecastTemperature(dailyLow)}
              </Text>
              <View style={styles.tempBarTrack}>
                <View
                  style={[
                    styles.tempBarFill,
                    {
                      left: `${lowPct}%`,
                      width: `${Math.max(highPct - lowPct, 4)}%`,
                    },
                  ]}
                />
              </View>
              <Text style={styles.tempHigh}>
                {formatForecastTemperature(dailyHigh)}
              </Text>
            </View>

            {/* Wind */}
            <View style={styles.windCol}>
              <Ionicons
                name="flag-outline"
                size={9}
                color={(gustMax ?? windMax) != null && (gustMax ?? windMax)! > 25 ? '#FF7043' : TACTICAL.textMuted}
              />
              <Text style={[
                styles.windText,
                (gustMax ?? windMax) != null && (gustMax ?? windMax)! > 25 && { color: '#FF7043' },
              ]}>
                {windMax != null ? `${Math.round(windMax)}${windDir ? ` ${windDir}` : ''}` : '--'}
              </Text>
              {gustMax != null && (
                <Text style={styles.gustText}>
                  G{Math.round(gustMax)}
                </Text>
              )}
            </View>
          </View>
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
    borderColor: 'rgba(62,79,60,0.35)',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62,79,60,0.20)',
  },
  headerTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
    flex: 1,
  },
  headerSub: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  dayRowToday: {
    backgroundColor: 'rgba(196,138,44,0.06)',
  },
  dayRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62,79,60,0.12)',
  },
  dayLabelCol: {
    width: 60,
  },
  dayName: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 0.8,
  },
  dayNameToday: {
    color: TACTICAL.amber,
  },
  dayDate: {
    fontSize: 8,
    color: TACTICAL.textMuted,
    marginTop: 1,
  },
  conditionCol: {
    width: 24,
    alignItems: 'center',
    gap: 2,
  },
  dayTempText: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  precipCol: {
    width: 36,
    alignItems: 'center',
  },
  precipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  precipText: {
    fontSize: 9,
    fontWeight: '700',
    fontFamily: 'Courier',
  },
  tempBarCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tempLow: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64B5F6',
    fontFamily: 'Courier',
    width: 28,
    textAlign: 'right',
  },
  tempBarTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(62,79,60,0.20)',
    position: 'relative',
    overflow: 'hidden',
  },
  tempBarFill: {
    position: 'absolute',
    top: 0,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(196,138,44,0.50)',
  },
  tempHigh: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FF7043',
    fontFamily: 'Courier',
    width: 28,
  },
  windCol: {
    width: 46,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    gap: 3,
  },
  windText: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
  },
  gustText: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
  },
});

