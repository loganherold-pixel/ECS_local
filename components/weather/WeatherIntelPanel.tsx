/**
 * Weather Intelligence Panel
 * 
 * Main weather panel component that orchestrates weather data fetching
 * and displays current conditions, forecast, alerts, and trail conditions.
 * 
 * Offline Support:
 * - Shows stale cached data with age indicator when offline
 * - Displays "unavailable" state gracefully with fallback data
 * - Auto-refreshes when connectivity is restored
 * - Never crashes when weather data is missing
 */
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Platform,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import {
  fetchWeatherWithStatus,
  getAnyCachedWeather,
  getWeatherAge,
  getWeatherStaleness,
  type WeatherFetchResult,
} from '../../lib/weatherStore';
import type { WeatherCoordinate, WaypointWeather } from '../../lib/weatherTypes';
import { getTrailOverallColor } from '../../lib/weatherTypes';
import { useApp } from '../../context/AppContext';
import CurrentConditionsCard from './CurrentConditionsCard';
import ForecastTimeline from './ForecastTimeline';
import WeatherAlerts from './WeatherAlerts';
import TrailConditionsCard from './TrailConditionsCard';

type WeatherTab = 'current' | 'forecast' | 'trail';

interface Props {
  /** Coordinates to fetch weather for (waypoints along route) */
  coordinates?: WeatherCoordinate[];
  /** Single coordinate fallback (e.g., user location or expedition center) */
  latitude?: number | null;
  longitude?: number | null;
  locationLabel?: string;
  /** Whether to auto-fetch on mount */
  autoFetch?: boolean;
  /** Compact mode for inline display */
  compact?: boolean;
  /** Units preference */
  units?: 'imperial' | 'metric';
}

export default function WeatherIntelPanel({
  coordinates,
  latitude,
  longitude,
  locationLabel,
  autoFetch = true,
  compact = false,
  units = 'imperial',
}: Props) {
  const { isOnline } = useApp();

  const [tab, setTab] = useState<WeatherTab>('current');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weatherData, setWeatherData] = useState<WaypointWeather[] | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(!compact);
  const [selectedWaypointIdx, setSelectedWaypointIdx] = useState(0);

  // Data source tracking for offline/stale indicators
  const [dataSource, setDataSource] = useState<'live' | 'cache_fresh' | 'cache_stale' | 'fallback' | null>(null);
  const [cachedAt, setCachedAt] = useState<number | null>(null);

  const mountedRef = useRef(true);
  const prevOnlineRef = useRef(isOnline);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  // Build coordinates array
  const effectiveCoords = useMemo<WeatherCoordinate[]>(() => {
    if (coordinates && coordinates.length > 0) return coordinates;
    if (latitude != null && longitude != null) {
      return [{ lat: latitude, lng: longitude, label: locationLabel || 'Current Position' }];
    }
    return [];
  }, [coordinates, latitude, longitude, locationLabel]);

  // Load any cached data on mount (including stale)
  useEffect(() => {
    if (effectiveCoords.length === 0) return;
    const cached = getAnyCachedWeather(effectiveCoords);
    if (cached) {
      setWeatherData(cached.data.results);
      setFetchedAt(cached.data.fetched_at);
      setCachedAt(cached.cachedAt);
      // Determine if it's fresh or stale
      const staleness = getWeatherStaleness(cached.cachedAt);
      setDataSource(staleness === 'fresh' ? 'cache_fresh' : 'cache_stale');
    }
  }, [effectiveCoords]);

  // Auto-fetch on mount
  useEffect(() => {
    if (autoFetch && effectiveCoords.length > 0 && !weatherData) {
      handleFetch();
    }
  }, [autoFetch, effectiveCoords.length]);

  // Auto-refresh when coming back online
  useEffect(() => {
    if (isOnline && !prevOnlineRef.current && effectiveCoords.length > 0) {
      // Just came back online — refresh weather data
      console.log('[WeatherPanel] Connectivity restored — refreshing weather');
      handleFetch(true);
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline, effectiveCoords.length]);

  const handleFetch = useCallback(async (force = false) => {
    if (effectiveCoords.length === 0) {
      setError('No coordinates available for weather lookup');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result: WeatherFetchResult = await fetchWeatherWithStatus(
        effectiveCoords,
        units,
        force,
      );

      if (!mountedRef.current) return;

      setWeatherData(result.data.results);
      setFetchedAt(result.data.fetched_at);
      setDataSource(result.source);
      setCachedAt(result.cachedAt);

      // Show error only if we got degraded data
      if (result.source === 'fallback') {
        setError(result.error || 'Weather data unavailable');
      } else if (result.source === 'cache_stale') {
        setError(result.error || 'Using cached data — unable to refresh');
      } else {
        setError(null);
      }
    } catch (err: any) {
      if (!mountedRef.current) return;
      setError(err?.message || 'Failed to fetch weather data');
    }
    if (mountedRef.current) setLoading(false);
  }, [effectiveCoords, units]);

  const selectedWeather = weatherData && weatherData.length > 0
    ? weatherData[Math.min(selectedWaypointIdx, weatherData.length - 1)]
    : null;

  const totalAlerts = weatherData
    ? weatherData.reduce((sum, w) => sum + (w.alerts?.length || 0), 0)
    : 0;

  const hasAlerts = totalAlerts > 0;

  // Determine worst trail condition across all waypoints
  const worstTrailStatus = useMemo(() => {
    if (!weatherData) return null;
    const order = ['good', 'fair', 'poor', 'hazardous'];
    let worst = 0;
    for (const w of weatherData) {
      if (w.trail_conditions) {
        const idx = order.indexOf(w.trail_conditions.overall);
        if (idx > worst) worst = idx;
      }
    }
    return order[worst] as any;
  }, [weatherData]);

  // Staleness info for UI
  const stalenessInfo = useMemo(() => {
    if (!cachedAt) return null;
    return {
      age: getWeatherAge(cachedAt),
      level: getWeatherStaleness(cachedAt),
    };
  }, [cachedAt]);

  const isFallback = dataSource === 'fallback';
  const isStale = dataSource === 'cache_stale';
  const showOfflineBanner = !isOnline || isStale || isFallback;

  if (effectiveCoords.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyHeader}>
          <Ionicons name="cloud-outline" size={14} color={TACTICAL.textMuted} />
          <Text style={styles.emptyTitle}>WEATHER INTEL</Text>
        </View>
        <Text style={styles.emptyText}>
          No location data available. Add waypoints or enable GPS to view weather intelligence.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Panel header */}
      <TouchableOpacity
        style={styles.panelHeader}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.85}
      >
        <View style={styles.panelHeaderLeft}>
          <View style={[
            styles.weatherIconBg,
            isFallback && { borderColor: 'rgba(138,138,133,0.28)', backgroundColor: 'rgba(138,138,133,0.12)' },
          ]}>
            <Ionicons
              name={isFallback ? 'cloud-offline-outline' : 'cloud-outline'}
              size={16}
              color={isFallback ? TACTICAL.textMuted : TACTICAL.amber}
            />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.panelTitleRow}>
              <Text style={styles.panelTitle}>WEATHER INTELLIGENCE</Text>
              {!isOnline && (
                <View style={styles.offlinePill}>
                  <View style={styles.offlineDot} />
                  <Text style={styles.offlinePillText}>OFFLINE</Text>
                </View>
              )}
            </View>
            <View style={styles.panelSubRow}>
              {selectedWeather?.current?.temp != null ? (
                <Text style={styles.panelTemp}>
                  {Math.round(selectedWeather.current.temp)}°
                  {' '}{selectedWeather.current.weather_main || ''}
                </Text>
              ) : isFallback ? (
                <Text style={[styles.panelTemp, { color: TACTICAL.textMuted }]}>
                  Data unavailable
                </Text>
              ) : null}
              {worstTrailStatus && (
                <View style={[
                  styles.trailMiniPill,
                  { backgroundColor: getTrailOverallColor(worstTrailStatus) + '18' },
                ]}>
                  <View style={[
                    styles.trailMiniDot,
                    { backgroundColor: getTrailOverallColor(worstTrailStatus) },
                  ]} />
                  <Text style={[
                    styles.trailMiniText,
                    { color: getTrailOverallColor(worstTrailStatus) },
                  ]}>
                    {worstTrailStatus.toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
        <View style={styles.panelHeaderRight}>
          {hasAlerts && (
            <View style={styles.alertBadge}>
              <Ionicons name="warning-outline" size={10} color="#EF5350" />
              <Text style={styles.alertBadgeText}>{totalAlerts}</Text>
            </View>
          )}
          {loading && <ActivityIndicator size="small" color={TACTICAL.amber} />}
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={TACTICAL.textMuted}
          />
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.panelBody}>
          {/* Offline / Stale data banner */}
          {showOfflineBanner && weatherData && (
            <View style={[
              styles.statusBanner,
              isFallback ? styles.statusBannerError : styles.statusBannerWarn,
            ]}>
              <Ionicons
                name={isFallback ? 'cloud-offline-outline' : isStale ? 'time-outline' : 'wifi-outline'}
                size={13}
                color={isFallback ? '#EF5350' : '#FFB300'}
              />
              <View style={styles.statusBannerContent}>
                <Text style={[
                  styles.statusBannerTitle,
                  { color: isFallback ? '#EF5350' : '#FFB300' },
                ]}>
                  {isFallback
                    ? 'WEATHER UNAVAILABLE'
                    : isStale
                      ? 'CACHED DATA'
                      : 'OFFLINE MODE'}
                </Text>
                <Text style={styles.statusBannerDesc}>
                  {isFallback
                    ? 'No cached data available. Connect to fetch weather intelligence.'
                    : isStale && stalenessInfo
                      ? `Last updated ${stalenessInfo.age}. Connect to refresh.`
                      : 'Showing cached data. Will refresh when online.'}
                </Text>
              </View>
              {isOnline && (isStale || isFallback) && (
                <TouchableOpacity
                  style={styles.statusBannerRetry}
                  onPress={() => handleFetch(true)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="refresh-outline" size={12} color={TACTICAL.amber} />
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Tab bar */}
          <View style={styles.tabBar}>
            {([
              { key: 'current' as WeatherTab, label: 'CONDITIONS', icon: 'thermometer-outline' },
              { key: 'forecast' as WeatherTab, label: 'FORECAST', icon: 'calendar-outline' },
              { key: 'trail' as WeatherTab, label: 'TRAIL', icon: 'trail-sign-outline' },
            ]).map(t => {
              const isActive = tab === t.key;
              // Dim forecast tab if no forecast data (fallback)
              const isDisabled = t.key === 'forecast' && isFallback;
              return (
                <TouchableOpacity
                  key={t.key}
                  style={[
                    styles.tabBtn,
                    isActive && styles.tabBtnActive,
                    isDisabled && styles.tabBtnDisabled,
                  ]}
                  onPress={() => !isDisabled && setTab(t.key)}
                  activeOpacity={isDisabled ? 1 : 0.85}
                >
                  <Ionicons
                    name={t.icon as any}
                    size={12}
                    color={isDisabled ? TACTICAL.textMuted + '50' : isActive ? TACTICAL.amber : TACTICAL.textMuted}
                  />
                  <Text style={[
                    styles.tabLabel,
                    isActive && styles.tabLabelActive,
                    isDisabled && styles.tabLabelDisabled,
                  ]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Waypoint selector (if multiple) */}
          {weatherData && weatherData.length > 1 && (
            <View style={styles.waypointSelector}>
              {weatherData.map((w, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.waypointPill,
                    selectedWaypointIdx === idx && styles.waypointPillActive,
                  ]}
                  onPress={() => setSelectedWaypointIdx(idx)}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name="location-outline"
                    size={10}
                    color={selectedWaypointIdx === idx ? TACTICAL.amber : TACTICAL.textMuted}
                  />
                  <Text
                    style={[
                      styles.waypointPillText,
                      selectedWaypointIdx === idx && styles.waypointPillTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {w.label || `WP ${idx + 1}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Error state (only when no data at all) */}
          {error && !weatherData && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={16} color="#EF5350" />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => handleFetch(true)}
                activeOpacity={0.85}
              >
                <Text style={styles.retryText}>RETRY</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Loading state (only when no data at all) */}
          {loading && !weatherData && (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color={TACTICAL.amber} />
              <Text style={styles.loadingText}>FETCHING WEATHER DATA...</Text>
            </View>
          )}

          {/* Fallback empty state — when we have fallback data but no real conditions */}
          {isFallback && selectedWeather && !selectedWeather.current?.temp && tab === 'current' && (
            <View style={styles.fallbackBox}>
              <Ionicons name="cloud-offline-outline" size={28} color={TACTICAL.textMuted} />
              <Text style={styles.fallbackTitle}>NO WEATHER DATA</Text>
              <Text style={styles.fallbackDesc}>
                Weather conditions are unavailable while offline.
                {'\n'}Connect to the internet to fetch current conditions.
              </Text>
              {isOnline && (
                <TouchableOpacity
                  style={styles.fallbackRetryBtn}
                  onPress={() => handleFetch(true)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="refresh-outline" size={14} color={TACTICAL.amber} />
                  <Text style={styles.fallbackRetryText}>FETCH NOW</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Content */}
          {selectedWeather && !isFallback && (
            <View style={styles.contentArea}>
              {/* Alerts always visible at top if present */}
              {selectedWeather.alerts && selectedWeather.alerts.length > 0 && (
                <WeatherAlerts alerts={selectedWeather.alerts} />
              )}

              {/* Current conditions tab */}
              {tab === 'current' && selectedWeather.current && (
                <CurrentConditionsCard
                  conditions={selectedWeather.current}
                  locationName={selectedWeather.label}
                  units={units}
                />
              )}

              {/* Forecast tab */}
              {tab === 'forecast' && selectedWeather.forecast && (
                <ForecastTimeline
                  forecast={selectedWeather.forecast}
                  units={units}
                />
              )}

              {/* Trail conditions tab */}
              {tab === 'trail' && selectedWeather.trail_conditions && (
                <TrailConditionsCard
                  conditions={selectedWeather.trail_conditions}
                />
              )}
            </View>
          )}

          {/* Trail conditions for fallback — always show the caution message */}
          {isFallback && tab === 'trail' && selectedWeather?.trail_conditions && (
            <View style={styles.contentArea}>
              <TrailConditionsCard conditions={selectedWeather.trail_conditions} />
            </View>
          )}

          {/* Footer with refresh */}
          <View style={styles.footer}>
            <View style={styles.footerLeft}>
              {fetchedAt && dataSource !== 'fallback' && (
                <Text style={styles.footerTimestamp}>
                  {isStale && stalenessInfo
                    ? `Cached ${stalenessInfo.age}`
                    : `Updated ${new Date(fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                </Text>
              )}
              {dataSource === 'fallback' && (
                <Text style={[styles.footerTimestamp, { color: '#EF5350' }]}>
                  No data
                </Text>
              )}
              {isStale && stalenessInfo && (
                <View style={[
                  styles.stalenessPill,
                  stalenessInfo.level === 'very_stale' && styles.stalenessPillDanger,
                ]}>
                  <Text style={[
                    styles.stalenessPillText,
                    stalenessInfo.level === 'very_stale' && { color: '#EF5350' },
                  ]}>
                    {stalenessInfo.level === 'very_stale' ? 'VERY OLD' : 'STALE'}
                  </Text>
                </View>
              )}
            </View>
            <TouchableOpacity
              style={[
                styles.refreshBtn,
                !isOnline && styles.refreshBtnDisabled,
              ]}
              onPress={() => handleFetch(true)}
              disabled={loading || !isOnline}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator size="small" color={TACTICAL.amber} />
              ) : (
                <>
                  <Ionicons
                    name="refresh-outline"
                    size={12}
                    color={isOnline ? TACTICAL.amber : TACTICAL.textMuted}
                  />
                  <Text style={[
                    styles.refreshText,
                    !isOnline && { color: TACTICAL.textMuted },
                  ]}>
                    {isOnline ? 'REFRESH' : 'OFFLINE'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.35)',
    overflow: 'hidden',
  },
  emptyContainer: {
    marginTop: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.25)',
    padding: 14,
    gap: 8,
  },
  emptyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  emptyText: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    lineHeight: 16,
  },

  // Panel header
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  panelHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  weatherIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(196,138,44,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.28)',
  },
  panelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  panelTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.3,
  },
  offlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(138,138,133,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(138,138,133,0.25)',
  },
  offlineDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#8A8A85',
  },
  offlinePillText: {
    fontSize: 7,
    fontWeight: '900',
    color: '#8A8A85',
    letterSpacing: 1,
  },
  panelSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  panelTemp: {
    fontSize: 11,
    fontWeight: '700',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  trailMiniPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  trailMiniDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  trailMiniText: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1,
  },
  panelHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  alertBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(239,83,80,0.12)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239,83,80,0.25)',
  },
  alertBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#EF5350',
    fontFamily: 'Courier',
  },

  // Panel body
  panelBody: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(62,79,60,0.20)',
  },

  // Status banners (offline / stale)
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 14,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusBannerWarn: {
    backgroundColor: 'rgba(255,179,0,0.06)',
    borderColor: 'rgba(255,179,0,0.20)',
  },
  statusBannerError: {
    backgroundColor: 'rgba(239,83,80,0.06)',
    borderColor: 'rgba(239,83,80,0.20)',
  },
  statusBannerContent: {
    flex: 1,
  },
  statusBannerTitle: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  statusBannerDesc: {
    fontSize: 9,
    color: TACTICAL.textMuted,
    marginTop: 2,
    lineHeight: 13,
  },
  statusBannerRetry: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(196,138,44,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.30)',
  },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(62,79,60,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.20)',
  },
  tabBtnActive: {
    backgroundColor: 'rgba(196,138,44,0.10)',
    borderColor: 'rgba(196,138,44,0.35)',
  },
  tabBtnDisabled: {
    opacity: 0.4,
  },
  tabLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  tabLabelActive: {
    color: TACTICAL.amber,
  },
  tabLabelDisabled: {
    color: TACTICAL.textMuted,
  },

  // Waypoint selector
  waypointSelector: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14,
    paddingBottom: 8,
    flexWrap: 'wrap',
  },
  waypointPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(62,79,60,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.20)',
    maxWidth: 120,
  },
  waypointPillActive: {
    backgroundColor: 'rgba(196,138,44,0.10)',
    borderColor: 'rgba(196,138,44,0.35)',
  },
  waypointPillText: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },
  waypointPillTextActive: {
    color: TACTICAL.amber,
  },

  // Error
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 14,
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(239,83,80,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239,83,80,0.20)',
  },
  errorText: {
    fontSize: 11,
    color: '#EF5350',
    flex: 1,
  },
  retryBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: 'rgba(239,83,80,0.15)',
  },
  retryText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#EF5350',
    letterSpacing: 1,
  },

  // Loading
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 24,
  },
  loadingText: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },

  // Fallback empty state
  fallbackBox: {
    alignItems: 'center',
    gap: 8,
    padding: 24,
    margin: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.20)',
  },
  fallbackTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  fallbackDesc: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 15,
  },
  fallbackRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(196,138,44,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.30)',
    marginTop: 4,
  },
  fallbackRetryText: {
    fontSize: 9,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },

  // Content
  contentArea: {
    paddingHorizontal: 14,
    gap: 12,
    paddingBottom: 4,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62,79,60,0.12)',
    marginTop: 8,
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerTimestamp: {
    fontSize: 9,
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
  },
  stalenessPill: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(255,179,0,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,179,0,0.25)',
  },
  stalenessPillDanger: {
    backgroundColor: 'rgba(239,83,80,0.12)',
    borderColor: 'rgba(239,83,80,0.25)',
  },
  stalenessPillText: {
    fontSize: 7,
    fontWeight: '900',
    color: '#FFB300',
    letterSpacing: 1,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(196,138,44,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.30)',
  },
  refreshBtnDisabled: {
    backgroundColor: 'rgba(62,79,60,0.06)',
    borderColor: 'rgba(62,79,60,0.15)',
  },
  refreshText: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },
});





