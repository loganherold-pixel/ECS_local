/**
 * RouteCorridorWeather — Route-Corridor Weather Forecasting
 *
 * Fetches weather data for waypoints along the active route (not just current position).
 * Displays a route weather timeline, highlights hazardous segments, and warns users
 * before entering severe weather zones.
 *
 * Components:
 *   useRouteCorridorWeather()   — Hook: samples route, fetches multi-coord weather
 *   RouteWeatherTimeline        — Floating overlay showing weather along route
 *   RouteWeatherDetailModal     — Full detail modal with all waypoint weather
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView,
  Animated, Dimensions, ActivityIndicator,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, TYPO, GOLD_RAIL } from '../../lib/theme';
import { hapticWarning, hapticMicro, hapticCommand } from '../../lib/haptics';
import {
  fetchWeatherWithStatus,
  type WeatherFetchResult,
} from '../../lib/weatherStore';
import type {
  WeatherCoordinate,
  WeatherAlert,
  AlertSeverity,
  WaypointWeather,
  CurrentConditions,
  TrailConditions,
} from '../../lib/weatherTypes';
import { getAlertColor, getWeatherIcon, getWindDirection } from '../../lib/weatherTypes';
import type { ECSRun, RunPoint } from '../../lib/runStore';
import { haversineMeters, metersToMiles } from '../../lib/runStore';

const { width: SCREEN_W } = Dimensions.get('window');

// ── Types ────────────────────────────────────────────────────

export type SegmentHazardLevel = 'clear' | 'caution' | 'warning' | 'hazardous';

export interface RouteWeatherPoint {
  /** Index in the sampled waypoint array */
  idx: number;
  /** Label (e.g. "Start", "WP 3", "End") */
  label: string;
  lat: number;
  lng: number;
  /** Distance from route start in miles */
  distanceMi: number;
  /** Weather data for this point (null if fetch failed) */
  weather: WaypointWeather | null;
  /** Computed hazard level for this segment */
  hazardLevel: SegmentHazardLevel;
  /** Hazard reasons */
  hazardReasons: string[];
}

export interface RouteCorridorResult {
  /** Sampled weather points along the route */
  points: RouteWeatherPoint[];
  /** Total route distance in miles */
  totalDistanceMi: number;
  /** Number of hazardous segments */
  hazardousCount: number;
  /** Number of caution segments */
  cautionCount: number;
  /** Worst hazard level on the route */
  worstHazard: SegmentHazardLevel;
  /** All alerts from all waypoints */
  allAlerts: WeatherAlert[];
  /** Whether the feature is enabled */
  enabled: boolean;
  /** Toggle on/off */
  toggle: () => void;
  /** Force refresh */
  refresh: () => void;
  /** Loading state */
  loading: boolean;
  /** Data source */
  source: 'live' | 'cache_fresh' | 'cache_stale' | 'fallback' | null;
  /** Error message */
  error: string | null;
  /** Last fetch timestamp */
  lastFetchAt: number | null;
  /** Whether an active route is loaded */
  hasRoute: boolean;
  /** Approaching hazard warning (nearest hazardous point) */
  approachingHazard: {
    active: boolean;
    point: RouteWeatherPoint | null;
    distanceAheadMi: number | null;
  };
}

// ── Constants ────────────────────────────────────────────────

const MAX_SAMPLE_POINTS = 10;
const MIN_SAMPLE_DISTANCE_M = 2000; // Don't sample closer than 2km apart
const REFETCH_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes for route weather
const APPROACHING_THRESHOLD_MI = 5; // Warn when within 5 miles of hazard
const ROUTE_WX_KEY = 'ecs_route_corridor_wx_visible';

// ── Hazard Classification ────────────────────────────────────

function classifyHazard(wp: WaypointWeather | null): { level: SegmentHazardLevel; reasons: string[] } {
  if (!wp || wp.error) return { level: 'clear', reasons: [] };

  const reasons: string[] = [];
  let level: SegmentHazardLevel = 'clear';

  // Check alerts
  if (wp.alerts && wp.alerts.length > 0) {
    for (const alert of wp.alerts) {
      if (alert.severity === 'extreme') {
        level = 'hazardous';
        reasons.push(`EXTREME: ${alert.title}`);
      } else if (alert.severity === 'warning') {
        if (level !== 'hazardous') level = 'warning';
        reasons.push(`WARNING: ${alert.title}`);
      } else if (alert.severity === 'advisory') {
        if (level === 'clear') level = 'caution';
        reasons.push(`ADVISORY: ${alert.title}`);
      }
    }
  }

  // Check trail conditions
  if (wp.trail_conditions) {
    const tc = wp.trail_conditions;
    if (tc.overall === 'hazardous') {
      level = 'hazardous';
      reasons.push('Trail conditions: HAZARDOUS');
    } else if (tc.overall === 'poor' && level !== 'hazardous') {
      if (level !== 'warning') level = 'warning';
      reasons.push('Trail conditions: POOR');
    } else if (tc.overall === 'fair' && level === 'clear') {
      level = 'caution';
      reasons.push('Trail conditions: FAIR');
    }
  }

  // Check current conditions for severe weather indicators
  if (wp.current) {
    const c = wp.current;

    // High winds
    if (c.wind_speed != null && c.wind_speed > 40) {
      if (level !== 'hazardous') level = 'warning';
      reasons.push(`High winds: ${Math.round(c.wind_speed)} mph`);
    } else if (c.wind_speed != null && c.wind_speed > 25) {
      if (level === 'clear') level = 'caution';
      reasons.push(`Moderate winds: ${Math.round(c.wind_speed)} mph`);
    }

    // Wind gusts
    if (c.wind_gust != null && c.wind_gust > 50) {
      if (level !== 'hazardous') level = 'warning';
      reasons.push(`Dangerous gusts: ${Math.round(c.wind_gust)} mph`);
    }

    // Heavy rain
    if (c.rain_1h != null && c.rain_1h > 10) {
      if (level !== 'hazardous') level = 'warning';
      reasons.push(`Heavy rain: ${c.rain_1h.toFixed(1)} mm/hr`);
    } else if (c.rain_1h != null && c.rain_1h > 2.5) {
      if (level === 'clear') level = 'caution';
      reasons.push(`Rain: ${c.rain_1h.toFixed(1)} mm/hr`);
    }

    // Snow
    if (c.snow_1h != null && c.snow_1h > 5) {
      if (level !== 'hazardous') level = 'warning';
      reasons.push(`Heavy snow: ${c.snow_1h.toFixed(1)} mm/hr`);
    } else if (c.snow_1h != null && c.snow_1h > 0) {
      if (level === 'clear') level = 'caution';
      reasons.push(`Snow: ${c.snow_1h.toFixed(1)} mm/hr`);
    }

    // Low visibility
    if (c.visibility != null && c.visibility < 1000) {
      if (level !== 'hazardous') level = 'warning';
      reasons.push(`Low visibility: ${c.visibility}m`);
    } else if (c.visibility != null && c.visibility < 5000) {
      if (level === 'clear') level = 'caution';
      reasons.push(`Reduced visibility: ${(c.visibility / 1000).toFixed(1)}km`);
    }

    // Thunderstorm
    if (c.weather_id != null && c.weather_id >= 200 && c.weather_id < 300) {
      if (level !== 'hazardous') level = 'warning';
      reasons.push('Thunderstorm activity');
    }
  }

  return { level, reasons };
}

function getHazardColor(level: SegmentHazardLevel): string {
  switch (level) {
    case 'hazardous': return '#EF5350';
    case 'warning': return '#FF7043';
    case 'caution': return '#FFB300';
    case 'clear': return '#66BB6A';
  }
}

function getHazardIcon(level: SegmentHazardLevel): string {
  switch (level) {
    case 'hazardous': return 'alert-circle';
    case 'warning': return 'warning';
    case 'caution': return 'alert-circle-outline';
    case 'clear': return 'checkmark-circle-outline';
  }
}

function getConditionIcon(wp: WaypointWeather | null): string {
  if (!wp || !wp.current) return 'cloud-outline';
  return getWeatherIcon(wp.current.weather_main, wp.current.weather_id);
}

// ── Route Sampling ───────────────────────────────────────────

function sampleRoutePoints(
  points: RunPoint[],
  waypoints: { lat: number; lon: number; name?: string; ele?: number | null; time?: string | null }[],
  maxSamples: number,
): { lat: number; lng: number; label: string; distanceMi: number }[] {
  if (points.length < 2) return [];

  // Compute cumulative distances
  const cumDist: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const d = haversineMeters(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
    cumDist.push(cumDist[i - 1] + d);
  }
  const totalM = cumDist[cumDist.length - 1];
  const totalMi = metersToMiles(totalM);

  if (totalM < 100) return []; // Route too short

  // Always include start and end
  const samples: { lat: number; lng: number; label: string; distanceMi: number }[] = [];

  // Start point
  samples.push({
    lat: points[0].lat,
    lng: points[0].lng,
    label: 'START',
    distanceMi: 0,
  });

  // Named waypoints from the route (if any)
  const namedWPs: { lat: number; lng: number; label: string; distanceMi: number }[] = [];
  for (const wp of waypoints) {
    // Find closest point on route to this waypoint
    let minDist = Infinity;
    let closestIdx = 0;
    for (let i = 0; i < points.length; i++) {
      const d = haversineMeters(wp.lat, wp.lon, points[i].lat, points[i].lng);
      if (d < minDist) { minDist = d; closestIdx = i; }
    }
    if (minDist < 5000) { // Within 5km of route
      namedWPs.push({
        lat: wp.lat,
        lng: wp.lon,
        label: wp.name || `WP`,
        distanceMi: metersToMiles(cumDist[closestIdx]),
      });
    }
  }

  // Determine how many evenly-spaced samples we need
  const remainingSlots = maxSamples - 2 - namedWPs.length; // -2 for start+end
  const evenSamples = Math.max(0, remainingSlots);

  if (evenSamples > 0) {
    const interval = totalM / (evenSamples + 1);
    for (let s = 1; s <= evenSamples; s++) {
      const targetDist = interval * s;
      // Find the point on the route at this distance
      let ptIdx = 0;
      for (let i = 1; i < cumDist.length; i++) {
        if (cumDist[i] >= targetDist) { ptIdx = i; break; }
        ptIdx = i;
      }
      // Interpolate between ptIdx-1 and ptIdx
      const prevDist = cumDist[ptIdx - 1] || 0;
      const nextDist = cumDist[ptIdx] || prevDist;
      const ratio = nextDist > prevDist ? (targetDist - prevDist) / (nextDist - prevDist) : 0;
      const lat = points[ptIdx - 1].lat + ratio * (points[ptIdx].lat - points[ptIdx - 1].lat);
      const lng = points[ptIdx - 1].lng + ratio * (points[ptIdx].lng - points[ptIdx - 1].lng);

      // Check if too close to a named waypoint
      const tooClose = namedWPs.some(nwp =>
        Math.abs(metersToMiles(targetDist) - nwp.distanceMi) < metersToMiles(MIN_SAMPLE_DISTANCE_M)
      );
      if (!tooClose) {
        samples.push({
          lat, lng,
          label: `MI ${metersToMiles(targetDist).toFixed(0)}`,
          distanceMi: metersToMiles(targetDist),
        });
      }
    }
  }

  // Add named waypoints
  for (const nwp of namedWPs) {
    samples.push(nwp);
  }

  // End point
  samples.push({
    lat: points[points.length - 1].lat,
    lng: points[points.length - 1].lng,
    label: 'END',
    distanceMi: totalMi,
  });

  // Sort by distance
  samples.sort((a, b) => a.distanceMi - b.distanceMi);

  // Deduplicate (remove samples too close together)
  const deduped: typeof samples = [samples[0]];
  for (let i = 1; i < samples.length; i++) {
    const prev = deduped[deduped.length - 1];
    const distBetween = haversineMeters(prev.lat, prev.lng, samples[i].lat, samples[i].lng);
    if (distBetween > MIN_SAMPLE_DISTANCE_M / 2 || i === samples.length - 1) {
      deduped.push(samples[i]);
    }
  }

  return deduped.slice(0, maxSamples);
}

// ══════════════════════════════════════════════════════════════
// HOOK: useRouteCorridorWeather
// ══════════════════════════════════════════════════════════════

export function useRouteCorridorWeather(
  activeRun: ECSRun | null,
  userLocation: { lat: number; lng: number } | null,
  showToast: (msg: string) => void,
): RouteCorridorResult {
  const [enabled, setEnabled] = useState<boolean>(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(ROUTE_WX_KEY) === 'true';
      }
    } catch {}
    return false;
  });

  const [weatherPoints, setWeatherPoints] = useState<RouteWeatherPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<RouteCorridorResult['source']>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchAt, setLastFetchAt] = useState<number | null>(null);

  const mountedRef = useRef(true);
  const intervalRef = useRef<any>(null);
  const lastRouteIdRef = useRef<string | null>(null);
  const seenHazardKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const hasRoute = !!activeRun && activeRun.points.length >= 2;

  const toggle = useCallback(() => {
    hapticMicro();
    setEnabled(prev => {
      const next = !prev;
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(ROUTE_WX_KEY, String(next));
        }
      } catch {}
      if (!next) {
        setWeatherPoints([]);
        setSource(null);
        setError(null);
      }
      return next;
    });
  }, []);

  // Sample route points when run changes
  const sampledCoords = useMemo(() => {
    if (!activeRun || activeRun.points.length < 2) return [];
    return sampleRoutePoints(activeRun.points, activeRun.waypoints || [], MAX_SAMPLE_POINTS);
  }, [activeRun?.id, activeRun?.points.length]);

  const fetchRouteWeather = useCallback(async () => {
    if (!enabled || sampledCoords.length < 2 || loading) return;

    setLoading(true);
    try {
      const coordinates: WeatherCoordinate[] = sampledCoords.map(s => ({
        lat: s.lat,
        lng: s.lng,
        label: s.label,
      }));

      const result = await fetchWeatherWithStatus(coordinates, 'imperial');
      if (!mountedRef.current) return;

      setSource(result.source);
      setError(result.error);
      setLastFetchAt(Date.now());

      // Map results to RouteWeatherPoints
      const points: RouteWeatherPoint[] = sampledCoords.map((sc, idx) => {
        const wp = result.data.results[idx] || null;
        const { level, reasons } = classifyHazard(wp);
        return {
          idx,
          label: sc.label,
          lat: sc.lat,
          lng: sc.lng,
          distanceMi: sc.distanceMi,
          weather: wp,
          hazardLevel: level,
          hazardReasons: reasons,
        };
      });

      // Detect NEW hazardous segments and warn
      const newHazards: RouteWeatherPoint[] = [];
      for (const pt of points) {
        if (pt.hazardLevel === 'hazardous' || pt.hazardLevel === 'warning') {
          const key = `${pt.label}_${pt.hazardLevel}`;
          if (!seenHazardKeysRef.current.has(key)) {
            seenHazardKeysRef.current.add(key);
            newHazards.push(pt);
          }
        }
      }

      if (newHazards.length > 0) {
        hapticWarning();
        const worst = newHazards.find(h => h.hazardLevel === 'hazardous') || newHazards[0];
        const label = worst.hazardLevel === 'hazardous' ? 'HAZARDOUS' : 'SEVERE';
        if (newHazards.length === 1) {
          showToast(`ROUTE ${label} WEATHER at ${worst.label} (${worst.distanceMi.toFixed(1)} mi)`);
        } else {
          showToast(`${newHazards.length} ROUTE WEATHER HAZARDS DETECTED`);
        }
      }

      setWeatherPoints(points);
    } catch (err: any) {
      if (mountedRef.current) {
        setError(err?.message || 'Route weather fetch failed');
      }
    }
    if (mountedRef.current) setLoading(false);
  }, [enabled, sampledCoords, loading, showToast]);

  const refresh = useCallback(() => {
    hapticMicro();
    seenHazardKeysRef.current.clear();
    fetchRouteWeather();
  }, [fetchRouteWeather]);

  // Fetch when enabled, route changes, or on mount
  useEffect(() => {
    if (!enabled || sampledCoords.length < 2) return;

    // Route changed — re-fetch
    const routeId = activeRun?.id || null;
    if (routeId !== lastRouteIdRef.current) {
      lastRouteIdRef.current = routeId;
      seenHazardKeysRef.current.clear();
      fetchRouteWeather();
    } else if (!lastFetchAt) {
      fetchRouteWeather();
    }
  }, [enabled, activeRun?.id, sampledCoords.length]);

  // Periodic refresh
  useEffect(() => {
    if (!enabled || sampledCoords.length < 2) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      return;
    }

    intervalRef.current = setInterval(() => {
      if (mountedRef.current) fetchRouteWeather();
    }, REFETCH_INTERVAL_MS);

    return () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    };
  }, [enabled, sampledCoords.length]);

  // Compute approaching hazard
  const approachingHazard = useMemo(() => {
    if (!userLocation || weatherPoints.length === 0) {
      return { active: false, point: null, distanceAheadMi: null };
    }

    // Find user's position along the route (closest point)
    let minDist = Infinity;
    let userDistMi = 0;
    for (const pt of weatherPoints) {
      const d = haversineMeters(userLocation.lat, userLocation.lng, pt.lat, pt.lng);
      if (d < minDist) {
        minDist = d;
        userDistMi = pt.distanceMi;
      }
    }

    // Find the nearest hazardous point AHEAD of the user
    let nearestHazard: RouteWeatherPoint | null = null;
    let nearestDist = Infinity;
    for (const pt of weatherPoints) {
      if ((pt.hazardLevel === 'hazardous' || pt.hazardLevel === 'warning') && pt.distanceMi > userDistMi) {
        const ahead = pt.distanceMi - userDistMi;
        if (ahead < nearestDist && ahead <= APPROACHING_THRESHOLD_MI) {
          nearestDist = ahead;
          nearestHazard = pt;
        }
      }
    }

    return {
      active: nearestHazard !== null,
      point: nearestHazard,
      distanceAheadMi: nearestHazard ? nearestDist : null,
    };
  }, [userLocation, weatherPoints]);

  // Computed stats
  const hazardousCount = weatherPoints.filter(p => p.hazardLevel === 'hazardous').length;
  const cautionCount = weatherPoints.filter(p => p.hazardLevel === 'caution' || p.hazardLevel === 'warning').length;
  const worstHazard: SegmentHazardLevel = weatherPoints.some(p => p.hazardLevel === 'hazardous') ? 'hazardous'
    : weatherPoints.some(p => p.hazardLevel === 'warning') ? 'warning'
    : weatherPoints.some(p => p.hazardLevel === 'caution') ? 'caution' : 'clear';

  const allAlerts: WeatherAlert[] = [];
  for (const pt of weatherPoints) {
    if (pt.weather?.alerts) {
      allAlerts.push(...pt.weather.alerts);
    }
  }

  const totalDistanceMi = weatherPoints.length > 0
    ? weatherPoints[weatherPoints.length - 1].distanceMi : 0;

  return {
    points: weatherPoints,
    totalDistanceMi,
    hazardousCount,
    cautionCount,
    worstHazard,
    allAlerts,
    enabled,
    toggle,
    refresh,
    loading,
    source,
    error,
    lastFetchAt,
    hasRoute,
    approachingHazard,
  };
}

// ══════════════════════════════════════════════════════════════
// COMPONENT: RouteWeatherTimeline (Floating Overlay)
// ══════════════════════════════════════════════════════════════

interface TimelineProps {
  points: RouteWeatherPoint[];
  totalDistanceMi: number;
  worstHazard: SegmentHazardLevel;
  hazardousCount: number;
  cautionCount: number;
  enabled: boolean;
  loading: boolean;
  source: string | null;
  hasRoute: boolean;
  approachingHazard: RouteCorridorResult['approachingHazard'];
  onDetailPress: () => void;
  onRefresh: () => void;
}

export function RouteWeatherTimeline({
  points,
  totalDistanceMi,
  worstHazard,
  hazardousCount,
  cautionCount,
  enabled,
  loading,
  source,
  hasRoute,
  approachingHazard,
  onDetailPress,
  onRefresh,
}: TimelineProps) {
  const [expanded, setExpanded] = useState(false);
  const pulseAnim = useRef(new Animated.Value(0)).current;

  // Pulse animation for approaching hazard
  useEffect(() => {
    if (approachingHazard.active) {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
        ])
      );
      anim.start();
      return () => anim.stop();
    } else {
      pulseAnim.setValue(0);
    }
  }, [approachingHazard.active, pulseAnim]);

  if (!enabled || !hasRoute) return null;

  const worstColor = getHazardColor(worstHazard);
  const hasSevere = hazardousCount > 0 || cautionCount > 0;

  return (
    <View style={tlStyles.container} pointerEvents="box-none">
      {/* Approaching hazard warning banner */}
      {approachingHazard.active && approachingHazard.point && (
        <Animated.View style={[
          tlStyles.hazardBanner,
          {
            opacity: pulseAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0.85, 1],
            }),
            borderColor: getHazardColor(approachingHazard.point.hazardLevel) + '80',
          },
        ]}>
          <TouchableOpacity
            style={tlStyles.hazardBannerInner}
            onPress={() => { hapticMicro(); onDetailPress(); }}
            activeOpacity={0.85}
          >
            <View style={[
              tlStyles.hazardBannerIcon,
              { backgroundColor: getHazardColor(approachingHazard.point.hazardLevel) + '20' },
            ]}>
              <Ionicons
                name={getHazardIcon(approachingHazard.point.hazardLevel) as any}
                size={14}
                color={getHazardColor(approachingHazard.point.hazardLevel)}
              />
            </View>
            <View style={tlStyles.hazardBannerContent}>
              <Text style={[
                tlStyles.hazardBannerTitle,
                { color: getHazardColor(approachingHazard.point.hazardLevel) },
              ]}>
                {approachingHazard.point.hazardLevel === 'hazardous' ? 'HAZARDOUS' : 'SEVERE'} WEATHER AHEAD
              </Text>
              <Text style={tlStyles.hazardBannerSub}>
                {approachingHazard.distanceAheadMi!.toFixed(1)} mi ahead at {approachingHazard.point.label}
                {approachingHazard.point.hazardReasons.length > 0 &&
                  ` — ${approachingHazard.point.hazardReasons[0]}`}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={12} color={TACTICAL.textMuted} />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Compact badge */}
      <TouchableOpacity
        style={[
          tlStyles.badge,
          hasSevere && { borderColor: worstColor + '50' },
        ]}
        onPress={() => {
          hapticMicro();
          if (points.length > 0) setExpanded(!expanded);
          else onDetailPress();
        }}
        activeOpacity={0.85}
      >
        <View style={tlStyles.badgeLeft}>
          <View style={[
            tlStyles.badgeIcon,
            { backgroundColor: (hasSevere ? worstColor : TACTICAL.amber) + '15' },
          ]}>
            <Ionicons
              name="git-commit-outline"
              size={13}
              color={hasSevere ? worstColor : TACTICAL.amber}
            />
          </View>
          <View>
            {loading && points.length === 0 ? (
              <Text style={tlStyles.badgeLoadingText}>LOADING ROUTE WX...</Text>
            ) : points.length > 0 ? (
              <View style={tlStyles.badgeInfoRow}>
                <Text style={[tlStyles.badgeLabel, hasSevere && { color: worstColor }]}>
                  RTE WX
                </Text>
                <Text style={tlStyles.badgeDistance}>
                  {totalDistanceMi.toFixed(0)} MI
                </Text>
                {hazardousCount > 0 && (
                  <View style={[tlStyles.hazardCountBadge, { backgroundColor: '#EF5350' + '20', borderColor: '#EF5350' + '40' }]}>
                    <Text style={[tlStyles.hazardCountText, { color: '#EF5350' }]}>
                      {hazardousCount}
                    </Text>
                  </View>
                )}
                {cautionCount > 0 && hazardousCount === 0 && (
                  <View style={[tlStyles.hazardCountBadge, { backgroundColor: '#FFB300' + '20', borderColor: '#FFB300' + '40' }]}>
                    <Text style={[tlStyles.hazardCountText, { color: '#FFB300' }]}>
                      {cautionCount}
                    </Text>
                  </View>
                )}
              </View>
            ) : (
              <Text style={tlStyles.badgeLoadingText}>NO ROUTE DATA</Text>
            )}
          </View>
        </View>
        {points.length > 0 && (
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={12}
            color={TACTICAL.textMuted}
          />
        )}
      </TouchableOpacity>

      {/* Expanded timeline */}
      {expanded && points.length > 0 && (
        <View style={tlStyles.expandedPanel}>
          {/* Segment bar visualization */}
          <View style={tlStyles.segmentBar}>
            {points.map((pt, idx) => {
              const widthPct = idx < points.length - 1
                ? ((points[idx + 1].distanceMi - pt.distanceMi) / totalDistanceMi) * 100
                : 0;
              if (idx === points.length - 1) return null;
              return (
                <View
                  key={`seg_${idx}`}
                  style={[
                    tlStyles.segmentBarChunk,
                    {
                      flex: Math.max(widthPct, 5),
                      backgroundColor: getHazardColor(pt.hazardLevel) + '60',
                    },
                  ]}
                />
              );
            })}
          </View>

          {/* Waypoint list */}
          <ScrollView
            style={tlStyles.waypointScroll}
            contentContainerStyle={tlStyles.waypointScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {points.map((pt, idx) => {
              const color = getHazardColor(pt.hazardLevel);
              const condIcon = getConditionIcon(pt.weather);
              const temp = pt.weather?.current?.temp != null
                ? `${Math.round(pt.weather.current.temp)}°` : '--';
              const wind = pt.weather?.current?.wind_speed != null
                ? `${Math.round(pt.weather.current.wind_speed)}mph` : '';
              const condText = pt.weather?.current?.weather_main || '';

              return (
                <TouchableOpacity
                  key={`wp_${idx}`}
                  style={[
                    tlStyles.waypointRow,
                    idx < points.length - 1 && tlStyles.waypointRowBorder,
                  ]}
                  onPress={() => { hapticMicro(); onDetailPress(); }}
                  activeOpacity={0.85}
                >
                  {/* Hazard dot */}
                  <View style={[tlStyles.hazardDot, { backgroundColor: color }]} />

                  {/* Label + distance */}
                  <View style={tlStyles.waypointLabel}>
                    <Text style={tlStyles.waypointLabelText} numberOfLines={1}>
                      {pt.label}
                    </Text>
                    <Text style={tlStyles.waypointDistText}>
                      {pt.distanceMi.toFixed(1)} mi
                    </Text>
                  </View>

                  {/* Conditions */}
                  <View style={tlStyles.waypointConditions}>
                    <Ionicons name={condIcon as any} size={12} color={TACTICAL.textMuted} />
                    <Text style={tlStyles.waypointTemp}>{temp}</Text>
                    {wind ? <Text style={tlStyles.waypointWind}>{wind}</Text> : null}
                  </View>

                  {/* Hazard badge */}
                  {pt.hazardLevel !== 'clear' && (
                    <View style={[
                      tlStyles.waypointHazardBadge,
                      { backgroundColor: color + '18', borderColor: color + '40' },
                    ]}>
                      <Text style={[tlStyles.waypointHazardText, { color }]}>
                        {pt.hazardLevel === 'hazardous' ? 'HAZ' :
                         pt.hazardLevel === 'warning' ? 'WRN' : 'CTN'}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Footer */}
          <View style={tlStyles.expandedFooter}>
            <TouchableOpacity style={tlStyles.footerBtn} onPress={onRefresh} activeOpacity={0.85}>
              <Ionicons name="refresh-outline" size={11} color={TACTICAL.amber} />
              <Text style={tlStyles.footerBtnText}>{loading ? 'LOADING' : 'REFRESH'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={tlStyles.footerBtn}
              onPress={() => { hapticMicro(); onDetailPress(); }}
              activeOpacity={0.85}
            >
              <Ionicons name="expand-outline" size={11} color={TACTICAL.amber} />
              <Text style={tlStyles.footerBtnText}>DETAILS</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

// ══════════════════════════════════════════════════════════════
// COMPONENT: RouteWeatherDetailModal
// ══════════════════════════════════════════════════════════════

interface DetailModalProps {
  visible: boolean;
  onClose: () => void;
  points: RouteWeatherPoint[];
  totalDistanceMi: number;
  worstHazard: SegmentHazardLevel;
  allAlerts: WeatherAlert[];
  source: string | null;
  lastFetchAt: number | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  approachingHazard: RouteCorridorResult['approachingHazard'];
}

export function RouteWeatherDetailModal({
  visible,
  onClose,
  points,
  totalDistanceMi,
  worstHazard,
  allAlerts,
  source,
  lastFetchAt,
  loading,
  error,
  onRefresh,
  approachingHazard,
}: DetailModalProps) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={mdStyles.overlay}>
        <TouchableOpacity style={mdStyles.backdrop} onPress={onClose} activeOpacity={1} />
        <View style={mdStyles.sheet}>
          <View style={mdStyles.handle} />

          {/* Header */}
          <View style={mdStyles.header}>
            <View style={mdStyles.headerLeft}>
              <View style={[
                mdStyles.headerIconBg,
                { borderColor: getHazardColor(worstHazard) + '40' },
              ]}>
                <Ionicons name="git-commit-outline" size={16} color={TACTICAL.amber} />
              </View>
              <View>
                <Text style={mdStyles.headerTitle}>ROUTE WEATHER</Text>
                <Text style={mdStyles.headerSub}>
                  {points.length} waypoints — {totalDistanceMi.toFixed(1)} mi
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={20} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Source + status bar */}
          <View style={mdStyles.statusBar}>
            {source && (
              <View style={[
                mdStyles.sourcePill,
                source === 'live' && { borderColor: 'rgba(102,187,106,0.25)' },
                source === 'cache_stale' && { borderColor: 'rgba(255,179,0,0.25)' },
              ]}>
                <View style={[
                  mdStyles.sourceDot,
                  { backgroundColor: source === 'live' ? '#66BB6A' :
                    source === 'cache_fresh' ? '#66BB6A' :
                    source === 'cache_stale' ? '#FFB300' : '#EF5350' },
                ]} />
                <Text style={mdStyles.sourceText}>
                  {source === 'live' ? 'LIVE' :
                   source === 'cache_fresh' ? 'CACHED' :
                   source === 'cache_stale' ? 'STALE' : 'OFFLINE'}
                </Text>
              </View>
            )}
            {lastFetchAt && (
              <Text style={mdStyles.lastFetchText}>
                {new Date(lastFetchAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            )}
            {/* Hazard summary */}
            {worstHazard !== 'clear' && (
              <View style={[
                mdStyles.hazardSummaryPill,
                { backgroundColor: getHazardColor(worstHazard) + '12', borderColor: getHazardColor(worstHazard) + '30' },
              ]}>
                <Ionicons
                  name={getHazardIcon(worstHazard) as any}
                  size={10}
                  color={getHazardColor(worstHazard)}
                />
                <Text style={[mdStyles.hazardSummaryText, { color: getHazardColor(worstHazard) }]}>
                  {worstHazard.toUpperCase()}
                </Text>
              </View>
            )}
          </View>

          {/* Approaching hazard warning */}
          {approachingHazard.active && approachingHazard.point && (
            <View style={[
              mdStyles.approachBanner,
              { borderLeftColor: getHazardColor(approachingHazard.point.hazardLevel) },
            ]}>
              <Ionicons
                name={getHazardIcon(approachingHazard.point.hazardLevel) as any}
                size={14}
                color={getHazardColor(approachingHazard.point.hazardLevel)}
              />
              <View style={mdStyles.approachBannerContent}>
                <Text style={[
                  mdStyles.approachBannerTitle,
                  { color: getHazardColor(approachingHazard.point.hazardLevel) },
                ]}>
                  {approachingHazard.point.hazardLevel === 'hazardous' ? 'HAZARDOUS' : 'SEVERE'} WEATHER AHEAD
                </Text>
                <Text style={mdStyles.approachBannerSub}>
                  {approachingHazard.distanceAheadMi!.toFixed(1)} mi ahead at {approachingHazard.point.label}
                </Text>
              </View>
            </View>
          )}

          {/* Error banner */}
          {error && (
            <View style={mdStyles.errorBanner}>
              <Ionicons name="alert-circle-outline" size={13} color="#EF5350" />
              <Text style={mdStyles.errorText} numberOfLines={2}>{error}</Text>
            </View>
          )}

          {/* Route segment bar */}
          {points.length > 1 && (
            <View style={mdStyles.segmentBarContainer}>
              <Text style={mdStyles.segmentBarLabel}>ROUTE CORRIDOR</Text>
              <View style={mdStyles.segmentBar}>
                {points.map((pt, idx) => {
                  if (idx === points.length - 1) return null;
                  const nextPt = points[idx + 1];
                  const widthPct = ((nextPt.distanceMi - pt.distanceMi) / totalDistanceMi) * 100;
                  return (
                    <View
                      key={`seg_${idx}`}
                      style={[
                        mdStyles.segmentChunk,
                        {
                          flex: Math.max(widthPct, 3),
                          backgroundColor: getHazardColor(pt.hazardLevel),
                        },
                      ]}
                    />
                  );
                })}
              </View>
              <View style={mdStyles.segmentBarLabels}>
                <Text style={mdStyles.segmentBarMi}>0 mi</Text>
                <Text style={mdStyles.segmentBarMi}>{totalDistanceMi.toFixed(0)} mi</Text>
              </View>
            </View>
          )}

          {/* Waypoint detail list */}
          <ScrollView style={mdStyles.scrollArea} contentContainerStyle={{ paddingBottom: 40 }}>
            {points.length === 0 && (
              <View style={mdStyles.emptyState}>
                <Ionicons name="cloud-outline" size={32} color={TACTICAL.textMuted} />
                <Text style={mdStyles.emptyTitle}>NO ROUTE WEATHER DATA</Text>
                <Text style={mdStyles.emptyDesc}>
                  {loading ? 'Fetching weather for route waypoints...' :
                   'Load a route to see corridor weather forecasts.'}
                </Text>
              </View>
            )}

            {points.map((pt, idx) => {
              const color = getHazardColor(pt.hazardLevel);
              const isExpanded = expandedIdx === idx;
              const condIcon = getConditionIcon(pt.weather);
              const temp = pt.weather?.current?.temp != null
                ? `${Math.round(pt.weather.current.temp)}°F` : '--';
              const feelsLike = pt.weather?.current?.feels_like != null
                ? `${Math.round(pt.weather.current.feels_like)}°F` : null;
              const wind = pt.weather?.current?.wind_speed != null
                ? `${Math.round(pt.weather.current.wind_speed)} mph` : '--';
              const windDir = pt.weather?.current?.wind_deg != null
                ? getWindDirection(pt.weather.current.wind_deg) : '';
              const humidity = pt.weather?.current?.humidity != null
                ? `${pt.weather.current.humidity}%` : '--';
              const condText = pt.weather?.current?.weather_description || pt.weather?.current?.weather_main || 'Unknown';
              const visibility = pt.weather?.current?.visibility != null
                ? `${(pt.weather.current.visibility / 1000).toFixed(1)} km` : null;

              return (
                <TouchableOpacity
                  key={`detail_${idx}`}
                  style={[mdStyles.waypointCard, { borderLeftColor: color }]}
                  onPress={() => {
                    hapticMicro();
                    setExpandedIdx(isExpanded ? null : idx);
                  }}
                  activeOpacity={0.85}
                >
                  {/* Card header */}
                  <View style={mdStyles.cardHeader}>
                    <View style={[mdStyles.cardIcon, { backgroundColor: color + '15' }]}>
                      <Ionicons name={condIcon as any} size={16} color={color} />
                    </View>
                    <View style={mdStyles.cardTitleArea}>
                      <View style={mdStyles.cardTitleRow}>
                        <Text style={mdStyles.cardLabel} numberOfLines={1}>{pt.label}</Text>
                        <Text style={mdStyles.cardDist}>{pt.distanceMi.toFixed(1)} mi</Text>
                      </View>
                      <View style={mdStyles.cardCondRow}>
                        <Text style={mdStyles.cardTemp}>{temp}</Text>
                        <Text style={mdStyles.cardCond}>{condText}</Text>
                        {pt.hazardLevel !== 'clear' && (
                          <View style={[
                            mdStyles.cardHazardBadge,
                            { backgroundColor: color + '18', borderColor: color + '40' },
                          ]}>
                            <Text style={[mdStyles.cardHazardText, { color }]}>
                              {pt.hazardLevel.toUpperCase()}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={14}
                      color={TACTICAL.textMuted}
                    />
                  </View>

                  {/* Expanded details */}
                  {isExpanded && (
                    <View style={mdStyles.cardBody}>
                      <View style={[mdStyles.cardDivider, { backgroundColor: color + '20' }]} />

                      {/* Weather stats grid */}
                      <View style={mdStyles.statsGrid}>
                        <View style={mdStyles.statItem}>
                          <Ionicons name="thermometer-outline" size={12} color={TACTICAL.textMuted} />
                          <Text style={mdStyles.statLabel}>TEMP</Text>
                          <Text style={mdStyles.statValue}>{temp}</Text>
                          {feelsLike && <Text style={mdStyles.statSub}>Feels {feelsLike}</Text>}
                        </View>
                        <View style={mdStyles.statItem}>
                          <Ionicons name="flag-outline" size={12} color={TACTICAL.textMuted} />
                          <Text style={mdStyles.statLabel}>WIND</Text>
                          <Text style={mdStyles.statValue}>{wind}</Text>
                          {windDir && <Text style={mdStyles.statSub}>{windDir}</Text>}
                        </View>
                        <View style={mdStyles.statItem}>
                          <Ionicons name="water-outline" size={12} color={TACTICAL.textMuted} />
                          <Text style={mdStyles.statLabel}>HUMIDITY</Text>
                          <Text style={mdStyles.statValue}>{humidity}</Text>
                        </View>
                        {visibility && (
                          <View style={mdStyles.statItem}>
                            <Ionicons name="eye-outline" size={12} color={TACTICAL.textMuted} />
                            <Text style={mdStyles.statLabel}>VIS</Text>
                            <Text style={mdStyles.statValue}>{visibility}</Text>
                          </View>
                        )}
                      </View>

                      {/* Trail conditions */}
                      {pt.weather?.trail_conditions && (
                        <View style={mdStyles.trailCondBox}>
                          <Text style={mdStyles.trailCondTitle}>TRAIL CONDITIONS</Text>
                          <View style={mdStyles.trailCondRow}>
                            <View style={[
                              mdStyles.trailCondBadge,
                              { backgroundColor: getTrailColor(pt.weather.trail_conditions.overall) + '18' },
                            ]}>
                              <Text style={[
                                mdStyles.trailCondBadgeText,
                                { color: getTrailColor(pt.weather.trail_conditions.overall) },
                              ]}>
                                {pt.weather.trail_conditions.overall.toUpperCase()}
                              </Text>
                            </View>
                          </View>
                          {pt.weather.trail_conditions.factors.slice(0, 3).map((f, fi) => (
                            <Text key={fi} style={mdStyles.trailFactorText}>
                              {f.factor}: {f.detail}
                            </Text>
                          ))}
                        </View>
                      )}

                      {/* Hazard reasons */}
                      {pt.hazardReasons.length > 0 && (
                        <View style={[mdStyles.hazardReasonsBox, { borderColor: color + '25' }]}>
                          <Ionicons name="shield-outline" size={12} color={color} />
                          <View style={mdStyles.hazardReasonsList}>
                            {pt.hazardReasons.map((r, ri) => (
                              <Text key={ri} style={[mdStyles.hazardReasonText, { color }]}>
                                {r}
                              </Text>
                            ))}
                          </View>
                        </View>
                      )}

                      {/* Alerts for this waypoint */}
                      {pt.weather?.alerts && pt.weather.alerts.length > 0 && (
                        <View style={mdStyles.alertsSection}>
                          <Text style={mdStyles.alertsSectionTitle}>ALERTS</Text>
                          {pt.weather.alerts.map((alert, ai) => (
                            <View
                              key={ai}
                              style={[mdStyles.alertItem, { borderLeftColor: getAlertColor(alert.severity) }]}
                            >
                              <Text style={[mdStyles.alertItemTitle, { color: getAlertColor(alert.severity) }]}>
                                {alert.title}
                              </Text>
                              <Text style={mdStyles.alertItemDesc} numberOfLines={2}>
                                {alert.description}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {/* Coordinates */}
                      <Text style={mdStyles.coordText}>
                        {pt.lat.toFixed(5)}, {pt.lng.toFixed(5)}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Footer */}
          <View style={mdStyles.footer}>
            <TouchableOpacity
              style={mdStyles.refreshBtn}
              onPress={() => { hapticCommand(); onRefresh(); }}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator size="small" color={TACTICAL.amber} style={{ transform: [{ scale: 0.7 }] }} />
              ) : (
                <Ionicons name="refresh-outline" size={14} color={TACTICAL.amber} />
              )}
              <Text style={mdStyles.refreshBtnText}>
                {loading ? 'FETCHING ROUTE WEATHER...' : 'REFRESH ROUTE WEATHER'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Helper ───────────────────────────────────────────────────

function getTrailColor(overall: string): string {
  switch (overall) {
    case 'good': return '#66BB6A';
    case 'fair': return '#FFB300';
    case 'poor': return '#FF7043';
    case 'hazardous': return '#EF5350';
    default: return '#8A8A85';
  }
}

// ══════════════════════════════════════════════════════════════
// STYLES: Timeline Overlay
// ══════════════════════════════════════════════════════════════

const tlStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 42,
    left: 10,
    zIndex: 23,
    maxWidth: 300,
  },

  // Approaching hazard banner
  hazardBanner: {
    marginBottom: 6,
    backgroundColor: 'rgba(11,15,18,0.95)',
    borderRadius: 10,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 8,
  },
  hazardBannerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  hazardBannerIcon: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hazardBannerContent: {
    flex: 1,
  },
  hazardBannerTitle: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  hazardBannerSub: {
    fontSize: 8,
    color: TACTICAL.textMuted,
    marginTop: 1,
  },

  // Badge
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(11,15,18,0.92)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.4)',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 6,
  },
  badgeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  badgeIcon: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badgeLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
    color: TACTICAL.amber,
  },
  badgeDistance: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
  },
  badgeLoadingText: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  hazardCountBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
  },
  hazardCountText: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  // Expanded panel
  expandedPanel: {
    marginTop: 4,
    backgroundColor: 'rgba(11,15,18,0.95)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.4)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
    maxHeight: 280,
  },
  segmentBar: {
    flexDirection: 'row',
    height: 4,
    marginHorizontal: 10,
    marginTop: 8,
    borderRadius: 2,
    overflow: 'hidden',
    gap: 1,
  },
  segmentBarChunk: {
    height: 4,
    borderRadius: 1,
  },
  waypointScroll: {
    maxHeight: 200,
  },
  waypointScrollContent: {
    paddingVertical: 4,
  },
  waypointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  waypointRowBorder: {
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(62,79,60,0.12)',
  },
  hazardDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  waypointLabel: {
    flex: 1,
    minWidth: 50,
  },
  waypointLabelText: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 0.5,
  },
  waypointDistText: {
    fontSize: 7,
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
  },
  waypointConditions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  waypointTemp: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  waypointWind: {
    fontSize: 7,
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
  },
  waypointHazardBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
    marginLeft: 4,
  },
  waypointHazardText: {
    fontSize: 6,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  expandedFooter: {
    flexDirection: 'row',
    gap: 6,
    padding: 8,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(62,79,60,0.15)',
  },
  footerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: 'rgba(196,138,44,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.20)',
  },
  footerBtnText: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },
});

// ══════════════════════════════════════════════════════════════
// STYLES: Detail Modal
// ══════════════════════════════════════════════════════════════

const mdStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: TACTICAL.panel,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    borderTopWidth: 2,
    borderColor: 'rgba(196,138,44,0.3)',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(138,138,133,0.3)',
    alignSelf: 'center', marginTop: 10, marginBottom: 4,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: GOLD_RAIL.sectionWidth, borderBottomColor: GOLD_RAIL.section,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  headerIconBg: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(196,138,44,0.12)', borderWidth: 1,
  },
  headerTitle: { fontSize: 12, fontWeight: '900', color: TACTICAL.amber, letterSpacing: 2 },
  headerSub: { fontSize: 10, color: TACTICAL.textMuted, marginTop: 2 },

  // Status bar
  statusBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: 0.5, borderBottomColor: 'rgba(62,79,60,0.12)',
  },
  sourcePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
    backgroundColor: 'rgba(102,187,106,0.08)', borderWidth: 1, borderColor: 'rgba(102,187,106,0.20)',
  },
  sourceDot: { width: 5, height: 5, borderRadius: 3 },
  sourceText: { fontSize: 7, fontWeight: '900', color: TACTICAL.textMuted, letterSpacing: 1 },
  lastFetchText: { fontSize: 9, color: TACTICAL.textMuted, fontFamily: 'Courier' },
  hazardSummaryPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, borderWidth: 1,
  },
  hazardSummaryText: { fontSize: 7, fontWeight: '900', letterSpacing: 1.5 },

  // Approaching hazard
  approachBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginTop: 10, padding: 10,
    borderRadius: 10, borderLeftWidth: 4,
    backgroundColor: 'rgba(239,83,80,0.06)', borderWidth: 1, borderColor: 'rgba(239,83,80,0.15)',
  },
  approachBannerContent: { flex: 1 },
  approachBannerTitle: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  approachBannerSub: { fontSize: 9, color: TACTICAL.textMuted, marginTop: 2 },

  // Error
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 8, paddingVertical: 8, paddingHorizontal: 10,
    borderRadius: 8, backgroundColor: 'rgba(239,83,80,0.06)',
    borderWidth: 1, borderColor: 'rgba(239,83,80,0.20)',
  },
  errorText: { fontSize: 10, color: '#EF5350', flex: 1 },

  // Segment bar
  segmentBarContainer: {
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8,
  },
  segmentBarLabel: {
    fontSize: 7, fontWeight: '900', color: TACTICAL.textMuted,
    letterSpacing: 3, marginBottom: 6,
  },
  segmentBar: {
    flexDirection: 'row', height: 6, borderRadius: 3,
    overflow: 'hidden', gap: 2,
  },
  segmentChunk: { height: 6, borderRadius: 2 },
  segmentBarLabels: {
    flexDirection: 'row', justifyContent: 'space-between', marginTop: 4,
  },
  segmentBarMi: { fontSize: 7, color: TACTICAL.textMuted, fontFamily: 'Courier' },

  // Scroll area
  scrollArea: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },

  // Empty state
  emptyState: { alignItems: 'center', gap: 10, paddingVertical: 40 },
  emptyTitle: { fontSize: 12, fontWeight: '900', color: TACTICAL.textMuted, letterSpacing: 2 },
  emptyDesc: { fontSize: 11, color: TACTICAL.textMuted, textAlign: 'center', lineHeight: 17 },

  // Waypoint cards
  waypointCard: {
    backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(62,79,60,0.25)',
    borderLeftWidth: 4, marginBottom: 10, overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12,
  },
  cardIcon: {
    width: 32, height: 32, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitleArea: { flex: 1 },
  cardTitleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  cardLabel: { fontSize: 11, fontWeight: '900', color: TACTICAL.text, letterSpacing: 0.5, flex: 1 },
  cardDist: { fontSize: 9, fontWeight: '700', color: TACTICAL.textMuted, fontFamily: 'Courier' },
  cardCondRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3,
  },
  cardTemp: { fontSize: 11, fontWeight: '800', color: TACTICAL.text, fontFamily: 'Courier' },
  cardCond: { fontSize: 9, color: TACTICAL.textMuted },
  cardHazardBadge: {
    paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, borderWidth: 1,
  },
  cardHazardText: { fontSize: 7, fontWeight: '900', letterSpacing: 1 },

  // Card body (expanded)
  cardBody: { paddingHorizontal: 12, paddingBottom: 12 },
  cardDivider: { height: 1, marginBottom: 10, borderRadius: 1 },

  // Stats grid
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  statItem: {
    alignItems: 'center', gap: 3,
    minWidth: 60, paddingVertical: 8, paddingHorizontal: 6,
    borderRadius: 8, backgroundColor: 'rgba(62,79,60,0.06)',
    borderWidth: 1, borderColor: 'rgba(62,79,60,0.12)',
  },
  statLabel: { fontSize: 6, fontWeight: '900', color: TACTICAL.textMuted, letterSpacing: 2 },
  statValue: { fontSize: 12, fontWeight: '800', color: TACTICAL.text, fontFamily: 'Courier' },
  statSub: { fontSize: 8, color: TACTICAL.textMuted },

  // Trail conditions
  trailCondBox: {
    padding: 10, borderRadius: 8,
    backgroundColor: 'rgba(62,79,60,0.06)', borderWidth: 1, borderColor: 'rgba(62,79,60,0.12)',
    marginBottom: 8,
  },
  trailCondTitle: { fontSize: 7, fontWeight: '900', color: TACTICAL.textMuted, letterSpacing: 2, marginBottom: 6 },
  trailCondRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  trailCondBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  trailCondBadgeText: { fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  trailFactorText: { fontSize: 9, color: TACTICAL.textMuted, lineHeight: 14, marginTop: 2 },

  // Hazard reasons
  hazardReasonsBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    padding: 10, borderRadius: 8,
    backgroundColor: 'rgba(239,83,80,0.04)', borderWidth: 1, marginBottom: 8,
  },
  hazardReasonsList: { flex: 1 },
  hazardReasonText: { fontSize: 9, lineHeight: 14 },

  // Alerts section
  alertsSection: { marginBottom: 8 },
  alertsSectionTitle: { fontSize: 7, fontWeight: '900', color: TACTICAL.textMuted, letterSpacing: 2, marginBottom: 6 },
  alertItem: {
    borderLeftWidth: 3, paddingLeft: 8, paddingVertical: 4, marginBottom: 4,
  },
  alertItemTitle: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  alertItemDesc: { fontSize: 8, color: TACTICAL.textMuted, marginTop: 1 },

  // Coordinates
  coordText: {
    fontSize: 8, color: TACTICAL.textMuted, fontFamily: 'Courier',
    textAlign: 'right', marginTop: 4,
  },

  // Footer
  footer: {
    padding: 16, borderTopWidth: GOLD_RAIL.sectionWidth, borderTopColor: GOLD_RAIL.section,
  },
  refreshBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 10,
    backgroundColor: 'rgba(196,138,44,0.10)', borderWidth: 1, borderColor: 'rgba(196,138,44,0.30)',
  },
  refreshBtnText: { fontSize: 10, fontWeight: '900', color: TACTICAL.amber, letterSpacing: 2 },
});



