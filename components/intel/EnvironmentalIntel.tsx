import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { ECSInlineHelper, ECSStateMessage } from '../ECSStateMessage';
import { ECSIconButton } from '../ECSButton';
import {
  ECSCard,
  ECSListRow,
  ECSPanel,
  ECSSection,
  ECSSectionBadge,
  ECSSectionHeader,
} from '../ECSSurface';
import { ECSBadge, ECSStateIndicator } from '../ECSStatus';

import { TACTICAL } from '../../lib/theme';
import type { ImportedRoute } from '../../lib/routeStore';
import { useThrottledGPS } from '../../lib/useThrottledGPS';
import { useOperationalWeather } from '../../lib/useOperationalWeather';
import {
  formatWeatherAlertLine,
  formatWeatherWindLine,
} from '../../lib/ecsWeather';
import {
  buildUnifiedWeatherCorridor,
  getWeatherSolarTimes,
} from '../../lib/weatherSurfaceSelectors';
import { ECS_STATE_COPY } from '../../lib/ecsStateCopy';
import type { ECSRun } from '../../lib/runStore';
import {
  useRouteCorridorWeather,
  type SegmentHazardLevel,
} from '../navigate/RouteCorridorWeather';
import {
  buildEnvironmentSnapshot,
  formatEnvironmentTime,
  formatSunlightRemaining,
  getSunlightSourceLabel,
} from '../../lib/environmentSnapshotService';
import { remotenessStore } from '../../lib/remotenessStore';

interface Props {
  activeRoute: ImportedRoute | null;
  activeRun: ECSRun | null;
  riskScore: number | null;
  riskLevel: string;
  riskColor: string;
}

const silentRouteWeatherToast = (_message: string) => {};

function formatElevationLine(feet: number | null, source: string): string {
  if (feet == null || !Number.isFinite(feet)) return 'Elevation unavailable';
  const label = source === 'gps' ? 'Device altitude' : source === 'last_known' ? 'Last known' : 'Elevation source';
  return `${Math.round(feet).toLocaleString()} ft · ${label}`;
}

function getStatusAppearance(kind: string) {
  switch (kind) {
    case 'live':
    case 'ready':
      return { label: 'LIVE DATA', color: '#4CAF50', icon: 'cloud-done-outline' as const };
    case 'cached':
    case 'stale':
      return { label: 'CACHED', color: '#D4A017', icon: 'time-outline' as const };
    case 'offline':
      return { label: 'OFFLINE', color: '#5DADE2', icon: 'cloud-offline-outline' as const };
    case 'permission_required':
    case 'permission-blocked':
      return { label: 'LOCATION REQUIRED', color: TACTICAL.textMuted, icon: 'locate-outline' as const };
    case 'network-blocked':
      return { label: 'NETWORK REQUIRED', color: TACTICAL.danger, icon: 'cloud-offline-outline' as const };
    case 'loading':
      return { label: 'LOADING', color: TACTICAL.textMuted, icon: 'sync-outline' as const };
    case 'provider_error':
    case 'unavailable':
    case 'error':
      return { label: 'UNAVAILABLE', color: TACTICAL.danger, icon: 'alert-circle-outline' as const };
    default:
      return { label: 'LOCATION REQUIRED', color: TACTICAL.textMuted, icon: 'locate-outline' as const };
  }
}

function getRouteHazardColor(level: SegmentHazardLevel): string {
  switch (level) {
    case 'hazardous':
      return TACTICAL.danger;
    case 'warning':
      return '#FF7043';
    case 'caution':
      return TACTICAL.amber;
    default:
      return '#4CAF50';
  }
}

function getRouteHazardLabel(level: SegmentHazardLevel): string {
  switch (level) {
    case 'hazardous':
      return 'HAZARD';
    case 'warning':
      return 'WARNING';
    case 'caution':
      return 'CAUTION';
    default:
      return 'CLEAR';
  }
}

export default function EnvironmentalIntel({
  activeRoute,
  activeRun,
  riskScore,
  riskLevel,
  riskColor,
}: Props) {
  const [, setRemotenessRevision] = useState(0);
  const gps = useThrottledGPS();
  const { snapshot, refresh, result } = useOperationalWeather({
    enabled: true,
    gps: {
      lat: gps.position?.latitude ?? null,
      lng: gps.position?.longitude ?? null,
      hasFix: gps.hasFix,
      permissionDenied: gps.permissionDenied,
      accuracyM: gps.position?.accuracyM ?? null,
    },
    units: 'imperial',
  });
  const routeWeatherLocation = useMemo(
    () => (
      gps.hasFix && gps.position?.latitude != null && gps.position?.longitude != null
        ? { lat: gps.position.latitude, lng: gps.position.longitude }
        : null
    ),
    [gps.hasFix, gps.position?.latitude, gps.position?.longitude],
  );
  const routeWeather = useRouteCorridorWeather(
    activeRun,
    routeWeatherLocation,
    silentRouteWeatherToast,
    {
      forceActive: true,
      persistPreference: false,
      emitToasts: false,
    },
  );
  useEffect(() => {
    remotenessStore.start();
    const unsubscribe = remotenessStore.subscribe(() => {
      setRemotenessRevision((value) => value + 1);
    });
    return () => {
      unsubscribe();
      remotenessStore.stop();
    };
  }, []);
  const remotenessIndex = remotenessStore.getIndex();

  const weatherSurface = useMemo(
    () => buildUnifiedWeatherCorridor({ snapshot, result, routeWeather }),
    [result, routeWeather, snapshot],
  );
  const solarTimes = useMemo(
    () => getWeatherSolarTimes(weatherSurface.current),
    [weatherSurface],
  );
  const resolvedCurrentWeather = weatherSurface.current?.current ?? null;

  const resolvedCondition =
    snapshot.current.condition ??
    snapshot.current.description ??
    resolvedCurrentWeather?.weather_main ??
    resolvedCurrentWeather?.weather_description ??
    weatherSurface.label;
  const resolvedTemperatureF =
    snapshot.current.temp ??
    resolvedCurrentWeather?.temp ??
    weatherSurface.temperatureF;
  const resolvedSunrise =
    snapshot.raw?.current?.sunrise ??
    resolvedCurrentWeather?.sunrise ??
    solarTimes.sunrise;
  const resolvedSunset =
    snapshot.raw?.current?.sunset ??
    resolvedCurrentWeather?.sunset ??
    solarTimes.sunset;
  const gpsLat = gps.position?.latitude ?? null;
  const gpsLon = gps.position?.longitude ?? null;
  const gpsAccuracyM = gps.position?.accuracyM ?? null;
  const gpsAltitudeFt = gps.position?.altitudeFt ?? null;
  const gpsTimestamp = gps.position?.timestamp ?? null;
  const environment = useMemo(
    () => buildEnvironmentSnapshot({
      coordinate: gps.hasFix && gpsLat != null && gpsLon != null
        ? {
            latitude: gpsLat,
            longitude: gpsLon,
            accuracyM: gpsAccuracyM,
            altitudeFt: gpsAltitudeFt,
            source: 'gps',
            updatedAt: gpsTimestamp,
          }
        : null,
      regionLabel: snapshot.locationName || null,
      regionSource: snapshot.locationName ? 'weather_provider' : 'unavailable',
      solarTimes: {
        sunrise: resolvedSunrise,
        sunset: resolvedSunset,
        source: 'weather_provider',
        updatedAt: snapshot.status.timestampMs ?? snapshot.status.cachedAt ?? snapshot.fetchedAt ?? null,
      },
      remoteness: remotenessIndex,
    }),
    [
      gps.hasFix,
      gpsAccuracyM,
      gpsAltitudeFt,
      gpsLat,
      gpsLon,
      gpsTimestamp,
      remotenessIndex,
      resolvedSunrise,
      resolvedSunset,
      snapshot.fetchedAt,
      snapshot.locationName,
      snapshot.status.cachedAt,
      snapshot.status.timestampMs,
    ],
  );
  const sunlightLine =
    environment.sunlight.status === 'unavailable'
      ? getSunlightSourceLabel(environment.sunlight)
      : `${formatSunlightRemaining(environment.sunlight)} · ${getSunlightSourceLabel(environment.sunlight)}`;
  const remotenessLine =
    environment.remoteness.score == null
      ? 'Remoteness unknown'
      : `${environment.remoteness.label} · services appear limited`;
  const elevationLine = formatElevationLine(environment.elevation.feet, environment.elevation.source);
  const resolvedWindLine = snapshot.raw || weatherSurface.current
    ? formatWeatherWindLine(snapshot)
    : 'Wind and precipitation details unavailable.';

  const statusAppearance = getStatusAppearance(snapshot.status.kind);
  const headline =
    snapshot.status.kind === 'ready' ||
    snapshot.status.kind === 'live' ||
    snapshot.status.kind === 'cached' ||
    snapshot.status.kind === 'stale' ||
    snapshot.status.kind === 'offline'
      ? `${resolvedCondition ?? 'Weather'} • ${resolvedTemperatureF != null ? `${Math.round(resolvedTemperatureF)}°` : '--'}`
      : 'Weather intelligence unavailable';
  const alertLine = formatWeatherAlertLine(snapshot) || weatherSurface.summaryLabel || '';
  const alertCount = weatherSurface.alerts.length;
  const severeAlert = weatherSurface.alerts[0] ?? null;
  const routeHazardDetails = useMemo(
    () => routeWeather.points
      .filter((point) => point.hazardLevel !== 'clear')
      .map((point) => {
        const current = point.weather?.current;
        const primaryReason =
          point.hazardReasons[0] ??
          point.weather?.alerts?.[0]?.title ??
          'Route weather requires attention';
        const condition = current?.weather_main ?? current?.weather_description ?? null;
        const wind = current?.wind_speed != null ? `${Math.round(current.wind_speed)} mph wind` : null;
        const temp = current?.temp != null ? `${Math.round(current.temp)} deg` : null;
        const supportingDetail = [condition, temp, wind].filter(Boolean).join(' / ');

        return {
          key: `${point.idx}-${point.label}-${point.hazardLevel}`,
          level: point.hazardLevel,
          label: `${point.label} - ${point.distanceMi.toFixed(1)} mi`,
          title: primaryReason,
          detail: supportingDetail || point.weather?.alerts?.[0]?.description || 'Route-corridor weather hazard.',
        };
      })
      .slice(0, 4),
    [routeWeather.points],
  );
  const routeHazardCount = routeWeather.hazardousCount + routeWeather.cautionCount;
  const routeHazardSummary = routeWeather.hasRoute
    ? routeHazardCount > 0
      ? `${routeHazardCount} route-corridor weather ${routeHazardCount === 1 ? 'hazard' : 'hazards'}`
      : routeWeather.points.length > 0
        ? 'No route-corridor weather hazards detected.'
        : routeWeather.loading
          ? 'Loading route-corridor weather hazards.'
          : routeWeather.error || 'Route-corridor weather is pending.'
    : null;
  const hasWeatherMetrics = Boolean(
    resolvedCondition ||
    resolvedTemperatureF != null ||
    weatherSurface.windMph != null ||
    weatherSurface.precipitationIntensity != null ||
    resolvedSunrise != null ||
    resolvedSunset != null,
  );

  const weatherStateCopy = useMemo(() => {
    switch (snapshot.status.kind) {
      case 'permission_required':
      case 'permission-blocked':
        return 'Location permission is required before ECS can resolve live weather from your device position.';
      case 'network-blocked':
        return snapshot.status.label || 'Network access is required to refresh live weather conditions.';
      case 'waiting_for_gps':
        return 'Waiting for a usable device location fix to load live dispatch weather.';
      case 'loading':
        return 'Refreshing field weather and alert conditions.';
      case 'offline':
        return snapshot.status.label || 'Offline. Showing last known weather if available.';
      case 'cached':
        return snapshot.status.label || 'Showing cached weather while ECS checks for a fresher update.';
      case 'stale':
        return snapshot.status.label || 'Cached weather is older than ECS prefers for live field use.';
      case 'provider_error':
      case 'error':
        return snapshot.status.error || 'Weather service unavailable right now.';
      case 'unavailable':
        return snapshot.status.error || 'No valid weather location is available right now.';
      default:
        return snapshot.current.description || 'Live weather data available for the current ECS location.';
    }
  }, [snapshot]);

  const showWeatherDetails = hasWeatherMetrics && snapshot.status.kind !== 'loading';
  const lastUpdatedLabel = snapshot.fetchedAt
    ? `Last updated ${new Date(snapshot.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : null;
  const sourceLabel =
    snapshot.sourceType === 'current_location'
      ? 'Current position'
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
                  {resolvedTemperatureF != null ? `${Math.round(resolvedTemperatureF)}°` : '--'}
                </Text>
                <Text style={styles.lightLabel}>TEMP</Text>
              </View>

              <View style={styles.lightDivider} />

              <View style={styles.lightStat}>
                <Ionicons name="sunny-outline" size={16} color={TACTICAL.amber} />
                <Text style={styles.lightValue}>
                  {formatEnvironmentTime(environment.sunlight.sunriseIso, environment.timezone.id)}
                </Text>
                <Text style={styles.lightLabel}>SUNRISE</Text>
              </View>

              <View style={styles.lightDivider} />

              <View style={styles.lightStat}>
                <Ionicons name="moon-outline" size={16} color="#5DADE2" />
                <Text style={styles.lightValue}>
                  {formatEnvironmentTime(environment.sunlight.sunsetIso, environment.timezone.id)}
                </Text>
                <Text style={styles.lightLabel}>SUNSET</Text>
              </View>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>SUNLIGHT</Text>
              <Text style={styles.infoValue}>{sunlightLine}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>ELEVATION</Text>
              <Text style={styles.infoValue}>{elevationLine}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>REMOTENESS</Text>
              <Text style={styles.infoValue}>{remotenessLine}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>WIND / PRECIP</Text>
              <Text style={styles.infoValue}>{resolvedWindLine}</Text>
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

        {routeWeather.hasRoute ? (
          <View style={styles.routeHazardBlock}>
            <View style={styles.routeHazardHeader}>
              <Text style={styles.infoLabel}>ROUTE WEATHER HAZARDS</Text>
              <Text style={styles.routeHazardStatus}>
                {routeWeather.loading ? 'REFRESHING' : routeWeather.source ? routeWeather.source.toUpperCase() : 'PENDING'}
              </Text>
            </View>
            <Text style={styles.infoValue}>{routeHazardSummary}</Text>
            {routeHazardDetails.length > 0 ? (
              <View style={styles.routeHazardList}>
                {routeHazardDetails.map((hazard) => {
                  const color = getRouteHazardColor(hazard.level);
                  return (
                    <View key={hazard.key} style={styles.routeHazardItem}>
                      <View style={[styles.routeHazardPill, { borderColor: `${color}55`, backgroundColor: `${color}12` }]}>
                        <Text style={[styles.routeHazardPillText, { color }]}>
                          {getRouteHazardLabel(hazard.level)}
                        </Text>
                      </View>
                      <View style={styles.routeHazardCopy}>
                        <Text style={styles.routeHazardTitle}>{hazard.title}</Text>
                        <Text style={styles.routeHazardMeta}>{hazard.label}</Text>
                        <Text style={styles.routeHazardDetail}>{hazard.detail}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>
        ) : null}
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
        <ECSSectionHeader
          title="RISK OVERVIEW"
          icon="shield-outline"
          accentColor={riskColor || TACTICAL.textMuted}
        />
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
            label="No active alerts reported for the current ECS location."
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

function TerrainRow({
  label,
  value,
  noDivider = false,
}: {
  label: string;
  value: string;
  noDivider?: boolean;
}) {
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
  routeHazardBlock: {
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62,79,60,0.12)',
  },
  routeHazardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  routeHazardStatus: {
    fontSize: 7,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 1.1,
  },
  routeHazardList: {
    gap: 6,
  },
  routeHazardItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 8,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.16)',
    backgroundColor: 'rgba(0,0,0,0.16)',
  },
  routeHazardPill: {
    minWidth: 54,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 7,
    borderWidth: 1,
  },
  routeHazardPillText: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  routeHazardCopy: {
    flex: 1,
    gap: 2,
  },
  routeHazardTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.text,
  },
  routeHazardMeta: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 0.5,
  },
  routeHazardDetail: {
    fontSize: 9,
    lineHeight: 13,
    color: TACTICAL.textMuted,
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
  subCard: {},
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
