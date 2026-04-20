import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { ECSInlineHelper, ECSStateMessage } from '../ECSStateMessage';
import { ECSIconButton } from '../ECSButton';
import { ECSCard, ECSListRow, ECSPanel, ECSSection, ECSSectionBadge, ECSSectionHeader } from '../ECSSurface';
import { ECSBadge, ECSStateIndicator } from '../ECSStatus';

import { TACTICAL } from '../../lib/theme';
import type { ImportedRoute } from '../../lib/routeStore';
import { useThrottledGPS } from '../../lib/useThrottledGPS';
import { useOperationalWeather } from '../../lib/useOperationalWeather';
import {
  formatWeatherAlertLine,
  formatWeatherHeadline,
  formatWeatherWindLine,
} from '../../lib/ecsWeather';
import { ECS_STATE_COPY } from '../../lib/ecsStateCopy';

interface Props {
  activeRoute: ImportedRoute | null;
  riskScore: number | null;
  riskLevel: string;
  riskColor: string;
}

type RouteWeatherTarget = {
  lat: number;
  lng: number;
  label: string;
};

function deriveRouteWeatherTarget(activeRoute: ImportedRoute | null): RouteWeatherTarget | null {
  if (!activeRoute) return null;

  const waypoint = activeRoute.waypoints[0];
  if (waypoint) {
    return {
      lat: waypoint.lat,
      lng: waypoint.lon,
      label: activeRoute.name || 'Route Origin',
    };
  }

  const point = activeRoute.segments[0]?.points[0];
  if (point) {
    return {
      lat: point.lat,
      lng: point.lon,
      label: activeRoute.name || 'Route Origin',
    };
  }

  return null;
}

function formatShortTime(unixSeconds: number | null | undefined): string {
  if (!unixSeconds || !Number.isFinite(unixSeconds)) return '--';

  return new Date(unixSeconds * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusAppearance(kind: string) {
  switch (kind) {
    case 'ready':
      return { label: 'LIVE DATA', color: '#4CAF50', icon: 'cloud-done-outline' as const };
    case 'stale':
      return { label: 'CACHED', color: '#D4A017', icon: 'time-outline' as const };
    case 'offline':
      return { label: 'OFFLINE', color: '#5DADE2', icon: 'cloud-offline-outline' as const };
    case 'loading':
      return { label: 'LOADING', color: TACTICAL.textMuted, icon: 'sync-outline' as const };
    case 'error':
      return { label: 'UNAVAILABLE', color: TACTICAL.danger, icon: 'alert-circle-outline' as const };
    default:
      return { label: 'ROUTE REQUIRED', color: TACTICAL.textMuted, icon: 'locate-outline' as const };
  }
}

export default function EnvironmentalIntel({ activeRoute, riskScore, riskLevel, riskColor }: Props) {
  const routeCoordinate = useMemo(() => deriveRouteWeatherTarget(activeRoute), [activeRoute]);
  const gps = useThrottledGPS();
  const { snapshot, refresh } = useOperationalWeather({
    enabled: true,
    gps: {
      lat: gps.position?.latitude ?? null,
      lng: gps.position?.longitude ?? null,
      hasFix: gps.hasFix,
    },
    routeCoordinate,
    units: 'imperial',
  });

  const statusAppearance = getStatusAppearance(snapshot.status.kind);
  const headline = snapshot.status.kind === 'ready' || snapshot.status.kind === 'stale' || snapshot.status.kind === 'offline'
    ? formatWeatherHeadline(snapshot)
    : 'Weather intelligence unavailable';
  const windLine = snapshot.raw ? formatWeatherWindLine(snapshot) : 'Wind and precipitation details unavailable.';
  const alertLine = formatWeatherAlertLine(snapshot);
  const alertCount = snapshot.alerts.length;
  const severeAlert = snapshot.alerts[0] ?? null;
  const hasWeatherMetrics = Boolean(
    snapshot.current.condition ||
    snapshot.current.temp != null ||
    snapshot.current.windSpeed != null ||
    snapshot.current.precipChance != null ||
    snapshot.raw?.current?.sunrise != null ||
    snapshot.raw?.current?.sunset != null,
  );

  const weatherStateCopy = useMemo(() => {
    switch (snapshot.status.kind) {
      case 'waiting_for_gps':
        return activeRoute
          ? 'Waiting for a usable location fix to refine route conditions.'
          : 'Waiting for current location or an active route to load dispatch weather.';
      case 'loading':
        return 'Refreshing field weather and alert conditions.';
      case 'offline':
        return snapshot.status.label || 'Offline. Showing last known weather if available.';
      case 'stale':
        return snapshot.status.label || 'Cached weather is older than ECS prefers for live field use.';
      case 'error':
        return snapshot.status.error || 'Weather service unavailable right now.';
      default:
        return snapshot.current.description || 'Live weather data available for the active route.';
    }
  }, [activeRoute, snapshot]);

  const showWeatherDetails = hasWeatherMetrics && snapshot.status.kind !== 'loading';
  const lastUpdatedLabel = snapshot.fetchedAt
    ? `Last updated ${new Date(snapshot.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : null;
  const sourceLabel =
    snapshot.sourceType === 'current_location'
      ? 'Current position'
      : snapshot.sourceType === 'route_origin'
        ? 'Route origin'
        : snapshot.sourceType === 'cached'
          ? 'Cached field data'
          : 'Weather source';

  return (
    <ECSSection style={styles.section}>
      <ECSSectionHeader
        title="ENVIRONMENTAL INTELLIGENCE"
        badge={<ECSSectionBadge label={statusAppearance.label} color={statusAppearance.color} />}
      />

      <ECSCard variant="secondary" style={styles.card}>
        <View style={styles.weatherHeader}>
          <View style={styles.weatherHeaderCopy}>
            <View style={styles.weatherLocationRow}>
              <Text style={styles.weatherLocation}>{snapshot.locationName}</Text>
              <ECSIconButton
                icon="refresh-outline"
                variant="secondary"
                size="compact"
                onPress={refresh}
                accessibilityLabel="Refresh environmental intelligence"
              />
            </View>
            <Text style={styles.weatherHeadline}>{headline}</Text>
            <Text style={styles.weatherSubline}>{weatherStateCopy}</Text>
            <View style={styles.weatherMetaRow}>
              <Text style={styles.weatherMetaText}>{sourceLabel}</Text>
              {lastUpdatedLabel ? <Text style={styles.weatherMetaText}>{lastUpdatedLabel}</Text> : null}
            </View>
          </View>
        </View>

        {showWeatherDetails ? (
          <>
            <View style={styles.lightRow}>
              <View style={styles.lightStat}>
                <Ionicons name="thermometer-outline" size={18} color={TACTICAL.amber} />
                <Text style={styles.lightValue}>
                  {snapshot.current.temp != null ? `${Math.round(snapshot.current.temp)}°` : '--'}
                </Text>
                <Text style={styles.lightLabel}>TEMP</Text>
              </View>

              <View style={styles.lightDivider} />

              <View style={styles.lightStat}>
                <Ionicons name="sunny-outline" size={16} color={TACTICAL.amber} />
                <Text style={styles.lightValue}>{formatShortTime(snapshot.raw?.current?.sunrise)}</Text>
                <Text style={styles.lightLabel}>SUNRISE</Text>
              </View>

              <View style={styles.lightDivider} />

              <View style={styles.lightStat}>
                <Ionicons name="moon-outline" size={16} color="#5DADE2" />
                <Text style={styles.lightValue}>{formatShortTime(snapshot.raw?.current?.sunset)}</Text>
                <Text style={styles.lightLabel}>SUNSET</Text>
              </View>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>WIND / PRECIP</Text>
              <Text style={styles.infoValue}>{windLine}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>CURRENT ALERTS</Text>
              <Text style={styles.infoValue}>{alertLine || 'No active alerts reported.'}</Text>
            </View>
          </>
        ) : (
          <View style={styles.weatherEmptyState}>
            <Ionicons name={statusAppearance.icon} size={18} color={statusAppearance.color} />
            <Text style={styles.weatherEmptyText}>{weatherStateCopy}</Text>
          </View>
        )}
      </ECSCard>

      <ECSPanel variant="quiet" style={styles.subCard}>
        <ECSSectionHeader title="TERRAIN NOTES" icon="trail-sign-outline" />
        {activeRoute ? (
          <View style={styles.terrainGrid}>
            <TerrainRow label="Active Route" value={activeRoute.name} />
            <TerrainRow label="Distance" value={`${activeRoute.total_distance_miles.toFixed(1)} mi`} />
            <TerrainRow
              label="Elevation Gain"
              value={activeRoute.elevation_gain_ft ? `${activeRoute.elevation_gain_ft} ft` : 'N/A'}
            />
            <TerrainRow label="Waypoints" value={`${activeRoute.waypoint_count}`} />
            <TerrainRow label="Segments" value={`${activeRoute.segment_count}`} noDivider />
          </View>
        ) : (
          <ECSStateMessage
            title={ECS_STATE_COPY.navigate.noRouteSelected.title}
            message="Open Navigate to stage route weather, terrain, and alert context."
            icon="trail-sign-outline"
            variant="compact"
          />
        )}
      </ECSPanel>

      <ECSPanel variant="quiet" style={styles.subCard}>
        <ECSSectionHeader title="RISK OVERVIEW" icon="shield-outline" accentColor={riskColor || TACTICAL.textMuted} />
        {riskScore !== null ? (
          <View style={styles.riskRow}>
            <View style={[styles.riskBadge, { borderColor: `${riskColor}30` }]}>
              <Text style={[styles.riskScore, { color: riskColor }]}>{riskScore.toFixed(2)}</Text>
            </View>
            <View style={styles.riskInfo}>
              <ECSBadge
                label={riskLevel}
                tone="warning"
                compact
                colorOverride={riskColor}
              />
              <Text style={styles.riskDesc}>Composite risk assessment</Text>
            </View>
          </View>
        ) : (
          <ECSInlineHelper text="Review Safety to score current field readiness." variant="partial_data" />
        )}
      </ECSPanel>

      <ECSPanel variant={severeAlert ? 'warning' : 'quiet'} style={styles.subCard}>
        <ECSSectionHeader
          title="SEVERE ALERTS"
          icon={alertCount > 0 ? 'warning-outline' : 'checkmark-circle-outline'}
          accentColor={alertCount > 0 ? TACTICAL.danger : '#4CAF50'}
        />

        {severeAlert ? (
          <View style={styles.alertWarn}>
            <Text style={styles.alertWarnTitle}>{severeAlert.title}</Text>
            <Text style={styles.alertWarnCopy}>{severeAlert.description}</Text>
          </View>
        ) : hasWeatherMetrics && (snapshot.status.kind === 'ready' || snapshot.status.kind === 'stale' || snapshot.status.kind === 'offline') ? (
          <ECSStateIndicator
            label="No active alerts reported for the route origin."
            tone="live"
            icon="checkmark-circle-outline"
            style={styles.alertClear}
          />
        ) : (
          <Text style={styles.noData}>{weatherStateCopy}</Text>
        )}
      </ECSPanel>
    </ECSSection>
  );
}

function TerrainRow({ label, value, noDivider = false }: { label: string; value: string; noDivider?: boolean }) {
  return (
    <ECSListRow
      label={label}
      value={value}
      noDivider={noDivider}
      style={styles.terrainRow}
    />
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  card: {
    gap: 10,
  },
  weatherHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  weatherHeaderCopy: {
    flex: 1,
    gap: 3,
  },
  weatherLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  weatherLocation: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.8,
  },
  weatherHeadline: {
    fontSize: 14,
    fontWeight: '800',
    color: TACTICAL.text,
  },
  weatherSubline: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    lineHeight: 15,
  },
  weatherMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  weatherMetaText: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.4,
  },
  lightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  lightStat: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  lightValue: {
    fontSize: 13,
    fontWeight: '800',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  lightLabel: {
    fontSize: 7,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  lightDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(62,79,60,0.25)',
  },
  infoRow: {
    gap: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62,79,60,0.12)',
  },
  infoLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 1.7,
  },
  infoValue: {
    fontSize: 11,
    lineHeight: 16,
    color: TACTICAL.text,
  },
  weatherEmptyState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  weatherEmptyText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    color: TACTICAL.textMuted,
  },
  subCard: {
  },
  terrainGrid: { gap: 1 },
  terrainRow: {
    paddingVertical: 5,
  },
  riskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  riskBadge: {
    width: 56,
    height: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  riskScore: {
    fontSize: 18,
    fontWeight: '900',
    fontFamily: 'Courier',
  },
  riskInfo: { flex: 1, gap: 2 },
  riskLevel: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  riskDesc: {
    fontSize: 10,
    color: TACTICAL.textMuted,
  },
  alertClear: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  alertClearText: {
    flex: 1,
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '600',
  },
  alertWarn: {
    gap: 5,
    padding: 10,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(192,57,43,0.24)',
    backgroundColor: 'rgba(192,57,43,0.08)',
  },
  alertWarnTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.danger,
  },
  alertWarnCopy: {
    fontSize: 10,
    lineHeight: 15,
    color: TACTICAL.text,
  },
  noData: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    fontStyle: 'italic',
  },
});
