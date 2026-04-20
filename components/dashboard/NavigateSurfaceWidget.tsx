import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { useRouter } from 'expo-router';

import MapRenderer from '../navigate/MapRenderer';
import { ECSWidgetFallback } from '../ECSStateMessage';
import {
  WidgetCardShell,
  WidgetCompactRow,
  WidgetMetaLine,
  WidgetPrimaryValue,
  WidgetSecondaryRow,
  type WidgetTone,
} from './WidgetChrome';
import {
  WidgetDetailLeadCard,
  WidgetDetailSectionCard,
  WidgetDetailSectionTitle,
  WidgetDetailStateCard,
} from './WidgetDetailChrome';
import { TACTICAL } from '../../lib/theme';
import { routeStore, type ImportedRoute } from '../../lib/routeStore';
import {
  loadRoadNavigationSession,
  type PersistedRoadNavigationSession,
} from '../../lib/roadNavigationStore';
import { getMapboxToken, getMapboxTokenSync } from '../../lib/mapConfig';
import { ECS_STATE_COPY } from '../../lib/ecsStateCopy';
import type { WidgetData, WidgetRenderOptions } from './WidgetRenderers';

type Props = {
  data: WidgetData;
  options?: WidgetRenderOptions;
};

function getRouteSignature(route: ImportedRoute | null): string {
  if (!route) return 'none';
  return `${route.id}:${route.updated_at}:${route.is_active}`;
}

function getSessionSignature(session: PersistedRoadNavigationSession | null): string {
  if (!session) return 'none';
  return `${session.sessionId}:${session.status}:${session.updatedAt}`;
}

function sameRoute(a: ImportedRoute | null, b: ImportedRoute | null): boolean {
  return getRouteSignature(a) === getRouteSignature(b);
}

function sameSession(
  a: PersistedRoadNavigationSession | null,
  b: PersistedRoadNavigationSession | null,
): boolean {
  return getSessionSignature(a) === getSessionSignature(b);
}

function getStatusLabel(
  activeImportedRoute: ImportedRoute | null,
  roadSession: PersistedRoadNavigationSession | null,
): string {
  if (activeImportedRoute?.is_active) return 'ROUTE ACTIVE';
  if (roadSession?.status === 'navigation_active' || roadSession?.status === 'rerouting') {
    return 'ROUTE ACTIVE';
  }
  if (roadSession?.status === 'route_preview' || roadSession?.status === 'destination_selected') {
    return 'ROUTE READY';
  }
  if (activeImportedRoute || roadSession) return 'ROUTE LOADED';
  return 'NO ROUTE';
}

function getStatusTone(
  activeImportedRoute: ImportedRoute | null,
  roadSession: PersistedRoadNavigationSession | null,
): WidgetTone {
  if (activeImportedRoute?.is_active || roadSession?.status === 'navigation_active') return 'live';
  if (roadSession?.status === 'rerouting') return 'warning';
  if (activeImportedRoute || roadSession) return 'good';
  return 'unavailable';
}

function getRoutePoints(activeImportedRoute: ImportedRoute | null) {
  if (!activeImportedRoute) return [];
  return activeImportedRoute.segments.flatMap((segment) =>
    segment.points.map((point) => ({
      lat: point.lat,
      lng: point.lon,
    })),
  );
}

function getRouteWaypoints(
  activeImportedRoute: ImportedRoute | null,
  roadSession: PersistedRoadNavigationSession | null,
) {
  if (activeImportedRoute) {
    return activeImportedRoute.waypoints.map((waypoint, index) => ({
      id: `${activeImportedRoute.id}-${index}`,
      latitude: waypoint.lat,
      longitude: waypoint.lon,
      title: waypoint.name ?? `Waypoint ${index + 1}`,
    }));
  }

  if (roadSession?.destination?.coordinate) {
    return [
      {
        id: roadSession.sessionId,
        latitude: roadSession.destination.coordinate.lat,
        longitude: roadSession.destination.coordinate.lng,
        title: roadSession.destination.title,
      },
    ];
  }

  return [];
}

function DetailMetricRow({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <View style={styles.detailMetricRow}>
      <Text style={styles.detailMetricLabel}>{label}</Text>
      <Text style={[styles.detailMetricValue, color ? { color } : null]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function useNavigateSurfaceState(options?: WidgetRenderOptions) {
  const [mapToken, setMapToken] = useState(() => getMapboxTokenSync());
  const [roadSession, setRoadSession] = useState<PersistedRoadNavigationSession | null>(null);
  const [activeImportedRoute, setActiveImportedRoute] = useState<ImportedRoute | null>(() =>
    routeStore.getActive(),
  );

  useEffect(() => {
    let active = true;

    if (mapToken) return () => {
      active = false;
    };

    void getMapboxToken()
      .then((token) => {
        if (active && token) {
          setMapToken(token);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [mapToken]);

  useEffect(() => {
    let mounted = true;

    const syncState = async () => {
      const nextRoute = routeStore.getActive();
      const nextSession = await loadRoadNavigationSession();
      if (!mounted) return;

      setActiveImportedRoute((current) => (sameRoute(current, nextRoute) ? current : nextRoute));
      setRoadSession((current) => (sameSession(current, nextSession) ? current : nextSession));
    };

    void syncState();
    const intervalId = setInterval(() => {
      void syncState();
    }, 2000);

    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, []);

  const statusLabel = getStatusLabel(activeImportedRoute, roadSession);
  const statusTone = getStatusTone(activeImportedRoute, roadSession);
  const routePoints = useMemo(() => getRoutePoints(activeImportedRoute), [activeImportedRoute]);
  const routeWaypoints = useMemo(
    () => getRouteWaypoints(activeImportedRoute, roadSession),
    [activeImportedRoute, roadSession],
  );

  const title =
    activeImportedRoute?.name ??
    roadSession?.destination?.title ??
    'Navigate';
  const secondaryText = activeImportedRoute
    ? 'Showing the active imported trail route.'
    : roadSession?.destination?.subtitle ||
      'Showing the staged road destination from Navigate.';
  const modeLabel = activeImportedRoute ? 'TRAIL' : 'ROAD';
  const stateLabel =
    roadSession?.status === 'navigation_active'
      ? 'LIVE'
      : roadSession?.status === 'route_preview'
        ? 'READY'
        : activeImportedRoute
          ? 'LOADED'
          : 'STAGED';
  const hasGps = !!(options?.gpsHasFix && options?.gpsLatitude != null && options?.gpsLongitude != null);

  return {
    mapToken,
    roadSession,
    activeImportedRoute,
    statusLabel,
    statusTone,
    routePoints,
    routeWaypoints,
    title,
    secondaryText,
    modeLabel,
    stateLabel,
    hasGps,
  };
}

export default function NavigateSurfaceWidget({ data, options }: Props) {
  const router = useRouter();
  const {
    mapToken,
    roadSession,
    activeImportedRoute,
    statusLabel,
    statusTone,
    routePoints,
    routeWaypoints,
    title,
    secondaryText,
    modeLabel,
    stateLabel,
  } = useNavigateSurfaceState(options);

  if (!activeImportedRoute && !roadSession) {
    if (options?.compact) {
      return <WidgetCompactRow title="Navigate" summary="No route staged" tone="unavailable" />;
    }
    return (
      <ECSWidgetFallback
        title={ECS_STATE_COPY.dashboard.noRouteActive.title}
        message="Open Navigate to stage a destination, preview a route, or activate a trail."
        actionLabel={ECS_STATE_COPY.dashboard.noRouteActive.ctaLabel}
        onAction={() => router.push('/navigate')}
      />
    );
  }

  if (options?.compact) {
    const compactSummary =
      roadSession?.status === 'navigation_active'
        ? `Next ${title}`
        : activeImportedRoute
          ? `Route ${title}`
          : `Destination ${title}`;
    return (
      <WidgetCompactRow
        title="Navigate"
        summary={compactSummary}
        tone={statusTone}
        status={roadSession?.status === 'navigation_active' ? stateLabel : modeLabel}
        statusTone={statusTone}
      />
    );
  }

  return (
    <WidgetCardShell
      badge={{ label: statusLabel, tone: statusTone }}
      footer={<WidgetMetaLine text={secondaryText} tone="neutral" />}
    >
      <View style={styles.content}>
        <WidgetPrimaryValue label="Navigate Surface" value={title} tone={statusTone} />
        <WidgetSecondaryRow
          items={[
            { label: 'MODE', value: modeLabel, tone: 'neutral' },
            { label: 'STATE', value: stateLabel, tone: statusTone },
          ]}
        />
        <View style={styles.mapFrame}>
          <MapRenderer
            points={routePoints}
            waypoints={routeWaypoints}
            mapStyle="ecs"
            mapboxToken={mapToken || ''}
            showUserLocation={!!(options?.gpsHasFix && options?.gpsLatitude != null && options?.gpsLongitude != null)}
            userLocation={
              options?.gpsLatitude != null && options?.gpsLongitude != null
                ? { latitude: options.gpsLatitude, longitude: options.gpsLongitude }
                : null
            }
            interactive={false}
            isLoading={!mapToken}
            hasToken={!!mapToken}
          />
        </View>
      </View>
    </WidgetCardShell>
  );
}

export function NavigateSurfaceDetailView({ data: _data, options }: Props) {
  const {
    mapToken,
    roadSession,
    activeImportedRoute,
    statusLabel,
    statusTone,
    routePoints,
    routeWaypoints,
    title,
    secondaryText,
    modeLabel,
    stateLabel,
    hasGps,
  } = useNavigateSurfaceState(options);

  if (!activeImportedRoute && !roadSession) {
    return (
      <View style={styles.detailContainer}>
        <WidgetDetailStateCard
          title="No route staged"
          message="Open Navigate to stage a destination, preview a route, or activate a trail."
          badgeLabel="UNAVAILABLE"
          tone="muted"
          icon="navigate-outline"
        />
      </View>
    );
  }

  const sourceLabel = activeImportedRoute ? 'Imported trail route' : 'Navigate road session';
  const gpsLabel = hasGps ? 'Live GPS position' : 'Route context only';

  return (
    <View style={styles.detailContainer}>
      <WidgetDetailLeadCard
        eyebrow="NAVIGATE SURFACE"
        title={title}
        summary={secondaryText}
        tone={statusTone === 'warning' ? 'attention' : statusTone === 'unavailable' ? 'manual' : 'live'}
        badges={[
          { label: statusLabel, tone: statusTone === 'warning' ? 'attention' : statusTone === 'unavailable' ? 'manual' : 'live' },
          { label: modeLabel, tone: 'neutral' },
        ]}
        metaLines={[sourceLabel, gpsLabel]}
      />

      {!hasGps ? (
        <WidgetDetailStateCard
          title="Waiting for GPS"
          message="Showing staged route context until ECS regains a usable GPS fix."
          badgeLabel="LIMITED GPS"
          tone="manual"
          icon="locate-outline"
        />
      ) : null}

      <WidgetDetailSectionCard tone="neutral">
        <WidgetDetailSectionTitle>ROUTE STATUS</WidgetDetailSectionTitle>
        <DetailMetricRow label="STATE" value={stateLabel} color={statusTone === 'live' ? '#4CAF50' : statusTone === 'warning' ? '#FFB300' : TACTICAL.text} />
        <DetailMetricRow label="MODE" value={modeLabel} />
        <DetailMetricRow label="ROUTE" value={title} />
        <DetailMetricRow
          label="WAYPOINTS"
          value={`${routeWaypoints.length}`}
          color={routeWaypoints.length > 0 ? TACTICAL.text : TACTICAL.textMuted}
        />
      </WidgetDetailSectionCard>

      <WidgetDetailSectionCard tone="neutral">
        <WidgetDetailSectionTitle>MAP PREVIEW</WidgetDetailSectionTitle>
        <View style={styles.detailMapFrame}>
          <MapRenderer
            points={routePoints}
            waypoints={routeWaypoints}
            mapStyle="ecs"
            mapboxToken={mapToken || ''}
            showUserLocation={hasGps}
            userLocation={
              options?.gpsLatitude != null && options?.gpsLongitude != null
                ? { latitude: options.gpsLatitude, longitude: options.gpsLongitude }
                : null
            }
            interactive={false}
            isLoading={!mapToken}
            hasToken={!!mapToken}
          />
        </View>
      </WidgetDetailSectionCard>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    minHeight: 0,
    gap: 6,
  },
  mapFrame: {
    flex: 1,
    minHeight: 96,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.18)',
    backgroundColor: 'rgba(11,14,18,0.94)',
  },
  detailContainer: {
    gap: 10,
  },
  detailMapFrame: {
    minHeight: 180,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.18)',
    backgroundColor: 'rgba(11,14,18,0.94)',
  },
  detailMetricRow: {
    minHeight: 18,
    paddingVertical: 3,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  detailMetricLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  detailMetricValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
});
