/**
 * WeatherAlertLayer — Real-time Weather Alert Integration for Navigate Map
 *
 * Components:
 *   useWeatherAlerts()         — Hook: fetches weather, tracks alerts, triggers notifications
 *   WeatherAlertMapOverlay     — Floating alert badge/panel on the map
 *   WeatherAlertDetailModal    — Full-screen modal for alert details
 *
 * Features:
 *   - Auto-fetches weather data based on GPS position
 *   - Re-fetches when GPS moves >500m from last fetch point
 *   - Detects NEW severe alerts and triggers haptic + toast
 *   - Shows severity-colored alert indicators on the map
 *   - Expandable alert panel with full details
 *   - Route corridor awareness (alerts near active route waypoints)
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView,
  Animated, Platform,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import ECSModal from '../ECSModal';
import { TACTICAL, TYPO, GOLD_RAIL } from '../../lib/theme';
import { hapticWarning, hapticMicro, hapticCommand } from '../../lib/haptics';
import type {
  WeatherAlert,
  AlertSeverity,
} from '../../lib/weatherTypes';
import { getAlertColor } from '../../lib/weatherTypes';
import { useOperationalWeather } from '../../lib/useOperationalWeather';

// ── Types ────────────────────────────────────────────────────

export interface WeatherAlertMarker {
  id: string;
  lat: number;
  lng: number;
  severity: AlertSeverity;
  title: string;
  description: string;
  type: string;
  color: string;
}

export interface UseWeatherAlertsResult {
  /** All active weather alerts */
  alerts: WeatherAlert[];
  /** Alert markers for map overlay */
  markers: WeatherAlertMarker[];
  /** Total alert count */
  alertCount: number;
  /** Count of severe (warning+extreme) alerts */
  severeCount: number;
  /** Whether weather layer is enabled */
  enabled: boolean;
  /** Toggle weather layer on/off */
  toggle: () => void;
  /** Force refresh weather data */
  refresh: () => void;
  /** Whether currently fetching */
  loading: boolean;
  /** Data source info */
  source: 'live' | 'cache_fresh' | 'cache_stale' | 'fallback' | null;
  /** Error message if any */
  error: string | null;
  /** Last fetch timestamp */
  lastFetchAt: number | null;
  /** Current conditions summary (for overlay badge) */
  conditionsSummary: string | null;
  /** Temperature string */
  tempString: string | null;
  /** Wind info */
  windString: string | null;
  /** Precipitation summary */
  precipString: string | null;
  /** State label for stale/offline/error */
  statusText: string | null;
}

// ── Haversine distance (meters) ──────────────────────────────
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Alert severity ordering ──────────────────────────────────
const SEVERITY_ORDER: Record<string, number> = { extreme: 0, warning: 1, advisory: 2 };

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

// ── Persistence key ──────────────────────────────────────────
const WEATHER_LAYER_KEY = 'ecs_weather_alert_layer_visible';
const REFETCH_DISTANCE_M = 500; // Re-fetch when GPS moves >500m
const REFETCH_INTERVAL_MS = 5 * 60 * 1000; // Also re-fetch every 5 minutes
const ROUTE_CORRIDOR_M = 5000; // Alerts within 5km of route are "in corridor"

// ══════════════════════════════════════════════════════════════
// HOOK: useWeatherAlerts
// ══════════════════════════════════════════════════════════════

export function useWeatherAlerts(
  userLocation: { lat: number; lng: number } | null,
  showToast: (msg: string) => void,
): UseWeatherAlertsResult {
  const [enabled, setEnabled] = useState<boolean>(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(WEATHER_LAYER_KEY) === 'true';
      }
    } catch {}
    return false;
  });

  const seenAlertKeysRef = useRef<Set<string>>(new Set());
  const userLat = userLocation?.lat ?? null;
  const userLng = userLocation?.lng ?? null;
  const gps = useMemo(
    () => ({
      lat: userLat,
      lng: userLng,
      hasFix: userLat != null && userLng != null,
    }),
    [userLat, userLng],
  );
  const { snapshot, refresh: refreshOperational } = useOperationalWeather({
    enabled,
    gps,
    units: 'imperial',
    freshnessWindowMs: REFETCH_INTERVAL_MS,
    movementThresholdM: REFETCH_DISTANCE_M,
  });
  const alerts = useMemo(() => (enabled ? snapshot.alerts : []), [enabled, snapshot.alerts]);
  const markers = useMemo<WeatherAlertMarker[]>(
    () =>
      enabled && userLat != null && userLng != null
        ? alerts.map((alert, index) => ({
            id: `wa_${userLat}_${userLng}_${alert.type}_${alert.severity}_${index}`,
            lat: userLat,
            lng: userLng,
            severity: alert.severity,
            title: alert.title,
            description: alert.description,
            type: alert.type,
            color: getAlertColor(alert.severity),
          }))
        : [],
    [alerts, enabled, userLat, userLng],
  );
  const source = enabled ? snapshot.status.source : null;
  const error = enabled ? snapshot.status.error : null;
  const lastFetchAt = useMemo(() => {
    if (!enabled || !snapshot.fetchedAt) return null;
    const parsed = Date.parse(snapshot.fetchedAt);
    return Number.isFinite(parsed) ? parsed : null;
  }, [enabled, snapshot.fetchedAt]);
  const conditionsSummary = enabled
    ? snapshot.current.description ?? snapshot.current.condition
    : null;
  const tempString = enabled && snapshot.current.temp != null
    ? `${Math.round(snapshot.current.temp)}°F`
    : null;
  const windString = enabled && snapshot.current.windSpeed != null
    ? `${Math.round(snapshot.current.windSpeed)} mph`
    : null;
  const precipChance = snapshot.current.precipChance;
  const precipType = snapshot.current.precipType;
  const precipString = useMemo(() => {
    if (!enabled || precipChance == null) return null;
    const precipLabel =
      precipType === 'snow'
        ? 'Snow'
        : precipType === 'rain'
          ? 'Rain'
          : 'Precip';
    return `${precipLabel} ${Math.round(precipChance)}%`;
  }, [enabled, precipChance, precipType]);
  const statusText = enabled
    ? snapshot.status.label ?? (snapshot.status.error ? 'Weather degraded' : null)
    : null;

  const toggle = useCallback(() => {
    hapticMicro();
    setEnabled(prev => {
      const next = !prev;
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(WEATHER_LAYER_KEY, String(next));
        }
      } catch {}
      if (!next) {
        seenAlertKeysRef.current.clear();
      }
      return next;
    });
  }, []);

  const refresh = useCallback(() => {
    if (!enabled || !userLocation) return;
    hapticMicro();
    seenAlertKeysRef.current.clear();
    refreshOperational();
  }, [enabled, refreshOperational, userLocation]);

  useEffect(() => {
    if (!enabled || !userLocation || alerts.length === 0) return;

    const orderedAlerts = [...alerts].sort(
      (a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3),
    );
    const newSevereAlerts: WeatherAlert[] = [];

    for (const alert of orderedAlerts) {
      const key = `${alert.type}_${alert.severity}_${alert.title}`;
      if (seenAlertKeysRef.current.has(key)) continue;
      seenAlertKeysRef.current.add(key);
      if (alert.severity === 'extreme' || alert.severity === 'warning') {
        newSevereAlerts.push(alert);
      }
    }

    if (newSevereAlerts.length === 0) return;

    hapticWarning();
    const worst = newSevereAlerts[0];
    const severityLabel = worst.severity === 'extreme' ? 'EXTREME' : 'WARNING';
    if (newSevereAlerts.length === 1) {
      showToast(`${severityLabel}: ${worst.title}`);
    } else {
      showToast(`${newSevereAlerts.length} NEW WEATHER ALERTS â€” ${worst.title}`);
    }
  }, [alerts, enabled, showToast, userLocation]);

  const severeCount = useMemo(() =>
    alerts.filter(a => a.severity === 'extreme' || a.severity === 'warning').length,
  [alerts]);

  return {
    alerts,
    markers,
    alertCount: alerts.length,
    severeCount,
    enabled,
    toggle,
    refresh,
    loading: enabled && snapshot.status.loading,
    source,
    error,
    lastFetchAt,
    conditionsSummary,
    tempString,
    windString,
    precipString,
    statusText,
  };
}

// ══════════════════════════════════════════════════════════════
// COMPONENT: WeatherAlertMapOverlay
// ══════════════════════════════════════════════════════════════

interface OverlayProps {
  alerts: WeatherAlert[];
  alertCount: number;
  severeCount: number;
  enabled: boolean;
  loading: boolean;
  source: string | null;
  conditionsSummary: string | null;
  tempString: string | null;
  windString: string | null;
  precipString: string | null;
  statusText: string | null;
  onDetailPress: () => void;
  onRefresh: () => void;
  topOffset?: number;
  leftOffset?: number;
}

export function WeatherAlertMapOverlay({
  alerts,
  alertCount,
  severeCount,
  enabled,
  loading,
  source,
  conditionsSummary,
  tempString,
  windString,
  precipString,
  statusText,
  onDetailPress,
  onRefresh,
  topOffset = 10,
  leftOffset = 10,
}: OverlayProps) {
  const [expanded, setExpanded] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation for severe alerts
  useEffect(() => {
    if (severeCount > 0) {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      );
      anim.start();
      return () => anim.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [severeCount, pulseAnim]);

  if (!enabled) return null;

  const hasAlerts = alertCount > 0;
  const worstSeverity = alerts.length > 0 ? alerts[0].severity : null;
  const badgeColor = worstSeverity === 'extreme' ? '#EF5350' :
    worstSeverity === 'warning' ? '#FFB300' :
    worstSeverity === 'advisory' ? '#42A5F5' : TACTICAL.amber;

  return (
    <View style={[ovStyles.container, { top: topOffset, left: leftOffset }]} pointerEvents="box-none">
      {/* Compact badge */}
      <TouchableOpacity
        style={[
          ovStyles.badge,
          hasAlerts && { borderColor: badgeColor + '60' },
        ]}
        onPress={() => {
          hapticMicro();
          if (hasAlerts) setExpanded(!expanded);
          else onDetailPress();
        }}
        activeOpacity={0.85}
      >
        <View style={ovStyles.badgeLeft}>
          {hasAlerts ? (
            <Animated.View style={[
              ovStyles.alertIconBg,
              { backgroundColor: badgeColor + '20', transform: [{ scale: pulseAnim }] },
            ]}>
              <Ionicons name="thunderstorm-outline" size={13} color={badgeColor} />
            </Animated.View>
          ) : (
            <View style={ovStyles.weatherIconBg}>
              <Ionicons name="cloud-outline" size={13} color={TACTICAL.amber} />
            </View>
          )}
          <View>
            {hasAlerts ? (
              <View style={ovStyles.alertCountRow}>
                <Text style={[ovStyles.alertCountText, { color: badgeColor }]}>
                  {alertCount} ALERT{alertCount !== 1 ? 'S' : ''}
                </Text>
                {severeCount > 0 && (
                  <View style={[ovStyles.severeBadge, { backgroundColor: badgeColor + '20', borderColor: badgeColor + '40' }]}>
                    <Text style={[ovStyles.severeText, { color: badgeColor }]}>
                      {severeCount} SEVERE
                    </Text>
                  </View>
                )}
              </View>
            ) : (
              <View style={ovStyles.conditionsStack}>
                <View style={ovStyles.conditionsRow}>
                  {tempString && (
                    <Text style={ovStyles.tempText}>{tempString}</Text>
                  )}
                  {conditionsSummary && (
                    <Text style={ovStyles.conditionsText}>{conditionsSummary}</Text>
                  )}
                  {!tempString && !conditionsSummary && (
                    <Text style={ovStyles.conditionsText}>
                      {loading ? 'Loading weather' : 'No alerts'}
                    </Text>
                  )}
                </View>
                {(windString || precipString) && (
                  <Text style={ovStyles.secondaryLine} numberOfLines={1}>
                    {windString || '--'}{windString && precipString ? ' • ' : ''}{precipString || ''}
                  </Text>
                )}
                {statusText && (
                  <Text style={ovStyles.statusLine} numberOfLines={1}>
                    {statusText}
                  </Text>
                )}
              </View>
            )}
          </View>
        </View>
        {hasAlerts && (
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={12}
            color={TACTICAL.textMuted}
          />
        )}
      </TouchableOpacity>

      {/* Expanded alert list */}
      {expanded && hasAlerts && (
        <View style={ovStyles.expandedPanel}>
          {alerts.slice(0, 4).map((alert, idx) => {
            const color = getAlertColor(alert.severity);
            const icon = getAlertIcon(alert.type);
            return (
              <TouchableOpacity
                key={`${alert.type}_${idx}`}
                style={[
                  ovStyles.alertRow,
                  { borderLeftColor: color },
                  idx < Math.min(alerts.length, 4) - 1 && ovStyles.alertRowBorder,
                ]}
                onPress={() => {
                  hapticMicro();
                  onDetailPress();
                }}
                activeOpacity={0.85}
              >
                <View style={[ovStyles.alertRowIcon, { backgroundColor: color + '18' }]}>
                  <Ionicons name={icon as any} size={12} color={color} />
                </View>
                <View style={ovStyles.alertRowContent}>
                  <Text style={[ovStyles.alertRowTitle, { color }]} numberOfLines={1}>
                    {alert.title}
                  </Text>
                  <Text style={ovStyles.alertRowDesc} numberOfLines={1}>
                    {alert.description}
                  </Text>
                </View>
                <View style={[ovStyles.alertSeverityBadge, { backgroundColor: color + '18', borderColor: color + '40' }]}>
                  <Text style={[ovStyles.alertSeverityText, { color }]}>
                    {getSeverityLabel(alert.severity)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}

          {alerts.length > 4 && (
            <TouchableOpacity
              style={ovStyles.moreRow}
              onPress={() => { hapticMicro(); onDetailPress(); }}
              activeOpacity={0.85}
            >
              <Text style={ovStyles.moreText}>
                +{alerts.length - 4} MORE ALERT{alerts.length - 4 !== 1 ? 'S' : ''}
              </Text>
              <Ionicons name="chevron-forward" size={12} color={TACTICAL.amber} />
            </TouchableOpacity>
          )}

          {/* Footer with refresh + detail */}
          <View style={ovStyles.expandedFooter}>
            <TouchableOpacity
              style={ovStyles.footerBtn}
              onPress={onRefresh}
              activeOpacity={0.85}
            >
              <Ionicons name="refresh-outline" size={11} color={TACTICAL.amber} />
              <Text style={ovStyles.footerBtnText}>REFRESH</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={ovStyles.footerBtn}
              onPress={() => { hapticMicro(); onDetailPress(); }}
              activeOpacity={0.85}
            >
              <Ionicons name="expand-outline" size={11} color={TACTICAL.amber} />
              <Text style={ovStyles.footerBtnText}>DETAILS</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

// ══════════════════════════════════════════════════════════════
// COMPONENT: WeatherAlertDetailModal
// ══════════════════════════════════════════════════════════════

interface DetailModalProps {
  visible: boolean;
  onClose: () => void;
  alerts: WeatherAlert[];
  source: string | null;
  lastFetchAt: number | null;
  conditionsSummary: string | null;
  tempString: string | null;
  windString: string | null;
  onRefresh: () => void;
  loading: boolean;
  error: string | null;
}

export function WeatherAlertDetailModal({
  visible,
  onClose,
  alerts,
  source,
  lastFetchAt,
  conditionsSummary,
  tempString,
  windString,
  onRefresh,
  loading,
  error,
}: DetailModalProps) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  return (
    <ECSModal visible={visible} onClose={onClose} dismissOnBackdrop={false} stackBehavior="replace">
      <View style={dmStyles.overlay}>
        <TouchableOpacity style={dmStyles.backdrop} onPress={onClose} activeOpacity={1} />
        <View style={dmStyles.sheet}>
          <View style={dmStyles.handle} />

          {/* Header */}
          <View style={dmStyles.header}>
            <View style={dmStyles.headerLeft}>
              <View style={dmStyles.headerIconBg}>
                <Ionicons name="thunderstorm-outline" size={16} color={TACTICAL.amber} />
              </View>
              <View>
                <Text style={dmStyles.headerTitle}>WEATHER ALERTS</Text>
                <Text style={dmStyles.headerSub}>
                  {alerts.length} active alert{alerts.length !== 1 ? 's' : ''}
                  {conditionsSummary ? ` — ${tempString || ''} ${conditionsSummary}` : ''}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={20} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Source indicator */}
          {source && (
            <View style={dmStyles.sourceRow}>
              <View style={[
                dmStyles.sourcePill,
                source === 'live' && dmStyles.sourcePillLive,
                source === 'cache_stale' && dmStyles.sourcePillStale,
                source === 'fallback' && dmStyles.sourcePillFallback,
              ]}>
                <View style={[
                  dmStyles.sourceDot,
                  { backgroundColor: source === 'live' ? '#66BB6A' :
                    source === 'cache_fresh' ? '#66BB6A' :
                    source === 'cache_stale' ? '#FFB300' : '#EF5350' },
                ]} />
                <Text style={dmStyles.sourceText}>
                  {source === 'live' ? 'LIVE' :
                   source === 'cache_fresh' ? 'CACHED' :
                   source === 'cache_stale' ? 'STALE' : 'OFFLINE'}
                </Text>
              </View>
              {lastFetchAt && (
                <Text style={dmStyles.lastFetchText}>
                  {new Date(lastFetchAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              )}
              {windString && (
                <View style={dmStyles.windPill}>
                  <Ionicons name="flag-outline" size={10} color={TACTICAL.textMuted} />
                  <Text style={dmStyles.windText}>{windString}</Text>
                </View>
              )}
            </View>
          )}

          {/* Error banner */}
          {error && (
            <View style={dmStyles.errorBanner}>
              <Ionicons name="alert-circle-outline" size={13} color="#EF5350" />
              <Text style={dmStyles.errorText} numberOfLines={2}>{error}</Text>
            </View>
          )}

          {/* Alert list */}
          <ScrollView style={dmStyles.scrollArea} contentContainerStyle={{ paddingBottom: 40 }}>
            {alerts.length === 0 && (
              <View style={dmStyles.emptyState}>
                <Ionicons name="checkmark-circle-outline" size={32} color="#66BB6A" />
                <Text style={dmStyles.emptyTitle}>NO ACTIVE ALERTS</Text>
                <Text style={dmStyles.emptyDesc}>
                  No severe weather warnings in your area.{'\n'}
                  Weather data refreshes automatically as you navigate.
                </Text>
              </View>
            )}

            {alerts.map((alert, idx) => {
              const color = getAlertColor(alert.severity);
              const icon = getAlertIcon(alert.type);
              const isExpanded = expandedIdx === idx;

              return (
                <TouchableOpacity
                  key={`${alert.type}_${alert.severity}_${idx}`}
                  style={[
                    dmStyles.alertCard,
                    { borderLeftColor: color },
                  ]}
                  onPress={() => {
                    hapticMicro();
                    setExpandedIdx(isExpanded ? null : idx);
                  }}
                  activeOpacity={0.85}
                >
                  <View style={dmStyles.alertCardHeader}>
                    <View style={[dmStyles.alertCardIcon, { backgroundColor: color + '18' }]}>
                      <Ionicons name={icon as any} size={16} color={color} />
                    </View>
                    <View style={dmStyles.alertCardTitleArea}>
                      <View style={dmStyles.alertCardTitleRow}>
                        <Text style={[dmStyles.alertCardTitle, { color }]} numberOfLines={1}>
                          {alert.title}
                        </Text>
                        <View style={[dmStyles.severityBadge, { backgroundColor: color + '18', borderColor: color + '40' }]}>
                          <Text style={[dmStyles.severityBadgeText, { color }]}>
                            {getSeverityLabel(alert.severity)}
                          </Text>
                        </View>
                      </View>
                      <Text style={dmStyles.alertCardType}>
                        {alert.type.replace(/_/g, ' ').toUpperCase()}
                      </Text>
                    </View>
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={14}
                      color={TACTICAL.textMuted}
                    />
                  </View>

                  {isExpanded && (
                    <View style={dmStyles.alertCardBody}>
                      <View style={[dmStyles.alertCardDivider, { backgroundColor: color + '20' }]} />
                      <Text style={dmStyles.alertCardDescription}>
                        {alert.description}
                      </Text>

                      {/* Severity indicator bar */}
                      <View style={dmStyles.severityBar}>
                        <View style={dmStyles.severityBarTrack}>
                          <View style={[
                            dmStyles.severityBarFill,
                            {
                              backgroundColor: color,
                              width: alert.severity === 'extreme' ? '100%' :
                                     alert.severity === 'warning' ? '66%' : '33%',
                            },
                          ]} />
                        </View>
                        <Text style={[dmStyles.severityBarLabel, { color }]}>
                          {alert.severity === 'extreme' ? 'EXTREME RISK' :
                           alert.severity === 'warning' ? 'ELEVATED RISK' : 'LOW RISK'}
                        </Text>
                      </View>

                      {/* Action recommendations */}
                      <View style={dmStyles.actionBox}>
                        <Ionicons name="shield-outline" size={12} color={TACTICAL.amber} />
                        <Text style={dmStyles.actionText}>
                          {alert.severity === 'extreme'
                            ? 'Seek shelter immediately. Avoid exposed terrain and water crossings.'
                            : alert.severity === 'warning'
                            ? 'Exercise caution. Monitor conditions and have an exit plan ready.'
                            : 'Be aware of changing conditions. Continue with normal precautions.'}
                        </Text>
                      </View>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Footer */}
          <View style={dmStyles.footer}>
            <TouchableOpacity
              style={dmStyles.refreshBtn}
              onPress={() => { hapticCommand(); onRefresh(); }}
              activeOpacity={0.85}
            >
              <Ionicons name="refresh-outline" size={14} color={TACTICAL.amber} />
              <Text style={dmStyles.refreshBtnText}>
                {loading ? 'FETCHING...' : 'REFRESH WEATHER'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ECSModal>
  );
}

// ══════════════════════════════════════════════════════════════
// STYLES: Overlay
// ══════════════════════════════════════════════════════════════

const ovStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 10,
    left: 10,
    zIndex: 22,
    maxWidth: 280,
  },
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
  alertIconBg: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weatherIconBg: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(196,138,44,0.12)',
  },
  alertCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  alertCountText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  severeBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
  },
  severeText: {
    fontSize: 6,
    fontWeight: '900',
    letterSpacing: 1,
  },
  conditionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  conditionsStack: {
    gap: 2,
  },
  tempText: {
    fontSize: 11,
    fontWeight: '700',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  conditionsText: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },
  secondaryLine: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.4,
    fontFamily: 'Courier',
  },
  statusLine: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.amber,
    letterSpacing: 0.4,
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
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderLeftWidth: 3,
  },
  alertRowBorder: {
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(62,79,60,0.15)',
  },
  alertRowIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertRowContent: {
    flex: 1,
  },
  alertRowTitle: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  alertRowDesc: {
    fontSize: 8,
    color: TACTICAL.textMuted,
    marginTop: 1,
  },
  alertSeverityBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  alertSeverityText: {
    fontSize: 6,
    fontWeight: '900',
    letterSpacing: 1,
  },
  moreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(62,79,60,0.15)',
  },
  moreText: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.amber,
    letterSpacing: 1,
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

const dmStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: TACTICAL.panel,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    borderTopWidth: 2,
    borderColor: 'rgba(196,138,44,0.3)',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(138,138,133,0.3)',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: GOLD_RAIL.sectionWidth,
    borderBottomColor: GOLD_RAIL.section,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(196,138,44,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.28)',
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },
  headerSub: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    marginTop: 2,
  },

  // Source indicator
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(62,79,60,0.12)',
  },
  sourcePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(102,187,106,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(102,187,106,0.20)',
  },
  sourcePillLive: {
    backgroundColor: 'rgba(102,187,106,0.08)',
    borderColor: 'rgba(102,187,106,0.20)',
  },
  sourcePillStale: {
    backgroundColor: 'rgba(255,179,0,0.08)',
    borderColor: 'rgba(255,179,0,0.20)',
  },
  sourcePillFallback: {
    backgroundColor: 'rgba(239,83,80,0.08)',
    borderColor: 'rgba(239,83,80,0.20)',
  },
  sourceDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  sourceText: {
    fontSize: 7,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  lastFetchText: {
    fontSize: 9,
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
  },
  windPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: 'rgba(62,79,60,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.20)',
  },
  windText: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
  },

  // Error
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(239,83,80,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(239,83,80,0.20)',
  },
  errorText: {
    fontSize: 10,
    color: '#EF5350',
    flex: 1,
  },

  // Scroll area
  scrollArea: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#66BB6A',
    letterSpacing: 2,
  },
  emptyDesc: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 17,
  },

  // Alert cards
  alertCard: {
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.25)',
    borderLeftWidth: 4,
    marginBottom: 10,
    overflow: 'hidden',
  },
  alertCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
  },
  alertCardIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertCardTitleArea: {
    flex: 1,
  },
  alertCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  alertCardTitle: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
    flex: 1,
  },
  alertCardType: {
    fontSize: 7,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
    marginTop: 2,
  },
  severityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
  },
  severityBadgeText: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1.5,
  },

  // Alert card body (expanded)
  alertCardBody: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  alertCardDivider: {
    height: 1,
    marginBottom: 10,
    borderRadius: 1,
  },
  alertCardDescription: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    lineHeight: 17,
  },
  severityBar: {
    marginTop: 12,
    gap: 4,
  },
  severityBarTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(62,79,60,0.15)',
    overflow: 'hidden',
  },
  severityBarFill: {
    height: 4,
    borderRadius: 2,
  },
  severityBarLabel: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 2,
  },
  actionBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 12,
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(196,138,44,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.15)',
  },
  actionText: {
    fontSize: 10,
    color: TACTICAL.text,
    lineHeight: 15,
    flex: 1,
  },

  // Footer
  footer: {
    padding: 16,
    borderTopWidth: GOLD_RAIL.sectionWidth,
    borderTopColor: GOLD_RAIL.section,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(196,138,44,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.30)',
  },
  refreshBtnText: {
    fontSize: 10,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },
});



